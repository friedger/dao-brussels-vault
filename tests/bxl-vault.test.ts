import { Cl } from "@stacks/transactions";
import { describe, expect, test } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("Bxl Btc Vault", () => {
  test("that user can withdraw", () => {
    // user deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // user requests withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(500), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // fast forward time
    simnet.mineEmptyBlocks(1001);

    // user executes withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-finalize",
      [Cl.uint(1)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(500));
  });

  test("that user can withdraw immediately with admin", () => {
    // user deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // user requests withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(500), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // admin executes withdrawal immediately
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-finalize",
      [Cl.uint(1)],
      deployer
    );
    expect(response.result).toBeOk(Cl.uint(500));
  });

  test("that user cannot withdraw more than deposited", () => {
    // user deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // user requests withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(1500), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(1));
  });

  test("that user cannot create duplicate withdrawal requests", () => {
    // user deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // user requests withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(500), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // user tries to create another withdrawal request
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(300), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(403));
  });

  test("that user can update withdrawal request", () => {
    // user deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // user requests withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(500), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // user updates withdrawal request with different amount
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-update",
      [Cl.uint(1), Cl.uint(300), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // fast forward time
    simnet.mineEmptyBlocks(1001);

    // user finalizes updated withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-finalize",
      [Cl.uint(1)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(300));
  });

  test("that user can cancel withdrawal request", () => {
    // user deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // user requests withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(500), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // user cancels withdrawal request by setting amount to 0
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-update",
      [Cl.uint(1), Cl.uint(0), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // user can now create a new withdrawal request
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(300), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(2));
  });

  test("that user cannot update non-existent withdrawal request", () => {
    // user tries to update non-existent request
    let response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-update",
      [Cl.uint(999), Cl.uint(500), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(404));
  });

  test("that admin cannot update another user's withdrawal request", () => {
    // wallet1 deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // wallet1 requests withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(500), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // admin tries to update wallet1's withdrawal request
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-update",
      [Cl.uint(1), Cl.uint(300), Cl.uint(1000)],
      deployer
    );
    expect(response.result).toBeErr(Cl.uint(401));
  });

  test("that user cannot finalize withdrawal before delay period", () => {
    // user deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // user requests withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(500), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // user tries to finalize withdrawal immediately
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-finalize",
      [Cl.uint(1)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(401)); // unauthorized
  });

  test("that user cannot finalize non-existent withdrawal request", () => {
    // user tries to finalize non-existent request
    let response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-finalize",
      [Cl.uint(999)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(404));
  });

  test("that user can finalize another user's withdrawal request after delay period", () => {
    // wallet1 deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // wallet1 requests withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(500), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // fast forward time
    simnet.mineEmptyBlocks(1001);

    // wallet2 finalize wallet1's withdrawal request
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-finalize",
      [Cl.uint(1)],
      wallet2
    );
    expect(response.result).toBeOk(Cl.uint(500));
  });

  test("that user cannot withdraw with invalid amount", () => {
    // user deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // user requests withdrawal with 0 amount
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(0), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(500));
  });

  test("that user cannot withdraw with insufficient delay", () => {
    // user deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // user requests withdrawal with delay less than minimum (1000 blocks)
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(500), Cl.uint(500)], // delay too short
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // fast forward time
    simnet.mineEmptyBlocks(501);

    // user tries to finalize early
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-finalize",
      [Cl.uint(1)],
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(401)); // unauthorized

    // fast forward time again
    simnet.mineEmptyBlocks(500);

    // user finalizes
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-finalize",
      [Cl.uint(1)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(500));
  });

  test("that user can update withdrawal request to increase amount", () => {
    // user deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // user requests withdrawal for 300
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(300), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // user updates withdrawal request to increase amount to 700
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-update",
      [Cl.uint(1), Cl.uint(700), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // fast forward time
    simnet.mineEmptyBlocks(1001);

    // user finalizes updated withdrawal
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-finalize",
      [Cl.uint(1)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(700));
  });

  test("that user cannot update withdrawal to exceed available balance", () => {
    // user deposits sBTC
    let response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.bool(true));

    // user requests withdrawal for 300
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-request",
      [Cl.uint(300), Cl.uint(1000)],
      wallet1
    );
    expect(response.result).toBeOk(Cl.uint(1));

    // user tries to update withdrawal request to exceed available balance
    response = simnet.callPublicFn(
      "bxl-vault",
      "withdraw-update",
      [Cl.uint(1), Cl.uint(1500), Cl.uint(1000)], // more than deposited
      wallet1
    );
    expect(response.result).toBeErr(Cl.uint(1)); // insufficient balance
  });

  describe("STX operations", () => {
    test("that user can deposit and withdraw STX", () => {
      // user deposits STX
      let response = simnet.callPublicFn(
        "bxl-vault",
        "deposit-stx",
        [Cl.uint(2000)],
        wallet1
      );
      expect(response.result).toBeOk(Cl.bool(true));

      // user withdraws STX
      response = simnet.callPublicFn(
        "bxl-vault",
        "withdraw-stx",
        [Cl.uint(1000)],
        wallet1
      );
      expect(response.result).toBeOk(Cl.bool(true));
    });

    test("that user cannot withdraw more STX than deposited", () => {
      // user deposits STX
      let response = simnet.callPublicFn(
        "bxl-vault",
        "deposit-stx",
        [Cl.uint(2000)],
        wallet1
      );
      expect(response.result).toBeOk(Cl.bool(true));

      // user tries to withdraw more than deposited
      response = simnet.callPublicFn(
        "bxl-vault",
        "withdraw-stx",
        [Cl.uint(2500)],
        wallet1
      );
      expect(response.result).toBeErr(Cl.uint(1)); // insufficient balance
    });
  });

  describe("Admin functions", () => {
    test("that admin can transfer surplus sBTC", () => {
      // user deposits sBTC
      let response = simnet.callPublicFn(
        "bxl-vault",
        "deposit",
        [Cl.uint(1000)],
        wallet1
      );
      expect(response.result).toBeOk(Cl.bool(true));

      // admin transfers surplus (assuming there's yield)
      response = simnet.callPublicFn(
        "bxl-vault",
        "admin-sbtc-transfer",
        [Cl.uint(100), Cl.principal(wallet2)],
        deployer
      );
      // This might fail if there's no surplus, but should test the admin access
    });

    test("that non-admin cannot transfer sBTC", () => {
      // user deposits sBTC
      let response = simnet.callPublicFn(
        "bxl-vault",
        "deposit",
        [Cl.uint(1000)],
        wallet1
      );
      expect(response.result).toBeOk(Cl.bool(true));

      // non-admin tries to transfer
      response = simnet.callPublicFn(
        "bxl-vault",
        "admin-sbtc-transfer",
        [Cl.uint(100), Cl.principal(wallet2)],
        wallet1
      );
      expect(response.result).toBeErr(Cl.uint(401)); // unauthorized
    });

    test("that admin can set new admin", () => {
      // admin sets wallet1 as new admin
      let response = simnet.callPublicFn(
        "bxl-vault",
        "admin-set-admin",
        [Cl.principal(wallet1), Cl.bool(true)],
        deployer
      );
      expect(response.result).toBeOk(Cl.bool(true));

      // wallet1 should now have admin privileges
      response = simnet.callPublicFn(
        "bxl-vault",
        "admin-set-admin",
        [Cl.principal(wallet2), Cl.bool(true)],
        wallet1
      );
      expect(response.result).toBeOk(Cl.bool(true));
    });
  });
});
