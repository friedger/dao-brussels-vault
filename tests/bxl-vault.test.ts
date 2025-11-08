import { Cl } from "@stacks/transactions";
import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

describe("BXL Vault Admin Flow Tests", () => {
  it("should run admin flow tests", async () => {
    const response = simnet.callPublicFn(
      "bxl-vault",
      "deposit",
      [Cl.uint(1000)],
      wallet1
    );
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

    const response2 = simnet.callPublicFn(
      "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
      "transfer",
      [
        Cl.uint(10),
        Cl.principal(wallet2),
        Cl.principal(`${deployer}.bxl-vault`),
        Cl.none(),
      ],
      wallet2
    );
    expect(response2.result).toBeOk(Cl.bool(true));

    const depoosits = simnet.callReadOnlyFn(
      "bxl-btc",
      "get-total-supply",
      [],
      wallet1
    );
    expect(depoosits.result).toBeOk(Cl.uint(1000));

    const sbtcBalance = simnet.callReadOnlyFn(
      "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token",
      "get-balance",
      [Cl.principal(`${deployer}.bxl-vault`)],
      wallet1
    );
    expect(sbtcBalance.result).toBeOk(Cl.uint(1010));

    const response3 = simnet.callPublicFn(
      "bxl-vault",
      "admin-sbtc-transfer",
      [Cl.uint(1), Cl.principal(wallet1)],
      deployer
    );
    expect(response3.result).toBeOk(Cl.bool(true));
  });
});
