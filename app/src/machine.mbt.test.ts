import * as path from "node:path"

import { defineDriver, run, stateCheck } from "@firfi/quint-connect"
import { ITFBigInt } from "@firfi/quint-connect/zod"
import { describe, it } from "vitest"
import { createActor } from "xstate"
import { z } from "zod"

import { isDead, isShaken, isStunned, savageMachine, type SavageSnapshot } from "./machine"
import { damageMargin, healAmount, incapRollResult, soakSuccesses, spiritRollResult, vigorRollResult } from "./types"

// ============================================================
// Quint state schema (all ints are bigint from ITF)
// ============================================================

const QuintState = z.object({
  shaken: z.boolean(),
  stunned: z.boolean(),
  distracted: z.bigint(),
  vulnerable: z.bigint(),
  wounds: z.bigint(),
  incapacitated: z.boolean(),
  bleedingOut: z.boolean(),
  dead: z.boolean(),
  fatigue: z.bigint(),
  incapByFatigue: z.boolean(),
  isWildCard: z.boolean(),
  maxWounds: z.bigint(),
  ownTurn: z.boolean()
})

// ============================================================
// XState snapshot → flat Quint state
// ============================================================

function fatigueLevel(snap: SavageSnapshot): number {
  if (isDead(snap)) return 0
  if (
    snap.matches({ alive: { fatigueTrack: "exhausted" } }) ||
    snap.matches({ alive: { fatigueTrack: "incapByFatigue" } })
  )
    return 2
  if (snap.matches({ alive: { fatigueTrack: "fatigued" } })) return 1
  return 0
}

function snapshotToQuintState(snap: SavageSnapshot) {
  const dead = isDead(snap)
  return {
    shaken: dead ? false : isShaken(snap),
    stunned: dead ? false : isStunned(snap),
    distracted: BigInt(snap.context.distractedTimer),
    vulnerable: BigInt(snap.context.vulnerableTimer),
    wounds: BigInt(snap.context.wounds),
    incapacitated: dead ? false : snap.matches({ alive: { damageTrack: "incapacitated" } }),
    bleedingOut: dead ? false : snap.matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } }),
    dead,
    fatigue: BigInt(fatigueLevel(snap)),
    incapByFatigue: dead ? false : snap.matches({ alive: { fatigueTrack: "incapByFatigue" } }),
    isWildCard: snap.context.isWildCard,
    maxWounds: BigInt(snap.context.maxWounds),
    ownTurn: snap.context.ownTurn
  }
}

// ============================================================
// Driver: map Quint actions → XState events
// ============================================================

const savageDriver = defineDriver(
  {
    init: { wc: z.boolean() },
    doTakeDamage: { margin: ITFBigInt, soak: ITFBigInt, incapRoll: ITFBigInt },
    doStartOfTurn: { vigorRoll: ITFBigInt, spiritRoll: ITFBigInt },
    doEndOfTurn: {},
    doUnshake: {},
    doApplyStunned: {},
    doApplyDistracted: {},
    doApplyVulnerable: {},
    doApplyFatigue: {},
    doRecoverFatigue: {},
    doHeal: { amount: ITFBigInt },
    doFinishingMove: {},
    step: {} // dead character no-op (state' = state)
  },
  () => {
    let actor: ReturnType<typeof createActor<typeof savageMachine>> | null = null

    function ensureActor() {
      if (!actor) throw new Error("Actor not initialized — init action must come first")
      return actor
    }

    return {
      init: ({ wc }) => {
        if (actor) actor.stop()
        actor = createActor(savageMachine, { input: { isWildCard: wc } })
        actor.start()
      },
      doTakeDamage: ({ incapRoll, margin, soak }) => {
        ensureActor().send({
          type: "TAKE_DAMAGE",
          margin: damageMargin(Number(margin)),
          soakSuccesses: soakSuccesses(Number(soak)),
          incapRoll: incapRollResult(Number(incapRoll))
        })
      },
      doStartOfTurn: ({ spiritRoll: sr, vigorRoll: vr }) => {
        ensureActor().send({
          type: "START_OF_TURN",
          vigorRoll: vigorRollResult(Number(vr)),
          spiritRoll: spiritRollResult(Number(sr))
        })
      },
      doEndOfTurn: () => {
        ensureActor().send({ type: "END_OF_TURN" })
      },
      doUnshake: () => {
        ensureActor().send({ type: "SPEND_BENNY" })
      },
      doApplyStunned: () => {
        ensureActor().send({ type: "APPLY_STUNNED" })
      },
      doApplyDistracted: () => {
        ensureActor().send({ type: "APPLY_DISTRACTED" })
      },
      doApplyVulnerable: () => {
        ensureActor().send({ type: "APPLY_VULNERABLE" })
      },
      doApplyFatigue: () => {
        ensureActor().send({ type: "APPLY_FATIGUE" })
      },
      doRecoverFatigue: () => {
        ensureActor().send({ type: "RECOVER_FATIGUE" })
      },
      doHeal: ({ amount }) => {
        ensureActor().send({ type: "HEAL", amount: healAmount(Number(amount)) })
      },
      doFinishingMove: () => {
        ensureActor().send({ type: "FINISHING_MOVE" })
      },
      step: () => {}, // dead character no-op
      getState: () => snapshotToQuintState(ensureActor().getSnapshot()),
      config: () => ({ statePath: ["state"] })
    }
  }
)

// ============================================================
// MBT test
// ============================================================

describe("Savage MBT", () => {
  it("replays Quint traces against XState machine", async () => {
    await run({
      spec: path.resolve(import.meta.dirname, "../../savage.qnt"),
      driver: savageDriver,
      backend: "rust",
      nTraces: 50,
      maxSteps: 30,
      stateCheck: stateCheck(
        (raw) => QuintState.parse(raw),
        (spec, impl) => {
          const keys = Object.keys(spec) as Array<keyof typeof spec>
          for (const k of keys) {
            if (spec[k] !== impl[k]) return false
          }
          return true
        }
      )
    })
  }, 120_000)
})
