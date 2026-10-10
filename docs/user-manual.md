# BXL Vault User Manual

Oct 8, 2026 · Live version: https://claude.ai/code/artifact/adc4cfd4-407a-451d-83e9-ebbd34d80cbf

BXL Vault keeps your bitcoin as sBTC and gives you exactly the amount you put in back when you leave. While it is in the vault, a 3-of-5 multisig of DAO Brussels stewards puts it to work in an sBTC bond pool. The rewards go to the Brussels crypto community, not to you.

## Stacks and sBTC in short

**Stacks** is a blockchain that builds on Bitcoin: every Stacks block is anchored in a Bitcoin block, and it runs smart contracts, such as BXL Vault. Its own coin, **STX**, pays the transaction fees. People who lock (stake) STX earn rewards paid in bitcoin.

**sBTC** is wrapped bitcoin on Stacks: each sBTC is backed 1:1 by BTC that the sBTC signers hold on Bitcoin. You send BTC to the sBTC bridge and get sBTC on Stacks; you send sBTC back to the bridge and get BTC on Bitcoin. Amounts are often given in sats: 1 BTC = 100,000,000 sats.

**Prices:** STX is priced in sats on the [STX/BTC chart on CoinGecko](https://www.coingecko.com/en/coins/stacks/btc). On 2026-10-08, 1 STX was about 462 sats. Bond pools ask for STX next to your sBTC, so this price decides how much STX that is.

## At a glance

A full round trip takes at least about a week inside the vault, plus the bridge times. It can take much longer if the admin has your sBTC in a bond. Times are approximate, at about 10 minutes per Bitcoin block.

| # | You do | You get | Typical time |
| --- | --- | --- | --- |
| 1 | Send BTC to the sBTC bridge | sBTC in your Stacks wallet | about 1 hour |
| 2 | Deposit sBTC into BXL Vault | bxlBTC, 1 per sat | 1 Stacks transaction |
| 3 | Request a withdrawal | your bxlBTC is locked for the request | 1 Stacks transaction |
| 4 | Wait | nothing to do | at least 1,000 Bitcoin blocks, about 7 days |
| 5 | Finalize the withdrawal | the same amount of sBTC back | 1 transaction, once the vault holds enough free sBTC |
| 6 | Withdraw sBTC through the bridge | BTC at your Bitcoin address | a few hours |

STX is optional and works the same way: deposit STX, get bxlSTX, withdraw STX once the vault's STX is unlocked.

## Before you start

You need a Bitcoin wallet, a Stacks wallet and a little STX for transaction fees.

- **A Stacks wallet that supports sBTC**, such as Leather or Xverse. Both show a Bitcoin address and a Stacks address for the same account.
- **BTC on Bitcoin (L1)** in that wallet or another one. Keep extra for the Bitcoin network fee of the bridge transaction.
- **A few STX** to pay Stacks transaction fees for the deposit, the withdrawal request and the finalize step.
- **Time.** Plan for at least a week between deciding to leave and having BTC back. Do not deposit money you may need at short notice.

Fees you pay:

| When | Fee | Paid in |
| --- | --- | --- |
| Bridging BTC to sBTC | Bitcoin network fee, plus the bridge fee the wallet shows | BTC |
| Each vault transaction | Stacks network fee, usually well under 1 STX | STX |
| Bridging sBTC back to BTC | Bitcoin network fee for the payout, set as a maximum when you request it | sBTC |

The vault itself charges no fee. You get back exactly the sats you deposited.

## Step 1: Bridge BTC to sBTC

sBTC is BTC on Stacks, 1 sBTC for 1 BTC. You get it by sending BTC to the sBTC bridge, which mints the same amount to your Stacks address.

1. Open the sBTC bridge in your wallet (Leather and Xverse both have one) and connect it.
2. Enter the amount of BTC. Check the minimum and the bridge fee the bridge shows before you confirm.
3. Confirm the Bitcoin transaction. Your wallet pays the Bitcoin network fee.
4. Wait for the Bitcoin confirmation. The bridge signers then mint sBTC to your Stacks address, usually within about an hour.
5. Check that the sBTC shows in your Stacks wallet before you go on.

If the deposit does not arrive, do not send it again. The bridge keeps a refund path for a deposit it cannot process; follow the status shown in the bridge.

## Step 2: Deposit into BXL Vault

Depositing sBTC gives you bxlBTC, one per sat, as your receipt. bxlBTC cannot be transferred, sold or used elsewhere: it only exists to get your sBTC back.

1. Open the BXL Vault app and connect your Stacks wallet.
2. Choose **Deposit sBTC** and enter the amount.
3. Check the transaction in your wallet: it sends that sBTC to `bxl-vault-v2` and nothing else. Confirm.
4. Your bxlBTC balance shows the amount once the transaction is confirmed, usually within a minute.

### Optional: deposit STX

You can also deposit STX and get bxlSTX one-for-one. The vault uses STX in two ways: as the STX that a bond requires next to the sBTC, and for STX staking with a pox-5 signer. Both earn more for the community.

STX is not as quick to get back as you may expect. While the vault's STX is staked or held in a bond, it is locked; see Step 3.

You can deposit more at any time. Each deposit adds to the same bxlBTC or bxlSTX balance.

## While your BTC is in the vault

The vault admin is a 3-of-5 multisig of DAO Brussels stewards: any 3 of the 5 keys must sign an admin action. The admin decides which sBTC bond pool the vault uses and when to move funds in and out. You do not need to do anything while you are in.

### What the admin can and cannot do

| The admin can | The admin cannot |
| --- | --- |
| Move the vault's sBTC and STX into an approved pool, and back | Transfer or burn your bxlBTC or bxlSTX |
| Choose and switch the pool: StackingDAO stBTC, the Xverse bond pool or the Esbee bond pool. It approves pools itself, so it could also approve a contract that keeps the funds | Send sBTC or STX that backs user deposits straight to itself; the direct transfer is capped at the rewards |
| Stake the vault's STX with a pox-5 signer, and unstake it | Change the 1:1 amount you get back |
| Finalize a withdrawal before its waiting time is over | Stop a withdrawal once its waiting time is over and the vault holds the sBTC |
| Send the rewards, the sBTC above what users are owed, to the community | Change the vault's code |
| Add or remove admins |  |

### Where the sBTC goes

sBTC only earns in pox-5 through a Bitcoin staking bond, and only pools on a bond's allowlist can join. The admin picks one of these:

| Pool | How the sBTC earns | How fast the admin can get it back |
| --- | --- | --- |
| StackingDAO stBTC | swapped for stBTC, which grows against sBTC | at once from StackingDAO's idle reserve, with a 1% fee; or about 29 days (4,200 blocks) without the fee |
| Xverse bond pool | in a 6-month bond, rolled into the next bond only when the admin commits | at the end of the bond, or early outside a pox-5 prepare phase |
| Esbee bond pool | in a 6-month bond, rolled into the next bond automatically | at the end of the bond after an exit request, or early outside a pox-5 prepare phase |

A bond also needs STX next to the sBTC, at least 5% of the sBTC's value. That STX comes from bxlSTX deposits and stays locked until the bond ends, even if the sBTC leaves early.

### Where the rewards go

Rewards arrive in the vault as sBTC. Everything above what the vault owes users belongs to DAO Brussels and funds community projects. You do not receive rewards; you get back exactly what you deposited.

## Step 3: Withdraw and bridge back to BTC

Getting sBTC out takes two transactions at least 1,000 Bitcoin blocks (about 7 days) apart. The wait gives the admin time to bring sBTC back from the pool.

### Withdraw sBTC from the vault

1. Choose **Request withdrawal**, enter the amount and a waiting time of at least 1,000 blocks. That amount of your bxlBTC is locked for the request.
2. Tell the stewards if you need the sBTC on a specific date, especially for a large amount.
3. After the waiting time, choose **Finalize**. Anyone can send this transaction, and the sBTC always goes to you. Your locked bxlBTC is burned.

Good to know:

- You can have one open request at a time. To change the amount, or cancel with an amount of 0, use **Update request**. An update starts the waiting time again.
- Finalize fails while the vault does not hold enough free sBTC. Your request stays open; try again after the admin has brought sBTC back from the pool.
- The admin can finalize your request early, for example once the sBTC is back.

### Withdraw STX

Choose **Withdraw STX** and enter the amount. It works at once when the vault holds that much unlocked STX. Otherwise it fails until the STX unlocks:

| Where the vault's STX is | When it unlocks |
| --- | --- |
| Free in the vault | now |
| Staked with a pox-5 signer | at the start of the cycle after the admin unstakes, up to about 15 days (2,100 blocks) |
| In an sBTC bond as its STX leg | when the bond ends, up to about 6 months |

### Bridge sBTC back to BTC

1. In the sBTC bridge, choose **Withdraw**, enter the amount and your Bitcoin address.
2. Set the maximum Bitcoin fee you accept. The fee is taken from the sBTC.
3. Confirm the Stacks transaction. The bridge signers send the BTC after the request is confirmed on Bitcoin, usually within a few hours.

## Risks

You can lose some or all of your BTC, or wait months to get it back. Read each risk before you deposit.

| Risk | What can happen | What limits it |
| --- | --- | --- |
| **Losses are not shared** | If a pool loses sBTC, the vault holds less than users are owed. Withdrawals are paid 1:1 in order until the vault runs out; those who leave last carry the loss. | The rewards above what users are owed act as a buffer before users are hit. |
| **Delays to get your money back** | Your withdrawal cannot be finalized until the admin brings sBTC back from the pool: up to about 29 days for stBTC without the fee, up to about 6 months for a bond. The STX leg of a bond stays locked until the bond ends. | The 7-day minimum wait; the stewards keep some sBTC free in the vault; early exit from bonds outside prepare phases. |
| **Admin keys** | 3 of the 5 stewards, or anyone holding 3 of their keys, can approve any contract as a pool and move all deposits into it, so they could take everything. They can also pick a risky pool, add admins, or leave funds in a pool and delay withdrawals. | The 3-of-5 threshold and stewards known to the community. Every pool approval and every move is public on Stacks, so anyone can watch. |
| **Admin inactivity** | If the stewards do not act, sBTC stays in a pool and your withdrawal cannot be finalized. | Nothing in the code: only the admin can bring sBTC back from a pool into the vault. Five stewards make it unlikely that fewer than 3 are reachable. |
| **Smart contracts** | A bug in the vault, the pool adapters, the pools or pox-5 can lock or lose funds. Version 2 and pox-5 are new. Testing has already found a bug in the vault's withdrawal requests (fixed in version 2) and one in an unreleased Esbee pool version. | Tests; an audit before launch is an open question. |
| **Pool operators** | StackingDAO, Xverse and Esbee run their own contracts, operators and signers. Their bugs, decisions or failures affect the vault's sBTC. | The admin can switch pools; the vault only uses approved pools. |
| **sBTC bridge** | sBTC is backed by BTC held by the sBTC signers. If they fail, are hacked or collude, sBTC can lose its backing or bridging back can stop. | A threshold of independent signers; this risk is the same for every sBTC holder. |
| **Bond allowlist** | Each bond's allowlist is set by the pox-5 bond admin. If no pool the vault uses is on it, the sBTC earns nothing. | No loss to you: the sBTC waits in the vault or the pool. |
| **Exit fees** | Getting sBTC out of stBTC at once costs 1%. The vault absorbs it as a loss. | The admin can use the fee-free 29-day route when there is time. |
| **STX price** | bxlSTX is paid back in STX, whatever its price. A falling STX price also lowers how much sBTC a bond can carry. | Applies only to STX you deposit. |
| **No transfer, no sale** | bxlBTC and bxlSTX cannot be sent or sold. The withdrawal is the only way out. | Your receipt cannot be stolen by a transfer or sold by mistake. |
| **Protocol changes** | Stacks can change how staking works, as it did when Dual Stacking ended and pox-5 replaced pox-4. The vault may need to migrate again. | Withdrawals keep working on the existing vault. |
| **Your own mistakes** | A wrong Bitcoin address, a bridge amount below the minimum or a lost wallet key cannot be undone. | Check addresses, start with a small amount, back up your wallet. |

## Open questions before launch

These need an answer before this manual goes to users.

- [ ] Mainnet addresses of `bxl-vault-v2`, the bxlBTC and bxlSTX tokens and the pool adapters. Version 2 is not deployed yet.
- [ ] The 5 stewards and the multisig address. The deploying key is the first admin and cannot remove itself, so the multisig must remove it after it is added.
- [ ] An independent audit of version 2 before deposits open.
- [ ] How much sBTC the stewards keep free in the vault for withdrawals, and their target time to bring sBTC back from a pool on request.
- [ ] The pool for bond 3, which starts at Bitcoin block 974,750 (early November 2026): Esbee if it gets on the allowlist, otherwise Xverse or stBTC.
- [ ] A fix in the Esbee pool for the STX leg after a full early exit, before Esbee is used.
- [ ] The sBTC bridge link the app points users to.
