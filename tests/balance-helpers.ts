import { Cl } from "@stacks/transactions";

/**
 * Get bxlBTC balance for a user
 */
export function getBxlBtcBalance(user: string) {
  const response = simnet.callReadOnlyFn(
    "bxl-btc",
    "get-balance",
    [Cl.principal(user)],
    user
  );
  return response.result;
}

/**
 * Get bxlSTX balance for a user
 */
export function getBxlStxBalance(user: string) {
  const response = simnet.callReadOnlyFn(
    "bxl-stx",
    "get-balance",
    [Cl.principal(user)],
    user
  );
  return response.result;
}

/**
 * Get total supply of bxlBTC tokens
 */
export function getTotalBxlBtcSupply() {
  const response = simnet.callReadOnlyFn(
    "bxl-btc",
    "get-total-supply",
    [],
    simnet.getAccounts().get("deployer")!
  );
  return response.result;
}

/**
 * Get total supply of bxlSTX tokens
 */
export function getTotalBxlStxSupply() {
  const response = simnet.callReadOnlyFn(
    "bxl-stx",
    "get-total-supply",
    [],
    simnet.getAccounts().get("deployer")!
  );
  return response.result;
}

/**
 * Get sBTC balance for a user or contract
 */
export function getSbtcBalance(user: string) {
  const response = simnet.callReadOnlyFn(
    "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
    "get-balance",
    [Cl.principal(user)],
     simnet.getAccounts().get("deployer")!
  );
  return response.result;
}

/**
 * Get STX balance for a user
 */
export function getStxBalance(user: string) {
  return simnet.getAssetsMap().get(user)?.STX || 0n;
}

/**
 * Check token metadata for bxlBTC
 */
export function getBxlBtcMetadata() {
  const name = simnet.callReadOnlyFn("bxl-btc", "get-name", [], simnet.getAccounts().get("deployer")!);
  const symbol = simnet.callReadOnlyFn("bxl-btc", "get-symbol", [], simnet.getAccounts().get("deployer")!);
  const decimals = simnet.callReadOnlyFn("bxl-btc", "get-decimals", [], simnet.getAccounts().get("deployer")!);
  const uri = simnet.callReadOnlyFn("bxl-btc", "get-token-uri", [], simnet.getAccounts().get("deployer")!);
  
  return { name, symbol, decimals, uri };
}

/**
 * Check token metadata for bxlSTX
 */
export function getBxlStxMetadata() {
  const name = simnet.callReadOnlyFn("bxl-stx", "get-name", [], simnet.getAccounts().get("deployer")!);
  const symbol = simnet.callReadOnlyFn("bxl-stx", "get-symbol", [], simnet.getAccounts().get("deployer")!);
  const decimals = simnet.callReadOnlyFn("bxl-stx", "get-decimals", [], simnet.getAccounts().get("deployer")!);
  const uri = simnet.callReadOnlyFn("bxl-stx", "get-token-uri", [], simnet.getAccounts().get("deployer")!);
  
  return { name, symbol, decimals, uri };
}