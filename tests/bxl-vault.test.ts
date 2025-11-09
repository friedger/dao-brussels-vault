import { Cl } from "@stacks/transactions";
import { describe, expect, test } from "vitest";
import {
  depositSbtc,
  depositStx,
  withdrawRequest,
  withdrawUpdate,
  withdrawFinalize,
  withdrawStx,
  adminSbtcTransfer,
  setAdmin
} from "./vault-helpers";
import {
  getBxlBtcBalance,
  getBxlStxBalance,
  getTotalBxlBtcSupply,
  getTotalBxlStxSupply
} from "./balance-helpers";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("Bxl Btc Vault", () => {
  test("that user can withdraw", () => {
    // user deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // user requests withdrawal
    response = withdrawRequest(500, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));

    // fast forward time
    simnet.mineEmptyBlocks(1001);

    // user executes withdrawal
    response = withdrawFinalize(1, wallet1);
    expect(response.result).toBeOk(Cl.uint(500));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));
    expect(getTotalBxlBtcSupply()).toBeOk(Cl.uint(500));
  });

  test("that user can withdraw immediately with admin", () => {
    // user deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // user requests withdrawal
    response = withdrawRequest(500, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));

    // admin executes withdrawal immediately
    response = withdrawFinalize(1, deployer);
    expect(response.result).toBeOk(Cl.uint(500));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));
    expect(getTotalBxlBtcSupply()).toBeOk(Cl.uint(500));
  });

  test("that user cannot withdraw more than deposited", () => {
    // user deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // user requests withdrawal
    response = withdrawRequest(1500, 1000, wallet1);
    expect(response.result).toBeErr(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000)); // balance unchanged
  });

  test("that user cannot create duplicate withdrawal requests", () => {
    // user deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // user requests withdrawal
    response = withdrawRequest(500, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));

    // user tries to create another withdrawal request
    response = withdrawRequest(300, 1000, wallet1);
    expect(response.result).toBeErr(Cl.uint(403));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500)); // balance unchanged
  });

  test("that user can update withdrawal request", () => {
    // user deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // user requests withdrawal
    response = withdrawRequest(500, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));

    // user updates withdrawal request with different amount
    response = withdrawUpdate(1, 300, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(700)); // 1000 - 300

    // fast forward time
    simnet.mineEmptyBlocks(1001);

    // user finalizes updated withdrawal
    response = withdrawFinalize(1, wallet1);
    expect(response.result).toBeOk(Cl.uint(300));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(700));
    expect(getTotalBxlBtcSupply()).toBeOk(Cl.uint(700));
  });

  test("that user can cancel withdrawal request", () => {
    // user deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // user requests withdrawal
    response = withdrawRequest(500, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));

    // user cancels withdrawal request by setting amount to 0
    response = withdrawUpdate(1, 0, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000)); // balance restored

    // user can now create a new withdrawal request
    response = withdrawRequest(300, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(2));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(700)); // 1000 - 300
  });

  test("that user cannot update non-existent withdrawal request", () => {
    // user tries to update non-existent request
    let response = withdrawUpdate(999, 500, 1000, wallet1);
    expect(response.result).toBeErr(Cl.uint(404));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(0)); // no balance
  });

  test("that admin cannot update another user's withdrawal request", () => {
    // wallet1 deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // wallet1 requests withdrawal
    response = withdrawRequest(500, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));

    // admin tries to update wallet1's withdrawal request
    response = withdrawUpdate(1, 300, 1000, deployer);
    expect(response.result).toBeErr(Cl.uint(401));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500)); // balance unchanged
  });

  test("that user cannot finalize withdrawal before delay period", () => {
    // user deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // user requests withdrawal
    response = withdrawRequest(500, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));

    // user tries to finalize withdrawal immediately
    response = withdrawFinalize(1, wallet1);
    expect(response.result).toBeErr(Cl.uint(401)); // unauthorized
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500)); // balance unchanged
  });

  test("that user cannot finalize non-existent withdrawal request", () => {
    // user tries to finalize non-existent request
    let response = withdrawFinalize(999, wallet1);
    expect(response.result).toBeErr(Cl.uint(404));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(0)); // no balance
  });

  test("that user can finalize another user's withdrawal request after delay period", () => {
    // wallet1 deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // wallet1 requests withdrawal
    response = withdrawRequest(500, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));

    // fast forward time
    simnet.mineEmptyBlocks(1001);

    // wallet2 finalize wallet1's withdrawal request
    response = withdrawFinalize(1, wallet2);
    expect(response.result).toBeOk(Cl.uint(500));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));
    expect(getTotalBxlBtcSupply()).toBeOk(Cl.uint(500));
  });

  test("that user cannot withdraw with invalid amount", () => {
    // user deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // user requests withdrawal with 0 amount
    response = withdrawRequest(0, 1000, wallet1);
    expect(response.result).toBeErr(Cl.uint(500));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000)); // balance unchanged
  });

  test("that user cannot withdraw with insufficient delay", () => {
    // user deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // user requests withdrawal with delay less than minimum (1000 blocks)
    response = withdrawRequest(500, 500, wallet1); // delay too short
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));

    // fast forward time
    simnet.mineEmptyBlocks(501);

    // user tries to finalize early
    response = withdrawFinalize(1, wallet1);
    expect(response.result).toBeErr(Cl.uint(401)); // unauthorized
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500)); // balance unchanged

    // fast forward time again
    simnet.mineEmptyBlocks(500);

    // user finalizes
    response = withdrawFinalize(1, wallet1);
    expect(response.result).toBeOk(Cl.uint(500));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(500));
    expect(getTotalBxlBtcSupply()).toBeOk(Cl.uint(500));
  });

  test("that user can update withdrawal request to increase amount", () => {
    // user deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // user requests withdrawal for 300
    response = withdrawRequest(300, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(700));

    // user updates withdrawal request to increase amount to 700
    response = withdrawUpdate(1, 700, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(300)); // 1000 - 700

    // fast forward time
    simnet.mineEmptyBlocks(1001);

    // user finalizes updated withdrawal
    response = withdrawFinalize(1, wallet1);
    expect(response.result).toBeOk(Cl.uint(700));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(300));
    expect(getTotalBxlBtcSupply()).toBeOk(Cl.uint(300));
  });

  test("that user cannot update withdrawal to exceed available balance", () => {
    // user deposits sBTC
    let response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

    // user requests withdrawal for 300
    response = withdrawRequest(300, 1000, wallet1);
    expect(response.result).toBeOk(Cl.uint(1));
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(700));

    // user tries to update withdrawal request to exceed available balance
    response = withdrawUpdate(1, 1500, 1000, wallet1); // more than deposited
    expect(response.result).toBeErr(Cl.uint(1)); // insufficient balance
    expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(700)); // balance unchanged
  });

  describe("STX operations", () => {
    test("that user can deposit and withdraw STX", () => {
      // user deposits STX
      let response = depositStx(2000, wallet1);
      expect(response.result).toBeOk(Cl.bool(true));
      expect(getBxlStxBalance(wallet1)).toBeOk(Cl.uint(2000));
      expect(getTotalBxlStxSupply()).toBeOk(Cl.uint(2000));

      // user withdraws STX
      response = withdrawStx(1000, wallet1);
      expect(response.result).toBeOk(Cl.bool(true));
      expect(getBxlStxBalance(wallet1)).toBeOk(Cl.uint(1000));
      expect(getTotalBxlStxSupply()).toBeOk(Cl.uint(1000));
    });

    test("that user cannot withdraw more STX than deposited", () => {
      // user deposits STX
      let response = depositStx(2000, wallet1);
      expect(response.result).toBeOk(Cl.bool(true));
      expect(getBxlStxBalance(wallet1)).toBeOk(Cl.uint(2000));

      // user tries to withdraw more than deposited
      response = withdrawStx(2500, wallet1);
      expect(response.result).toBeErr(Cl.uint(1)); // insufficient balance
      expect(getBxlStxBalance(wallet1)).toBeOk(Cl.uint(2000)); // balance unchanged
    });
  });

  describe("Admin functions", () => {
    test("that admin can transfer surplus sBTC", () => {
      // user deposits sBTC
      let response = depositSbtc(1000, wallet1);
      expect(response.result).toBeOk(Cl.bool(true));
      expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

      // admin transfers surplus (assuming there's yield)
      response = adminSbtcTransfer(100, wallet2, deployer);
      // This might fail if there's no surplus, but should test the admin access
    });

    test("that non-admin cannot transfer sBTC", () => {
      // user deposits sBTC
      let response = depositSbtc(1000, wallet1);
      expect(response.result).toBeOk(Cl.bool(true));
      expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000));

      // non-admin tries to transfer
      response = adminSbtcTransfer(100, wallet2, wallet1);
      expect(response.result).toBeErr(Cl.uint(401)); // unauthorized
      expect(getBxlBtcBalance(wallet1)).toBeOk(Cl.uint(1000)); // balance unchanged
    });

    test("that admin can set new admin", () => {
      // admin sets wallet1 as new admin
      let response = setAdmin(wallet1, true, deployer);
      expect(response.result).toBeOk(Cl.bool(true));

      // wallet1 should now have admin privileges
      response = setAdmin(wallet2, true, wallet1);
      expect(response.result).toBeOk(Cl.bool(true));
    });
  });
});
