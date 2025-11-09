import { Cl } from "@stacks/transactions";

/**
 * Deposit sBTC to the vault
 */
export function depositSbtc(amount: number, user: string) {
  return simnet.callPublicFn(
    "bxl-vault",
    "deposit",
    [Cl.uint(amount)],
    user
  );
}

/**
 * Deposit STX to the vault
 */
export function depositStx(amount: number, user: string) {
  return simnet.callPublicFn(
    "bxl-vault",
    "deposit-stx",
    [Cl.uint(amount)],
    user
  );
}

/**
 * Request withdrawal with delay
 */
export function withdrawRequest(amount: number, delay: number, user: string) {
  return simnet.callPublicFn(
    "bxl-vault",
    "withdraw-request",
    [Cl.uint(amount), Cl.uint(delay)],
    user
  );
}

/**
 * Update or cancel withdrawal request
 */
export function withdrawUpdate(requestId: number, amount: number, delay: number, user: string) {
  return simnet.callPublicFn(
    "bxl-vault",
    "withdraw-update",
    [Cl.uint(requestId), Cl.uint(amount), Cl.uint(delay)],
    user
  );
}

/**
 * Finalize withdrawal request
 */
export function withdrawFinalize(requestId: number, user: string) {
  return simnet.callPublicFn(
    "bxl-vault",
    "withdraw-finalize",
    [Cl.uint(requestId)],
    user
  );
}

/**
 * Withdraw STX from vault
 */
export function withdrawStx(amount: number, user: string) {
  return simnet.callPublicFn(
    "bxl-vault",
    "withdraw-stx",
    [Cl.uint(amount)],
    user
  );
}

/**
 * Admin transfer of surplus sBTC
 */
export function adminSbtcTransfer(amount: number, recipient: string, admin: string) {
  return simnet.callPublicFn(
    "bxl-vault",
    "admin-sbtc-transfer",
    [Cl.uint(amount), Cl.principal(recipient)],
    admin
  );
}

/**
 * Admin transfer of surplus STX
 */
export function adminStxTransfer(amount: number, recipient: string, admin: string) {
  return simnet.callPublicFn(
    "bxl-vault",
    "admin-stx-transfer",
    [Cl.uint(amount), Cl.principal(recipient)],
    admin
  );
}

/**
 * Delegate STX for stacking
 */
export function delegateStx(admin: string) {
  return simnet.callPublicFn(
    "bxl-vault",
    "delegate-stx",
    [],
    admin
  );
}

/**
 * Revoke STX delegation
 */
export function revokeDelegateStx(admin: string) {
  return simnet.callPublicFn(
    "bxl-vault",
    "revoke-delegate-stx",
    [],
    admin
  );
}

/**
 * Set admin privileges
 */
export function setAdmin(admin: string, enable: boolean, caller: string) {
  return simnet.callPublicFn(
    "bxl-vault",
    "admin-set-admin",
    [Cl.principal(admin), Cl.bool(enable)],
    caller
  );
}

/**
 * Get withdrawal request details
 */
export function getWithdrawalRequest(requestId: number) {
  const response = simnet.callReadOnlyFn(
    "bxl-vault",
    "get-withdrawal-request",
    [Cl.uint(requestId)],
    simnet.getAccounts().get("deployer")!
  );
  return response.result;
}

/**
 * Transfer sBTC to vault (simulates yield)
 */
export function transferSbtcToVault(amount: number, sender: string, vaultAddress: string) {
  return simnet.callPublicFn(
    "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
    "transfer",
    [
      Cl.uint(amount),
      Cl.principal(sender),
      Cl.principal(vaultAddress),
      Cl.none(),
    ],
    sender
  );
}

/**
 * Setup pool for stacking tests
 */
export function setupStackingPool() {
  return simnet.callPublicFn(
    "SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.pox4-multi-pool-v1",
    "set-pool-pox-address-active",
    [
      Cl.tuple({
        version: Cl.bufferFromHex("0x04"),
        hashbytes: Cl.bufferFromHex("0x0c7fc13d45ff9a51ec36c0dac3b9c3589175500f"),
      }),
    ],
    "SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4"
  );
}

/**
 * Transfer STX to vault (simulates yield)
 */
export function transferStxToVault(amount: number, sender: string, vaultAddress: string) {
  return simnet.transferSTX(amount, vaultAddress, sender);
}