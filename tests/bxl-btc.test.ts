import { Cl } from "@stacks/transactions";
import { describe, expect, test } from "vitest";
import { getBxlBtcBalance, getTotalBxlBtcSupply, getBxlBtcMetadata } from "./balance-helpers";
import { depositSbtc } from "./vault-helpers";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("BXL-BTC Token Contract", () => {
  test("that token has correct metadata", () => {
    const { name, symbol, decimals, uri } = getBxlBtcMetadata();

    expect(name.result).toBeOk(Cl.stringAscii("Dao Brussels Bitcoin"));
    expect(symbol.result).toBeOk(Cl.stringAscii("bxlBTC"));
    expect(decimals.result).toBeOk(Cl.uint(8));
    expect(getTotalBxlBtcSupply()).toBeOk(Cl.uint(0));
    expect(uri.result).toBeOk(Cl.none());
  });

  test("that non-vault cannot mint tokens", () => {
    // Non-vault tries to mint tokens
    let response = simnet.callPublicFn(
      "bxl-btc",
      "mint",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(401)); // unauthorized
  });

  test("that non-vault cannot lock tokens", () => {
    // Non-vault tries to lock tokens
    let response = simnet.callPublicFn(
      "bxl-btc",
      "lock",
      [Cl.uint(500)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(401)); // unauthorized
  });

  test("that non-vault cannot burn tokens", () => {
    // Non-vault tries to burn tokens
    let response = simnet.callPublicFn(
      "bxl-btc",
      "burn",
      [Cl.uint(300), Cl.principal(wallet1)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(401)); // unauthorized
  });

  test("that transfers are disabled", () => {
    // First mint some tokens via vault
    let response = depositSbtc(1000, deployer);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(deployer)).toBeOk(Cl.uint(1000));

    // Try to transfer tokens (should fail)
    response = simnet.callPublicFn(
      "bxl-btc",
      "transfer",
      [Cl.uint(500), Cl.principal(deployer), Cl.principal(wallet1), Cl.none()],
      deployer
    );
    expect(response.result).toBeErr(Cl.uint(403)); // forbidden
  });

  test("that vault can be set only once", () => {
    // Try to set vault again (should fail if already set)
    let response = simnet.callPublicFn(
      "bxl-btc",
      "set-vault",
      [Cl.principal(wallet1)],
      deployer
    );
    expect(response.result).toBeErr(Cl.uint(403)); // forbidden - vault already set
  });
});
