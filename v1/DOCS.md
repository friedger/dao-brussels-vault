# BXL Vault: Bitcoin Yield for the Brussels Crypto Community

**Version 1.0**  
**Date: November 2025**  
**DAO Brussels**

---

## Abstract

BXL Vault is a decentralized protocol built on the Stacks blockchain that enables users to protect the their Bitcoin and generate yield that goes directly to the community. Users maintain full ownership of their Bitcoin.

---

## 1. Introduction

**"The safest place to store your Bitcoin is your community."**

BXL Vault serves as a mechanism for community-driven resource allocation. When users deposit and lock their Bitcoin into the vault, they maintain full ownership through 1:1 backed wrapped tokens, while simultaneously contributing to a shared pool that generates yield. This yield is then stewarded by the DAO Brussels community to fund public goods, infrastructure development, and other initiatives that benefit the Brussels Crypto Community.

**How does it work?**

1. **Wrap your Bitcoin in sBTC** ([learn how to do it](https://docs.stacks.co/sbtc))
2. **Deposit it in BXL Vault** - receive bxlBTC tokens representing your ownership
3. **Yield goes to the community** - generated through Dual Stacking mechanisms

The yield is generated through Dual Stacking, a mechanism on the Stacks Blockchain to put Bitcoin to work through 1:1 backed sBTC tokens and Proof-of-Transfer (PoX) stacking.

### 1.1 Main Features

#### 🔧 Protection Against Wrench Attack
BXL Vault makes sure that nobody can ever force user to transfer their Bitcoin to them. Wrapped Bitcoin (bxlBTC) can only be unlocked by the stewards of DAO Brussels or after a period of at least one week.

#### 💰 Yield for the Community
No need to donate. Users keep their assets. Users just make them available for the community to fund itself. It's like having a house and letting the community make use of it for free. Ownership does not change.

#### 🏛️ Non-Taxable Event
If users receive yield, it quickly becomes complicated with taxes. Is it really worth it? Users may as well use it as an endowment and make sure that the yield directly goes to the community.


### 1.2 Protocol Overview

BXL Vault consists of three primary smart contracts:

- **`bxl-vault`**: Core vault managing deposits, withdrawals, and admin functions.
- **`bxl-btc`**: Wrapped Bitcoin token (bxlBTC) representing sBTC claims representing BTC claims.
- **`bxl-stx`**: Wrapped STX token for stacking operations.

The contracts are written in Clarity language.

The two wrapped tokens contracts are simple SIP-10 tokens. The supply is controlled by a mint contract that can mint and burn unlimited amounts of tokens.

The vault contract registers itself as mint contract for the two tokens. The contract ensures that the wrapped tokens are always 1:1 backed. Wrapped tokens are minted and burnt only when the corresponding amount is deposited and withdrawn.

The vault contract can be enrolled into Dual Stacking and it can participate in delegated stacking with Fast Pool v2. 

The vault contract has one privileged admin account that can transfer rewards of Dual Stacking and update the admin account.

---

## 2. Functionality

### 2.1 Core Bitcoin Operations

#### Deposit Process
1. Users deposit sBTC to the vault contract
2. Equivalent wrapped tokens (bxlBTC) are minted to the user
3. Deposited sBTC is held in the vault and may be stacked for rewards

#### Withdrawal Process (🔧 Wrench Attack Protection)
1. Users request a withdrawal by putting their wrapped tokens (bxlBTC) in transit.
2. A time-delayed withdrawal request is created with a minimum 1-week delay (1000 Bitcoin blocks).
3. Admin can execute the request immediately.
4. During the delay period, users can cancel their withdrawal.
5. After the delay period, users can finalize withdrawal to receive their sBTC.


### 2.2 Stacking Integration

#### Bitcoin Stacking
1. The vault enrolls in dual stacking protocols. Any user can call the enroll function as soon as the minimum sBTC balance is reached.
2. sBTC rewards flow back to the vault and are managed by community stewards

#### Stacks Stacking
1. Users can deposit STX for enhanced stacking capabilities
2. Equivalent wrapped tokens (bxlSTX) are minted to the user
3. Admin locks STX tokens by delegation to stacking pool (Fast Pool v2) to increase the yield of Dual Stacking.
4. At the end of the life time of BXL Vault, admin unlocks STX tokens.
5. Once STX tokens are unlocked, users burn their wrapped tokens (bxlSTX)
6. Equivalent underlying STX is transferred from the vault. The 1:1 redemption ratio is maintained.

### 2.3 Administrative Functions

The protocol includes administrative functions for:

- Transferring sBTC rewards
- Managing Dual Stacking enrollment and stacking delegation
- Transferring admin privileges to a new account (typically a multi-sig or DAO contract)
- Executing withdrawal requests

---

## 3. Token Specifications

### 3.1 bxlBTC (BXL Bitcoin) - Primary Token

| Property | Value |
|----------|-------|
| **Symbol** | `bxlBTC` |
| **Name** | Dao Brussels Bitcoin |
| **Decimals** | 8 |
| **Backed by** | sBTC tokens held in vault |
| **Ratio** | 1:1 with underlying sBTC |
| **Purpose** | Represent ownership of locked Bitcoin |

### 3.2 bxlSTX (BXL Stacks) - Stacking Operations

| Property | Value |
|----------|-------|
| **Symbol** | `bxlSTX` |
| **Name** | Dao Brussels Stacks |
| **Decimals** | 6 |
| **Backed by** | STX tokens held in vault |
| **Ratio** | 1:1 with underlying STX |
| **Purpose** | Support stacking operations and enhanced yields |

---

## 4. Risk Analysis

### 4.1 Smart Contract Risks

#### Code Vulnerabilities
- Programming errors
- Contract initialization race conditions

**Mitigation**: Comprehensive testing, Redeployment

### 4.2 Centralization Risks

#### Single Admin Control
- Current implementation relies on single admin principal, who can transfer rewards and manage stacking

**Mitigation**: Deployment with multi-sig, transfer privileges to multi-sig or DAO contract

### 4.3 External Dependencies

#### Protocol Dependencies
- Reliance on sBTC token contract functionality
- Dependence on Stacks PoX stacking mechanisms
- Integration with third-party stacking pools

**Mitigation**: Replace BXL Vault with a new version if necessary

### 4.4 Off-chain Risks

#### Account access
- Loss of seed phrase

**Mitigation**: Use smart wallets/account abstraction

### 4.5 Related Risks
Some risks known from other protocols and other platforms are eliminated by design of the Clarity language and of the protocol:
* Reentrancy attacks 
* Liquidity risks
* Under-collateralization
* Wrench attacks

---

## 5. Contract API Reference

### 5.1 BXL Vault Contract

#### Primary Bitcoin Functions

##### `deposit(amount uint)`

**Purpose**: Deposit sBTC and mint bxlBTC tokens

| Field | Description |
|-------|-------------|
| **Parameters** | `amount`: Amount of sBTC to deposit in sats |
| **Assertions** | • User has sufficient sBTC balance<br>• sBTC transfer succeeds |
| **Effects** | • Transfers sBTC from user to vault<br>• Mints equivalent bxlBTC to user |

##### `withdraw-request(amount uint, delay uint)`

**Purpose**: Request withdrawal with time delay

| Field | Description |
|-------|-------------|
| **Parameters** | • `amount`: Amount of bxlBTC to burn/sBTC to withdraw in sats<br>• `delay`: Delay in blocks (minimum 1000 blocks ≈ 1 week) |
| **Assertions** | • Amount > 0 (error u500 if invalid)<br>• User has sufficient bxlBTC balance (error u1 if insufficient)<br>• User doesn't have active withdrawal request (error u403 if forbidden)<br>• Delay >= minimum delay (1000 blocks) |
| **Effects** | • Burns bxlBTC from user and locks into transit tokens<br>• Creates withdrawal request with specified delay<br>• Maps user to request ID (only one active request per user)<br>• Returns request ID |

##### `withdraw-update(request-id uint, amount uint, delay uint)`

**Purpose**: Update or cancel an existing withdrawal request

| Field | Description |
|-------|-------------|
| **Parameters** | • `request-id`: ID of existing withdrawal request<br>• `amount`: New amount (0 to cancel)<br>• `delay`: New delay in blocks |
| **Assertions** | • Request exists (error u404 if not found)<br>• User owns the request (error u401 if unauthorized)<br>• If amount > 0: user has sufficient bxlBTC balance |
| **Effects** | • Unlocks previous amount from transit back to bxlBTC<br>• If amount = 0: deletes request and user mapping<br>• If amount > 0: locks new amount and updates request details<br>• Returns request ID |

##### `withdraw-finalize(request-id uint)`

**Purpose**: Finalize withdrawal after delay period or by admin

| Field | Description |
|-------|-------------|
| **Parameters** | `request-id`: ID of the withdrawal request to finalize |
| **Assertions** | • Request exists (error u404 if not found)<br>• User matches request owner (error u401 if unauthorized)<br>• Delay period has passed OR caller is admin<br>• Vault has sufficient sBTC for transfer |
| **Effects** | • Burns transit tokens from user<br>• Transfers sBTC from vault to user<br>• Removes withdrawal request and user mapping |

##### `admin-sbtc-transfer(amount uint, recipient principal)`

**Purpose**: Transfer surplus sBTC to specified recipient (admin only)

| Field | Description |
|-------|-------------|
| **Parameters** | • `amount`: Amount of sBTC to transfer<br>• `recipient`: Principal to receive the transfer |
| **Assertions** | • Caller is admin<br>• Remaining sBTC balance >= bxlBTC total supply after transfer<br>• Transfer succeeds |
| **Effects** | • Transfers sBTC from vault to recipient<br>• Maintains full collateralization |

#### Stacking Functions

##### `deposit-stx(amount uint)`

**Purpose**: Deposit STX for stacking operations and mint bxlSTX tokens

| Field | Description |
|-------|-------------|
| **Parameters** | `amount`: Amount of STX to deposit in uSTX |
| **Assertions** | • User has sufficient STX balance<br>• STX transfer succeeds |
| **Effects** | • Transfers STX from user to vault<br>• Mints equivalent bxlSTX to user |

##### `withdraw-stx(amount uint)`

**Purpose**: Burn bxlSTX and withdraw STX

| Field | Description |
|-------|-------------|
| **Parameters** | `amount`: Amount of bxlSTX to burn/STX to withdraw in uSTX |
| **Assertions** | • User has sufficient bxlSTX balance<br>• Vault has sufficient undelegated STX for transfer |
| **Effects** | • Burns bxlSTX from user<br>• Transfers STX from vault to user |

##### `enroll()`

**Purpose**: Enroll vault in dual stacking to generate community yield

| Field | Description |
|-------|-------------|
| **Parameters** | None |
| **Assertions** | • Vault has minimum required sBTC balance |
| **Effects** | • Enrolls vault in dual stacking protocol<br>• Enables sBTC reward generation for community |

##### `delegate-stx()`

**Purpose**: Delegate vault's STX to stacking pool (admin only)

| Field | Description |
|-------|-------------|
| **Parameters** | None |
| **Assertions** | • Caller is admin<br>• Stacking delegation succeeds |
| **Effects** | • Delegates up to 1,000,000 STX to pox4-multi-pool-v1<br>• Locks STX via PoX |

##### `revoke-delegate-stx()`

**Purpose**: Revoke STX delegation from stacking pool (admin only)

| Field | Description |
|-------|-------------|
| **Parameters** | None |
| **Assertions** | • Caller is admin<br>• Revocation succeeds |
| **Effects** | • Revokes STX delegation<br>• Stops STX stacking participation |

##### `admin-stx-transfer(amount uint, recipient principal)`

**Purpose**: Transfer surplus STX to specified recipient (admin only)

| Field | Description |
|-------|-------------|
| **Parameters** | • `amount`: Amount of STX to transfer<br>• `recipient`: Principal to receive the transfer |
| **Assertions** | • Caller is admin<br>• Remaining STX balance >= bxlSTX total supply after transfer<br>• Transfer succeeds |
| **Effects** | • Transfers STX rewards from vault to recipient<br>• Maintains full collateralization |

##### `admin-set-admin(admin principal, enable bool)`

**Purpose**: Update admin privileges (admin only)

| Field | Description |
|-------|-------------|
| **Parameters** | • `admin`: Principal to grant/revoke admin privileges<br>• `enable`: Whether to grant (true) or revoke (false) privileges |
| **Assertions** | • Caller is admin |
| **Effects** | • Updates admin privileges for specified principal |

### 5.2 BXL-BTC Token Contract

#### Public Functions

##### `transfer(amount uint, sender principal, recipient principal, memo (optional (buff 34)))`

**Purpose**: Transfer bxlBTC tokens between principals (disabled for security)

| Field | Description |
|-------|-------------|
| **Parameters** | • `amount`: Amount to transfer<br>• `sender`: Source principal<br>• `recipient`: Destination principal<br>• `memo`: Optional transfer memo |
| **Assertions** | • Always fails (transfers disabled) |
| **Effects** | • Returns error (transfers not allowed for security) |

##### `mint(amount uint)`

**Purpose**: Mint new bxlBTC tokens (vault only)

| Field | Description |
|-------|-------------|
| **Parameters** | `amount`: Amount to mint |
| **Assertions** | • Caller is authorized vault contract |
| **Effects** | • Mints bxlBTC to transaction sender<br>• Increases total supply |

##### `lock(amount uint)`

**Purpose**: Lock bxlBTC tokens during withdrawal request (vault only)

| Field | Description |
|-------|-------------|
| **Parameters** | `amount`: Amount to lock |
| **Assertions** | • Caller is authorized vault contract<br>• User has sufficient bxlBTC balance |
| **Effects** | • Burns bxlBTC from user<br>• Mints equivalent transit tokens<br>• Transfers transit tokens to user |

##### `burn(amount uint, user principal)`

**Purpose**: Burn transit tokens during withdrawal finalization (vault only)

| Field | Description |
|-------|-------------|
| **Parameters** | • `amount`: Amount to burn<br>• `user`: User whose tokens to burn |
| **Assertions** | • Caller is authorized vault contract<br>• User has sufficient transit tokens |
| **Effects** | • Burns transit tokens from specified user<br>• Decreases transit supply |

### 5.3 BXL-STX Token Contract

#### Public Functions

##### `transfer(amount uint, sender principal, recipient principal, memo (optional (buff 34)))`

**Purpose**: Transfer bxlSTX tokens between principals (disabled for security)

| Field | Description |
|-------|-------------|
| **Parameters** | • `amount`: Amount to transfer<br>• `sender`: Source principal<br>• `recipient`: Destination principal<br>• `memo`: Optional transfer memo |
| **Assertions** | • Always fails (transfers disabled) |
| **Effects** | • Returns error (transfers not allowed for security) |

##### `mint(amount uint)`

**Purpose**: Mint new bxlSTX tokens (vault only)

| Field | Description |
|-------|-------------|
| **Parameters** | `amount`: Amount to mint |
| **Assertions** | • Caller is authorized vault contract |
| **Effects** | • Mints bxlSTX to transaction sender<br>• Increases total supply |

##### `burn(amount uint)`

**Purpose**: Burn bxlSTX tokens (vault only)

| Field | Description |
|-------|-------------|
| **Parameters** | `amount`: Amount to burn |
| **Assertions** | • Caller is authorized vault contract<br>• Sender has sufficient balance |
| **Effects** | • Burns bxlSTX from transaction sender<br>• Decreases total supply |

---

## 6. Future Developments

### 6.1 Governance Implementation
- Transition from single admin to DAO governance
- Token-based voting mechanisms
- Proposal and execution frameworks

### 6.2 Enhanced Stacking Strategies
- Multi-pool delegation optimization
- Automated reward distribution
- Dynamic stacking allocation

### 6.3 Additional Asset Support
- Support for additional Bitcoin-pegged assets
- Cross-chain asset bridging
- Yield farming integrations

### 6.4 Enhanced User Security
- Support for time locks and community based approvals
- Advanced wrench attack protection mechanisms
- Multi-signature withdrawal approvals

---

## 7. Conclusion

BXL Vault provides a secure way to support the Brussels Crypot Community by staking your Bitcoin while maintaining full ownership. The protocol's transparent design, 1:1 backing mechanism, and wrench attack protection ensure your funds remain secure while generating yield that is directly received by and benefits the community.

**Remember: "The safest place to store your Bitcoin is your community."**

---

**Disclaimer**: This whitepaper is for informational purposes only and does not constitute financial advice. Users should conduct their own research and understand the risks involved before interacting with the protocol. Users should only lock the amount of Bitcoin they are comfortable with.