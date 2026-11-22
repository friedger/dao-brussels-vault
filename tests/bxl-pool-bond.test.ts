// `bxl-pool-bond`: the vault's own pox-5 bond seat, staking with Fast Pool's
// max500 signer manager (loaded from mainnet as a requirement), against
// simnet's pox-5.
//
// Simnet pox-5: cycles of 1050 burn blocks with a 50-block prepare phase,
// bond N starts at burn height N * 2100 and runs 12 cycles.
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
const wallet3 = accounts.get("wallet_3")!;

const POX5 = "ST000000000000000000002AMW42H.pox-5";
// The vendored pox-5 names the mainnet boot address as bond admin.
const BOND_ADMIN = "SP000000000000000000002Q6VF78";
const SBTC = "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token";
const MAX500_ADMIN = "SPMPMA1V6P430M8C91QS1G9XJ95S59JS1TZFZ4Q4";
const MAX500 = `${MAX500_ADMIN}.fastpool-max500-signer-manager`;
const CYCLE_LENGTH = 1050;
const BOND_LENGTH_CYCLES = 12;
const BOND_INDEX = 2;

const SATS = 50_000_000; // 0.5 BTC
const STX_VALUE_RATIO = 100_000; // uSTX per 100 sats
const MIN_USTX_RATIO = 500; // 5%

const VAULT = "bxl-vault-v2";
const ADAPTER = "bxl-pool-bond";
const vaultId = `${deployer}.${VAULT}`;
const adapterId = `${deployer}.${ADAPTER}`;

const num = (cv: ClarityValue) => Number(cvToValue(cv, true));
const call = (fn: string, args: ClarityValue[], sender: string) =>
  simnet.callPublicFn(VAULT, fn, args, sender);
const adapter = (fn: string, args: ClarityValue[], sender: string) =>
  simnet.callPublicFn(ADAPTER, fn, args, sender);
const readAdapter = (fn: string) =>
  simnet.callReadOnlyFn(ADAPTER, fn, [], deployer).result;
const readPox = (fn: string, args: ClarityValue[] = []) =>
  simnet.callReadOnlyFn(POX5, fn, args, deployer).result;
const currentCycle = () => num(readPox("current-pox-reward-cycle"));
const stxAccount = (who: string) =>
  simnet.execute(`(stx-account '${who})`).result as any;
const lockedStx = (who: string) => Number(stxAccount(who).value.locked.value);
const unlockedStx = (who: string) =>
  Number(stxAccount(who).value.unlocked.value);
const sbtcBalance = (who: string) =>
  num(
    (
      simnet.callReadOnlyFn(SBTC, "get-balance", [Cl.principal(who)], deployer)
        .result as any
    ).value
  );
const deployed = () =>
  simnet.callReadOnlyFn(VAULT, "get-deployed", [], deployer).result;
const bondStart = (index: number) =>
  num(readPox("bond-period-to-burn-height", [Cl.uint(index)]));
const bondUnlock = (index: number) =>
  num(
    readPox("reward-cycle-to-burn-height", [
      Cl.uint(
        num(readPox("bond-period-to-reward-cycle", [Cl.uint(index)])) +
          BOND_LENGTH_CYCLES
      ),
    ])
  );
const requiredUstx = (sats: number) =>
  num(
    readPox("min-ustx-for-sats-amount", [
      Cl.uint(sats),
      Cl.uint(STX_VALUE_RATIO),
      Cl.uint(MIN_USTX_RATIO),
    ])
  );

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

/** Admin pulls funds out of the adapter; returns what reached the vault. */
const adapterWithdraw = () => {
  const sbtcBefore = sbtcBalance(vaultId);
  const stxBefore = unlockedStx(vaultId);
  expect(adapter("withdraw", [Cl.uint(0)], deployer).result).toHaveClarityType(
    ClarityType.ResponseOk
  );
  return {
    sats: sbtcBalance(vaultId) - sbtcBefore,
    ustx: unlockedStx(vaultId) - stxBefore,
  };
};

/** Register max500 as a pox-5 signer, as its admin would on mainnet. */
function registerMax500() {
  const privateKey =
    "010101010101010101010101010101010101010101010101010101010101010101";
  const raw = (
    simnet.callReadOnlyFn(
      POX5,
      "get-signer-grant-message-hash",
      [Cl.principal(MAX500), Cl.uint(1)],
      deployer
    ).result as any
  ).value;
  const messageHash =
    typeof raw === "string" ? raw : Buffer.from(raw).toString("hex");
  expect(
    simnet.callPublicFn(
      MAX500,
      "register-self",
      [
        Cl.principal(MAX500),
        Cl.bufferFromHex(privateKeyToPublic(privateKey)),
        Cl.uint(1),
        Cl.bufferFromHex(signMessageHashRsv({ messageHash, privateKey })),
      ],
      MAX500_ADMIN
    ).result
  ).toHaveClarityType(ClarityType.ResponseOk);
}

/** The bond admin writes `index`'s terms and allowlist. */
function setupBond(index: number, allowlisted = true) {
  advanceToBurnHeight(bondStart(index) - 2 * CYCLE_LENGTH);
  expect(
    simnet.callPublicFn(
      POX5,
      "setup-bond",
      [
        Cl.uint(index),
        Cl.uint(1000),
        Cl.uint(STX_VALUE_RATIO),
        Cl.uint(MIN_USTX_RATIO),
        Cl.bufferFromHex("00"),
        Cl.list(
          allowlisted
            ? [
                Cl.tuple({
                  staker: Cl.principal(adapterId),
                  "max-sats": Cl.uint(SATS),
                }),
              ]
            : []
        ),
      ],
      BOND_ADMIN
    ).result
  ).toHaveClarityType(ClarityType.ResponseOk);
}

/**
 * Users deposit 0.5 BTC and the STX leg; the admin approves the adapter and
 * deploys both into it. Nothing is in pox-5 yet.
 */
function deployIntoAdapter() {
  const ustx = requiredUstx(SATS);
  expect(call("deposit", [Cl.uint(SATS)], wallet1).result).toBeOk(
    Cl.bool(true)
  );
  expect(call("deposit-stx", [Cl.uint(ustx)], wallet2).result).toBeOk(
    Cl.bool(true)
  );
  expect(
    call("admin-set-pool", [Cl.principal(adapterId), Cl.bool(true)], deployer)
      .result
  ).toBeOk(Cl.bool(true));
  expect(
    call(
      "deploy",
      [Cl.principal(adapterId), Cl.uint(SATS), Cl.uint(ustx)],
      deployer
    ).result
  ).toBeOk(Cl.bool(true));
  return ustx;
}

/** Shortly before the bond starts, outside a prepare phase. */
function beforeBondStart(index: number) {
  advanceToBurnHeight(bondStart(index) - 300);
  avoidPreparePhase();
}

const register = (index: number, sender = deployer) =>
  adapter("register", [Cl.principal(MAX500), Cl.uint(index)], sender).result;

/** Everything up to a registered seat in bond BOND_INDEX. */
function registerInBond() {
  registerMax500();
  setupBond(BOND_INDEX);
  const ustx = deployIntoAdapter();
  beforeBondStart(BOND_INDEX);
  expect(register(BOND_INDEX)).toHaveClarityType(ClarityType.ResponseOk);
  return ustx;
}

describe("bxl-pool-bond: joining a bond", () => {
  test("deposit only books the sBTC as idle principal", () => {
    registerMax500();
    const ustx = deployIntoAdapter();
    expect(readAdapter("get-idle-sats")).toBeUint(SATS);
    expect(sbtcBalance(adapterId)).toBe(SATS);
    expect(unlockedStx(adapterId)).toBe(ustx);
    expect(readAdapter("get-value")).toBeOk(
      Cl.tuple({ sats: Cl.uint(SATS), ustx: Cl.uint(ustx) })
    );
    expect(readAdapter("get-rewards")).toBeUint(0);
  });

  test("register moves the sBTC and the whole STX leg into the bond", () => {
    const ustx = registerInBond();

    expect(readAdapter("get-custodied-sats")).toBeUint(SATS);
    expect(readAdapter("get-idle-sats")).toBeUint(0);
    expect(sbtcBalance(adapterId)).toBe(0);
    expect(lockedStx(adapterId)).toBe(ustx);
    const membership = cvToValue(readAdapter("get-membership"), true) as any;
    expect(Number(membership.value["bond-index"].value)).toBe(BOND_INDEX);
    expect(Number(membership.value["amount-sats"].value)).toBe(SATS);
    expect(membership.value.signer.value).toBe(MAX500);

    // The vault still counts it all as principal, so there is no surplus.
    expect(readAdapter("get-value")).toBeOk(
      Cl.tuple({ sats: Cl.uint(SATS), ustx: Cl.uint(ustx) })
    );
    expect(deployed()).toBeTuple({ sats: Cl.uint(SATS), ustx: Cl.uint(ustx) });
    expect(
      call(
        "admin-sbtc-transfer",
        [Cl.uint(1), Cl.principal(deployer), Cl.list([Cl.principal(adapterId)])],
        deployer
      ).result
    ).toBeErr(Cl.uint(500));
    expect(
      call(
        "admin-stx-transfer",
        [Cl.uint(1), Cl.principal(deployer), Cl.list([Cl.principal(adapterId)])],
        deployer
      ).result
    ).toBeErr(Cl.uint(500));
  });

  test("register needs an admin, max500 and an allowance", () => {
    registerMax500();
    setupBond(BOND_INDEX, false);
    deployIntoAdapter();
    beforeBondStart(BOND_INDEX);

    expect(register(BOND_INDEX, wallet1)).toBeErr(Cl.uint(401));
    expect(
      adapter(
        "register",
        [Cl.principal(`${deployer}.signer-manager`), Cl.uint(BOND_INDEX)],
        deployer
      ).result
    ).toBeErr(Cl.uint(507));
    // pox-5's ERR_NOT_ALLOWLISTED
    expect(register(BOND_INDEX)).toBeErr(Cl.uint(11));
    // nothing moved
    expect(readAdapter("get-idle-sats")).toBeUint(SATS);
    expect(sbtcBalance(adapterId)).toBe(SATS);
  });

  test("register fails once the bond has started", () => {
    registerMax500();
    setupBond(BOND_INDEX);
    deployIntoAdapter();
    advanceToBurnHeight(bondStart(BOND_INDEX) + 10);
    avoidPreparePhase();
    // pox-5's ERR_BOND_ALREADY_STARTED
    expect(register(BOND_INDEX)).toBeErr(Cl.uint(43));
    expect(readAdapter("get-idle-sats")).toBeUint(SATS);
  });

  test("before registering, withdraw hands everything back", () => {
    registerMax500();
    const ustx = deployIntoAdapter();
    expect(adapter("withdraw", [Cl.uint(0)], wallet1).result).toBeErr(
      Cl.uint(401)
    );
    expect(adapterWithdraw()).toEqual({ sats: SATS, ustx });
    expect(deployed()).toBeTuple({ sats: Cl.uint(0), ustx: Cl.uint(0) });
    expect(readAdapter("get-idle-sats")).toBeUint(0);
  });

  test("only the vault deposits and collects", () => {
    expect(
      adapter("deposit", [Cl.uint(1), Cl.uint(0)], deployer).result
    ).toBeErr(Cl.uint(401));
    expect(adapter("collect-rewards", [], deployer).result).toBeErr(
      Cl.uint(401)
    );
  });
});

describe("bxl-pool-bond: leaving a bond", () => {
  test("early: unstake-sbtc and withdraw pay a user, the STX leg stays locked", () => {
    const ustx = registerInBond();
    expect(
      call("withdraw-request", [Cl.uint(SATS), Cl.uint(1000)], wallet1).result
    ).toBeOk(Cl.uint(1));
    advanceToBurnHeight(bondStart(BOND_INDEX) + 1100);
    avoidPreparePhase();

    // Bonded: the vault cannot pay.
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeErr(
      Cl.uint(1)
    );

    const unstake = (sender: string, manager = MAX500) =>
      adapter(
        "unstake-sbtc",
        [Cl.principal(manager), Cl.uint(SATS)],
        sender
      ).result;
    expect(unstake(wallet1)).toBeErr(Cl.uint(401));
    expect(unstake(deployer, `${deployer}.signer-manager`)).toBeErr(
      Cl.uint(507)
    );
    expect(unstake(deployer)).toHaveClarityType(ClarityType.ResponseOk);
    expect(readAdapter("get-custodied-sats")).toBeUint(0);
    expect(readAdapter("get-idle-sats")).toBeUint(SATS);

    expect(adapterWithdraw()).toEqual({ sats: SATS, ustx: 0 });
    expect(deployed()).toBeTuple({ sats: Cl.uint(0), ustx: Cl.uint(ustx) });

    const before = sbtcBalance(wallet1);
    expect(call("withdraw-finalize", [Cl.uint(1)], wallet1).result).toBeOk(
      Cl.uint(SATS)
    );
    expect(sbtcBalance(wallet1)).toBe(before + SATS);

    // The STX leg stays in the bond until it ends.
    expect(lockedStx(adapterId)).toBe(ustx);
    expect(call("withdraw-stx", [Cl.uint(ustx)], wallet2).result).toBeErr(
      Cl.uint(1)
    );
  });

  test("at the end of the bond, sBTC and the STX leg both come back", () => {
    const ustx = registerInBond();
    advanceToBurnHeight(bondUnlock(BOND_INDEX));
    simnet.mineEmptyBlock();
    avoidPreparePhase();
    expect(lockedStx(adapterId)).toBe(0);
    // Still in pox-5's custody until unstaked.
    expect(readAdapter("get-custodied-sats")).toBeUint(SATS);

    expect(
      adapter("unstake-sbtc", [Cl.principal(MAX500), Cl.uint(SATS)], deployer)
        .result
    ).toHaveClarityType(ClarityType.ResponseOk);
    expect(adapterWithdraw()).toEqual({ sats: SATS, ustx });
    expect(deployed()).toBeTuple({ sats: Cl.uint(0), ustx: Cl.uint(0) });

    // Users get both back.
    expect(
      call("withdraw-request", [Cl.uint(SATS), Cl.uint(0)], wallet1).result
    ).toBeOk(Cl.uint(1));
    expect(call("withdraw-finalize", [Cl.uint(1)], deployer).result).toBeOk(
      Cl.uint(SATS)
    );
    expect(call("withdraw-stx", [Cl.uint(ustx)], wallet2).result).toBeOk(
      Cl.bool(true)
    );
  });

  test("register rolls the seat into the next bond, in the last half cycle", () => {
    const ustx = registerInBond();
    const next = BOND_INDEX + 6; // starts when bond BOND_INDEX ends
    setupBond(next);

    // pox-5 opens the rollover window half a cycle before the old bond ends
    // (`get-bond-l1-unlock-height`); a moment earlier is ERR_ROLLOVER_TOO_EARLY.
    const windowOpens = num(
      readPox("get-bond-l1-unlock-height", [Cl.uint(BOND_INDEX)])
    );
    expect(windowOpens).toBe(bondStart(next) - CYCLE_LENGTH / 2);
    advanceToBurnHeight(windowOpens - 10);
    expect(register(next)).toBeErr(Cl.uint(48));
    expect(readAdapter("get-custodied-sats")).toBeUint(SATS);

    beforeBondStart(next);
    expect(simnet.burnBlockHeight).toBeGreaterThanOrEqual(windowOpens);
    expect(register(next)).toHaveClarityType(ClarityType.ResponseOk);

    const membership = cvToValue(readAdapter("get-membership"), true) as any;
    expect(Number(membership.value["bond-index"].value)).toBe(next);
    expect(readAdapter("get-custodied-sats")).toBeUint(SATS);
    expect(sbtcBalance(adapterId)).toBe(0);

    // Still locked past the first bond's end.
    advanceToBurnHeight(bondUnlock(BOND_INDEX) + 10);
    simnet.mineEmptyBlock();
    expect(lockedStx(adapterId)).toBe(ustx);
    expect(deployed()).toBeTuple({ sats: Cl.uint(SATS), ustx: Cl.uint(ustx) });
  });
});

describe("bxl-pool-bond: rewards", () => {
  test("sBTC above the idle principal is rewards and goes to the vault", () => {
    registerInBond();
    // anyone may pay the seat, as max500's permissionless claim does
    expect(
      simnet.callPublicFn(
        SBTC,
        "transfer",
        [Cl.uint(1_234), Cl.principal(wallet3), Cl.principal(adapterId), Cl.none()],
        wallet3
      ).result
    ).toBeOk(Cl.bool(true));
    expect(readAdapter("get-rewards")).toBeUint(1_234);

    expect(call("collect-rewards", [Cl.principal(adapterId)], wallet3).result).toBeOk(
      Cl.uint(1_234)
    );
    expect(sbtcBalance(adapterId)).toBe(0);
    expect(readAdapter("get-rewards")).toBeUint(0);
    // nothing left to collect
    expect(call("collect-rewards", [Cl.principal(adapterId)], wallet3).result).toBeOk(
      Cl.uint(0)
    );

    // It is surplus: the admin can take exactly that.
    const transfer = (amount: number) =>
      call(
        "admin-sbtc-transfer",
        [Cl.uint(amount), Cl.principal(deployer), Cl.list([Cl.principal(adapterId)])],
        deployer
      ).result;
    expect(transfer(1_235)).toBeErr(Cl.uint(500));
    expect(transfer(1_234)).toBeOk(Cl.bool(true));
  });

  test("rewards do not mix with principal returned by unstake-sbtc", () => {
    registerInBond();
    advanceToBurnHeight(bondStart(BOND_INDEX) + 1100);
    avoidPreparePhase();
    adapter("unstake-sbtc", [Cl.principal(MAX500), Cl.uint(SATS)], deployer);
    simnet.callPublicFn(
      SBTC,
      "transfer",
      [Cl.uint(700), Cl.principal(wallet3), Cl.principal(adapterId), Cl.none()],
      wallet3
    );
    expect(readAdapter("get-rewards")).toBeUint(700);
    expect(call("collect-rewards", [Cl.principal(adapterId)], wallet3).result).toBeOk(
      Cl.uint(700)
    );
    expect(adapterWithdraw()).toEqual({ sats: SATS, ustx: 0 });
  });

  test("pox-5 rewards reach the vault through max500", () => {
    registerInBond();
    // Into the bond, then fund pox-5 as the reward source would.
    advanceToBurnHeight(bondStart(BOND_INDEX) + 10);
    const REWARDS = 1_000_000;
    expect(
      simnet.callPublicFn(
        SBTC,
        "transfer",
        [Cl.uint(REWARDS), Cl.principal(wallet3), Cl.principal(POX5), Cl.none()],
        wallet3
      ).result
    ).toBeOk(Cl.bool(true));

    // Wait for the next distribution point, then distribute.
    const distribution = num(readPox("current-distribution-cycle"));
    advanceToBurnHeight(
      num(
        readPox("distribution-cycle-to-burn-height", [Cl.uint(distribution + 1)])
      ) + 1
    );
    const calculated = simnet.callPublicFn(
      POX5,
      "calculate-rewards",
      [Cl.list([Cl.uint(BOND_INDEX)])],
      wallet3
    );
    expect(calculated.result).toHaveClarityType(ClarityType.ResponseOk);
    const rewardCycle = num(
      readPox("burn-height-to-reward-cycle", [
        Cl.uint(num(readPox("get-last-reward-compute-height"))),
      ])
    );

    // max500 pulls the signer's share, then pays the seat.
    expect(
      simnet.callPublicFn(
        MAX500,
        "claim-rewards",
        [Cl.list([Cl.uint(BOND_INDEX)]), Cl.uint(rewardCycle)],
        wallet3
      ).result
    ).toHaveClarityType(ClarityType.ResponseOk);
    const claimed = adapter(
      "claim",
      [Cl.uint(rewardCycle), Cl.some(Cl.uint(BOND_INDEX))],
      wallet3
    );
    expect(claimed.result).toHaveClarityType(ClarityType.ResponseOk);
    const earned = num((claimed.result as any).value.value.earned);
    expect(earned).toBeGreaterThan(0);
    expect(readAdapter("get-rewards")).toBeUint(earned);

    const before = sbtcBalance(vaultId);
    expect(call("collect-rewards", [Cl.principal(adapterId)], wallet3).result).toBeOk(
      Cl.uint(earned)
    );
    expect(sbtcBalance(vaultId)).toBe(before + earned);
    // principal untouched
    expect(readAdapter("get-custodied-sats")).toBeUint(SATS);
  });
});
