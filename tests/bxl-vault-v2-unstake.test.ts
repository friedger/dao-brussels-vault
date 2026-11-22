// STX withdrawals once the admin has unstaked, against simnet's pox-5: the
// vault stakes its STX with a signer manager; `withdraw-stx` fails while the
// STX is locked and works once `unstake` has taken effect. The sBTC side, in a
// bond, is in `bxl-pool-bond.test.ts`.
//
// Simnet pox-5: cycles of 1050 burn blocks with a 50-block prepare phase.
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

const POX5 = "ST000000000000000000002AMW42H.pox-5";

const VAULT = "bxl-vault-v2";
const vaultId = `${deployer}.${VAULT}`;
const managerId = `${deployer}.signer-manager`;

const num = (cv: ClarityValue) => Number(cvToValue(cv, true));
const call = (fn: string, args: ClarityValue[], sender: string) =>
  simnet.callPublicFn(VAULT, fn, args, sender);
const readPox = (fn: string, args: ClarityValue[] = []) =>
  simnet.callReadOnlyFn(POX5, fn, args, deployer).result;
const currentCycle = () => num(readPox("current-pox-reward-cycle"));
const cycleStart = (cycle: number) =>
  num(readPox("reward-cycle-to-burn-height", [Cl.uint(cycle)]));
const stxAccount = (who: string) =>
  simnet.execute(`(stx-account '${who})`).result as any;
const lockedStx = (who: string) => Number(stxAccount(who).value.locked.value);

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

  test("stake-update locks more STX and extends the lock", () => {
    registerSigner();
    call("deposit-stx", [Cl.uint(STX + 500_000_000)], wallet1);
    avoidPreparePhase();
    expect(
      call("stake", [Cl.principal(managerId), Cl.uint(STX), Cl.uint(2)], deployer)
        .result
    ).toHaveClarityType(ClarityType.ResponseOk);
    const before = (
      readPox("get-staker-info", [Cl.principal(vaultId)]) as any
    ).value.value;

    avoidPreparePhase();
    const updated = call(
      "stake-update",
      [
        Cl.principal(managerId),
        Cl.principal(managerId),
        Cl.uint(1),
        Cl.uint(500_000_000),
      ],
      deployer
    );
    expect(updated.result).toHaveClarityType(ClarityType.ResponseOk);
    expect(lockedStx(vaultId)).toBe(STX + 500_000_000);
    const after = (readPox("get-staker-info", [Cl.principal(vaultId)]) as any)
      .value.value;
    expect(num(after["amount-ustx"])).toBe(STX + 500_000_000);
    expect(num(after["num-cycles"])).toBe(num(before["num-cycles"]) + 1);

    // all of it is still the users': locked STX counts as held
    expect(
      call(
        "admin-stx-transfer",
        [Cl.uint(1), Cl.principal(deployer), Cl.list([])],
        deployer
      ).result
    ).toBeErr(Cl.uint(500));
  });

  test("unstake is only for the admin", () => {
    registerSigner();
    expect(
      call("unstake", [Cl.principal(managerId)], wallet1).result
    ).toBeErr(Cl.uint(401));
  });
});
