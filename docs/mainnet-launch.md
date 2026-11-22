# BXL Vault v2: mainnet launch, 2 December 2026

Prepared 20 November 2026 at burn block 976,788. Block heights below are
exact; dates assume 144 burn blocks a day and can drift by a day.

## 1. What goes on chain

`Clarinet-mainnet.toml` lists the launch set and nothing else. All six
contracts are Clarity 6, epoch 4.0, like the pools already live on mainnet,
and every principal in them is the mainnet one.

| Order | Contract | Role |
| --- | --- | --- |
| 1 | `bxl-btc-v2` | bxlBTC receipt token |
| 2 | `bxl-stx-v2` | bxlSTX receipt token |
| 3 | `sbtc-pool-trait` | interface of the pool contracts |
| 4 | `bxl-vault-v2` | the vault; binds both tokens to itself when published |
| 5 | `bxl-pool-bond` | the vault's own pox-5 bond seat, Fast Pool max500 |
| 6 | `bxl-pool-stbtc` | StackingDAO stBTC, the always-open parking place |

Not published: `signer-manager`, `mock-sbtc-pool` and `bxl-vault-v2-rv`
(tests only), and `bxl-pool-xverse`, which is pinned to Xverse lane 3. That
lane is full and bonded until bond 9; publish a copy for the right lane if
Xverse is ever needed. The vault approves pools at runtime, so any pool
contract can be added after launch.

The tokens accept `set-vault` only from their own deployer, once, so the
same key must publish all six. A dry run of `clarinet deployments generate
--mainnet` with a stand-in key gave one batch in the order above; the source is
about 37 KB, so publishing costs well under 1 STX.

## 2. Calendar

| Burn block | Date (est.) | Event |
| --- | --- | --- |
| 976,788 | 20 Nov | today |
| ~977,650 | ~26 Nov | `setup-bond(4)` expected (about 1,300 blocks before the start in earlier bonds); bond 4's allowlist is fixed then |
| ~978,516 | 2 Dec | launch |
| 978,850 to 978,949 | 4 to 5 Dec | prepare phase: no `register` |
| 978,950 | 5 Dec | bond 4 starts |
| ~981,850 | ~26 Dec | `setup-bond(5)` expected |
| 983,050 to 983,149 | 2 to 3 Jan | prepare phase |
| 983,150 | 3 Jan | bond 5 starts |

**Bond 4 is only reachable if the allowance request goes out now.** It is
keyed on `<deployer>.bxl-pool-bond`, so the deployer address must be chosen
first. With an allowance, users have from launch to block 978,849 (about two
and a half days) to deposit sBTC and the STX leg before the admins register.
Without one, the target is bond 5.

## 3. Decisions needed before deploying

| Decision | Why it blocks |
| --- | --- |
| Deployer address | the allowance request and the deployment plan name it; it is the first admin |
| Admin multisig and its stewards | the manual promises a 3-of-5 multisig; the deployer hands over to it |
| Allowance request for bond 4 (and 5) at 0.5 BTC | without it the seat cannot join; needs the deployer address |
| Audit | the manual lists an audit before deposits open; launching on 2 Dec means launching without one |
| Where sBTC waits until the first bond | see 5.3 |
| Front-end and dashboard | `vault-watch-dash/src/services/blockchain.ts` needs the v2 contract IDs; the bridge link for users is still open |

## 4. Deploy

```
# settings/Mainnet.toml: the deployer's mnemonic (gitignored, never committed)
clarinet check --manifest-path Clarinet-mainnet.toml
clarinet deployments generate --mainnet --manifest-path Clarinet-mainnet.toml --medium-cost
# read deployments/default.mainnet-plan.yaml: six contract-publish, expected-sender = deployer
clarinet deployments apply --mainnet --manifest-path Clarinet-mainnet.toml
```

Before `apply`, on the commit being deployed: `npm test`,
`npm run fuzz:invariant`, `npm run fuzz:test`, all green.

After it, check on chain that each contract's source matches the commit, and
that `bxl-btc-v2` and `bxl-stx-v2` read the vault as their vault (a second
`set-vault` from the deployer returns `(err u403)`).

## 5. After deploy, in this order

### 5.1 Admins and pools (deployer)

1. `bxl-vault-v2 admin-set-admin <multisig> true`
2. `bxl-vault-v2 admin-set-pool <deployer>.bxl-pool-bond true`
3. `bxl-vault-v2 admin-set-pool <deployer>.bxl-pool-stbtc true`
4. `bxl-vault-v2 admin-set-manager SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.fastpool-max500-signer-manager true`
   (for staking the vault's free STX)
5. Once the multisig has signed one admin call:
   `bxl-vault-v2 admin-set-admin <deployer> false` (from the multisig). The
   vault always keeps at least one admin.

`bxl-pool-bond`, `bxl-pool-stbtc` and their admin calls all check the vault's
admin list, so nothing else needs handing over.

### 5.2 Smoke test with small amounts (a steward's wallet)

1. `deposit u10000`; bxlBTC balance is 10,000.
2. `withdraw-request u10000 u0`; `get-withdrawal-request` shows `opens-at` =
   now + 1000. An admin `withdraw-finalize` pays it at once.
3. `deposit-stx u1000000`, `withdraw-stx u1000000`.
4. `admin-sbtc-transfer u1 <multisig> (list)` fails with `(err u500)`: no
   surplus yet.

### 5.3 Putting the sBTC to work

- **Bond 4 allowance granted:** by block 978,849, `deploy` the sBTC and the
  STX leg (`min-ustx-for-sats-amount` at bond 4's terms, about 5% of the sats'
  value in STX) into `bxl-pool-bond`, then `register` with max500 and bond 4.
- **No allowance yet:** keep the sBTC in the vault until bond 5. Parking it
  in stBTC earns a little but `get-value` counts the 1% instant-exit fee at
  once, and with no surplus at launch that puts the vault under what it owes
  users (invariant #7's exception). The fee-free queued exit takes about
  4,200 blocks, which fits only if the sBTC is parked right after launch.
- **Free STX:** `stake` with max500 what the STX leg does not need. The STX
  leg must stay unstaked until it is deployed into the seat.

### 5.4 Each bond, and each reward cycle

Follow the runbook in [bxl-bond-staker-plan.md](bxl-bond-staker-plan.md):
`claim` and `collect-rewards` every cycle; roll over with `register` in the
last half cycle of the bond (from `get-bond-l1-unlock-height`), with a new
allowance for every bond.

## 6. Winding down v1

Read on 20 November: v1 (`SPBX1F9B4G87C3R6H4N82RRHBS2Q5523QMDV38QF.bxl-vault`)
owes 10,886 sats of bxlBTC to 6 holders and 12 STX of bxlSTX to 5 holders,
and holds 122,480 sats and 12 STX. No withdrawal is open.

1. Tell v1 holders to withdraw and deposit into v2. A v1 admin can finalize
   their requests at once instead of after 1,000 blocks.
2. Move v1's surplus (111,594 sats today, the Dual Stacking yield) with v1's
   `admin-sbtc-transfer`, to the DAO or into v2 as a buffer for invariant #7.
3. Keep v1 readable in the dashboard until its supply is zero.

## 7. What the admins cannot do after launch

The vault has no pause and no upgrade. If a bug turns up, the admins can
bring sBTC back from the pools into the vault and finalize users' withdrawals
early, but they cannot stop deposits or change the code. A fix means a v3 and
asking users to move again, as in section 6.
