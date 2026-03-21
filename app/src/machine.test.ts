import { describe, expect, it } from "vitest"
import { createActor } from "xstate"

import { isDead, isProne, isShaken, savageMachine } from "./machine"

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
    a.send({ type: "TAKE_DAMAGE", margin: 2, soakSuccesses: 0, incapRoll: 0 })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(0)
  })

  // woundFromRaiseTest: margin 5, 1 raise → Shaken + 1 wound
  it("wound from raise (margin 5)", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: 5, soakSuccesses: 0, incapRoll: 0 })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(1)
  })

  // shakenOnShakenTest: Shaken-on-Shaken = 1 wound
  it("shaken-on-shaken gives wound", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: 2, soakSuccesses: 0, incapRoll: 0 })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(0)
    a.send({ type: "TAKE_DAMAGE", margin: 1, soakSuccesses: 0, incapRoll: 0 })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(1)
  })

  // shakenWithRaiseTest: Shaken + 1 raise = still just 1 wound
  it("shaken with raise gives 1 wound (not 2)", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 0 })
    expect(isShaken(snap(a))).toBe(true)
    a.send({ type: "TAKE_DAMAGE", margin: 4, soakSuccesses: 0, incapRoll: 0 })
    expect(snap(a).context.wounds).toBe(1)
  })

  // soakClearsShakenTest: soak removes all wounds and clears pre-existing Shaken
  it("soak clears shaken", () => {
    const a = createWC()
    // Get to shaken state
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 0 })
    expect(isShaken(snap(a))).toBe(true)
    // Now take damage with soak
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 1, incapRoll: 0 })
    expect(isShaken(snap(a))).toBe(false)
    expect(snap(a).context.wounds).toBe(0)
  })

  // partialSoakTest: reduce wounds but stay Shaken
  it("partial soak", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: 8, soakSuccesses: 1, incapRoll: 0 })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(1)
  })

  // noDamageOnMissTest: margin 0 causes Shaken (it's a hit that meets toughness)
  it("margin 0 causes shaken", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 0 })
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
    a.send({ type: "TAKE_DAMAGE", margin: 4, soakSuccesses: 0, incapRoll: 0 })
    expect(isDead(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(1)
  })

  // extraShakenSurvivesTest
  it("extra shaken survives", () => {
    const a = createExtra()
    a.send({ type: "TAKE_DAMAGE", margin: 2, soakSuccesses: 0, incapRoll: 0 })
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
    a.send({ type: "TAKE_DAMAGE", margin: 12, soakSuccesses: 0, incapRoll: 0 })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).context.wounds).toBe(3)
    return a
  }

  // incapBleedingOutTest: shaken + 3 wounds, hit again → incap, incapRoll fail → bleeding out
  it("incap bleeding out", () => {
    const a = shakenWith3Wounds()
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 0 })
    expect(snap(a).matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })).toBe(true)
    expect(snap(a).context.wounds).toBe(3)
  })

  // incapCritFailDeadTest
  it("incap crit fail → dead", () => {
    const a = shakenWith3Wounds()
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: -1 })
    expect(isDead(snap(a))).toBe(true)
  })

  // incapSuccessTest
  it("incap success → stable", () => {
    const a = shakenWith3Wounds()
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 1 })
    expect(snap(a).matches({ alive: { damageTrack: { incapacitated: "stable" } } })).toBe(true)
    expect(isDead(snap(a))).toBe(false)
  })

  // bleedingOutDeathTest
  it("bleeding out fail → dead", () => {
    const a = shakenWith3Wounds()
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 0 }) // → bleedingOut
    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 0 })
    expect(isDead(snap(a))).toBe(true)
  })

  // bleedingOutStabilizedTest
  it("bleeding out raise → stabilized", () => {
    const a = shakenWith3Wounds()
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 0 }) // → bleedingOut
    a.send({ type: "START_OF_TURN", vigorRoll: 2, spiritRoll: 0 })
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

    a.send({ type: "START_OF_TURN", vigorRoll: 1, spiritRoll: 0 })
    expect(snap(a).matches({ alive: { conditionTrack: { stun: "normal" } } })).toBe(true)
    expect(snap(a).matches({ alive: { conditionTrack: { vulnerability: "vulnerable" } } })).toBe(true)
    expect(snap(a).context.vulnerableTimer).toBe(1)
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)

    a.send({ type: "END_OF_TURN" })
    expect(snap(a).context.vulnerableTimer).toBe(0)
    expect(snap(a).context.distractedTimer).toBe(-1)

    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 0 })
    a.send({ type: "END_OF_TURN" })
    expect(snap(a).context.vulnerableTimer).toBe(-1)
    expect(snap(a).matches({ alive: { conditionTrack: { vulnerability: "clear" } } })).toBe(true)
  })

  // stunnedRecoveryRaiseTest
  it("stunned recovery raise → vulnerable clears at end of current turn", () => {
    const a = createWC()
    a.send({ type: "APPLY_STUNNED" })
    a.send({ type: "START_OF_TURN", vigorRoll: 2, spiritRoll: 0 })
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
    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 0 })
    expect(snap(a).matches({ alive: { conditionTrack: { stun: "stunned" } } })).toBe(true)
  })

  function shakenAndStunned() {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 0 })
    a.send({ type: "APPLY_STUNNED" })
    return a
  }

  it("stunned + shaken: both recover on same turn", () => {
    const a = shakenAndStunned()
    a.send({ type: "START_OF_TURN", vigorRoll: 1, spiritRoll: 1 })
    expect(snap(a).matches({ alive: { conditionTrack: { stun: "normal" } } })).toBe(true)
    expect(isShaken(snap(a))).toBe(false)
  })

  it("stunned + shaken: vigor fails, spirit succeeds", () => {
    const a = shakenAndStunned()
    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 1 })
    expect(snap(a).matches({ alive: { conditionTrack: { stun: "stunned" } } })).toBe(true)
    expect(isShaken(snap(a))).toBe(false)
  })

  it("stunned + shaken: vigor succeeds, spirit fails", () => {
    const a = shakenAndStunned()
    a.send({ type: "START_OF_TURN", vigorRoll: 1, spiritRoll: 0 })
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
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 0 })
    expect(isShaken(snap(a))).toBe(true)
    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 1 })
    expect(isShaken(snap(a))).toBe(false)
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)
  })

  // shakenRecoveryFailTest
  it("shaken recovery fail", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 0 })
    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 0 })
    expect(isShaken(snap(a))).toBe(true)
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)
  })

  // bennyUnshakeTest
  it("benny unshake", () => {
    const a = createWC()
    a.send({ type: "TAKE_DAMAGE", margin: 2, soakSuccesses: 0, incapRoll: 0 })
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

    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 0 })
    a.send({ type: "END_OF_TURN" })
    expect(snap(a).context.distractedTimer).toBe(-1)
    expect(snap(a).matches({ alive: { conditionTrack: { distraction: "clear" } } })).toBe(true)
  })

  // distractedDuringOwnTurnTest
  it("distracted during own turn → lasts through current + next turn", () => {
    const a = createWC()
    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 0 })
    expect(snap(a).matches({ alive: { turnPhase: "ownTurn" } })).toBe(true)
    a.send({ type: "APPLY_DISTRACTED" })
    expect(snap(a).context.distractedTimer).toBe(1)

    a.send({ type: "END_OF_TURN" })
    expect(snap(a).context.distractedTimer).toBe(0)

    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 0 })
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
    a.send({ type: "TAKE_DAMAGE", margin: 8, soakSuccesses: 0, incapRoll: 0 }) // 2 wounds, shaken
    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 1 }) // recover shaken → wounded
    expect(snap(a).context.wounds).toBe(2)
    expect(isShaken(snap(a))).toBe(false)

    a.send({ type: "HEAL", amount: 1 })
    expect(snap(a).context.wounds).toBe(1)
  })

  // healRemovesIncapTest
  it("heal removes incapacitation", () => {
    const a = createWC()
    // Get to incapacitated + bleedingOut
    a.send({ type: "TAKE_DAMAGE", margin: 12, soakSuccesses: 0, incapRoll: 0 }) // 3 wounds, shaken
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 0 }) // shaken-on-shaken → incap, bleedingOut
    expect(snap(a).matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })).toBe(true)

    a.send({ type: "HEAL", amount: 1 })
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
          a.send({ type: "TAKE_DAMAGE", margin, soakSuccesses: soak, incapRoll })
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
    a.send({ type: "TAKE_DAMAGE", margin: 12, soakSuccesses: 0, incapRoll: 0 })
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 1 })
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
    b.send({ type: "TAKE_DAMAGE", margin: 4, soakSuccesses: 0, incapRoll: 0 })
    expect(isDead(snap(b))).toBe(true)
    expect(isProne(snap(b))).toBe(false)
  })

  it("prone persists across turns", () => {
    const a = createWC()
    a.send({ type: "DROP_PRONE" })
    expect(isProne(snap(a))).toBe(true)

    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 0 })
    expect(isProne(snap(a))).toBe(true)

    a.send({ type: "END_OF_TURN" })
    expect(isProne(snap(a))).toBe(true)

    a.send({ type: "START_OF_TURN", vigorRoll: 0, spiritRoll: 0 })
    expect(isProne(snap(a))).toBe(true)
  })

  it("prone clears when incapacitated (enters non-active state)", () => {
    const a = createWC()
    a.send({ type: "DROP_PRONE" })
    expect(isProne(snap(a))).toBe(true)

    // Incapacitate via damage
    a.send({ type: "TAKE_DAMAGE", margin: 12, soakSuccesses: 0, incapRoll: 0 })
    a.send({ type: "TAKE_DAMAGE", margin: 0, soakSuccesses: 0, incapRoll: 1 })
    expect(snap(a).matches({ alive: { damageTrack: "incapacitated" } })).toBe(true)
    expect(isProne(snap(a))).toBe(false)
  })
})
