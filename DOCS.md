# BXL Vault: Bitcoin Yield for the Commons

**Version 1.0**  
**Date: November 2025**  
**DAO Brussels**

---

## Abstract

BXL Vault is a decentralized protocol built on the Stacks blockchain that enables users to generate a yield through Dual Stacking for the Commons by deposit Bitcoin. The protocol acknowledges ownership of Bitcoin through 1:1 backed wrapped bxlBTC tokens. The Commons is represented by an admin account, usually a multi-sig wallet controlled by stewards of the community.

---

## 1. Introduction

**Contribute to the Commons by granting access to your assets while maintaining ownership.** The DAO Brussels community generates yield from deposited assets, which stewards use to build and develop the Commons in Brussels.

BXL Vault serves as a mechanism for community-driven resource allocation. When users deposit their Bitcoin into the vault, they maintain full ownership through 1:1 backed wrapped tokens, while simultaneously contributing to a shared pool that generates yield. This yield is then stewarded by the DAO Brussels community to fund public goods, infrastructure development, and other initiatives that benefit the Brussels Commons.

The yield is generated through Dual Stacking, an mechanism on the Stacks Blockchain to put Bitcoin at work through 1:1 backed sBTC tokens and Proof-of-transfer (PoX) stacking mechanism.


### 1.1 Goals

- **Community Contribution**: Enable Bitcoin holders to contribute to the Brussels Commons while maintaining ownership
- **Yield Generation**: Participate in Bitcoin stacking rewards while maintaining token liquidity  
- **Stewardship Model**: Channel generated yield toward building and developing the Commons in Brussels
- **Decentralized Management**: Provide transparent, smart contract-based asset management
- **Capital Efficiency**: Maximize utility of deposited Bitcoin through strategic stacking

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

#### Withdrawal Process
1. Users burn their wrapped tokens (bxlBTC)
2. Equivalent underlying sBTC is transferred from the vault. The 1:1 redemption ratio is maintained

### 2.2 Stacking Integration

#### Bitcoin Stacking
1. The vault enrolls in dual stacking protocols. Any user can call the enroll function as soon as the minimum sBTC balance is reached.
2. sBTC rewards flow back to the vault

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
- Transferring admin privileges to a new account

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
| **Purpose** | Represent ownership of Bitcoin |

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

**Mitigation**: Deployment with multi-sig

### 4.3 External Dependencies

#### Protocol Dependencies
- Reliance on sBTC token contract functionality
- Dependence on Stacks PoX stacking mechanisms
- Integration with third-party stacking pools

**Mitigation**: Replace BXL Vault with a new version

### 4.4 Liquidity Risks

#### Market Conditions
- Wrapped token markets may develop differently than underlying assets
- Potential arbitrage opportunities or price deviations

**Mitigation**: Arbitrage mechanisms and market maker incentives if a market for wrapped BXL tokens develops

### 4.5 Related Risks
Some risks known from other protocols and other platforms are eliminated by design of the Clarity language and of the protocol:
* Reentrancy attacks 
* Under-collateralization

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

##### `withdraw(amount uint)`

**Purpose**: Burn bxlBTC and withdraw sBTC

| Field | Description |
|-------|-------------|
| **Parameters** | `amount`: Amount of bxlBTC to burn/sBTC to withdraw in sats|
| **Assertions** | • User has sufficient bxlBTC balance<br>• Vault has sufficient sBTC for transfer |
| **Effects** | • Burns bxlBTC from user<br>• Transfers sBTC from vault to user |

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
| **Assertions** | • User has sufficient bxlSTX balance<br>• Vault has sufficient STX for transfer |
| **Effects** | • Burns bxlSTX from user<br>• Transfers STX from vault to user |

##### `delegate-stx()`

**Purpose**: Delegate vault's STX to stacking pool (admin only)

| Field | Description |
|-------|-------------|
| **Parameters** | None |
| **Assertions** | • Caller is admin<br>• Stacking delegation succeeds |
| **Effects** | • Delegates 1,000,000 STX to pox4-multi-pool-v1<br>• Enables STX stacking rewards |

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
| **Effects** | • Transfers STX from vault to recipient<br>• Maintains full collateralization |

### 5.2 BXL-BTC Token Contract

#### Public Functions

##### `transfer(amount uint, sender principal, recipient principal, memo (optional (buff 34)))`

**Purpose**: Transfer bxlBTC tokens between principals

| Field | Description |
|-------|-------------|
| **Parameters** | • `amount`: Amount to transfer<br>• `sender`: Source principal<br>• `recipient`: Destination principal<br>• `memo`: Optional transfer memo |
| **Assertions** | • Caller is sender or has sender authorization<br>• Sender has sufficient balance |
| **Effects** | • Transfers bxlBTC from sender to recipient<br>• Emits memo if provided |

##### `mint(amount uint)`

**Purpose**: Mint new bxlBTC tokens (vault only)

| Field | Description |
|-------|-------------|
| **Parameters** | `amount`: Amount to mint |
| **Assertions** | • Caller is authorized vault contract |
| **Effects** | • Mints bxlBTC to transaction sender<br>• Increases total supply |

##### `burn(amount uint)`

**Purpose**: Burn bxlBTC tokens (vault only)

| Field | Description |
|-------|-------------|
| **Parameters** | `amount`: Amount to burn |
| **Assertions** | • Caller is authorized vault contract<br>• Sender has sufficient balance |
| **Effects** | • Burns bxlBTC from transaction sender<br>• Decreases total supply |

### 5.3 BXL-STX Token Contract

#### Public Functions

##### `transfer(amount uint, sender principal, recipient principal, memo (optional (buff 34)))`

**Purpose**: Transfer bxlSTX tokens between principals

| Field | Description |
|-------|-------------|
| **Parameters** | • `amount`: Amount to transfer<br>• `sender`: Source principal<br>• `recipient`: Destination principal<br>• `memo`: Optional transfer memo |
| **Assertions** | • Caller is sender or has sender authorization<br>• Sender has sufficient balance |
| **Effects** | • Transfers bxlSTX from sender to recipient<br>• Emits memo if provided |

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

---

## 7. Conclusion

BXL Vault provides a foundational infrastructure for deploying Bitcoins for the benefit of the Commons. The protocol's transparent design and 1:1 backing mechanism ensure user funds remain secure.

---

**Disclaimer**: This whitepaper is for informational purposes only and does not constitute financial advice. Users should conduct their own research and understand the risks involved before interacting with the protocol. Users should only deploy the amount of Bitcoins they are comfortable with.