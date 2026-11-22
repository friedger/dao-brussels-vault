# DAO Brussels Vault

Users deposit sBTC and STX and get bxlBTC and bxlSTX 1:1. The vault's admins
put the sBTC to work in an sBTC pool on pox-5 and stake the STX with a pox-5
signer. Everything the vault holds above what it owes its users is yield for
DAO Brussels.

## Money flow

1. A user deposits sBTC (or STX) and receives bxlBTC (or bxlSTX), 1:1.
2. Admins deploy the sBTC into the vault's own pox-5 bond seat
   (`bxl-pool-bond`, staking with Fast Pool) or an approved pool: StackingDAO
   stBTC or the Xverse bond pool. They stake the free STX with a pox-5 signer
   manager.
3. Rewards arrive in the vault as sBTC.
4. Admins can transfer only what the vault holds above the bxlBTC and bxlSTX
   it has issued.
5. A user withdraws sBTC after a delay of at least 1000 Bitcoin blocks (an
   admin can finalize earlier), and STX at once.

## Contracts

| Contract | Role |
| --- | --- |
| `contracts/bxl-vault-v2.clar` | the vault |
| `contracts/bxl-btc.clar`, `contracts/bxl-stx.clar` | the non-transferable receipt tokens (`bxl-btc-v2`, `bxl-stx-v2`) |
| `contracts/sbtc-pool-trait.clar` | what the vault expects from a pool adapter |
| `contracts/bxl-pool-stbtc.clar`, `bxl-pool-xverse.clar` | one adapter per pool |
| `contracts/bxl-pool-bond.clar` | the vault's own pox-5 bond seat, staking with Fast Pool's max500 signer manager |

The signer manager used in the STX staking tests is loaded from the sibling
`../../fastpool/fastpool-pox-5` repository; Fast Pool's max500 signer manager
and the Xverse and StackingDAO contracts come from mainnet (see
`Clarinet.toml`).

## Docs

- [User manual](docs/user-manual.md)
- [The sBTC pools](docs/sbtc-pools.md)
- [Invariants](docs/invariants.md)
- [Migration to pox-5](docs/pox5-migration-plan.md)
- [Plan: a bond staker for BXL only](docs/bxl-bond-staker-plan.md)
- [Mainnet launch, 2 December 2026](docs/mainnet-launch.md)

## Development

```
clarinet check
npm test                  # vitest
npm run fuzz:invariant    # Rendezvous
```

Mainnet uses its own manifest, `Clarinet-mainnet.toml`, which lists only the
contracts that go on chain; see [docs/mainnet-launch.md](docs/mainnet-launch.md).

## Version 1

The pox-4 vault (Dual Stacking, Fast Pool) is archived in [`v1/`](v1/) as its
own Clarinet project.
