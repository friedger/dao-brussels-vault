# BXL Vault v2: the sBTC pools

Updated Nov 20, 2026 (the Esbee pool replaced by the vault's own bond seat). Earlier version published at: https://claude.ai/code/artifact/5127ba1f-e535-4858-a5e9-58c78f93d00f

## Overview

The vault puts the sBTC it holds into one of three places: StackingDAO stBTC, the Xverse bond pool, or a pox-5 bond seat of its own. Each has a small contract with the same functions (`deposit`, `withdraw`, `collect-rewards`, `get-value`), so switching is an admin call on the vault, not a migration. That contract, not the vault, is the pool member or bond staker.

Recommended order: the vault's own bond seat for every bond it is allowlisted for, otherwise an Xverse lane with room, with stBTC as the always-open fallback.

|  | StackingDAO stBTC | Xverse lane 3 | BXL bond seat |
| --- | --- | --- | --- |
| Contract | `bxl-pool-stbtc` | `bxl-pool-xverse` | `bxl-pool-bond` (is itself the pox-5 staker) |
| Pool contract | `stacking-dao-core-stbtc-v1` | `sbtc-bond-staker-v1-3` | none; pox-5 directly |
| Needs an STX leg | no | yes | yes |
| Entry | any time, no allowlist | only while a bond is bound, first come first served | before the bond starts; BXL's own allowance, requested for each bond |
| Rewards | stBTC/sBTC ratio grows | sBTC, claimed by `collect-rewards` | sBTC from Fast Pool's max500 signer, passed on by `collect-rewards` |
| Fees | protocol fee inside the rate; 1% for an instant exit | 4.95% signer fee, which Xverse can change at once to up to 99.99% | 4.5% signer fee today, capped at 5%, increases 2 cycles delayed |
| Rollover | none needed | explicit `commit-rollover` every bond | the admin calls `register` in the old bond's last half cycle |
| Exit | instant from the idle reserve (1% fee), or queued about 4,200 blocks | at bond end, or early with `unstake-sbtc-early` | `unstake-sbtc` at any time outside prepare phases, then `withdraw` |
| Operator | StackingDAO | Xverse key | the vault's admins |

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
- **Use it when:** BXL's own seat is not on the bond's allowlist and the lane has room.

## Option 3: the vault's own bond seat

`bxl-pool-bond` holds a pox-5 bond seat for the vault only and stakes with Fast Pool's `fastpool-max500-signer-manager`. It is a separate contract because pox-5 keeps one position per principal: the vault itself keeps staking its free STX with `stake`. Planned at 0.5 BTC; see [bxl-bond-staker-plan.md](bxl-bond-staker-plan.md).

- **Entry:** the allowance is BXL's alone. The admin deploys sBTC and the STX leg into the seat and calls `register` any time before the bond starts, outside a prepare phase.
- **Rewards:** max500 pays them to the seat in sBTC (anyone may trigger it, or call the seat's `claim`); `collect-rewards` moves them into the vault. max500 takes 4.5% today, never more than 5%.
- **Rollover:** `register` for the next bond, which pox-5 accepts only in the old bond's last half cycle (about 1,050 burn blocks on mainnet).
- **Exit:** `unstake-sbtc`, early or after the bond ends, then `withdraw`. The STX leg stays locked until the bond ends.
- **Risks:** needs an allowance for every bond, including each rollover; new, unaudited code; the STX leg (about 6,700 to 7,800 STX for 0.5 BTC at bond 1 to 3 terms) is locked for the whole bond.
- **Use it when:** BXL is on the bond's allowlist.

## Switching pools and booking withdrawals

The admin allowlists an adapter with `admin-set-pool`, then calls `deploy` with that adapter and an amount. To switch, the admin withdraws from one adapter and deploys into another; users notice nothing.

```
bxl-vault-v2 --deploy: sBTC + STX--> adapter --deposit--> pool
bxl-vault-v2 <--pool-withdrawn----- adapter <--principal, rewards-- pool
```

- **Every transfer is checked.** `deploy`, `collect-rewards` and `pool-withdrawn` compare the vault's sBTC and STX balances before and after; any difference from the stated amount fails the call (error u504).
- **Withdrawals are pulled.** The adapter calls `pool-withdrawn` with the amounts it hands over and what it still has in the pool, read from the pool's own records. The vault takes the funds and sets the booked principal to that remaining amount, never higher than before.
- **Third parties can't distort the books.** Anyone can claim rewards or principal for the adapter, or send it sBTC. Whatever is not principal still in the pool ends up as surplus the admin can move, so nothing is counted twice or lost.
- **Admin transfers only take the surplus.** `admin-sbtc-transfer` and `admin-stx-transfer` count as owed all bxlBTC, the bxlBTC in open withdrawal requests, and all bxlSTX. The admin passes every adapter that holds deployed principal (each once, error u505 if one is missing, u506 if one repeats); each counts at its booked principal or at its `get-value`, whichever is lower, so a loss in a pool (such as the stBTC exit fee) counts before it is realised. `deploy` itself does not check coverage, so entering a pool with an exit fee lowers it by that fee; see [invariants.md](invariants.md).
