# BXL Vault v2: the three sBTC pools

Oct 10, 2026 · Live version: https://claude.ai/code/artifact/5127ba1f-e535-4858-a5e9-58c78f93d00f

## Overview

The vault puts the sBTC it holds into one of three pools: StackingDAO stBTC, the Xverse bond pool (lane 3) or the Esbee bond pool. Each pool has a small adapter contract with the same three functions (`deposit`, `withdraw`, `collect-rewards`), so switching pools is an admin call on the vault, not a migration. The adapter, not the vault, is the pool member.

Recommended order for bond 3: Esbee if it gets on the bond 3 allowlist, otherwise Xverse lane 3, with stBTC as the always-open fallback.

|  | StackingDAO stBTC | Xverse lane 3 | Esbee |
| --- | --- | --- | --- |
| Adapter | `bxl-pool-stbtc` | `bxl-pool-xverse` | `bxl-pool-esbee` |
| Pool contract | `stacking-dao-core-stbtc-v1` | `sbtc-bond-staker-v1-3` | `esbee-dao-bond-staker-1` (v1, mainnet) |
| Needs an STX leg | no | yes | yes |
| Entry | any time, no allowlist | only while a bond is bound, first come first served | only while a bond is bound; pool must be on the bond allowlist |
| Rewards | stBTC/sBTC ratio grows | sBTC, claimed by `collect-rewards` | sBTC, claimed by `collect-rewards` |
| Fees | protocol fee inside the rate; 1% for an instant exit | 4.95% signer fee | 0 today, cap 5% |
| Rollover | none needed | explicit `commit-rollover` every bond | passive until `request-exit` |
| Exit | instant from the idle reserve (1% fee), or queued about 4,200 blocks | at bond end, or early with `unstake-sbtc-early` | at bond end, or early with `unstake-sbtc-early` |
| Operator | StackingDAO | Xverse key | Esbee DAO (members vote) |

## Option 1: StackingDAO stBTC

stBTC is the option that is always open: no allowlist, no bond window and no STX leg. The adapter swaps the vault's sBTC for stBTC. StackingDAO stakes the sBTC in pox-5 bonds, and the rewards raise the stBTC/sBTC ratio (1 stBTC = 1.00373 sBTC on 2026-10-08).

- **Rewards:** nothing to collect. The yield shows up when the vault withdraws more sats than it put in.
- **Fast exit:** `withdraw` takes sBTC from StackingDAO's idle reserve at once, for a 1% fee.
- **Slow exit, no fee today:** the admin calls `init-withdraw`, waits the cooldown of about 4,200 burn blocks, then `finish-withdraw`; the next `withdraw` hands the sBTC to the vault. The adapter tracks what each queued withdrawal will pay, so the vault keeps counting it as principal while it waits.
- **Risks:** StackingDAO contract risk and its pause switches; the 1% fee if the vault needs sBTC quickly.
- **Use it when:** the vault misses a bond window, or as a parking place between bonds.

## Option 2: Xverse sBTC bond pool, lane 3

Xverse runs six pool contracts ("lanes"); lane N takes bonds whose number mod 6 is N, so lane 3 takes bonds 3, 9, 15 and so on. Xverse was on the allowlist for bonds 1 and 2, so lane 3 is very likely on it for bond 3. Each bond runs 12 cycles and needs sBTC plus an STX leg; the vault sends both, and any spare STX waits in the adapter.

- **Entry:** only while a bond is bound, until 100 blocks before it starts. The allowance is first come first served; lane 2 filled in three days.
- **Rewards:** paid in sBTC. `collect-rewards` claims them and moves them into the vault. Xverse's signer takes 4.95%; there is no pool fee.
- **Rollover:** the admin must call `commit-rollover` before every new bond. If they forget, the pool releases the whole position at the roll: no loss, but no yield until the next bond.
- **Exit:** at bond end the principal is released; `withdraw` brings it back. Before term the admin can call `unstake-sbtc-early`.
- **Risks:** a missed `commit-rollover`; Xverse's key operates the pool.
- **Use it when:** Esbee is not on the bond allowlist.

## Option 3: Esbee bond pool

Esbee is the preferred pool: no fees today and a DAO that its members, including the vault, can vote in. The catch is the allowlist: the v1 pool (`esbee-dao-bond-staker-1`) had 5 BTC in bond 1 but is not on bond 2's allowlist, so the vault can only use it if a bond 3 request succeeds.

- **Entry:** like Xverse, sBTC plus an STX leg while a bond is bound. The operator picks the bond with `set-next-bond` and anyone can then call `bind-next-bond`.
- **Receipts:** the pool gives the adapter iou tokens for its sBTC and STX; it burns them when it pays principal back.
- **Rewards:** paid in sBTC, claimed with `collect-rewards`. Signer fee and pool fee are 0 today, capped at 5%.
- **Rollover:** passive. The position rides into each new bond until the admin calls `request-exit`.
- **Exit:** at bond end after `request-exit`, or early with `unstake-sbtc-early`; `withdraw` brings the sBTC and STX back.
- **Risks:** no allowlist entry for bond 3 yet. On mainnet the adapter's local names (`.bond-staker`, `.iou-bond-*`) must be switched to the `SPFCGF…` contracts.
- **Use it when:** it is on the bond allowlist.

## Switching pools and booking withdrawals

The admin allowlists an adapter with `admin-set-pool`, then calls `enroll` with that adapter and an amount. To switch, the admin withdraws from one adapter and enrolls into another; users notice nothing.

```
bxl-vault-v2 --enroll: sBTC + STX--> adapter --deposit--> pool
bxl-vault-v2 <--pool-withdrawn----- adapter <--principal, rewards-- pool
```

- **Every transfer is checked.** `enroll`, `collect-rewards` and `pool-withdrawn` compare the vault's sBTC and STX balances before and after; any difference from the stated amount fails the call (error u504).
- **Withdrawals are pulled.** The adapter calls `pool-withdrawn` with the amounts it hands over and what it still has in the pool, read from the pool's own records. The vault takes the funds and sets the booked principal to that remaining amount, never higher than before.
- **Third parties can't distort the books.** Anyone can claim rewards or principal for the adapter, or send it sBTC. Whatever is not principal still in the pool ends up as surplus the admin can move, so nothing is counted twice or lost.
