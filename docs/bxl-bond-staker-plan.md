# Plan: a bond staker for BXL only (`bxl-pool-bond`)

**Status:** contract written (`contracts/bxl-pool-bond.clar`) and tested
(`tests/bxl-pool-bond.test.ts`, and in the Rendezvous harness), sized for
0.5 BTC. Not deployed; no allowance requested yet. The Esbee adapter
(`bxl-pool-esbee`) was removed in its favour.

A pox-5 bond seat that holds only the vault's sBTC, is run by the
`bxl-vault-v2` admins, and stakes with Fast Pool's
`SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager`.

## 1. Why

The Esbee pool cannot take more BTC before bond 7. Read from mainnet at burn
block 976,787:

- `esbee-dao-bond-staker-1` is in bond 1 until 991,550. Deposits need a bound
  bond with an open stake window; bond 1's window closed at 966,250.
- `NEXT_BOND_OFFSET u6` lets it bind only a bond six after its live one.
  `earliest-bindable-bond` returns 7, which starts at 991,550.
- It is not allowlisted for bonds 2 and 3, and bonds 4 to 6 are not set up yet.

A seat of BXL's own can join any bond it is allowlisted for. Without members,
shares, epochs, a treasury or a DAO, it stays small.

## 2. Why a separate contract and not the vault itself

pox-5 keeps one position per principal: STX-only staking (`stake`) or a bond
seat (`register-for-bond`). A bond registration rolls an existing STX-only stake
into the bond (`existing-stake` in `register-for-bond`). If the vault held the
seat itself, it could no longer stake its remaining STX on its own. A separate
contract holds the seat; the vault keeps staking its free STX with `stake`.

## 3. Design

One contract, `contracts/bxl-pool-bond.clar`. It is both the pox-5 staker
(the allowlisted principal) and the vault's `sbtc-pool-trait` adapter, like the
other three adapters. Only the vault deposits; only vault admins act.

**Fixed parameters**

- Signer manager: `fastpool-max500-signer-manager`, a constant. Functions take
  the manager as a trait argument and check it against the constant.
- No signer calldata. Without a payout config, max500 pays staker rewards in
  sBTC directly to the staker, which is this contract.
- Admin check: `(contract-call? .bxl-vault-v2 is-admin tx-sender)`, as in the
  other adapters.

**State**

- `idle-sats`: sBTC held here that is principal: deposited and not yet
  registered, or returned by `unstake-sbtc` and not yet handed back. Every
  other sBTC in the contract is rewards.
- Everything else is read from pox-5: `get-bond-membership` (bond index,
  amount, signer), `get-staker-custodied-sbtc`, and `stx-account` for the STX
  leg.

**Trait functions (called by the vault)**

| Function | What it does |
| --- | --- |
| `deposit (sats ustx)` | vault only. Takes sBTC and STX from the vault, adds `sats` to `idle-sats`. Nothing goes to pox-5 yet. |
| `withdraw (sats)` | admin. Hands back all `idle-sats` and all unlocked STX through `pool-withdrawn`, with remaining = custodied sBTC and locked STX. `sats` is ignored, as in the bond adapters. |
| `collect-rewards` | vault only. Sends `sbtc-balance - idle-sats` to the vault. This counts rewards whoever triggered the claim on max500. |
| `get-value` | `{ sats: custodied + idle-sats, ustx: locked + unlocked }`. No exit fee: an early `unstake-sbtc` returns all custodied sBTC. |

**Admin functions**

| Function | pox-5 call | Notes |
| --- | --- | --- |
| `register (bond-index)` | `register-for-bond bond-index manager ustx (err sats) none` | sats = custodied + idle (pox-5 moves only the net difference, `roll-sbtc`); ustx = all STX held. The same call rolls into the next bond, but pox-5 accepts a rollover only from `get-bond-l1-unlock-height` of the old bond, half a cycle before it ends (`ERR_ROLLOVER_TOO_EARLY`, u48). Allowances: `with-ft` for the net sBTC moved in, `with-staking` for the *whole* STX lock (pox-5 re-locks the full amount, as `stake-update` showed). No `with-pox`: tested without it. |
| `unstake-sbtc (sats)` | `unstake-sbtc manager sats` | During the bond (early leave, outside prepare phases) or after it. sBTC returns here and is added to `idle-sats`. Needs `with-pox`: without it pox-5's release fails with `(err u128)`. |
| `claim (reward-cycle bond-index)` | max500 `claim-staker-rewards` | Convenience only; anyone can call max500 directly for this contract. |

The STX leg unlocks by itself at the bond's unlock height. After that,
`withdraw` hands it back.

**Vault**

No change: the trait fits, `admin-set-pool` approves the contract, `deploy`
sends sBTC plus the STX leg, `pool-withdrawn` and `collect-rewards` check every
transfer. The STX leg comes out of the vault's free STX, so the admins stake
with `stake` only what the leg does not need.

## 4. What this leaves out on purpose

- Other members, shares, an operator, an exit queue: the vault is the only
  member and its admins decide.
- Passive rollover: an admin calls `register` for each bond. Missing a bond
  means the sBTC sits idle (or goes to stBTC), not that it is lost.
- L1 payouts, BTC lockups (`(ok outputs)` branch of `btc-lockup`),
  `update-bond-registration`: not needed for one manager and sBTC only.

## 5. Per-bond runbook

| When | Who | Step |
| --- | --- | --- |
| before `setup-bond` | admins | ask for an allowance for `<deployer>.bxl-pool-bond` (stacks.co/bitcoin-staking and the Stacks Labs contacts) |
| after `setup-bond` | anyone | check `get-bond-allowance bond-index <bxl-pool-bond>` and `min-ustx-for-sats-amount` for the STX leg |
| before the bond starts, not in a prepare phase | admins | `deploy` sBTC and the STX leg from the vault, then `register bond-index` |
| each reward cycle | anyone | `claim` (or max500 `claim-staker-rewards`), then the vault's `collect-rewards` |
| users need sBTC early | admins | `unstake-sbtc`, then `withdraw` |
| last half cycle of the bond: from `get-bond-l1-unlock-height` (bond start + 6 bond periods − 1,050 burn blocks on mainnet) until the next bond starts, not in a prepare phase | admins | to roll over: `deploy` any added sBTC and STX, then `register` the next bond (needs its own allowance). Earlier fails with u48 |
| bond ends | admins | if not rolled over: `unstake-sbtc` and `withdraw`; the STX leg unlocks by itself |

Mainnet timing (bond N starts at 966,350 + (N - 1) × 4,200; `setup-bond` came
about 1,300 blocks before a start in earlier bonds):

| Bond | Starts | Allowlist written (est.) | Days from 976,787 to start |
| --- | --- | --- | --- |
| 4 | 978,950 | ~977,650 | ~15 (too soon for a new contract) |
| 5 | 983,150 | ~981,850 | ~44 |
| 6 | 987,350 | ~986,050 | ~73 |

Bond 5 is the realistic target.

## 6. Tests

- vitest, simnet: reuse `registerSigner` and the `setup-bond` call by the bond
  admin from `tests/bxl-vault-v2-unstake.test.ts`; Fast Pool's
  `signer-manager.clar` is the same code as max500. Cover: deploy and
  register; the allowances needed (sBTC delta, whole STX lock, `with-pox`);
  rewards reaching the vault through `collect-rewards`, also when a third party
  triggered the claim; early `unstake-sbtc` and `withdraw` in time for
  `withdraw-finalize`; STX leg back after the bond; rolling into the next bond;
  rejections (non-admin, non-vault, wrong manager, not allowlisted, prepare
  phase).
- Rendezvous: add the adapter to the harness's `POOLS` and a stand-in for the
  pox-5 calls, as the bond-staker repo does, so the vault invariants cover it.

## 7. Risks and open questions

- **Size.** Planned at 0.5 BTC (50,000,000 sats); ask for an allowance of
  that size. The v1 vault holds 122,480 sats and 12 STX today, so the
  deposits have to come first.
- **STX leg for 0.5 BTC.** `min-ustx-for-sats-amount` at the terms of bonds 1
  to 3 (stx-value-ratio 310,237, 267,384 and 275,260 uSTX per 100 sats,
  min-ustx-ratio 500) gives about 7,760, 6,680 and 6,880 STX. That STX must
  come from bxlSTX deposits and stays locked for the whole bond.
- **Allowlist.** pox-5 keys allowances on the staker principal, so the
  deployer and contract name must be fixed before the request.
- **STX leg.** pox-5 needs `min-ustx-ratio` (5% today) of the sats' value in
  locked STX for the whole bond, priced at `setup-bond`. The vault's bxlSTX
  deposits must cover it.
- **Signer.** max500's fee is 450 bps (4.5%) today, capped at 5%, and increases take effect
  two cycles later. pox-5's `pause-rewards` can stop payouts.
- **Lock-in.** The STX leg stays locked until the bond ends even after an early
  `unstake-sbtc`; plan bxlSTX liquidity around it.
