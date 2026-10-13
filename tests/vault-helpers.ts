import { Cl } from "@stacks/transactions";

/**
 * Deposit sBTC to the vault
 */
export function depositSbtc(amount: number, user: string) {
  return simnet.callPublicFn(
    "bxl-vault-v2",
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
    "bxl-vault-v2",
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
    "bxl-vault-v2",
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
    "bxl-vault-v2",
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
    "bxl-vault-v2",
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
    "bxl-vault-v2",
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
    "bxl-vault-v2",
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
    "bxl-vault-v2",
    "admin-stx-transfer",
    [Cl.uint(amount), Cl.principal(recipient)],
    admin
  );
}

/**
 * Set admin privileges
 */
export function setAdmin(admin: string, enable: boolean, caller: string) {
  return simnet.callPublicFn(
    "bxl-vault-v2",
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
    "bxl-vault-v2",
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
 * Transfer STX to vault (simulates yield)
 */
export function transferStxToVault(amount: number, sender: string, vaultAddress: string) {
  return simnet.transferSTX(amount, vaultAddress, sender);
}