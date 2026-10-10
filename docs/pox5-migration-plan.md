# BXL Vault: migration to pox-5

Status: plan, 2026-10-08 (revised the same day with the Xverse bond pool and the bond 3 allowlist campaign). Nothing in this document has been implemented yet.

## 1. Why the current contracts no longer earn anything

Verified on mainnet on 2026-10-08:

| Fact | Value |
|---|---|
| pox-5 live since | Epoch 4.0, burn block 960,230; first pox-5 cycle 141 |
| Current burn height | 970,461, cycle 144 prepare phase; cycle 145 starts at 970,550 |
| Vault sBTC balance | 2,612,174 sats |
| Vault STX balance | 7,512.9 STX, all unlocked (pox-4 unlocked everything at the fork) |
| Last Dual Stacking payout to the vault | 2026-09-08 from `dual-stacking-v3_0_0` |
| Dual Stacking `enroll` calls since October | every one aborts |
| Last Fast Pool v2 STX payout | 2026-08-11 |

What breaks in `contracts/bxl-vault.clar`:

- `delegate-stx` calls `pox4-multi-pool-v1 delegate-stx`. pox-5 has no delegation at all. There is no `delegate-stx`, no `allow-contract-caller`, no `revoke-delegate-stx`.
- `revoke-delegate-stx` calls `pox-4`, which is inactive.
- `enroll` calls `dual-stacking-v1`. The Dual Stacking pilot is finished. sBTC only earns in pox-5 through a "bond".
- The deploy-time `allow-contract-caller` call targets pox-4.
- `bxl-btc` and `bxl-stx` bind to the vault once via `set-vault`, so a new vault needs new token contracts too.

So this is a redeploy of all three contracts, not an upgrade.

## 2. How pox-5 works for a contract like the vault

Source: `SP000000000000000000002Q6VF78.pox-5` on mainnet.

**STX leg (STX-only staking).** The staker calls pox-5 itself as `tx-sender`:

```clarity
(stake (signer-manager <signer-manager-trait>) (amount-ustx uint) (num-cycles uint) (start-burn-ht uint) (signer-calldata (optional (buff 500))))
(stake-update (signer-manager <signer-manager-trait>) (old-signer-manager <signer-manager-trait>) (cycles-to-extend uint) (amount-increase uint) (signer-calldata (optional (buff 500))))
(unstake (old-signer-manager <signer-manager-trait>))
```

- `num-cycles` is 1 to 12. `start-burn-ht` must fall in the current cycle (pass `burn-block-height`).
- `stake` and `unstake` fail during the prepare phase (last 100 blocks of a cycle).
- A contract stakes from inside `as-contract?` with the allowances the bond pools use: `((with-staking ustx) (with-pox))` for `stake`, `((with-pox))` for `unstake`.
- Rewards are sBTC. The signer manager pulls them from pox-5 with `claim-rewards`, then anyone calls the manager's `claim-staker-rewards (staker, reward-cycle, none)` and the manager transfers sBTC to the staker. No vault code is needed to receive them. Passing `signer-calldata none` keeps payouts in sBTC on Stacks.
- One position per principal. A principal cannot be STX-only staking and a bond member at the same time.

**sBTC leg (bonds).** sBTC earns only inside a protocol bond: `register-for-bond` moves the sBTC into pox-5 custody for 12 cycles and locks an STX leg next to it. A bond opens every 2 cycles, each runs 12 cycles. Registration requires an entry on the bond's allowlist. The allowlist is written once, inside `setup-bond`, by the bond admin `SP72DMR3MJKS7RVBY33JVV7EEJSQ1PYDVKDP10FX` (Stacks Labs / Endowment). There is no function to add an entry afterwards.

| Bond | Start burn block | `setup-bond` was called at | Target rate | STX leg | Allowlist |
|---|---|---|---|---|---|
| 1 (Genesis) | 966,350 | 965,047 (1,303 blocks before) | 3% | 5% of sBTC value | 15 entries, see section 3.2 |
| 2 | 970,550 | 969,162 (1,388 blocks before) | 3% | 5% | 3 entries: StackingDAO 483 BTC, Xverse lane 2 22 BTC, one EOA 0.1 BTC |
| 3 | 974,750 | not yet; earliest 970,550, expected around 973,400 (about 28 October) | | | open |
| 4 | 978,950 | | | | |

The vault is not on any allowlist. Stacks Labs has said roughly 10% of each period's capacity is reserved for community pools and that allocation requests go through stacks.co/bitcoin-staking. Bond 2 had one community pool (Xverse, 22 BTC) on a 505 BTC allowlist.

## 3. Options for the sBTC leg

### 3.1 Xverse sBTC bond pool (live, allowlisted for bonds 1 and 2)

`SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-0` to `-v1-5`, each paired with `sbtc-bond-treasury-v1-N`. The header says it is adapted from `fastpool/sbtc-pool-bond-staker` at commit `d8406b7`, generated into six "lanes": lane N only binds bonds with `index mod 6 = N` and rolls that bond into N+6, so the pool's principal never has two overlapping bonds.

State on 2026-10-08:

| Lane | Bond | Signer manager | Bonded | Notes |
|---|---|---|---|---|
| v1-1 | 1 | `xverse-signer-manager-2` | 5.15 BTC, 80,327 STX | 25 BTC allowance; 884,873 sats of rewards credited so far; two early exits |
| v1-2 | 2 | `xverse-signer-manager-3` | 22.00 BTC, 294,122 STX | 22 BTC allowance filled in 3 days by 46 deposits; staked 2026-10-07 |
| v1-0, -3, -4, -5 | none bound | | empty | lane 3 is the one that will take bond 3 |

Interface a member uses (all checks on `tx-sender`, so a contract inside `as-contract?` is a normal member):

```clarity
(deposit (sats uint))                                 ;; sats + get-required-ustx(sats) STX leave tx-sender; only before the first stake of a lane and while a bond is bound
(withdraw)                                            ;; full refund while still queued
(commit-rollover (additional-sats uint))              ;; REQUIRED every bond: reserve the full position for bond N+6; uncommitted members are released at the roll
(cancel-rollover-commitment)
(request-exit) / (cancel-exit)                        ;; leave at the roll, keep that bond's rewards
(unstake-sbtc-early (manager <signer-manager-trait>) (sats uint))  ;; sBTC back now, STX back at the roll, unsynced rewards forfeited, not in prepare phase
(sync-rewards) (claim-rewards (member principal)) (claim-principal (member principal))  ;; permissionless, pay the member
(get-required-ustx (sats uint)) (get-bound-bond) (get-pool) (get-member (member principal)) (get-stake-preview)
```

Differences from the Fast Pool pool that matter: no `deposit-stx`, no L1 bridge, no DAO. Rollover is explicit and all-or-nothing per member (`commit-rollover`), so an adapter must call it inside each rollover window or the position is released as idle sBTC and STX (no loss, no yield). Pool fee 0. Signer fee: `xverse-signer-manager-3` currently charges 495 bps (4.95%) of rewards.

Timing for bond 3 through lane 3: deposits open when Xverse binds (after Stacks Labs' `setup-bond`), close at start minus 100 blocks (974,650), and the allowance is first come first served. Lane 2 filled in three days.

### 3.2 Esbee / Fast Pool sBTC bond pool (live on mainnet in bond 1, dropped from bond 2)

The web app in `../../fastpool/esbee-dao` has no contracts. They live in `../../fastpool/sbtc-pool-bond-staker`: `bond-treasury`, `bond-staker`, `bond-bridge`, `esbee-dao`, with the older generation under `v1/`.

Mainnet facts:

- `SPFCGF789WX1B737VQYAQ6BG3QYVMJGPDKRKYK00.esbee-dao-bond-staker-1` (v1 code) was on the bond 1 allowlist with 5 BTC. It filled 4.99 BTC from 8 depositors between 3 and 9 September, staked on 9 September through `fastpool-max500-signer-manager`, holds 77,462 STX, and has 858,420 sats of rewards credited. Signer fee 0, pool fee 0.
- It was not on the bond 2 allowlist.
- The v2 contracts (`bond-staker` with early exit, L1 bridge, DAO) are deployed on testnet only (`STFCGF789WX1B737VQYAQ6BG3QYVMJGPDJN4TJFM.vault-2` etc.). The mainnet deployer in `esbee-dao/src/config.ts` is empty.

Member interface (v2), same shape as Xverse's minus `commit-rollover`, plus:

```clarity
(deposit (sats uint)) (deposit-stx (ustx uint)) (withdraw) (request-exit) (cancel-exit)
(unstake-sbtc-early (manager <signer-manager-trait>) (sats uint))
(sync-rewards) (claim-rewards (member principal)) (claim-principal (member principal))
```

Rollover in v2 is passive: a member rides into bond N+6 unless they `request-exit`, and a roll that does not fit scales everyone back. For the vault that is simpler to operate than Xverse's explicit commitment.

The precondition the pool cannot arrange itself: `bind-bond` fails with `ERR_NOT_ALLOWLISTED` until Stacks Labs names the pool contract in `setup-bond`. Deposits are only possible after `bind-bond`.

### 3.3 stBTC (StackingDAO), live, largest allowlisted pool

`SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.stacking-dao-core-stbtc-v1` (StackingDAO held 150 BTC of bond 1 and 483 BTC of bond 2 through `stbtc-staker-bond-N-v2`).

```clarity
(deposit (sbtc-amount uint) (min-shares-out uint))   ;; sBTC -> stBTC, tx-sender based
(init-withdraw (stbtc-amount uint)) (withdraw (nft-id uint))   ;; 4,200 burn block cooldown, fee 0 today
(withdraw-idle (stbtc-amount uint))                   ;; instant from idle reserve, fee 100 bps
(get-sbtc-per-stbtc)                                  ;; data-stbtc-v1, 1 stBTC = 1.00373 sBTC today
```

Deposits are open with no allowlist and no window, which makes stBTC the fallback if the vault misses a bond window. Yield is ratio growth, so the vault holds a growing stBTC claim instead of receiving transfers. Adds StackingDAO contract risk and the DAO's pause switches.

### 3.4 Direct bond registration by the vault

Possible only with an allowlist entry for `bxl-vault-v2`, and it blocks the vault from STX-only staking its remaining STX. Not recommended.

### 3.5 Comparison

| | Xverse lane | Esbee v2 | stBTC |
|---|---|---|---|
| Live on mainnet | yes | v1 yes, v2 no | yes |
| On bond 3 allowlist | very likely | only with the campaign in section 4 | very likely |
| Entry window | days before each bond, first come first served | same | any time |
| Fees on rewards | 4.95% signer fee | 0 today, cap 5% | protocol fee inside the rate, 1% instant exit |
| Exit before term | `unstake-sbtc-early`, forfeits unsynced rewards | same | 4,200 blocks or 1% instant |
| Rollover | explicit `commit-rollover` every bond | passive | none needed |
| Governance | Xverse key is operator | members vote (DAO), vault can vote via `as-contract?` | StackingDAO |
| Reward form | sBTC transfers to the member | sBTC transfers to the member | ratio growth |

## 4. Bond 3 allowlist campaign for Esbee

Why it is plausible: the v1 pool proved demand and execution (5 BTC allowance, 99.9% filled in six days, staked on time, rewards flowing, zero fees), and bond 2 used only 22 BTC of the roughly 50 BTC that the stated 10% community-pool share would imply. The ask is one entry on the bond 3 allowlist, which Stacks Labs writes in a single `setup-bond` call expected around burn block 973,400.

What has to be true before that call:

1. The v2 pool contracts are deployed on mainnet under a known principal, because the allowlist is keyed on the staker principal. The principal does not have to exist at `setup-bond` time, but a request without an address will not be taken seriously.
2. The request names an allocation and shows committed demand. Two ways to make demand visible on chain before the pool can accept deposits (it cannot before `bind-bond`):
   - **Pledge contract** (preferred): a small `esbee-pledge` contract that takes sBTC plus the STX leg, is withdrawable at any time, publishes `get-total-pledged`, and has a permissionless `forward` that deposits each pledge into the pool once a bond is bound. The pledged total is the number in the request.
   - **Vault-side earmark**: `bxl-vault-v2` deposits into a pool adapter that holds the sBTC idle until the pool binds. Weaker as an argument because only BXL's sBTC is visible, but it needs no change in the esbee repos.
3. Submit through stacks.co/bitcoin-staking (the Endowment's allocation form) and in parallel to the Stacks Labs contacts who ran the bond 1 list, with the bond 1 track record and the pledged total.

Branding: the brand notes in `sbtc-pool-bond-staker/brand/README.md` argue for "Esbee" as the name. "Esbee DAO" describes the operator seat, which is the part depositors care least about. Calling the product people deposit into "Esbee Vault" and keeping "Esbee DAO" for governance matches what the contracts do. It also lines up with "BXL Vault" depositing into "Esbee Vault". Decide this before the request goes out so the request, the site and the contract names agree.

Timeline (burn blocks, about 144 per day):

| When | Event |
|---|---|
| 970,550 (today + 90 blocks) | `setup-bond(3)` becomes callable |
| by about 972,500 (about 22 October) | esbee v2 on mainnet, pledge contract live, request filed |
| about 973,400 (about 28 October) | Stacks Labs calls `setup-bond(3)`, allowlist fixed |
| after that, plus 576 blocks notice | pool binds bond 3; deposits and pledge forwarding open |
| 974,462 to 974,650 (about 5 to 6 November) | stake window; vault sBTC must be in the pool |
| 974,750 | bond 3 starts, first reward cycle 147 |

If the vault misses it, the next window is bond 4 (978,950, about 4 December) and the sBTC can sit in stBTC or in the Xverse lane 3 meanwhile.

## 5. Options for the STX leg

| Signer manager | Delegated STX (cycle 145) | Fee today | Open to contracts |
|---|---|---|---|
| `SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager` | 71.9M | 0 bps, hard cap 500 bps, 2-cycle activation delay | yes |
| `SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.xverse-signer-manager-3` | 21.1M | 495 bps | yes |
| `SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG.native-pool-signer-manager` | 57.0M | | no, requires StackingDAO's `native-pool-v1` |

Recommendation: Fast Pool, with the manager passed as a trait argument from an admin-managed allowlist.

Note that part of the vault's STX is consumed as the bond pool's STX leg (5% of the sBTC value, about 350 STX for today's 2.6M sats). Only the remainder is STX-only staked.

## 6. Recommended design for `bxl-vault-v2`

Principles: keep the user-facing API byte-compatible (`deposit`, `withdraw-request`, `withdraw-update`, `withdraw-finalize`, `deposit-stx`, `withdraw-stx`, the `withdrawal-requests` map, the 1,000-block minimum). Name the STX functions after pox-5 (`stake`, `unstake`), since there is no delegation any more. Put the pool choice behind a small trait so switching between Esbee, Xverse and stBTC is an admin call, not a vault migration.

### 6.1 Contracts

- `bxl-btc-v2`, `bxl-stx-v2`: copies of the current tokens (same asset names `bxl-btc`, `bxl-btc-transit`, `bxl-stx`, so dashboard post conditions keep working).
- `sbtc-pool-trait`:
  ```clarity
  (define-trait sbtc-pool-trait (
    (deposit (uint) (response uint uint))          ;; sBTC (and STX leg if the pool needs one) in, from the vault
    (withdraw (uint) (response uint uint))         ;; sBTC back to the vault; may fail if illiquid
    (get-sbtc-value () (response uint uint))       ;; sBTC-equivalent held for the vault, incl. accrued yield
    (collect-rewards () (response uint uint))      ;; push any claimable sBTC to the vault
  ))
  ```
- `bxl-pool-bond`: adapter for the two bond-pool forks. One source with the pool principal as a constant, deployed once per pool instance (`bxl-pool-esbee`, `bxl-pool-xverse-3`). `deposit` holds the sBTC and STX idle until the pool has a bond bound, then calls the pool's `deposit`; `withdraw` uses `withdraw` while queued, `unstake-sbtc-early` while bonded, `claim-principal` after a roll; `collect-rewards` calls `sync-rewards`, `claim-rewards` and forwards sBTC to the vault; `get-sbtc-value` is queued plus bonded plus released sats plus claimable rewards. Admin-only `commit-rollover` and `request-exit` pass-throughs (Xverse needs the first every bond). The adapter only accepts calls from the vault (`contract-caller`). The adapter is the pool member, so the vault principal stays free for STX-only staking.
- `bxl-pool-stbtc`: adapter over StackingDAO. `deposit` calls `stacking-dao-core-stbtc-v1 deposit`; `get-sbtc-value` is `stbtc-balance * get-sbtc-per-stbtc / 1e8`; `withdraw` uses `withdraw-idle`, with an admin-only two-step `init-withdraw`/`withdraw`; `collect-rewards` is a no-op.
- `bxl-vault-v2`, changes vs. v1:

| Function | v1 | v2 |
|---|---|---|
| `enroll` | dual-stacking enroll, anyone | admin only: `(enroll (pool <sbtc-pool-trait>) (amount uint))`, moves `amount` sBTC (and, for bond pools, the STX leg) to an allowlisted adapter and records it in a `pool-deposits` map |
| new `pool-withdrawn` | | called by an adapter (from `as-contract?`) when the admin runs the adapter's `withdraw`; the vault pulls the sBTC and STX itself, checks its balance before and after, and sets that pool's recorded principal to the position the adapter reads from the pool's own books (never higher than before), so sBTC that third parties push to the adapter is booked correctly. There is no `unenroll`: funds come back through the adapter. `enroll` and `collect-rewards` check the vault's balance before and after the adapter call too (`err u504`) |
| new `collect-rewards` | | anyone: `(collect-rewards (pool <sbtc-pool-trait>))` |
| new `admin-set-pool` | | allowlist or deny an adapter principal |
| `delegate-stx` → `stake` | pox4-multi-pool delegate | admin: `(stake (manager <signer-manager-trait>) (amount uint) (cycles uint))`, calls `pox-5 stake` inside `(as-contract? ((with-staking amount) (with-pox)) ...)` with `signer-calldata none`; manager must be in an admin allowlist |
| new `stake-update` | | admin: `stake-update` wrapper |
| `revoke-delegate-stx` → `unstake` | pox-4 revoke | admin: `(unstake (manager <signer-manager-trait>))`, calls `pox-5 unstake` |
| `admin-sbtc-transfer` | `sbtc-balance >= amount + supply` | `free-sbtc + sum(pool get-sbtc-value) >= amount + supply`, over the adapters passed as a list of traits |
| `admin-stx-transfer` | `stx-balance >= amount + supply` | counts STX held by bond adapters as well |
| `withdraw-finalize` | pays from vault balance | unchanged; if free sBTC is short the admin first calls the adapter's `withdraw` |
| deploy-time init | pox-4 `allow-contract-caller` | removed |

The dashboard's admin calls change names (`stake`, `unstake`) and take arguments (pool, manager, cycles).

Drop the hard-coded `max-stacking-amount` and stake the actual free STX balance, since pox-5 checks `locked + unlocked >= amount`.

### 6.2 Toolchain

- `Clarinet.toml`: `clarity_version = 6`, `epoch = "4.0"` for all contracts (what `fastpool-pox-5` and `sbtc-pool-bond-staker` use with clarinet 3.23.1, which is installed).
- Vendor `../../fastpool/fastpool-pox-5/boot/pox-5.clar` and add `[project.override_boot_contracts_source] pox-5 = "./boot/pox-5.clar"`. Clarinet's bundled pox-5 diverges from mainnet.
- Requirements: keep `sbtc-token`, add `sbtc-deposit` (simnet sBTC balances). Test the bond adapter against `../../fastpool/sbtc-pool-bond-staker/contracts/bond-staker.clar` and `bond-treasury.clar` pulled in as local contracts (and the Xverse lane source for `commit-rollover`), with `fastpool-pox-5/contracts/signer-manager.clar` as the registered signer. For stBTC, add `stacking-dao-core-stbtc-v1` as a requirement, or a local mock if its dependency tree is too heavy.
- `package.json`: `@stacks/clarinet-sdk` ^3.21, `vitest` ^4.1, `@stacks/transactions` ^7.6. `node_modules` is not installed in this repo today.

### 6.3 Tests

- Every test in `tests/bxl-vault.test.ts` and `tests/bxl-btc.test.ts` must pass unchanged against the v2 vault.
- Replace `setupStackingPool` in `tests/vault-helpers.ts` with a helper that registers the local signer manager on simnet pox-5 (`grant-signer-key` + `register-signer`) and mines past the prepare phase.
- New tests: stake/unstake through the manager; prepare-phase rejection; enroll into the bond adapter before and after `bind-bond`; `commit-rollover` pass-through; collateral check counts pool value; `collect-rewards` moves sBTC into the vault; adapter rejects non-vault callers; `admin-set-pool` gating; stBTC adapter value and idle withdraw.
- Clarunit flows in `tests-clar/`: update `bxl-vault-stacking_flow_test.clar`.

### 6.4 Deployment and migration

1. Deploy `bxl-btc-v2`, `bxl-stx-v2`, `sbtc-pool-trait`, the adapters, `bxl-vault-v2` from the same deployer `SPBX1F9B4G87C3R6H4N82RRHBS2Q5523QMDV38QF`.
2. Admin: `admin-set-pool` for the adapters, `admin-set-manager fastpool-max500-signer-manager true`.
3. Wind down v1: announce; users call `withdraw-request` on v1, the admin finalizes immediately, users `deposit` into v2 and `withdraw-stx`/`deposit-stx` for STX. v1 history shows a handful of depositors.
4. Admin on v2: `enroll` the sBTC into the bond adapter before the bond 3 stake window (section 4), keeping a liquid buffer (suggest the larger of 10% or the sum of open withdrawal requests). If Esbee is not allowlisted, use the Xverse lane 3 adapter or stBTC.
5. Admin on v2: `stake` the remaining free STX for 12 cycles, outside a prepare phase. Cycle 145 reward phase runs from burn block 970,550 to 972,550.
6. Every six months: `commit-rollover` (Xverse) or nothing (Esbee), `collect-rewards` any time.

### 6.5 Dashboard (`../vault-watch-dash`)

All contract knowledge sits in `src/services/blockchain.ts`; nothing in the app reads pox-4 or dual-stacking state. Required changes:

1. Constants, lines 33 to 59: `BXL_BTC_CONTRACT`, `BXL_STX_CONTRACT`, `VAULT_CONTRACT` to the `-v2` names. Replace `YIELD_DISTRIBUTOR_CONTRACTS` and `YIELD_SENDERS` with the signer manager, the bond pools and the adapters.
2. Line 134 compares the token name exactly (`contractName === "bxl-btc"`); a `-v2` name yields a factor of 0. Compare against the constants instead.
3. `src/components/VaultOverviewCards.tsx:35` hard-codes the explorer URL for `bxl-btc`; build it from the constant.
4. Earned yield (`VaultOverviewCards.tsx`) is `vault sBTC - supply`. Add the pool value: call the vault's new read-only `get-total-sbtc-value` and subtract the supply.
5. Yield history (`blockchain.ts:521-575`) classifies `distribute-rewards` and `transfer-many`. Add the pool's `claim-rewards` and the manager's `claim-staker-rewards`/`payout` transfers.
6. Admin page: `delegate-stx` becomes `stake` and `revoke-delegate-stx` becomes `unstake`; `enroll`, `stake` and `unstake` take the pool or manager and amounts as arguments. Add buttons for the adapters' `withdraw`, `stake-update`, `collect-rewards`, `commit-rollover`, and a "claim pool rewards" button that calls the signer manager's `claim-staker-rewards` with the vault as staker. `stake` locks STX, so give it a stacking post condition or `postConditionMode: "allow"`, and bump `@stacks/transactions` to 7.6.
7. Copy in `Admin.tsx`, `VaultHowItWorksCard.tsx`, `FAQSection.tsx`, `VaultDetails.tsx` and the tutorial steps still describes Dual Stacking and Fast Pool v2.
8. `VaultDetails.tsx:34` shows locked STX from Hiro's `stx.locked`. Verify Hiro reports pox-5 locks there; unverified so far. Fallback: read `pox-5 get-staker-info` for the vault.
9. Old history: `useTransactions(VAULT_CONTRACT)` will only show v2. Query both vault IDs if the accumulated yield chart should keep v1 numbers.

## 7. Open questions

- Launch pool for bond 3: Esbee if the allowlist request lands, otherwise Xverse lane 3 (4.95% fee, explicit rollover) or stBTC. Decide the fallback order now so the adapters are ready.
- Who files the Esbee allocation request and with what number? The pledge contract gives the number; it is a change in the `sbtc-pool-bond-staker` repo, not here.
- Naming: "Esbee Vault" for the pool and "Esbee DAO" for the seat, or keep one name?
- Liquidity policy: how much sBTC stays free in the vault for withdrawals, and may `withdraw-finalize` take the early-exit or idle-fee cost out of surplus automatically?

## 8. References

- pox-5 source: `SP000000000000000000002Q6VF78.pox-5`; `fastpool-pox-5/boot/pox-5.clar` is the same canonical source.
- Xverse pool: `SP8HK160YD5GHXP69VGA0TC7AQJ1X4CDW3XVERSE.sbtc-bond-staker-v1-2` (generated from a lane-0 canonical source, header cites `fastpool/sbtc-pool-bond-staker@d8406b7`).
- Esbee v1 on mainnet: `SPFCGF789WX1B737VQYAQ6BG3QYVMJGPDKRKYK00.esbee-dao-bond-staker-1`. v2 source: `../../fastpool/sbtc-pool-bond-staker`.
- Bond admin: `SP72DMR3MJKS7RVBY33JVV7EEJSQ1PYDVKDP10FX`; its `setup-bond` calls carry the full allowlists.
- Signer managers: `fastpool-max500-signer-manager`, `xverse-signer-manager-3`, `native-pool-signer-manager` on mainnet.
- StackingDAO stBTC: https://docs.stackingdao.com/stackingdao/core-contracts/stbtc-stacking-dao-core
- Stacks: https://www.stacks.co/blog/the-genesis-bond-starts-at-bitcoin-block-966-350, https://www.stacks.co/bitcoin-staking, https://docs.stacks.co/operate/staking-stx/stack-with-a-pool, forum thread "Bond Staking and Esbee DAO" https://forum.stacks.org/t/bond-staking-and-esbee-dao/18972
