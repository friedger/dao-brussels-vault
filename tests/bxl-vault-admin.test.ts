import { Cl } from "@stacks/transactions";
import { describe, expect, test } from "vitest";
import {
  depositSbtc,
  depositStx,
  adminSbtcTransfer,
  adminStxTransfer,
  delegateStx,
  revokeDelegateStx,
  transferSbtcToVault,
  transferStxToVault,
  setupStackingPool
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
        recipient: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.bxl-vault",
        sender: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5",
      },
    });

    expect(response.events[1]).toStrictEqual({
      event: "ft_mint_event",
      data: {
        amount: "1000",
        asset_identifier:
          "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.bxl-btc::bxl-btc",
        recipient: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5",
      },
    });

    // yield arrives
    const response2 = transferSbtcToVault(10, wallet2, `${deployer}.bxl-vault`);
    expect(response2.result).toBeOk(Cl.bool(true));

    // Check balances using helper functions
    expect(getTotalBxlBtcSupply()).toBeOk(Cl.uint(1000));
    expect(getSbtcBalance(`${deployer}.bxl-vault`)).toBeOk(Cl.uint(1010));

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
    const response = transferStxToVault(10, wallet2, `${deployer}.bxl-vault`);
    expect(response.result).toBeOk(Cl.bool(true));

    // admin removes STX
    const response2 = adminStxTransfer(1, wallet1, deployer);
    expect(response2.result).toBeOk(Cl.bool(true));
  });

  test("that admin can stack and revoke", () => {
    setupStackingPool();

    // user deposits stx
    const response = depositStx(1000, wallet1);
    expect(response.result).toBeOk(Cl.bool(true));

    // admin stacks
    const response2 = delegateStx(deployer);
    expect(response2.result).toBeOk(
      Cl.tuple({
        "lock-amount": Cl.uint(1000),
        stacker: Cl.principal(`${deployer}.bxl-vault`),
        "unlock-burn-height": Cl.uint(2100),
      })
    );

    const response3 = revokeDelegateStx(deployer);
    expect(response3.result).toBeOk(
      Cl.some(
        Cl.tuple({
          "amount-ustx": Cl.uint(1_000_000_000 * 1e6),
          "delegated-to": Cl.principal(
            "SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4.pox4-multi-pool-v1"
          ),
          "pox-addr": Cl.none(),
          "until-burn-ht": Cl.none(),
        })
      )
    );
  });

  test("that non-admin cannot call admin functions", () => {
    let response = adminSbtcTransfer(1, wallet1, wallet1);
    expect(response.result).toBeErr(Cl.uint(401));

    response = adminStxTransfer(1, wallet1, wallet1);
    expect(response.result).toBeErr(Cl.uint(401));

    response = delegateStx(wallet1);
    expect(response.result).toBeErr(Cl.uint(401));

    response = revokeDelegateStx(wallet1);
    expect(response.result).toBeErr(Cl.uint(401));
  });
});
