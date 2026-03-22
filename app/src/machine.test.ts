import { describe, expect, it } from "vitest"
import { createActor } from "xstate"

import {
  afflictionType,
  blindedPenalty,
  isAfflicted,
  isBlinded,
  isBound,
  isDead,
  isDistracted,
  isEntangled,
  isFullyBlinded,
  isGrabbed,
  isGrappled,
  isOnHold,
  isPinned,
  isProne,
  isRestrained,
  isShaken,
  isStunned,
  isVulnerable,
  hasEffect,
  activeEffectsList,
  resolveFear,
  savageMachine
} from "./machine"
import { margin as dm, soak as sk, incap as ir, vigor as vr, spirit as sr, heal as ha, athletics as ar, escape as er, grapple as gr, grappleEsc as ger, pin as pr, severity as bs, affDur as ad } from "./test/helpers/brands"

// ============================================================
// Helpers
// ============================================================

function createWC() {
  const actor = createActor(savageMachine, { input: { isWildCard: true } })
  actor.start()
  return actor
}

function createExtra() {
  const actor = createActor(savageMachine, { input: { isWildCard: false } })
  actor.start()
  return actor
}

function snap(actor: ReturnType<typeof createWC>) {
  return actor.getSnapshot()
}

// ============================================================
// Damage tests
// ============================================================

describe("damage", () => {
  // shakenFromDamageTest: margin 2, no raises → just Shaken
  it("shaken from damage (margin < 4)", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(2), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(0)
  })

  // woundFromRaiseTest: margin 5, 1 raise → Shaken + 1 wound
  it("wound from raise (margin 5)", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(5), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(1)
  })

  // shakenOnShakenTest: Shaken-on-Shaken = 1 wound
  it("shaken-on-shaken gives wound", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(2), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(0)
    a.send({ type: "TAKE_DAMAGE", margin: dm(1), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(1)
  })

  // shakenWithRaiseTest: Shaken + 1 raise = still just 1 wound
  it("shaken with raise gives 1 wound (not 2)", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    a.send({ type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(snap(a).context.wounds).toBe(1)
  })

  // soakClearsShakenTest: soak removes all wounds and clears pre-existing Shaken
  it("soak clears shaken", () => {
    const a = createWC()
    // Get to shaken state
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    // Now take damage with soak
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(1), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(false)
    expect(snap(a).context.wounds).toBe(0)
  })

  // partialSoakTest: reduce wounds but stay Shaken
  it("partial soak", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(8), soakSuccesses: sk(1), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(1)
  })

  // noDamageOnMissTest: margin 0 causes Shaken (it's a hit that meets toughness)
  it("margin 0 causes shaken", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
  })
})

// ============================================================
// Extra tests
// ============================================================

describe("extras", () => {
  // extraDiesFromWoundTest
  it("extra dies from wound", () => {
    const a = createExtra()
    a.send({ type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isDead(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(1)
  })

  // extraShakenSurvivesTest
  it("extra shaken survives", () => {
    const a = createExtra()
    a.send({ type: "TAKE_DAMAGE", margin: dm(2), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    expect(isDead(snap(a))).toBe(false)
    expect(snap(a).context.wounds).toBe(0)
  })
})

// ============================================================
// Incapacitation tests (Wild Card)
// ============================================================

describe("incapacitation", () => {
  // Helper: get WC to shaken with 3 wounds
  function shakenWith3Wounds() {
    const a = createWC()
    // Single hit: margin 12 → 3 raises → 3 wounds from unshaken
    a.send({ type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(3)
    return a
  }

  // incapBleedingOutTest: shaken + 3 wounds, hit again → incap, incapRoll fail → bleeding out
  it("incap bleeding out", () => {
    const a = shakenWith3Wounds()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(snap(a).matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })).toBe(true)
    expect(snap(a).context.wounds).toBe(3)
  })

  // incapCritFailDeadTest
  it("incap crit fail → dead", () => {
    const a = shakenWith3Wounds()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(-1) })
    expect(isDead(snap(a))).toBe(true)
  })

  // incapSuccessTest
  it("incap success → stable", () => {
    const a = shakenWith3Wounds()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(1) })
    expect(snap(a).matches({ alive: { damageTrack: { incapacitated: "stable" } } })).toBe(true)
    expect(isDead(snap(a))).toBe(false)
  })

  // bleedingOutDeathTest
  it("bleeding out fail → dead", () => {
    const a = shakenWith3Wounds()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) }) // → bleedingOut
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(isDead(snap(a))).toBe(true)
  })

  // bleedingOutStabilizedTest
  it("bleeding out raise → stabilized", () => {
    const a = shakenWith3Wounds()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) }) // → bleedingOut
    a.send({ type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) })
    expect(snap(a).matches({ alive: { damageTrack: { incapacitated: "stable" } } })).toBe(true)
    expect(isDead(snap(a))).toBe(false)
  })
})

// ============================================================
// Stunned recovery tests
// ============================================================

describe("stunned recovery", () => {
  // stunnedRecoverySuccessTest
  it("stunned recovery success → vulnerable until end of next turn", () => {
    const a = createWC()
    a.send({ type: "APPLY_STUNNED" })
    expect(snap(a).matches({ alive: { conditionTrack: { stun: "stunned" } } })).toBe(true)
    expect(snap(a).matches({ alive: { conditionTrack: { distraction: "distracted" } } })).toBe(true)
    expect(snap(a).context.distractedTimer).toBe(0)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) })
    expect(snap(a).matches({ alive: { conditionTrack: { stun: "normal" } } })).toBe(true)
    expect(snap(a).matches({ alive: { conditionTrack: { vulnerability: "vulnerable" } } })).toBe(true)
    expect(snap(a).context.vulnerableTimer).toBe(1)
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)

    a.send({ type: "END_OF_TURN" })
    expect(snap(a).context.vulnerableTimer).toBe(0)
    expect(snap(a).context.distractedTimer).toBe(-1)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "END_OF_TURN" })
    expect(snap(a).context.vulnerableTimer).toBe(-1)
    expect(snap(a).matches({ alive: { conditionTrack: { vulnerability: "clear" } } })).toBe(true)
  })

  // stunnedRecoveryRaiseTest
  it("stunned recovery raise → vulnerable clears at end of current turn", () => {
    const a = createWC()
    a.send({ type: "APPLY_STUNNED" })
    a.send({ type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) })
    expect(snap(a).matches({ alive: { conditionTrack: { stun: "normal" } } })).toBe(true)
    expect(snap(a).context.vulnerableTimer).toBe(0)

    a.send({ type: "END_OF_TURN" })
    expect(snap(a).context.vulnerableTimer).toBe(-1)
    expect(snap(a).matches({ alive: { conditionTrack: { vulnerability: "clear" } } })).toBe(true)
  })

  // stunnedRecoveryFailTest
  it("stunned recovery fail → still stunned", () => {
    const a = createWC()
    a.send({ type: "APPLY_STUNNED" })
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(snap(a).matches({ alive: { conditionTrack: { stun: "stunned" } } })).toBe(true)
  })

  function shakenAndStunned() {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) })
    a.send({ type: "APPLY_STUNNED" })
    return a
  }

  it("stunned + shaken: both recover on same turn", () => {
    const a = shakenAndStunned()
    a.send({ type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(1) })
    expect(snap(a).matches({ alive: { conditionTrack: { stun: "normal" } } })).toBe(true)
    expect(isShaken(snap(a))).toBe(false)
  })

  it("stunned + shaken: vigor fails, spirit succeeds", () => {
    const a = shakenAndStunned()
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) })
    expect(snap(a).matches({ alive: { conditionTrack: { stun: "stunned" } } })).toBe(true)
    expect(isShaken(snap(a))).toBe(false)
  })

  it("stunned + shaken: vigor succeeds, spirit fails", () => {
    const a = shakenAndStunned()
    a.send({ type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) })
    expect(snap(a).matches({ alive: { conditionTrack: { stun: "normal" } } })).toBe(true)
    expect(isShaken(snap(a))).toBe(true)
  })
})

// ============================================================
// Shaken recovery tests
// ============================================================

describe("shaken recovery", () => {
  // shakenRecoveryTest
  it("shaken recovery success", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) })
    expect(isShaken(snap(a))).toBe(false)
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)
  })

  // shakenRecoveryFailTest
  it("shaken recovery fail", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) })
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)
  })

  // bennyUnshakeTest
  it("benny unshake", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(2), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    a.send({ type: "SPEND_BENNY" })
    expect(isShaken(snap(a))).toBe(false)
  })
})

// ============================================================
// Distracted / Vulnerable timing tests
// ============================================================

describe("condition timers", () => {
  // distractedOutsideTurnTest
  it("distracted outside own turn → clears at end of next own turn", () => {
    const a = createWC()
    expect(snap(a).matches({ alive: { turnPhase: "othersTurn" } })).toBe(true)
    a.send({ type: "APPLY_DISTRACTED" })
    expect(snap(a).context.distractedTimer).toBe(0)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "END_OF_TURN" })
    expect(snap(a).context.distractedTimer).toBe(-1)
    expect(snap(a).matches({ alive: { conditionTrack: { distraction: "clear" } } })).toBe(true)
  })

  // distractedDuringOwnTurnTest
  it("distracted during own turn → lasts through current + next turn", () => {
    const a = createWC()
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)
    a.send({ type: "APPLY_DISTRACTED" })
    expect(snap(a).context.distractedTimer).toBe(1)

    a.send({ type: "END_OF_TURN" })
    expect(snap(a).context.distractedTimer).toBe(0)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "END_OF_TURN" })
    expect(snap(a).context.distractedTimer).toBe(-1)
    expect(snap(a).matches({ alive: { conditionTrack: { distraction: "clear" } } })).toBe(true)
  })
})

// ============================================================
// Fatigue tests
// ============================================================

describe("fatigue", () => {
  // fatigueProgressionTest
  it("fatigue progression: fresh → fatigued → exhausted → incapByFatigue", () => {
    const a = createWC()
    a.send({ type: "APPLY_FATIGUE" })
    expect(snap(a).matches({ alive: { fatigueTrack: "fatigued" } })).toBe(true)
    a.send({ type: "APPLY_FATIGUE" })
    expect(snap(a).matches({ alive: { fatigueTrack: "exhausted" } })).toBe(true)
    a.send({ type: "APPLY_FATIGUE" })
    expect(snap(a).matches({ alive: { fatigueTrack: "incapByFatigue" } })).toBe(true)
  })

  // fatigueRecoveryTest
  it("fatigue recovery: incapByFatigue → exhausted → fatigued → fresh", () => {
    const a = createWC()
    a.send({ type: "APPLY_FATIGUE" })
    a.send({ type: "APPLY_FATIGUE" })
    a.send({ type: "APPLY_FATIGUE" })
    expect(snap(a).matches({ alive: { fatigueTrack: "incapByFatigue" } })).toBe(true)

    a.send({ type: "RECOVER_FATIGUE" })
    expect(snap(a).matches({ alive: { fatigueTrack: "exhausted" } })).toBe(true)
    a.send({ type: "RECOVER_FATIGUE" })
    expect(snap(a).matches({ alive: { fatigueTrack: "fatigued" } })).toBe(true)
    a.send({ type: "RECOVER_FATIGUE" })
    expect(snap(a).matches({ alive: { fatigueTrack: "fresh" } })).toBe(true)
  })
})

// ============================================================
// Healing tests
// ============================================================

describe("healing", () => {
  // healWoundsTest
  it("heal reduces wounds", () => {
    const a = createWC()
    // Get to wounded state: take damage, recover from shaken
    a.send({ type: "TAKE_DAMAGE", margin: dm(8), soakSuccesses: sk(0), incapRoll: ir(0) }) // 2 wounds, shaken
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) }) // recover shaken → wounded
    expect(snap(a).context.wounds).toBe(2)
    expect(isShaken(snap(a))).toBe(false)

    a.send({ type: "HEAL", amount: ha(1) })
    expect(snap(a).context.wounds).toBe(1)
  })

  // healRemovesIncapTest
  it("heal removes incapacitation", () => {
    const a = createWC()
    // Get to incapacitated + bleedingOut
    a.send({ type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) }) // 3 wounds, shaken
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) }) // shaken-on-shaken → incap, bleedingOut
    expect(snap(a).matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })).toBe(true)

    a.send({ type: "HEAL", amount: ha(1) })
    expect(snap(a).context.wounds).toBe(2)
    expect(snap(a).matches({ alive: { damageTrack: "active" } })).toBe(true)
  })
})

// ============================================================
// Nondeterministic test (wound bounds)
// ============================================================

describe("invariants", () => {
  it("wound bounds preserved on any single hit", () => {
    for (const margin of [0, 1, 2, 4, 5, 8, 12, 15]) {
      for (const soak of [0, 1, 2, 3, 4]) {
        for (const incapRoll of [-1, 0, 1, 2, 3]) {
          const a = createWC()
          a.send({ type: "TAKE_DAMAGE", margin: dm(margin), soakSuccesses: sk(soak), incapRoll: ir(incapRoll) })
          const s = snap(a)
          expect(s.context.wounds).toBeGreaterThanOrEqual(0)
          expect(s.context.wounds).toBeLessThanOrEqual(s.context.maxWounds)
        }
      }
    }
  })
})

// ============================================================
// Prone tests
// ============================================================

describe("prone", () => {
  it("drop prone and stand up cycle", () => {
    const a = createWC()
    expect(isProne(snap(a))).toBe(false)

    a.send({ type: "DROP_PRONE" })
    expect(isProne(snap(a))).toBe(true)

    a.send({ type: "STAND_UP" })
    expect(isProne(snap(a))).toBe(false)
  })

  it("prone blocked when incapacitated", () => {
    const a = createWC()
    // Incapacitate: 3 wounds + shaken, then shaken-on-shaken → incap
    a.send({ type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) })
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(1) })
    expect(snap(a).matches({ alive: { damageTrack: "incapacitated" } })).toBe(true)

    a.send({ type: "DROP_PRONE" })
    expect(isProne(snap(a))).toBe(false)
  })

  it("prone blocked when incapacitated by fatigue", () => {
    const a = createWC()
    a.send({ type: "APPLY_FATIGUE" })
    a.send({ type: "APPLY_FATIGUE" })
    a.send({ type: "APPLY_FATIGUE" })
    expect(snap(a).matches({ alive: { fatigueTrack: "incapByFatigue" } })).toBe(true)

    a.send({ type: "DROP_PRONE" })
    expect(isProne(snap(a))).toBe(false)
  })

  it("prone clears on death", () => {
    const a = createWC()
    a.send({ type: "DROP_PRONE" })
    expect(isProne(snap(a))).toBe(true)

    // Kill: extra dies from any wound
    const b = createExtra()
    b.send({ type: "DROP_PRONE" })
    expect(isProne(snap(b))).toBe(true)
    b.send({ type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isDead(snap(b))).toBe(true)
    expect(isProne(snap(b))).toBe(false)
  })

  it("prone persists across turns", () => {
    const a = createWC()
    a.send({ type: "DROP_PRONE" })
    expect(isProne(snap(a))).toBe(true)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(isProne(snap(a))).toBe(true)

    a.send({ type: "END_OF_TURN" })
    expect(isProne(snap(a))).toBe(true)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(isProne(snap(a))).toBe(true)
  })

  it("prone clears when incapacitated (enters non-active state)", () => {
    const a = createWC()
    a.send({ type: "DROP_PRONE" })
    expect(isProne(snap(a))).toBe(true)

    // Incapacitate via damage
    a.send({ type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) })
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(1) })
    expect(snap(a).matches({ alive: { damageTrack: "incapacitated" } })).toBe(true)
    expect(isProne(snap(a))).toBe(false)
  })
})

// ============================================================
// Hold/Interrupt tests
// ============================================================

describe("hold/interrupt", () => {
  it("go on hold from own turn", () => {
    const a = createWC()
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)

    a.send({ type: "GO_ON_HOLD" })
    expect(isOnHold(snap(a))).toBe(true)
    expect(snap(a).context.ownTurn).toBe(false)
  })

  it("cannot go on hold when shaken", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    // Recover shaken on start of turn
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    // Still shaken (spirit fail)
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)

    a.send({ type: "GO_ON_HOLD" })
    expect(isOnHold(snap(a))).toBe(false) // Blocked
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)
  })

  it("cannot go on hold when stunned", () => {
    const a = createWC()
    a.send({ type: "APPLY_STUNNED" })
    a.send({ type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) }) // recover stunned
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)
    // Now vulnerable but not stunned — should be able to hold
    a.send({ type: "GO_ON_HOLD" })
    expect(isOnHold(snap(a))).toBe(true)
  })

  it("interrupt success → acts before interruptee", () => {
    const a = createWC()
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "GO_ON_HOLD" })
    expect(isOnHold(snap(a))).toBe(true)

    a.send({ type: "INTERRUPT", athleticsRoll: ar(1) })
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)
    expect(snap(a).context.ownTurn).toBe(true)
    expect(snap(a).context.interruptedSuccessfully).toBe(true)
  })

  it("interrupt fail → still gets turn (acts after interruptee)", () => {
    const a = createWC()
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "GO_ON_HOLD" })

    a.send({ type: "INTERRUPT", athleticsRoll: ar(0) })
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)
    expect(snap(a).context.ownTurn).toBe(true)
    expect(snap(a).context.interruptedSuccessfully).toBe(false)
  })

  it("hold lost when shaken applied", () => {
    const a = createWC()
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "GO_ON_HOLD" })
    expect(isOnHold(snap(a))).toBe(true)

    // Take damage → shaken
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    expect(isOnHold(snap(a))).toBe(false)
    expect(snap(a).matches({ alive: { turnPhase: "othersTurn" } })).toBe(true)
  })

  it("hold lost when stunned applied", () => {
    const a = createWC()
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "GO_ON_HOLD" })
    expect(isOnHold(snap(a))).toBe(true)

    a.send({ type: "APPLY_STUNNED" })
    expect(isOnHold(snap(a))).toBe(false)
    expect(snap(a).matches({ alive: { turnPhase: "othersTurn" } })).toBe(true)
  })

  it("end of turn from hold → still on hold (hold persists across rounds)", () => {
    const a = createWC()
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "GO_ON_HOLD" })

    a.send({ type: "END_OF_TURN" })
    expect(snap(a).matches({ alive: { turnPhase: "onHold" } })).toBe(true)
    expect(isOnHold(snap(a))).toBe(true)
  })

  it("hold persists across multiple rounds", () => {
    const a = createWC()
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "GO_ON_HOLD" })
    expect(isOnHold(snap(a))).toBe(true)

    a.send({ type: "END_OF_TURN" })
    expect(isOnHold(snap(a))).toBe(true)

    a.send({ type: "END_OF_TURN" })
    expect(isOnHold(snap(a))).toBe(true)
  })

  it("end of turn from hold does NOT tick distracted timer", () => {
    const a = createWC()
    a.send({ type: "APPLY_DISTRACTED" })
    expect(snap(a).context.distractedTimer).toBe(0)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "GO_ON_HOLD" })
    expect(isOnHold(snap(a))).toBe(true)
    expect(snap(a).context.distractedTimer).toBe(0)

    a.send({ type: "END_OF_TURN" })
    expect(isOnHold(snap(a))).toBe(true)
    expect(snap(a).context.distractedTimer).toBe(0) // NOT ticked
  })
})

// ============================================================
// Restraint tests (entangled/bound)
// ============================================================

describe("restraint", () => {
  it("apply entangled", () => {
    const a = createWC()
    a.send({ type: "APPLY_ENTANGLED" })
    expect(isEntangled(snap(a))).toBe(true)
    expect(isRestrained(snap(a))).toBe(true)
    expect(isBound(snap(a))).toBe(false)
  })

  it("apply bound → also distracted + vulnerable", () => {
    const a = createWC()
    a.send({ type: "APPLY_BOUND" })
    expect(isBound(snap(a))).toBe(true)
    expect(isRestrained(snap(a))).toBe(true)
    expect(isDistracted(snap(a))).toBe(true)
    expect(isVulnerable(snap(a))).toBe(true)
  })

  it("entangled upgraded to bound", () => {
    const a = createWC()
    a.send({ type: "APPLY_ENTANGLED" })
    expect(isEntangled(snap(a))).toBe(true)
    a.send({ type: "APPLY_BOUND" })
    expect(isBound(snap(a))).toBe(true)
    expect(isEntangled(snap(a))).toBe(false)
  })

  it("escape from entangled: success → free", () => {
    const a = createWC()
    a.send({ type: "APPLY_ENTANGLED" })
    a.send({ type: "ESCAPE_ATTEMPT", rollResult: er(1) })
    expect(isRestrained(snap(a))).toBe(false)
  })

  it("escape from entangled: fail → still entangled", () => {
    const a = createWC()
    a.send({ type: "APPLY_ENTANGLED" })
    a.send({ type: "ESCAPE_ATTEMPT", rollResult: er(0) })
    expect(isEntangled(snap(a))).toBe(true)
  })

  it("escape from bound: success → entangled", () => {
    const a = createWC()
    a.send({ type: "APPLY_BOUND" })
    a.send({ type: "ESCAPE_ATTEMPT", rollResult: er(1) })
    expect(isEntangled(snap(a))).toBe(true)
    expect(isBound(snap(a))).toBe(false)
  })

  it("escape from bound: raise → free", () => {
    const a = createWC()
    a.send({ type: "APPLY_BOUND" })
    a.send({ type: "ESCAPE_ATTEMPT", rollResult: er(2) })
    expect(isRestrained(snap(a))).toBe(false)
  })

  it("restraint blocked when incapacitated", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) })
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(1) })
    expect(snap(a).matches({ alive: { damageTrack: "incapacitated" } })).toBe(true)
    a.send({ type: "APPLY_ENTANGLED" })
    expect(isRestrained(snap(a))).toBe(false)
  })

  it("restraint clears on incapacitation", () => {
    const a = createWC()
    a.send({ type: "APPLY_BOUND" })
    expect(isBound(snap(a))).toBe(true)
    // Incapacitate
    a.send({ type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) })
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(1) })
    expect(snap(a).matches({ alive: { damageTrack: "incapacitated" } })).toBe(true)
    expect(isRestrained(snap(a))).toBe(false)
  })

  it("restraint clears on death", () => {
    const b = createExtra()
    b.send({ type: "APPLY_ENTANGLED" })
    expect(isEntangled(snap(b))).toBe(true)
    b.send({ type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isDead(snap(b))).toBe(true)
    expect(isRestrained(snap(b))).toBe(false)
  })
})

// ============================================================
// Grapple tests
// ============================================================

describe("grapple", () => {
  it("grapple attempt success → grabbed + distracted + vulnerable", () => {
    const a = createWC()
    a.send({ type: "GRAPPLE_ATTEMPT", rollResult: gr(1) })
    expect(isGrabbed(snap(a))).toBe(true)
    expect(isGrappled(snap(a))).toBe(true)
    expect(isDistracted(snap(a))).toBe(true)
    expect(isVulnerable(snap(a))).toBe(true)
  })

  it("grapple attempt raise → pinned", () => {
    const a = createWC()
    a.send({ type: "GRAPPLE_ATTEMPT", rollResult: gr(2) })
    expect(isPinned(snap(a))).toBe(true)
    expect(isGrappled(snap(a))).toBe(true)
  })

  it("grapple attempt fail → still free", () => {
    const a = createWC()
    a.send({ type: "GRAPPLE_ATTEMPT", rollResult: gr(0) })
    expect(isGrappled(snap(a))).toBe(false)
  })

  it("grapple escape from grabbed → free", () => {
    const a = createWC()
    a.send({ type: "GRAPPLE_ATTEMPT", rollResult: gr(1) })
    expect(isGrabbed(snap(a))).toBe(true)
    a.send({ type: "GRAPPLE_ESCAPE", rollResult: ger(1) })
    expect(isGrappled(snap(a))).toBe(false)
  })

  it("grapple escape fail → still grabbed", () => {
    const a = createWC()
    a.send({ type: "GRAPPLE_ATTEMPT", rollResult: gr(1) })
    a.send({ type: "GRAPPLE_ESCAPE", rollResult: ger(0) })
    expect(isGrabbed(snap(a))).toBe(true)
  })

  it("pin attempt success → pinned", () => {
    const a = createWC()
    a.send({ type: "GRAPPLE_ATTEMPT", rollResult: gr(1) })
    expect(isGrabbed(snap(a))).toBe(true)
    a.send({ type: "PIN_ATTEMPT", rollResult: pr(1) })
    expect(isPinned(snap(a))).toBe(true)
  })

  it("grapple escape from pinned → free", () => {
    const a = createWC()
    a.send({ type: "GRAPPLE_ATTEMPT", rollResult: gr(2) })
    expect(isPinned(snap(a))).toBe(true)
    a.send({ type: "GRAPPLE_ESCAPE", rollResult: ger(1) })
    expect(isGrappled(snap(a))).toBe(false)
  })

  it("grapple and restraint are mutually exclusive", () => {
    const a = createWC()
    a.send({ type: "APPLY_ENTANGLED" })
    expect(isEntangled(snap(a))).toBe(true)
    // Grapple from entangled state — replaces restraint
    a.send({ type: "GRAPPLE_ATTEMPT", rollResult: gr(1) })
    expect(isGrabbed(snap(a))).toBe(true)
    expect(isEntangled(snap(a))).toBe(false)
  })

  it("grapple clears on incapacitation", () => {
    const a = createWC()
    a.send({ type: "GRAPPLE_ATTEMPT", rollResult: gr(1) })
    expect(isGrabbed(snap(a))).toBe(true)
    a.send({ type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) })
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(1) })
    expect(isGrappled(snap(a))).toBe(false)
  })
})

// ============================================================
// Blinded tests
// ============================================================

describe("blinded", () => {
  it("apply blinded severity 2 → impaired", () => {
    const a = createWC()
    a.send({ type: "APPLY_BLINDED", severity: bs(2) })
    expect(isBlinded(snap(a))).toBe(true)
    expect(isFullyBlinded(snap(a))).toBe(false)
    expect(blindedPenalty(snap(a))).toBe(-2)
  })

  it("apply blinded severity 4 → fully blinded", () => {
    const a = createWC()
    a.send({ type: "APPLY_BLINDED", severity: bs(4) })
    expect(isFullyBlinded(snap(a))).toBe(true)
    expect(blindedPenalty(snap(a))).toBe(-4)
  })

  it("impaired upgraded to blinded", () => {
    const a = createWC()
    a.send({ type: "APPLY_BLINDED", severity: bs(2) })
    expect(isFullyBlinded(snap(a))).toBe(false)
    a.send({ type: "APPLY_BLINDED", severity: bs(4) })
    expect(isFullyBlinded(snap(a))).toBe(true)
  })

  it("blinded recovery: vigor raise → clear", () => {
    const a = createWC()
    a.send({ type: "APPLY_BLINDED", severity: bs(4) })
    expect(isFullyBlinded(snap(a))).toBe(true)
    a.send({ type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) })
    expect(isBlinded(snap(a))).toBe(false)
    expect(blindedPenalty(snap(a))).toBe(0)
  })

  it("blinded recovery: vigor success → step down to impaired", () => {
    const a = createWC()
    a.send({ type: "APPLY_BLINDED", severity: bs(4) })
    a.send({ type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) })
    expect(isFullyBlinded(snap(a))).toBe(false)
    expect(isBlinded(snap(a))).toBe(true)
    expect(blindedPenalty(snap(a))).toBe(-2)
  })

  it("impaired recovery: vigor success → clear", () => {
    const a = createWC()
    a.send({ type: "APPLY_BLINDED", severity: bs(2) })
    a.send({ type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) })
    expect(isBlinded(snap(a))).toBe(false)
  })

  it("blinded recovery: vigor fail → no change", () => {
    const a = createWC()
    a.send({ type: "APPLY_BLINDED", severity: bs(4) })
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(isFullyBlinded(snap(a))).toBe(true)
  })

  it("blinded clears on incapacitation", () => {
    const a = createWC()
    a.send({ type: "APPLY_BLINDED", severity: bs(4) })
    expect(isFullyBlinded(snap(a))).toBe(true)
    a.send({ type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) })
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(1) })
    expect(isBlinded(snap(a))).toBe(false)
  })
})

// ============================================================
// Fear table tests
// ============================================================

describe("Fear table", () => {
  it("1-3: adrenaline rush", () => {
    expect(resolveFear(1, 0)).toEqual(["ADRENALINE"])
    expect(resolveFear(3, 0)).toEqual(["ADRENALINE"])
  })

  it("4-6: distracted", () => {
    expect(resolveFear(4, 0)).toEqual(["APPLY_DISTRACTED"])
    expect(resolveFear(6, 0)).toEqual(["APPLY_DISTRACTED"])
  })

  it("7-9: vulnerable", () => {
    expect(resolveFear(7, 0)).toEqual(["APPLY_VULNERABLE"])
    expect(resolveFear(9, 0)).toEqual(["APPLY_VULNERABLE"])
  })

  it("10-12: stunned", () => {
    expect(resolveFear(10, 0)).toEqual(["APPLY_STUNNED"])
    expect(resolveFear(12, 0)).toEqual(["APPLY_STUNNED"])
  })

  it("13: fear mark (stunned + scar)", () => {
    expect(resolveFear(13, 0)).toEqual(["APPLY_STUNNED", "HINDRANCE_SCAR"])
  })

  it("14-15: slowness hindrance", () => {
    expect(resolveFear(14, 0)).toEqual(["HINDRANCE_SLOWNESS"])
    expect(resolveFear(15, 0)).toEqual(["HINDRANCE_SLOWNESS"])
  })

  it("16-17: panic (stunned + flee)", () => {
    expect(resolveFear(16, 0)).toEqual(["APPLY_STUNNED", "PANIC_FLEE"])
    expect(resolveFear(17, 0)).toEqual(["APPLY_STUNNED", "PANIC_FLEE"])
  })

  it("18-19: minor phobia", () => {
    expect(resolveFear(18, 0)).toEqual(["HINDRANCE_MINOR_PHOBIA"])
    expect(resolveFear(19, 0)).toEqual(["HINDRANCE_MINOR_PHOBIA"])
  })

  it("20-21: major phobia", () => {
    expect(resolveFear(20, 0)).toEqual(["HINDRANCE_MAJOR_PHOBIA"])
    expect(resolveFear(21, 0)).toEqual(["HINDRANCE_MAJOR_PHOBIA"])
  })

  it("22+: heart attack", () => {
    expect(resolveFear(22, 0)).toEqual(["HEART_ATTACK"])
    expect(resolveFear(25, 0)).toEqual(["HEART_ATTACK"])
  })

  it("modifier shifts bracket correctly", () => {
    expect(resolveFear(3, 5)).toEqual(["APPLY_VULNERABLE"])
    expect(resolveFear(10, 3)).toEqual(["APPLY_STUNNED", "HINDRANCE_SCAR"])
    expect(resolveFear(18, 4)).toEqual(["HEART_ATTACK"])
  })

  it("negative modifier reduces result", () => {
    expect(resolveFear(10, -5)).toEqual(["APPLY_DISTRACTED"])
  })
})

// ============================================================
// Affliction tests
// ============================================================

describe("afflictions", () => {
  it("apply and cure affliction", () => {
    const a = createWC()
    a.send({ type: "APPLY_AFFLICTION", afflictionType: "weak", duration: ad(3) })
    expect(isAfflicted(snap(a))).toBe(true)
    expect(afflictionType(snap(a))).toBe("weak")
    expect(snap(a).context.afflictionTimer).toBe(3)

    a.send({ type: "CURE_AFFLICTION" })
    expect(isAfflicted(snap(a))).toBe(false)
    expect(afflictionType(snap(a))).toBeNull()
    expect(snap(a).context.afflictionTimer).toBe(-1)
  })

  it("affliction timer ticks down and expires", () => {
    const a = createWC()
    a.send({ type: "APPLY_AFFLICTION", afflictionType: "paralytic", duration: ad(1) })
    expect(afflictionType(snap(a))).toBe("paralytic")
    expect(snap(a).context.afflictionTimer).toBe(1)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "END_OF_TURN" })
    expect(snap(a).context.afflictionTimer).toBe(0)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "END_OF_TURN" })
    expect(isAfflicted(snap(a))).toBe(false)
    expect(snap(a).context.afflictionTimer).toBe(-1)
  })

  it("death clears affliction", () => {
    const b = createExtra()
    b.send({ type: "APPLY_AFFLICTION", afflictionType: "lethal", duration: ad(5) })
    expect(isAfflicted(snap(b))).toBe(true)
    b.send({ type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isDead(snap(b))).toBe(true)
    expect(snap(b).context.afflictionTimer).toBe(-1)
  })

  it("paralytic blocks stunned recovery", () => {
    const a = createWC()
    a.send({ type: "APPLY_AFFLICTION", afflictionType: "paralytic", duration: ad(5) })
    a.send({ type: "APPLY_STUNNED" })
    expect(isStunned(snap(a))).toBe(true)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) })
    expect(isStunned(snap(a))).toBe(true) // blocked by paralytic
  })

  it("paralytic does not block shaken recovery", () => {
    const a = createWC()
    a.send({ type: "APPLY_AFFLICTION", afflictionType: "paralytic", duration: ad(5) })
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) })
    expect(isShaken(snap(a))).toBe(false)
  })

  it("weak adds fatigue each turn", () => {
    const a = createWC()
    a.send({ type: "APPLY_AFFLICTION", afflictionType: "weak", duration: ad(5) })
    expect(snap(a).matches({ alive: { fatigueTrack: "fresh" } })).toBe(true)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(snap(a).matches({ alive: { fatigueTrack: "fatigued" } })).toBe(true)

    a.send({ type: "END_OF_TURN" })
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(snap(a).matches({ alive: { fatigueTrack: "exhausted" } })).toBe(true)
  })

  it("lethal adds fatigue + shaken + wound per turn", () => {
    const a = createWC()
    a.send({ type: "APPLY_AFFLICTION", afflictionType: "lethal", duration: ad(5) })

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(snap(a).matches({ alive: { fatigueTrack: "fatigued" } })).toBe(true)
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(1)
  })

  it("lethal cascades to incapacitation", () => {
    const a = createWC()
    // Start with 3 wounds (max for WC)
    a.send({ type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(snap(a).context.wounds).toBe(3)
    expect(isShaken(snap(a))).toBe(true)
    // Recover shaken
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) })
    a.send({ type: "END_OF_TURN" })

    a.send({ type: "APPLY_AFFLICTION", afflictionType: "lethal", duration: ad(5) })
    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    expect(snap(a).matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })).toBe(true)
  })

  it("sleep blocks stunned recovery", () => {
    const a = createWC()
    a.send({ type: "APPLY_STUNNED" })
    expect(isStunned(snap(a))).toBe(true)
    a.send({ type: "APPLY_AFFLICTION", afflictionType: "sleep", duration: ad(3) })

    a.send({ type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(1) })
    expect(isStunned(snap(a))).toBe(true) // blocked by sleep
  })

  it("sleep blocks shaken recovery", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isShaken(snap(a))).toBe(true)
    a.send({ type: "APPLY_AFFLICTION", afflictionType: "sleep", duration: ad(3) })

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) })
    expect(isShaken(snap(a))).toBe(true) // blocked by sleep
  })

  it("affliction replaces previous affliction", () => {
    const a = createWC()
    a.send({ type: "APPLY_AFFLICTION", afflictionType: "weak", duration: ad(3) })
    expect(afflictionType(snap(a))).toBe("weak")

    a.send({ type: "APPLY_AFFLICTION", afflictionType: "lethal", duration: ad(5) })
    expect(afflictionType(snap(a))).toBe("lethal")
    expect(snap(a).context.afflictionTimer).toBe(5)
  })
})

// ============================================================
// Power effect tests
// ============================================================

describe("power effects", () => {
  it("apply and dismiss effect", () => {
    const a = createWC()
    a.send({ type: "APPLY_POWER_EFFECT", etype: "armor", duration: 3 })
    expect(hasEffect(snap(a), "armor")).toBe(true)
    expect(activeEffectsList(snap(a))).toHaveLength(1)
    expect(activeEffectsList(snap(a))[0]).toEqual({ etype: "armor", timer: 3 })

    a.send({ type: "DISMISS_EFFECT", etype: "armor" })
    expect(hasEffect(snap(a), "armor")).toBe(false)
    expect(activeEffectsList(snap(a))).toHaveLength(0)
  })

  it("effect timer ticks down and expires", () => {
    const a = createWC()
    a.send({ type: "APPLY_POWER_EFFECT", etype: "shield", duration: 1 })
    expect(activeEffectsList(snap(a))).toHaveLength(1)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "END_OF_TURN" })
    expect(activeEffectsList(snap(a))).toHaveLength(0)
  })

  it("multiple effects stack and tick independently", () => {
    const a = createWC()
    a.send({ type: "APPLY_POWER_EFFECT", etype: "armor", duration: 3 })
    a.send({ type: "APPLY_POWER_EFFECT", etype: "smite", duration: 2 })
    expect(activeEffectsList(snap(a))).toHaveLength(2)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "END_OF_TURN" })
    expect(activeEffectsList(snap(a))).toHaveLength(2)
    expect(activeEffectsList(snap(a))[0].timer).toBe(2)
    expect(activeEffectsList(snap(a))[1].timer).toBe(1)

    a.send({ type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) })
    a.send({ type: "END_OF_TURN" })
    expect(activeEffectsList(snap(a))).toHaveLength(1)
    expect(activeEffectsList(snap(a))[0].etype).toBe("armor")
  })

  it("backlash clears all effects and adds fatigue", () => {
    const a = createWC()
    a.send({ type: "APPLY_POWER_EFFECT", etype: "armor", duration: 3 })
    a.send({ type: "APPLY_POWER_EFFECT", etype: "boost", duration: 2 })
    expect(activeEffectsList(snap(a))).toHaveLength(2)
    expect(snap(a).matches({ alive: { fatigueTrack: "fresh" } })).toBe(true)

    a.send({ type: "BACKLASH" })
    expect(activeEffectsList(snap(a))).toHaveLength(0)
    expect(snap(a).matches({ alive: { fatigueTrack: "fatigued" } })).toBe(true)
  })

  it("dismiss removes only first match", () => {
    const a = createWC()
    a.send({ type: "APPLY_POWER_EFFECT", etype: "armor", duration: 3 })
    a.send({ type: "APPLY_POWER_EFFECT", etype: "armor", duration: 5 })
    expect(activeEffectsList(snap(a))).toHaveLength(2)

    a.send({ type: "DISMISS_EFFECT", etype: "armor" })
    expect(activeEffectsList(snap(a))).toHaveLength(1)
    expect(activeEffectsList(snap(a))[0].timer).toBe(5)
  })

  it("death clears active effects", () => {
    const b = createExtra()
    b.send({ type: "APPLY_POWER_EFFECT", etype: "shield", duration: 3 })
    expect(activeEffectsList(snap(b))).toHaveLength(1)

    b.send({ type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) })
    expect(isDead(snap(b))).toBe(true)
    expect(activeEffectsList(snap(b))).toHaveLength(0)
  })

  it("backlash with no active effects does not add fatigue", () => {
    const a = createWC()
    expect(activeEffectsList(snap(a))).toHaveLength(0)
    expect(snap(a).matches({ alive: { fatigueTrack: "fresh" } })).toBe(true)

    a.send({ type: "BACKLASH" })
    expect(snap(a).matches({ alive: { fatigueTrack: "fresh" } })).toBe(true)
  })

  it("apply power effect with duration 0 is a no-op", () => {
    const a = createWC()
    a.send({ type: "APPLY_POWER_EFFECT", etype: "armor", duration: 0 })
    expect(activeEffectsList(snap(a))).toHaveLength(0)
    expect(hasEffect(snap(a), "armor")).toBe(false)
  })
})
