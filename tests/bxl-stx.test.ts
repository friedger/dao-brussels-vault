import { Cl } from "@stacks/transactions";
import { describe, expect, test } from "vitest";
import { getBxlStxBalance, getTotalBxlStxSupply, getBxlStxMetadata } from "./balance-helpers";
import { depositStx, withdrawStx } from "./vault-helpers";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("BXL-STX Token Contract", () => {
  test("that token has correct metadata", () => {
    const { name, symbol, decimals, uri } = getBxlStxMetadata();
    
    expect(name.result).toBeOk(Cl.stringAscii("Dao Brussels Stacks"));
    expect(symbol.result).toBeOk(Cl.stringAscii("bxlSTX"));
    expect(decimals.result).toBeOk(Cl.uint(6));
    expect(uri.result).toBeOk(Cl.none());
    expect(getTotalBxlStxSupply()).toBeOk(Cl.uint(0));
  });

  test("that non-vault cannot mint tokens", () => {
    let response = simnet.callPublicFn(
      "bxl-stx",
      "mint",
      [Cl.uint(1000000)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(401));
  });

  test("that non-vault cannot burn tokens", () => {
    let response = simnet.callPublicFn(
      "bxl-stx",
      "burn",
      [Cl.uint(300000)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(401));
  });

  test("that transfers are disabled", () => {
    // First mint some tokens via vault deposit
    let response = depositStx(2000000, deployer);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlStxBalance(deployer)).toBeOk(Cl.uint(2000000));

    // Try to transfer tokens (should fail)
    response = simnet.callPublicFn(
      "bxl-stx",
      "transfer",
      [Cl.uint(500000), Cl.principal(deployer), Cl.principal(wallet1), Cl.none()],
      deployer
    );
    expect(response.result).toBeErr(Cl.uint(403));
  });

  test("that vault functions work correctly through vault contract", () => {
    // Vault mints tokens through deposit
    let response = depositStx(1000000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlStxBalance(wallet1)).toBeOk(Cl.uint(1000000));
    expect(getTotalBxlStxSupply()).toBeOk(Cl.uint(1000000));

    // Vault burns tokens through withdrawal
    response = withdrawStx(400000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlStxBalance(wallet1)).toBeOk(Cl.uint(600000));
    expect(getTotalBxlStxSupply()).toBeOk(Cl.uint(600000));
  });

  test("that multiple users can have separate balances", () => {
    // User1 deposits STX
    let response1 = depositStx(1000000, wallet1);
    expect(response1.result).toBeOk(Cl.bool(true));
    expect(getBxlStxBalance(wallet1)).toBeOk(Cl.uint(1000000));

    // User2 deposits STX  
    let response2 = depositStx(500000, wallet2);
    expect(response2.result).toBeOk(Cl.bool(true));
    expect(getBxlStxBalance(wallet2)).toBeOk(Cl.uint(500000));
    expect(getTotalBxlStxSupply()).toBeOk(Cl.uint(1500000));

    // User1 withdraws - should not affect User2
    response1 = withdrawStx(300000, wallet1);
    expect(response1.result).toBeOk(Cl.bool(true));
    expect(getBxlStxBalance(wallet1)).toBeOk(Cl.uint(700000));
    expect(getBxlStxBalance(wallet2)).toBeOk(Cl.uint(500000)); // User2 unaffected
  });
});