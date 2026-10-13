import { Cl } from "@stacks/transactions";
import { describe, expect, test } from "vitest";
import {
  depositSbtc,
  depositStx,
  adminSbtcTransfer,
  adminStxTransfer,
  transferSbtcToVault,
  transferStxToVault
} from "./vault-helpers";
import {
  getTotalBxlBtcSupply,
  getSbtcBalance
} from "./balance-helpers";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("Bxl Btc Vault admin", () => {
  test("that admin can remove sBTC yield", async () => {
    // user deposits sBTC
    const response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));

    expect(response.events[0]).toStrictEqual({
      event: "ft_transfer_event",
      data: {
        amount: "1000",
        asset_identifier:
          "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token::sbtc-token",
        recipient: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.bxl-vault-v2",
        sender: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5",
      },
    });

    expect(response.events[1]).toStrictEqual({
      event: "ft_mint_event",
      data: {
        amount: "1000",
        asset_identifier:
          "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.bxl-btc-v2::bxl-btc",
        recipient: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5",
      },
    });

    // yield arrives
    const response2 = transferSbtcToVault(10, wallet2, `${deployer}.bxl-vault-v2`);
    expect(response2.result).toBeOk(Cl.bool(true));

    // Check balances using helper functions
    expect(getTotalBxlBtcSupply()).toBeOk(Cl.uint(1000));
    expect(getSbtcBalance(`${deployer}.bxl-vault-v2`)).toBeOk(Cl.uint(1010));

    // admin removes sBTC
    const response3 = adminSbtcTransfer(1, wallet1, deployer);
    expect(response3.result).toBeOk(Cl.bool(true));
  });

  test("that admin can't remove user deposits", () => {
    // user deposits sBTC
    const response = depositSbtc(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));

    // admin tries to remove sBTC
    const response2 = adminSbtcTransfer(1, wallet1, deployer);
    expect(response2.result).toBeErr(Cl.uint(500));
  });

  test("that admin can remove stx yield", () => {
    // yield arrives
    const response = transferStxToVault(10, wallet2, `${deployer}.bxl-vault-v2`);
    expect(response.result).toBeOk(Cl.bool(true));

    // admin removes STX
    const response2 = adminStxTransfer(1, wallet1, deployer);
    expect(response2.result).toBeOk(Cl.bool(true));
  });

  test("that non-admin cannot call admin functions", () => {
    let response = adminSbtcTransfer(1, wallet1, wallet1);
    expect(response.result).toBeErr(Cl.uint(401));

    response = adminStxTransfer(1, wallet1, wallet1);
    expect(response.result).toBeErr(Cl.uint(401));
  });
});
