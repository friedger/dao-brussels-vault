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
      "bxl-btc-v2",
      "mint",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(401)); // unauthorized
  });

  test("that non-vault cannot lock tokens", () => {
    // Non-vault tries to lock tokens
    let response = simnet.callPublicFn(
      "bxl-btc-v2",
      "lock",
      [Cl.uint(500)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(401)); // unauthorized
  });

  test("that non-vault cannot unlock tokens", () => {
    const response = simnet.callPublicFn(
      "bxl-btc-v2",
      "unlock",
      [Cl.uint(500)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(401));
  });

  test("that non-vault cannot burn tokens", () => {
    // Non-vault tries to burn tokens
    let response = simnet.callPublicFn(
      "bxl-btc-v2",
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
      "bxl-btc-v2",
      "transfer",
      [Cl.uint(500), Cl.principal(deployer), Cl.principal(wallet1), Cl.none()],
      deployer
    );
    expect(response.result).toBeErr(Cl.uint(403)); // forbidden
  });

  test.each(["bxl-btc-v2", "bxl-stx-v2"])(
    "that the vault of %s can be set only once",
    (token) => {
      // the vault set itself at deployment
      const response = simnet.callPublicFn(
        token,
        "set-vault",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(response.result).toBeErr(Cl.uint(403));
    }
  );

  test("that transit balances follow a user's open request", () => {
    const transit = (who: string) =>
      simnet.callReadOnlyFn(
        "bxl-btc-v2",
        "get-transit-balance",
        [Cl.principal(who)],
        wallet1
      ).result;
    const transitSupply = () =>
      simnet.callReadOnlyFn("bxl-btc-v2", "get-transit-supply", [], wallet1)
        .result;
    const vault = (fn: string, args: any[], who: string) =>
      simnet.callPublicFn("bxl-vault-v2", fn, args, who).result;

    depositSbtc(1000, wallet1);
    depositSbtc(1000, wallet2);
    expect(transit(wallet1)).toBeOk(Cl.uint(0));

    expect(
      vault("withdraw-request", [Cl.uint(300), Cl.uint(0)], wallet1)
    ).toBeOk(Cl.uint(1));
    expect(
      vault("withdraw-request", [Cl.uint(200), Cl.uint(0)], wallet2)
    ).toBeOk(Cl.uint(2));
    expect(transit(wallet1)).toBeOk(Cl.uint(300));
    expect(transit(wallet2)).toBeOk(Cl.uint(200));
    expect(transitSupply()).toBeOk(Cl.uint(500));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(700));

    // lowering the request moves the difference back
    expect(
      vault("withdraw-update", [Cl.uint(1), Cl.uint(100), Cl.uint(0)], wallet1)
    ).toBeOk(Cl.uint(1));
    expect(transit(wallet1)).toBeOk(Cl.uint(100));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(900));

    // paying out burns the transit
    simnet.mineEmptyBurnBlocks(1001);
    expect(vault("withdraw-finalize", [Cl.uint(1)], wallet1)).toBeOk(
      Cl.uint(100)
    );
    expect(transit(wallet1)).toBeOk(Cl.uint(0));
    expect(transitSupply()).toBeOk(Cl.uint(200));
    expect(getTotalBxlBtcSupply()).toBeOk(Cl.uint(1700));
  });

  test.each(["bxl-btc-v2", "bxl-stx-v2"])(
    "that only the deployer can set the vault of %s",
    (token) => {
      const response = simnet.callPublicFn(
        token,
        "set-vault",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(response.result).toBeErr(Cl.uint(401));
    }
  );
});
