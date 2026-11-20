# DAO Brussels Vault

Users deposit sBTC and STX and get bxlBTC and bxlSTX 1:1. The vault's admins
put the sBTC to work in an sBTC pool on pox-5 and stake the STX with a pox-5
signer. Everything the vault holds above what it owes its users is yield for
DAO Brussels.

## Money flow

1. A user deposits sBTC (or STX) and receives bxlBTC (or bxlSTX), 1:1.
2. Admins deploy the sBTC into an approved pool: StackingDAO stBTC, the Xverse
   bond pool or the Esbee bond pool. They stake the free STX with a pox-5
   signer manager.
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
| `contracts/bxl-pool-stbtc.clar`, `bxl-pool-xverse.clar`, `bxl-pool-esbee.clar` | one adapter per pool |

The Esbee pool and the signer manager used in tests are loaded from the
sibling `../../fastpool` repositories (see `Clarinet.toml`).

## Docs

- [User manual](docs/user-manual.md)
- [The three sBTC pools](docs/sbtc-pools.md)
- [Invariants](docs/invariants.md)
- [Migration to pox-5](docs/pox5-migration-plan.md)

## Development

```
clarinet check
npm test                  # vitest
npm run fuzz:invariant    # Rendezvous
```

## Version 1

The pox-4 vault (Dual Stacking, Fast Pool) is archived in [`v1/`](v1/) as its
own Clarinet project.
