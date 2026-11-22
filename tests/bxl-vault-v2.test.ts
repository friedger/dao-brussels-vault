import { Cl, ClarityType } from "@stacks/transactions";
import { describe, expect, test } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const VAULT = "bxl-vault-v2";
const vaultId = `${deployer}.${VAULT}`;
const mockPool = `${deployer}.mock-sbtc-pool`;
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";

// StackingDAO activates its contracts by governance after deployment, which
// simnet does not replay.
const STACKING_DAO = "SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG";
const activateStackingDao = () => {
  for (const name of [
    "stacking-dao-core-stbtc-v1",
    "stbtc-reserve",
    "rewards-pox5-v1",
    "data-stbtc-v1",
    "withdraw-data-stbtc",
  ]) {
    expect(
      simnet.callPublicFn(
        `${STACKING_DAO}.dao`,
        "set-contract-active",
        [Cl.principal(`${STACKING_DAO}.${name}`), Cl.bool(true)],
        STACKING_DAO
      ).result
    ).toBeOk(Cl.bool(true));
  }
};

const call = (fn: string, args: any[], sender: string) =>
  simnet.callPublicFn(VAULT, fn, args, sender);

const sbtcBalance = (who: string) => {
  const { result } = simnet.callReadOnlyFn(
    SBTC,
    "get-balance",
    [Cl.principal(who)],
    deployer
  );
  return Number((result as any).value.value);
};

/** Admin pulls funds out of a pool adapter; returns what reached the vault. */
const poolWithdraw = (pool: string, sats: number) => {
  const sbtcBefore = sbtcBalance(vaultId);
  const stxBefore = Number(simnet.getAssetsMap().get("STX")?.get(vaultId) ?? 0n);
  const { result } = simnet.callPublicFn(
    pool.split(".")[1],
    "withdraw",
    [Cl.uint(sats)],
    deployer
  );
  expect(result).toHaveClarityType(ClarityType.ResponseOk);
  return {
    sats: sbtcBalance(vaultId) - sbtcBefore,
    ustx:
      Number(simnet.getAssetsMap().get("STX")?.get(vaultId) ?? 0n) - stxBefore,
  };
};

const stxBalance = (who: string) =>
  Number(simnet.getAssetsMap().get("STX")?.get(who) ?? 0n);

const deployed = () =>
  simnet.callReadOnlyFn(VAULT, "get-deployed", [], deployer).result;

const sbtcTransfer = (amount: number, pools: string[]) =>
  call(
    "admin-sbtc-transfer",
    [
      Cl.uint(amount),
      Cl.principal(deployer),
      Cl.list(pools.map((p) => Cl.principal(p))),
    ],
    deployer
  );

const approveMockPool = () =>
  expect(
    call("admin-set-pool", [Cl.principal(mockPool), Cl.bool(true)], deployer)
      .result
  ).toBeOk(Cl.bool(true));

describe("bxl-vault-v2 user mechanics (unchanged from v1)", () => {
  test("deposit, request and finalize an sBTC withdrawal", () => {
    expect(call("deposit", [Cl.uint(1000)], wallet1).result).toBeOk(
      Cl.bool(true)
    );
    expect(
      simnet.callReadOnlyFn(
        "bxl-btc-v2",
        "get-balance",
        [Cl.principal(wallet1)],
        wallet1
      ).result
    ).toBeOk(Cl.uint(1000));

    expect(
      call("withdraw-request", [Cl.uint(400), Cl.uint(1000)], wallet1).result
    ).toBeOk(Cl.uint(1));
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeErr(
      Cl.uint(401)
    );
    simnet.mineEmptyBurnBlocks(1001);
    const before = sbtcBalance(wallet1);
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeOk(
      Cl.uint(400)
    );
    expect(sbtcBalance(wallet1)).toBe(before + 400);
  });

  test("a finalized request cannot be finalized or updated again", () => {
    call("deposit", [Cl.uint(1000)], wallet1);
    call("withdraw-request", [Cl.uint(400), Cl.uint(1000)], wallet1);
    simnet.mineEmptyBurnBlocks(1001);
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeOk(
      Cl.uint(400)
    );

    // A new request with a long delay must not be paid out early through
    // the old, already open request id.
    expect(
      call("withdraw-request", [Cl.uint(400), Cl.uint(10_000)], wallet1).result
    ).toBeOk(Cl.uint(2));
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeErr(
      Cl.uint(404)
    );
    expect(
      call("withdraw-update", [Cl.uint(1), Cl.uint(400), Cl.uint(1000)], wallet1)
        .result
    ).toBeErr(Cl.uint(404));
    expect(call("withdraw-finalize", [Cl.uint(2)], wallet1).result).toBeErr(
      Cl.uint(401)
    );
  });

  test("request getters follow a request from open to paid", () => {
    const request = (id: number) =>
      simnet.callReadOnlyFn(VAULT, "get-withdrawal-request", [Cl.uint(id)], wallet1)
        .result;
    const requestId = (who: string) =>
      simnet.callReadOnlyFn(
        VAULT,
        "get-withdrawal-request-id",
        [Cl.principal(who)],
        wallet1
      ).result;
    const lastId = () =>
      simnet.callReadOnlyFn(VAULT, "get-last-request-id", [], wallet1).result;

    expect(lastId()).toBeUint(0);
    expect(request(1)).toBeNone();
    expect(requestId(wallet1)).toBeNone();

    call("deposit", [Cl.uint(1000)], wallet1);
    const height = simnet.burnBlockHeight;
    expect(
      call("withdraw-request", [Cl.uint(400), Cl.uint(0)], wallet1).result
    ).toBeOk(Cl.uint(1));
    expect(lastId()).toBeUint(1);
    expect(requestId(wallet1)).toBeSome(Cl.uint(1));
    expect(request(1)).toBeSome(
      Cl.tuple({
        user: Cl.principal(wallet1),
        amount: Cl.uint(400),
        // a delay below the minimum is raised to it
        "opens-at": Cl.uint(height + 1000),
      })
    );

    simnet.mineEmptyBurnBlocks(1001);
    call("withdraw-finalize", [Cl.uint(1)], wallet1);
    expect(request(1)).toBeNone();
    expect(requestId(wallet1)).toBeNone();
    // ids are never reused
    expect(lastId()).toBeUint(1);
  });

  test("an update with a long delay keeps it", () => {
    call("deposit", [Cl.uint(1000)], wallet1);
    call("withdraw-request", [Cl.uint(400), Cl.uint(1000)], wallet1);
    const height = simnet.burnBlockHeight;
    expect(
      call("withdraw-update", [Cl.uint(1), Cl.uint(500), Cl.uint(5000)], wallet1)
        .result
    ).toBeOk(Cl.uint(1));
    expect(
      simnet.callReadOnlyFn(VAULT, "get-withdrawal-request", [Cl.uint(1)], wallet1)
        .result
    ).toBeSome(
      Cl.tuple({
        user: Cl.principal(wallet1),
        amount: Cl.uint(500),
        "opens-at": Cl.uint(height + 5000),
      })
    );
    simnet.mineEmptyBurnBlocks(1001);
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeErr(
      Cl.uint(401)
    );
  });

  test("deposit and withdraw STX", () => {
    expect(call("deposit-stx", [Cl.uint(5_000_000)], wallet1).result).toBeOk(
      Cl.bool(true)
    );
    expect(call("withdraw-stx", [Cl.uint(2_000_000)], wallet1).result).toBeOk(
      Cl.bool(true)
    );
    expect(
      simnet.callReadOnlyFn(
        "bxl-stx-v2",
        "get-total-supply",
        [],
        wallet1
      ).result
    ).toBeOk(Cl.uint(3_000_000));
  });
});

describe("bxl-vault-v2 sBTC pools", () => {
  test("only the admin deploys, and only into approved pools", () => {
    call("deposit", [Cl.uint(10_000)], wallet1);
    const args = [Cl.principal(mockPool), Cl.uint(5_000), Cl.uint(0)];
    expect(call("deploy", args, wallet1).result).toBeErr(Cl.uint(401));
    expect(call("deploy", args, deployer).result).toBeErr(Cl.uint(502));
    approveMockPool();
    expect(call("deploy", args, deployer).result).toBeOk(Cl.bool(true));
    expect(sbtcBalance(mockPool)).toBe(5_000);
    expect(deployed()).toBeTuple({ sats: Cl.uint(5_000), ustx: Cl.uint(0) });
  });

  test("deploy sends the STX leg as well", () => {
    call("deposit", [Cl.uint(10_000)], wallet1);
    call("deposit-stx", [Cl.uint(3_000_000)], wallet2);
    approveMockPool();
    expect(
      call(
        "deploy",
        [Cl.principal(mockPool), Cl.uint(10_000), Cl.uint(3_000_000)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));
    expect(stxBalance(mockPool)).toBe(3_000_000);
    expect(deployed()).toBeTuple({
      sats: Cl.uint(10_000),
      ustx: Cl.uint(3_000_000),
    });
  });

  test("deploy can send the STX leg alone", () => {
    call("deposit-stx", [Cl.uint(3_000_000)], wallet2);
    approveMockPool();
    expect(
      call(
        "deploy",
        [Cl.principal(mockPool), Cl.uint(0), Cl.uint(1_000_000)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));
    expect(stxBalance(mockPool)).toBe(1_000_000);
    expect(deployed()).toBeTuple({ sats: Cl.uint(0), ustx: Cl.uint(1_000_000) });
    // nothing to deploy at all
    expect(
      call("deploy", [Cl.principal(mockPool), Cl.uint(0), Cl.uint(0)], deployer)
        .result
    ).toBeErr(Cl.uint(500));
  });

  test("admin-stx-transfer takes the surplus and not a uSTX more", () => {
    call("deposit-stx", [Cl.uint(3_000_000)], wallet1);
    simnet.transferSTX(500, vaultId, wallet2);
    const stxTransfer = (amount: number) =>
      call(
        "admin-stx-transfer",
        [Cl.uint(amount), Cl.principal(deployer), Cl.list([])],
        deployer
      ).result;
    expect(stxTransfer(501)).toBeErr(Cl.uint(500));
    expect(stxTransfer(500)).toBeOk(Cl.bool(true));
    expect(stxTransfer(1)).toBeErr(Cl.uint(500));
    expect(stxBalance(vaultId)).toBe(3_000_000);
  });

  test("pool principal counts towards the collateral check", () => {
    call("deposit", [Cl.uint(10_000)], wallet1);
    approveMockPool();
    call("deploy", [Cl.principal(mockPool), Cl.uint(8_000), Cl.uint(0)], deployer);
    // Nothing above what users are owed.
    expect(
      sbtcTransfer(1, [mockPool])
        .result
    ).toBeErr(Cl.uint(500));
  });

  test("rewards land in the vault as surplus", () => {
    call("deposit", [Cl.uint(10_000)], wallet1);
    approveMockPool();
    call("deploy", [Cl.principal(mockPool), Cl.uint(10_000), Cl.uint(0)], deployer);
    simnet.callPublicFn(
      "mock-sbtc-pool",
      "add-sbtc",
      [Cl.uint(0), Cl.uint(300)],
      wallet2
    );
    // anyone may collect
    expect(
      call("collect-rewards", [Cl.principal(mockPool)], wallet2).result
    ).toBeOk(Cl.uint(300));
    expect(sbtcBalance(vaultId)).toBe(300);
    expect(
      sbtcTransfer(300, [mockPool])
        .result
    ).toBeOk(Cl.bool(true));
  });

  test("pool withdrawals lower the principal and keep growth as yield", () => {
    call("deposit", [Cl.uint(10_000)], wallet1);
    call("deposit-stx", [Cl.uint(1_000_000)], wallet1);
    approveMockPool();
    call(
      "deploy",
      [Cl.principal(mockPool), Cl.uint(10_000), Cl.uint(1_000_000)],
      deployer
    );
    simnet.callPublicFn(
      "mock-sbtc-pool",
      "add-sbtc",
      [Cl.uint(200), Cl.uint(0)],
      wallet2
    );
    expect(
      poolWithdraw(mockPool, 4_000)
    ).toEqual({ sats: 4_000, ustx: 1_000_000 });
    // The record follows what the pool still holds (6,000 + 200 growth),
    // never above what went in.
    expect(deployed()).toBeTuple({ sats: Cl.uint(6_200), ustx: Cl.uint(0) });

    // The rest, with the 200 sats of growth.
    expect(
      poolWithdraw(mockPool, 100_000)
    ).toEqual({ sats: 6_200, ustx: 0 });
    expect(deployed()).toBeTuple({ sats: Cl.uint(0), ustx: Cl.uint(0) });
    expect(sbtcBalance(vaultId)).toBe(10_200);

    // a withdrawal can be paid again
    call("withdraw-request", [Cl.uint(10_000), Cl.uint(1000)], wallet1);
    simnet.mineEmptyBurnBlocks(1001);
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeOk(
      Cl.uint(10_000)
    );
  });

  test("pool-withdrawn only lowers the caller's own principal", () => {
    call("deposit", [Cl.uint(1_000)], wallet1);
    approveMockPool();
    call("deploy", [Cl.principal(mockPool), Cl.uint(1_000), Cl.uint(0)], deployer);
    expect(
      call("pool-withdrawn", [Cl.uint(1_000), Cl.uint(0), Cl.uint(0), Cl.uint(0)], deployer)
        .result
    ).toBeErr(Cl.uint(404));
    expect(deployed()).toBeTuple({ sats: Cl.uint(1_000), ustx: Cl.uint(0) });
  });

  test("pool-withdrawn needs the adapter to act as itself", () => {
    call("deposit", [Cl.uint(10_000)], wallet1);
    approveMockPool();
    call("deploy", [Cl.principal(mockPool), Cl.uint(5_000), Cl.uint(0)], deployer);
    // the adapter is contract-caller, but tx-sender is still the wallet
    expect(
      simnet.callPublicFn(
        "mock-sbtc-pool",
        "report-withdrawn-as-caller",
        [Cl.uint(0)],
        wallet2
      ).result
    ).toBeErr(Cl.uint(401));
    expect(deployed()).toBeTuple({ sats: Cl.uint(5_000), ustx: Cl.uint(0) });
  });

  test("deploy fails when the adapter sends anything back", () => {
    call("deposit", [Cl.uint(10_000)], wallet1);
    approveMockPool();
    simnet.callPublicFn("mock-sbtc-pool", "add-sbtc", [Cl.uint(1), Cl.uint(0)], wallet2);
    simnet.callPublicFn("mock-sbtc-pool", "set-cheat", [Cl.uint(1)], wallet2);
    expect(
      call("deploy", [Cl.principal(mockPool), Cl.uint(5_000), Cl.uint(0)], deployer)
        .result
    ).toBeErr(Cl.uint(504));
    expect(deployed()).toBeTuple({ sats: Cl.uint(0), ustx: Cl.uint(0) });
  });

  test("collect-rewards only from approved pools", () => {
    expect(
      call("collect-rewards", [Cl.principal(mockPool)], wallet1).result
    ).toBeErr(Cl.uint(502));
  });

  test("collect-rewards fails when the adapter reports more than it sends", () => {
    call("deposit", [Cl.uint(10_000)], wallet1);
    approveMockPool();
    call("deploy", [Cl.principal(mockPool), Cl.uint(10_000), Cl.uint(0)], deployer);
    simnet.callPublicFn("mock-sbtc-pool", "add-sbtc", [Cl.uint(0), Cl.uint(300)], wallet2);
    simnet.callPublicFn("mock-sbtc-pool", "set-cheat", [Cl.uint(2)], wallet2);
    expect(
      call("collect-rewards", [Cl.principal(mockPool)], wallet2).result
    ).toBeErr(Cl.uint(504));
    expect(sbtcBalance(vaultId)).toBe(0);
  });

  test("open withdrawal requests count as owed", () => {
    call("deposit", [Cl.uint(1_000)], wallet1);
    call("withdraw-request", [Cl.uint(1_000), Cl.uint(1000)], wallet1);
    // All bxl-btc is in transit; the sBTC behind it is still owed.
    expect(sbtcTransfer(1, []).result).toBeErr(Cl.uint(500));
    simnet.callPublicFn(
      SBTC,
      "transfer",
      [Cl.uint(10), Cl.principal(wallet2), Cl.principal(vaultId), Cl.none()],
      wallet2
    );
    expect(sbtcTransfer(11, []).result).toBeErr(Cl.uint(500));
    expect(sbtcTransfer(10, []).result).toBeOk(Cl.bool(true));
    simnet.mineEmptyBurnBlocks(1001);
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeOk(
      Cl.uint(1_000)
    );
  });

  test("admin transfers must list every pool with principal, once", () => {
    call("deposit", [Cl.uint(10_000)], wallet1);
    approveMockPool();
    call("deploy", [Cl.principal(mockPool), Cl.uint(5_000), Cl.uint(0)], deployer);
    expect(sbtcTransfer(1, []).result).toBeErr(Cl.uint(505));
    expect(sbtcTransfer(1, [mockPool, mockPool]).result).toBeErr(Cl.uint(506));
    // complete: passes the pool check, then finds no surplus
    expect(sbtcTransfer(1, [mockPool]).result).toBeErr(Cl.uint(500));
    expect(
      call(
        "admin-stx-transfer",
        [Cl.uint(1), Cl.principal(deployer), Cl.list([])],
        deployer
      ).result
    ).toBeErr(Cl.uint(505));
  });

  test("a loss in a pool counts before it is realised", () => {
    call("deposit", [Cl.uint(10_000)], wallet1);
    approveMockPool();
    call("deploy", [Cl.principal(mockPool), Cl.uint(10_000), Cl.uint(0)], deployer);
    // 300 sats of yield reach the vault, but the pool position lost 200.
    simnet.callPublicFn(
      SBTC,
      "transfer",
      [Cl.uint(300), Cl.principal(wallet2), Cl.principal(vaultId), Cl.none()],
      wallet2
    );
    simnet.callPublicFn("mock-sbtc-pool", "set-loss", [Cl.uint(200)], wallet2);
    expect(sbtcTransfer(101, [mockPool]).result).toBeErr(Cl.uint(500));
    expect(sbtcTransfer(100, [mockPool]).result).toBeOk(Cl.bool(true));
  });

  test("a disabled pool can still be emptied", () => {
    call("deposit", [Cl.uint(1_000)], wallet1);
    approveMockPool();
    call("deploy", [Cl.principal(mockPool), Cl.uint(1_000), Cl.uint(0)], deployer);
    call("admin-set-pool", [Cl.principal(mockPool), Cl.bool(false)], deployer);
    expect(
      poolWithdraw(mockPool, 1_000)
    ).toEqual({ sats: 1_000, ustx: 0 });
  });
});

describe("pool adapters", () => {
  test.each(["bxl-pool-stbtc", "bxl-pool-xverse", "bxl-pool-bond", "mock-sbtc-pool"])(
    "%s only takes calls from the vault",
    (adapter) => {
      expect(
        simnet.callPublicFn(adapter, "deposit", [Cl.uint(1), Cl.uint(0)], wallet1)
          .result
      ).toBeErr(Cl.uint(401));
      expect(
        simnet.callPublicFn(adapter, "withdraw", [Cl.uint(1)], wallet1).result
      ).toBeErr(Cl.uint(401));
      expect(
        simnet.callPublicFn(adapter, "collect-rewards", [], wallet1).result
      ).toBeErr(Cl.uint(401));
    }
  );

  test("adapter admin actions need a vault admin", () => {
    expect(
      simnet.callPublicFn("bxl-pool-xverse", "commit-rollover", [], wallet1)
        .result
    ).toBeErr(Cl.uint(401));
    expect(
      simnet.callPublicFn(
        "bxl-pool-bond",
        "register",
        [Cl.principal(`${deployer}.signer-manager`), Cl.uint(1)],
        wallet1
      ).result
    ).toBeErr(Cl.uint(401));
    expect(
      simnet.callPublicFn("bxl-pool-stbtc", "init-withdraw", [Cl.uint(1)], wallet1)
        .result
    ).toBeErr(Cl.uint(401));
  });

  test("the vault deposits into and withdraws from stBTC through the adapter", () => {
    const stbtcPool = `${deployer}.bxl-pool-stbtc`;
    activateStackingDao();
    // The first stBTC depositor gives up 1000 dead shares; mainnet is past that.
    simnet.callPublicFn(
      `${STACKING_DAO}.stacking-dao-core-stbtc-v1`,
      "deposit",
      [Cl.uint(100_000), Cl.uint(0)],
      wallet2
    );
    call("deposit", [Cl.uint(100_000)], wallet1);
    call("admin-set-pool", [Cl.principal(stbtcPool), Cl.bool(true)], deployer);
    expect(
      call(
        "deploy",
        [Cl.principal(stbtcPool), Cl.uint(50_000), Cl.uint(0)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));
    expect(
      simnet.callReadOnlyFn("bxl-pool-stbtc", "get-sbtc-value", [], deployer)
        .result
    ).toBeUint(50_000);
    // For the collateral checks it counts net of the 1% idle exit fee.
    expect(
      simnet.callReadOnlyFn("bxl-pool-stbtc", "get-value", [], deployer).result
    ).toBeOk(Cl.tuple({ sats: Cl.uint(49_500), ustx: Cl.uint(0) }));

    // Instant withdrawal from the idle reserve costs the 1% idle fee.
    expect(
      poolWithdraw(stbtcPool, 10_000)
    ).toEqual({ sats: 9_900, ustx: 0 });
    // The record is what StackingDAO still holds for the adapter: the fee is
    // a loss, partly won back because the fee raises the stBTC ratio.
    const left = simnet.callReadOnlyFn(
      "bxl-pool-stbtc",
      "get-position",
      [],
      deployer
    ).result;
    expect(left).toBeUint(40_028);
    expect(deployed()).toBeTuple({ sats: left, ustx: Cl.uint(0) });
  });
});

describe("admins", () => {
  const setAdmin = (who: string, enable: boolean, sender: string) =>
    call("admin-set-admin", [Cl.principal(who), Cl.bool(enable)], sender).result;

  const adminCount = () =>
    simnet.callReadOnlyFn(VAULT, "get-admin-count", [], wallet1).result;

  test("there is always at least one admin", () => {
    expect(adminCount()).toBeUint(1);
    // the only admin cannot step down
    expect(setAdmin(deployer, false, deployer)).toBeErr(Cl.uint(403));
    expect(setAdmin(wallet1, true, deployer)).toBeOk(Cl.bool(true));
    expect(adminCount()).toBeUint(2);
    // enabling an admin twice does not count twice
    expect(setAdmin(wallet1, true, deployer)).toBeOk(Cl.bool(true));
    expect(adminCount()).toBeUint(2);
    // with two admins, one may step down or remove the other
    expect(setAdmin(deployer, false, deployer)).toBeOk(Cl.bool(true));
    expect(adminCount()).toBeUint(1);
    // disabling a non-admin does not count either
    expect(setAdmin(wallet2, false, wallet1)).toBeOk(Cl.bool(true));
    expect(adminCount()).toBeUint(1);
    expect(setAdmin(deployer, false, wallet1)).toBeOk(Cl.bool(true));
    expect(setAdmin(wallet1, false, wallet1)).toBeErr(Cl.uint(403));
    expect(setAdmin(wallet2, false, wallet1)).toBeOk(Cl.bool(true));
    expect(setAdmin(wallet1, false, wallet1)).toBeErr(Cl.uint(403));
    expect(setAdmin(wallet2, true, deployer)).toBeErr(Cl.uint(401));
  });
});

describe("pox-5 STX staking", () => {
  test("only approved signer managers", () => {
    const manager = Cl.principal(`${deployer}.signer-manager`);
    expect(
      call("stake", [manager, Cl.uint(1_000_000), Cl.uint(1)], wallet1)
        .result
    ).toBeErr(Cl.uint(401));
    expect(
      call("stake", [manager, Cl.uint(1_000_000), Cl.uint(1)], deployer)
        .result
    ).toBeErr(Cl.uint(503));
    expect(
      call("stake-update", [manager, manager, Cl.uint(1), Cl.uint(0)], wallet1)
        .result
    ).toBeErr(Cl.uint(401));
    expect(
      call("stake-update", [manager, manager, Cl.uint(1), Cl.uint(0)], deployer)
        .result
    ).toBeErr(Cl.uint(503));
  });
});
