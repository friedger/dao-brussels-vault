# BXL Vault v2: invariants

The properties `bxl-vault-v2` keeps, and how each is checked. The Rendezvous
harness [`rendezvous/bxl-vault-v2-rv.clar`](../rendezvous/bxl-vault-v2-rv.clar)
fuzzes them:

```
npm run fuzz:invariant   # invariants, checked after random call sequences
npm run fuzz:test        # properties, checked per call
```

## Notation

| Symbol | Meaning |
| --- | --- |
| S | the vault's sBTC balance |
| X | the vault's STX, locked plus unlocked |
| B, T | bxl-btc supply, bxl-btc-transit supply (bxl-btc locked in open withdrawal requests) |
| Y | bxl-stx supply |
| Pₚ | `get-pool-principal p`: principal recorded for pool p |
| Vₚ | `p.get-value`: what pool p's position is worth now, net of exit fees |
| D | `get-deployed`: total recorded principal |

The vault counts what it holds as **Cₛ = S + Σₚ min(Pₚ.sats, Vₚ.sats)** in
sBTC and **Cₓ = X + Σₚ min(Pₚ.ustx, Vₚ.ustx)** in STX.

## A. Accounting identities

These hold in every state.

| # | Invariant | Rendezvous check |
| --- | --- | --- |
| 1 | D = Σₚ Pₚ, for sats and ustx | `invariant-deployed-matches-pools` |
| 2 | A user's bxl-btc-transit is the amount of their open request, or 0 | `invariant-transit-matches-request` |
| 3 | A user has at most one open request, and the request map and the user index agree | `invariant-user-index-points-to-own-request`, `invariant-request-is-indexed` |
| 4 | A user's bxl-btc + transit = their sBTC deposits − sBTC paid to them; their bxl-stx = STX deposits − STX withdrawals | `invariant-user-sbtc-claim`, `invariant-user-stx-claim` |
| 5 | There is always at least one admin | `invariant-admins-remain` |
| 6 | Every open request id is between 1 and `get-last-request-id` | `invariant-request-is-indexed` |

## B. Solvency

| # | Invariant | Rendezvous check |
| --- | --- | --- |
| 7 | **Cₛ ≥ B + T and Cₓ ≥ Y, except for pool entry and exit fees** (see below) | `invariant-sbtc-covers-claims`, `invariant-stx-covers-claims` |
| 8 | A pool counts as at most its recorded principal, so Cₛ ≤ S + D: unrealised gains in a pool cannot be spent | by construction (`get-pools-value`) |
| 9 | Pₚ rises only in `deploy`, by exactly what left the vault, and falls only in `pool-withdrawn` called by p | `invariant-principal-within-deployed` |

**The exception in #7.** The vault keeps #7 through every user operation,
reward and admin transfer:

- deposits, withdrawal requests and withdrawals change both sides equally,
- rewards (`collect-rewards`, pox-5 staker rewards, stBTC growth realised on
  withdrawal) only add to Cₛ,
- `admin-sbtc-transfer` and `admin-stx-transfer` refuse any amount that would
  break it,
- `pool-withdrawn` cannot lower it.

Fees charged when the vault enters or leaves a pool are the exception.
`deploy` does not check coverage, and a pool's `get-value` is net of its exit
fee: deploying N sats into StackingDAO stBTC lowers Cₛ by the 1% idle exit fee
on N straight away. Leaving through the fee-free queue gets that back; leaving
through the idle reserve realises it. If the vault holds no surplus at the
time, the fee comes out of what users are owed. Losses inside a pool (a
slash, a bug) are outside the vault's control and are not covered either; #8
makes them count as soon as `get-value` shows them.

The harness measures entry fees on each `deploy` (sats sent minus how much the
pool's value rose) and reads the mock pool's unrealised loss, and adds both to
the left-hand side of the sBTC check.

## C. Where funds can go

| # | Invariant | Checked by |
| --- | --- | --- |
| 10 | `deploy`, `pool-withdrawn` and `collect-rewards` move exactly the stated sBTC and STX, nothing else (u504 otherwise) | the vault itself; unit tests in `tests/bxl-vault-v2.test.ts` |
| 11 | sBTC leaves only through `withdraw-finalize` (to the request's owner, for the transit burned), `admin-sbtc-transfer` (surplus only) or `deploy` (an approved pool) | #4 and #7 together |
| 12 | STX leaves only through `withdraw-stx` (to the caller, for the bxl-stx burned), `admin-stx-transfer` (surplus only) or `deploy` (an approved pool). Staking locks STX but does not move it | #4 and #7 together |
| 13 | No admin action changes B, T, Y or any user's balance | #4 |

## D. Withdrawal requests

| # | Invariant | Rendezvous check |
| --- | --- | --- |
| 14 | A request opens at least 1000 burn blocks after it was last set, and only an admin can pay it out earlier | `invariant-request-delay`, `invariant-no-early-finalization` |
| 15 | A request is paid at most once: finalizing deletes it | `invariant-transit-matches-request`, `invariant-request-is-indexed` |

## E. Configuration

| # | Invariant | Checked by |
| --- | --- | --- |
| 16 | Each token's vault is set once, by the token's deployer, to `bxl-vault-v2` | unit tests |
| 17 | Only admins can deploy, stake, approve pools and managers, or transfer the surplus; the adapters' `withdraw`, exit and rollover calls are admin-only too. `collect-rewards` is open to anyone but only pays the vault | unit tests; the fuzzer calls every function from admins and non-admins |

## Not invariants

- **Liquidity.** `withdraw-finalize` needs S ≥ amount and `withdraw-stx`
  needs enough unlocked STX. While funds are in a pool or staked, users wait
  for an admin to bring them back. The vault guarantees solvency, not prompt
  payout.
- **External losses.** See the exception to #7.

## Properties

Checked one call at a time by `npm run fuzz:test`, with random amounts and
callers. They replace the clarunit flows that used to live in `tests-clar/`.
A property that does not apply to the caller or the state (for example, an
admin-only property drawn for a non-admin) is discarded, not passed.

| Property | Replaces | Checks |
| --- | --- | --- |
| `test-deposit-request-cancel` | `test-happy-path` (sBTC) | deposit mints bxl-btc 1:1 and moves the sBTC into the vault; a request moves bxl-btc into transit, gets the next id and opens 1000 blocks later; cancelling restores both balances and clears the index |
| `test-stx-round-trip` | `test-happy-path` (STX) | deposit-stx mints bxl-stx 1:1; withdrawing it in two parts restores every balance |
| `test-request-above-balance-fails` | `test-unhappy-path` | a request above the user's bxl-btc fails with u1 and changes nothing |
| `test-second-request-fails` | `test-unhappy-path` | with a request open, a second one fails with u403 and the open one stays |
| `test-stx-withdraw-above-balance-fails` | `test-unhappy-path` | withdrawing more than the user's bxl-stx fails with u1 |
| `test-admin-cannot-take-principal` | `test-withdraw-admin-fails` | an admin transfer of surplus + 1 or more fails with u500 and moves nothing |
| `test-admin-can-take-yield` | `test-withdraw-admin` | sBTC sent to a covered vault can be taken out by an admin, and what users are owed does not change |
| `test-non-admin-cannot-transfer` | (new) | `admin-sbtc-transfer` from a non-admin fails with u401 |

Removing the admin check from `admin-sbtc-transfer` fails
`test-non-admin-cannot-transfer`.

## How the harness works

`rv` only calls the public functions of the contract it fuzzes. The vault
cannot call the mock pool, because the mock calls the vault and the two would
depend on each other. So the fuzzer targets the harness. Each harness function
forwards to the vault or to `mock-sbtc-pool` and records what it did in ghost
state: deposits and payouts per user, principal sent into each pool, when each
request was set, and entry fees. The invariants read the vault only through
its read-only functions. The vault identifies users and admins by
`tx-sender`, which forwarding keeps.

To reach deep states, the harness folds random amounts and ids into ranges
that can succeed: up to what the caller or the vault holds, and ids issued so
far. `rendezvous/rv.config.json` limits the callers to the deployer and three
wallets, so about a quarter of all calls come from an admin.

The fuzzer can deploy into the mock pool and into `bxl-pool-bond`, the vault's
own bond seat: deposits there wait as idle principal, anyone may pay the seat
rewards (`bond-pay-rewards`), and an admin hands both back (`bond-withdraw`,
`collect-rewards`). Its pox-5 calls need a bond set up by the bond admin, which
no fuzzer account is; `tests/bxl-pool-bond.test.ts` covers them. The
StackingDAO contracts are not activated on simnet, and the Xverse pool is not
set up for bonds; the unit tests cover those adapters.

Two mutants show the checks have teeth:

- leaving the bxl-btc-transit supply out of `admin-sbtc-transfer`'s check
  fails `invariant-sbtc-covers-claims`,
- keeping the request after `withdraw-finalize` (the v1 bug) fails
  `invariant-transit-matches-request`.
