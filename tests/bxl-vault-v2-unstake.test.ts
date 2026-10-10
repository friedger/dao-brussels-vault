// User withdrawals once the admin has unstaked, against simnet's pox-5.
//
//   STX:  the vault stakes its STX with a signer manager; `withdraw-stx` fails
//         while the STX is locked and works once `unstake` has
//         taken effect.
//   sBTC: the vault's sBTC sits in an Esbee bond; `withdraw-finalize` fails
//         while it is bonded and works once the admin has taken it out of the
//         bond (`unstake-sbtc-early`) and back into the vault (the adapter's `withdraw`).
//
// Simnet pox-5: cycles of 1050 burn blocks with a 50-block prepare phase,
// bond N starts at burn height N * 2100.
import {
  Cl,
  ClarityType,
  ClarityValue,
  cvToValue,
  privateKeyToPublic,
  signMessageHashRsv,
} from "@stacks/transactions";
import { describe, expect, test } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const POX5 = "ST000000000000000000002AMW42H.pox-5";
// The vendored pox-5 names the mainnet boot address as bond admin.
const BOND_ADMIN = "SP000000000000000000002Q6VF78";
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const CYCLE_LENGTH = 1050;
const BOND_INDEX = 2;

const VAULT = "bxl-vault-v2";
const vaultId = `${deployer}.${VAULT}`;
const managerId = `${deployer}.signer-manager`;
const esbeePool = `${deployer}.bond-staker`;
const esbeeAdapter = `${deployer}.bxl-pool-esbee`;

const num = (cv: ClarityValue) => Number(cvToValue(cv, true));
const call = (fn: string, args: ClarityValue[], sender: string) =>
  simnet.callPublicFn(VAULT, fn, args, sender);
const readPox = (fn: string, args: ClarityValue[] = []) =>
  simnet.callReadOnlyFn(POX5, fn, args, deployer).result;
const currentCycle = () => num(readPox("current-pox-reward-cycle"));
const cycleStart = (cycle: number) =>
  num(readPox("reward-cycle-to-burn-height", [Cl.uint(cycle)]));
const stxAccount = (who: string) =>
  Cl.deserialize(simnet.runSnippet(`(stx-account '${who})`) as string) as any;
const lockedStx = (who: string) => Number(stxAccount(who).value.locked.value);
const sbtcBalance = (who: string) =>
  num(
    (
      simnet.callReadOnlyFn(SBTC, "get-balance", [Cl.principal(who)], deployer)
        .result as any
    ).value
  );

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

const advanceToBurnHeight = (target: number) => {
  const delta = target - simnet.burnBlockHeight;
  if (delta > 0) simnet.mineEmptyBurnBlocks(delta);
};

const avoidPreparePhase = () => {
  for (let guard = 0; guard < 200; guard++) {
    const prepare = readPox("is-in-prepare-phase", [Cl.uint(currentCycle())]);
    if (cvToValue(prepare) !== true) return;
    simnet.mineEmptyBurnBlocks(10);
  }
};

/** Register `signer-manager` as a pox-5 signer and approve it in the vault. */
function registerSigner() {
  const privateKey =
    "010101010101010101010101010101010101010101010101010101010101010101";
  const raw = (
    simnet.callReadOnlyFn(
      POX5,
      "get-signer-grant-message-hash",
      [Cl.principal(managerId), Cl.uint(1)],
      deployer
    ).result as any
  ).value;
  const messageHash =
    typeof raw === "string" ? raw : Buffer.from(raw).toString("hex");
  expect(
    simnet.callPublicFn(
      "signer-manager",
      "register-self",
      [
        Cl.principal(managerId),
        Cl.bufferFromHex(privateKeyToPublic(privateKey)),
        Cl.uint(1),
        Cl.bufferFromHex(signMessageHashRsv({ messageHash, privateKey })),
      ],
      deployer
    ).result
  ).toHaveClarityType(ClarityType.ResponseOk);
  expect(
    call("admin-set-manager", [Cl.principal(managerId), Cl.bool(true)], deployer)
      .result
  ).toBeOk(Cl.bool(true));
}

describe("STX withdrawal after the admin unstakes", () => {
  const STX = 2_000_000_000; // 2,000 STX

  test("withdraw-stx is blocked while staked and works after unstake", () => {
    registerSigner();
    expect(call("deposit-stx", [Cl.uint(STX)], wallet1).result).toBeOk(
      Cl.bool(true)
    );

    avoidPreparePhase();
    const staked = call(
      "stake",
      [Cl.principal(managerId), Cl.uint(STX), Cl.uint(4)],
      deployer
    );
    expect(staked.result).toHaveClarityType(ClarityType.ResponseOk);
    expect(lockedStx(vaultId)).toBe(STX);

    // Locked: the vault cannot pay.
    expect(call("withdraw-stx", [Cl.uint(STX)], wallet1).result).toBeErr(
      Cl.uint(1)
    );

    // The admin unstakes; the STX unlocks at the start of the next cycle.
    avoidPreparePhase();
    const unlockCycle = currentCycle() + 1;
    expect(
      call("unstake", [Cl.principal(managerId)], deployer).result
    ).toHaveClarityType(ClarityType.ResponseOk);
    expect(call("withdraw-stx", [Cl.uint(STX)], wallet1).result).toBeErr(
      Cl.uint(1)
    );

    advanceToBurnHeight(cycleStart(unlockCycle));
    simnet.mineEmptyBlock();
    expect(lockedStx(vaultId)).toBe(0);

    const before = Number(stxAccount(wallet1).value.unlocked.value);
    expect(call("withdraw-stx", [Cl.uint(STX)], wallet1).result).toBeOk(
      Cl.bool(true)
    );
    expect(Number(stxAccount(wallet1).value.unlocked.value)).toBe(before + STX);
  });

  test("unstake is only for the admin", () => {
    registerSigner();
    expect(
      call("unstake", [Cl.principal(managerId)], wallet1).result
    ).toBeErr(Cl.uint(401));
  });
});

describe("sBTC withdrawal after the admin leaves the bond", () => {
  const SATS = 10_000_000; // 0.1 BTC
  const STX_VALUE_RATIO = 100_000; // uSTX per 100 sats
  const MIN_USTX_RATIO = 500; // 5%

  /** v1 (v-bond-1): the operator sets the floor, then anyone binds. */
  function bindBond() {
    expect(
      simnet.callPublicFn(
        "bond-staker",
        "set-next-bond",
        [Cl.uint(BOND_INDEX)],
        deployer
      ).result
    ).toBeOk(Cl.uint(BOND_INDEX));
    expect(
      simnet.callPublicFn("bond-staker", "bind-next-bond", [], wallet2).result
    ).toHaveClarityType(ClarityType.ResponseOk);
  }

  /** Esbee pool on bond 2 with the vault's adapter as its only member. */
  function enrollIntoBond() {
    registerSigner();
    const bondStart = num(
      readPox("bond-period-to-burn-height", [Cl.uint(BOND_INDEX)])
    );

    expect(
      simnet.callPublicFn(
        "bond-staker",
        "initialize",
        [Cl.principal(managerId), Cl.principal(deployer)],
        deployer
      ).result
    ).toHaveClarityType(ClarityType.ResponseOk);
    advanceToBurnHeight(bondStart - 2 * CYCLE_LENGTH);
    expect(
      simnet.callPublicFn(
        POX5,
        "setup-bond",
        [
          Cl.uint(BOND_INDEX),
          Cl.uint(1000),
          Cl.uint(STX_VALUE_RATIO),
          Cl.uint(MIN_USTX_RATIO),
          Cl.bufferFromHex("00"),
          Cl.list([
            Cl.tuple({
              staker: Cl.principal(esbeePool),
              "max-sats": Cl.uint(SATS * 10),
            }),
          ]),
        ],
        BOND_ADMIN
      ).result
    ).toHaveClarityType(ClarityType.ResponseOk);
    bindBond();

    // Users deposit; the admin moves sBTC and the STX leg into the pool.
    const ustx = num(
      simnet.callReadOnlyFn(
        "bond-staker",
        "get-required-ustx",
        [Cl.uint(SATS)],
        deployer
      ).result
    );
    expect(call("deposit", [Cl.uint(SATS)], wallet1).result).toBeOk(
      Cl.bool(true)
    );
    expect(call("deposit-stx", [Cl.uint(ustx)], wallet2).result).toBeOk(
      Cl.bool(true)
    );
    expect(
      call("admin-set-pool", [Cl.principal(esbeeAdapter), Cl.bool(true)], deployer)
        .result
    ).toBeOk(Cl.bool(true));
    expect(
      call(
        "enroll",
        [Cl.principal(esbeeAdapter), Cl.uint(SATS), Cl.uint(ustx)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));
    expect(sbtcBalance(vaultId)).toBe(0);

    // Anyone commits the pool to the bond.
    advanceToBurnHeight(bondStart - 288);
    expect(
      simnet.callPublicFn(
        "bond-staker",
        "stake",
        [Cl.principal(managerId)],
        wallet2
      ).result
    ).toHaveClarityType(ClarityType.ResponseOk);
    return { ustx };
  }

  test("before the bond starts, the adapter withdraw alone brings the sBTC back", () => {
    registerSigner();
    const bondStart = num(
      readPox("bond-period-to-burn-height", [Cl.uint(BOND_INDEX)])
    );
    simnet.callPublicFn(
      "bond-staker",
      "initialize",
      [Cl.principal(managerId), Cl.principal(deployer)],
      deployer
    );
    advanceToBurnHeight(bondStart - 2 * CYCLE_LENGTH);
    simnet.callPublicFn(
      POX5,
      "setup-bond",
      [
        Cl.uint(BOND_INDEX),
        Cl.uint(1000),
        Cl.uint(STX_VALUE_RATIO),
        Cl.uint(MIN_USTX_RATIO),
        Cl.bufferFromHex("00"),
        Cl.list([
          Cl.tuple({
            staker: Cl.principal(esbeePool),
            "max-sats": Cl.uint(SATS * 10),
          }),
        ]),
      ],
      BOND_ADMIN
    );
    bindBond();
    const ustx = num(
      simnet.callReadOnlyFn(
        "bond-staker",
        "get-required-ustx",
        [Cl.uint(SATS)],
        deployer
      ).result
    );
    call("deposit", [Cl.uint(SATS)], wallet1);
    call("deposit-stx", [Cl.uint(ustx)], wallet2);
    call("admin-set-pool", [Cl.principal(esbeeAdapter), Cl.bool(true)], deployer);
    expect(
      call(
        "enroll",
        [Cl.principal(esbeeAdapter), Cl.uint(SATS), Cl.uint(ustx)],
        deployer
      ).result
    ).toBeOk(Cl.bool(true));

    expect(
      call("withdraw-request", [Cl.uint(SATS), Cl.uint(1000)], wallet1).result
    ).toBeOk(Cl.uint(1));
    simnet.mineEmptyBurnBlocks(1001);
    // The sBTC is queued in the pool, not in the vault.
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeErr(
      Cl.uint(1)
    );

    expect(
      poolWithdraw(esbeeAdapter, SATS)
    ).toEqual({ sats: SATS, ustx: ustx });
    const before = sbtcBalance(wallet1);
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeOk(
      Cl.uint(SATS)
    );
    expect(sbtcBalance(wallet1)).toBe(before + SATS);
    expect(call("withdraw-stx", [Cl.uint(ustx)], wallet2).result).toBeOk(
      Cl.bool(true)
    );
  });

  test("while bonded, withdraw-finalize works after unstake-sbtc-early and the adapter withdraw", () => {
    const { ustx } = enrollIntoBond();
    avoidPreparePhase();

    expect(
      call("withdraw-request", [Cl.uint(SATS), Cl.uint(1000)], wallet1).result
    ).toBeOk(Cl.uint(1));
    simnet.mineEmptyBurnBlocks(1001);
    avoidPreparePhase();

    // Bonded: neither the vault nor the adapter has anything to pay out.
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeErr(
      Cl.uint(1)
    );
    expect(
      poolWithdraw(esbeeAdapter, SATS)
    ).toEqual({ sats: 0, ustx: 0 });

    // The admin takes the sats out of the bond, then back into the vault.
    expect(
      simnet.callPublicFn(
        "bxl-pool-esbee",
        "unstake-sbtc-early",
        [Cl.principal(managerId), Cl.uint(SATS)],
        wallet1
      ).result
    ).toBeErr(Cl.uint(401));
    expect(
      simnet.callPublicFn(
        "bxl-pool-esbee",
        "unstake-sbtc-early",
        [Cl.principal(managerId), Cl.uint(SATS)],
        deployer
      ).result
    ).toHaveClarityType(ClarityType.ResponseOk);
    expect(poolWithdraw(esbeeAdapter, SATS).sats).toBe(SATS);

    const before = sbtcBalance(wallet1);
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeOk(
      Cl.uint(SATS)
    );
    expect(sbtcBalance(wallet1)).toBe(before + SATS);

    // The STX leg stays in the bond.
    expect(call("withdraw-stx", [Cl.uint(ustx)], wallet2).result).toBeErr(
      Cl.uint(1)
    );
  });

  test("principal and sBTC that third parties push to the adapter are booked right", () => {
    const { ustx } = enrollIntoBond();
    avoidPreparePhase();
    expect(
      simnet.callPublicFn(
        "bxl-pool-esbee",
        "unstake-sbtc-early",
        [Cl.principal(managerId), Cl.uint(SATS)],
        deployer
      ).result
    ).toHaveClarityType(ClarityType.ResponseOk);

    // Anyone may pay the adapter its released principal, and anyone may send
    // it sBTC (as the pool's permissionless `claim-rewards` would).
    expect(
      simnet.callPublicFn(
        "bond-staker",
        "claim-principal",
        [Cl.principal(esbeeAdapter)],
        wallet2
      ).result
    ).toHaveClarityType(ClarityType.ResponseOk);
    expect(
      simnet.callPublicFn(
        SBTC,
        "transfer",
        [Cl.uint(500), Cl.principal(wallet2), Cl.principal(esbeeAdapter), Cl.none()],
        wallet2
      ).result
    ).toBeOk(Cl.bool(true));

    // The admin's withdraw finds nothing left to claim, but the vault books
    // from the pool's records: the sats left the bond, the STX leg did not.
    expect(poolWithdraw(esbeeAdapter, SATS)).toEqual({ sats: SATS + 500, ustx: 0 });
    expect(
      simnet.callReadOnlyFn(VAULT, "get-enrolled", [], deployer).result
    ).toBeTuple({ sats: Cl.uint(0), ustx: Cl.uint(ustx) });
    // The pushed 500 sats are surplus, nothing more.
    expect(
      call("admin-sbtc-transfer", [Cl.uint(501), Cl.principal(deployer)], deployer)
        .result
    ).toBeErr(Cl.uint(500));
    expect(
      call("admin-sbtc-transfer", [Cl.uint(500), Cl.principal(deployer)], deployer)
        .result
    ).toBeOk(Cl.bool(true));
  });

  // v-bond-1 skips the pox-5 call when no sats are bonded, so the pool
  // winds down after a full early exit (the unreleased main branch does not).
  test("after a full early exit, the STX leg comes back at the end of the bond", () => {
    const { ustx } = enrollIntoBond();
    avoidPreparePhase();
    simnet.callPublicFn(
      "bxl-pool-esbee",
      "unstake-sbtc-early",
      [Cl.principal(managerId), Cl.uint(SATS)],
      deployer
    );
    poolWithdraw(esbeeAdapter, SATS);
    const live: any = cvToValue(
      simnet.callReadOnlyFn("bond-staker", "get-live-epoch", [], deployer)
        .result,
      true
    );
    advanceToBurnHeight(Number(live.value["unlock-burn-height"].value));
    avoidPreparePhase();
    expect(
      simnet.callPublicFn(
        "bond-staker",
        "unstake-sbtc",
        [Cl.principal(managerId)],
        wallet2
      ).result
    ).toHaveClarityType(ClarityType.ResponseOk);
    expect(
      poolWithdraw(esbeeAdapter, 0)
    ).toEqual({ sats: 0, ustx: ustx });
    expect(call("withdraw-stx", [Cl.uint(ustx)], wallet2).result).toBeOk(
      Cl.bool(true)
    );
    expect(
      simnet.callReadOnlyFn(VAULT, "get-enrolled", [], deployer).result
    ).toBeTuple({ sats: Cl.uint(0), ustx: Cl.uint(0) });
  });


  test("at the end of the bond, sBTC and the STX leg both come back", () => {
    const { ustx } = enrollIntoBond();
    const live: any = cvToValue(
      simnet.callReadOnlyFn("bond-staker", "get-live-epoch", [], deployer)
        .result,
      true
    );
    const unlockHeight = Number(live.value["unlock-burn-height"].value);

    call("withdraw-request", [Cl.uint(SATS), Cl.uint(1000)], wallet1);
    simnet.mineEmptyBurnBlocks(1001);
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeErr(
      Cl.uint(1)
    );
    expect(call("withdraw-stx", [Cl.uint(ustx)], wallet2).result).toBeErr(
      Cl.uint(1)
    );

    // Bond over, no next bond bound: anyone unstakes the pool.
    advanceToBurnHeight(unlockHeight);
    avoidPreparePhase();
    expect(
      simnet.callPublicFn(
        "bond-staker",
        "unstake-sbtc",
        [Cl.principal(managerId)],
        wallet2
      ).result
    ).toHaveClarityType(ClarityType.ResponseOk);

    expect(
      poolWithdraw(esbeeAdapter, SATS)
    ).toEqual({ sats: SATS, ustx: ustx });
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeOk(
      Cl.uint(SATS)
    );
    expect(call("withdraw-stx", [Cl.uint(ustx)], wallet2).result).toBeOk(
      Cl.bool(true)
    );
    expect(
      simnet.callReadOnlyFn(VAULT, "get-enrolled", [], deployer).result
    ).toBeTuple({ sats: Cl.uint(0), ustx: Cl.uint(0) });
  });
});
