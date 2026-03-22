import { execSync } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

import { defineDriver, run, stateCheck } from "@firfi/quint-connect"
import { ITFBigInt } from "@firfi/quint-connect/zod"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { createActor } from "xstate"
import { z } from "zod"

import { isDead, isShaken, isStunned, type SavageEvent, savageMachine, type SavageSnapshot } from "./machine"
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
// ENFORCEMENT: every SavageEvent type must have a driver action
// ============================================================

// Canonical map: SavageEvent type → Quint action name.
// Adding a new SavageEvent without a map entry here = compile error.
type EventActionMap = {
  TAKE_DAMAGE: "doTakeDamage"
  START_OF_TURN: "doStartOfTurn"
  END_OF_TURN: "doEndOfTurn"
  SPEND_BENNY: "doUnshake"
  APPLY_STUNNED: "doApplyStunned"
  APPLY_DISTRACTED: "doApplyDistracted"
  APPLY_VULNERABLE: "doApplyVulnerable"
  APPLY_FATIGUE: "doApplyFatigue"
  RECOVER_FATIGUE: "doRecoverFatigue"
  HEAL: "doHeal"
  FINISHING_MOVE: "doFinishingMove"
  DROP_PRONE: "doDropProne"
  STAND_UP: "doStandUp"
  GO_ON_HOLD: "doGoOnHold"
  ACT_FROM_HOLD: "doActFromHold"
  INTERRUPT: "doInterrupt"
  APPLY_ENTANGLED: "doApplyEntangled"
  APPLY_BOUND: "doApplyBound"
  ESCAPE_ATTEMPT: "doEscapeAttempt"
  GRAPPLE_ATTEMPT: "doGrappleAttempt"
  GRAPPLE_ESCAPE: "doGrappleEscape"
  PIN_ATTEMPT: "doPinAttempt"
  APPLY_BLINDED: "doApplyBlinded"
  APPLY_AFFLICTION: "doApplyAffliction"
  CURE_AFFLICTION: "doCureAffliction"
  DEFEND: "doDefend"
  APPLY_POWER_EFFECT: "doApplyEffect"
  DISMISS_EFFECT: "doDismissEffect"
  BACKLASH: "doBacklash"
}

// Compile error if a SavageEvent type is missing from EventActionMap.
// Exclude<...> is `never` when complete; any missing event type appears in the union.
type UnmappedEvents = Exclude<SavageEvent["type"], keyof EventActionMap | "_LETHAL_TICK">
// If UnmappedEvents is not `never`, this line won't compile — the error names the missing events.
type AssertAllEventsMapped = UnmappedEvents extends never
  ? true
  : { ERROR: `Missing from EventActionMap: ${UnmappedEvents}` }
void (true as AssertAllEventsMapped)

// ============================================================
// Driver: map Quint actions → XState events
// ============================================================

const driverSchema = {
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
} as const

const savageDriver = defineDriver(driverSchema, () => {
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
      ensureActor().send({ type: "END_OF_TURN", vigorRoll: vigorRollResult(0) })
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
})

// ============================================================
// Sync enforcement tests
// ============================================================

// Known missing fields. Remove entries as they're added to QuintState.
const KNOWN_MISSING_FIELDS = new Set([
  "prone",
  "onHold",
  "holdUsed",
  "restrained",
  "grappledBy",
  "blinded",
  "injuries",
  "afflictionType",
  "afflictionTimer",
  "activeEffects",
  "defending"
])

// Effect Schema for the Quint AST subset needed to extract State field names
type QuintRow = {
  readonly kind: "row"
  readonly fields: ReadonlyArray<{ readonly fieldName: string }>
  readonly other: QuintRow | { readonly kind: "empty" }
}

const QuintRow: Schema.Schema<QuintRow, unknown> = Schema.suspend(() =>
  Schema.Struct({
    kind: Schema.Literal("row"),
    fields: Schema.Array(Schema.Struct({ fieldName: Schema.String })),
    other: Schema.Union(QuintRow, Schema.Struct({ kind: Schema.Literal("empty") }))
  })
) as Schema.Schema<QuintRow, unknown>

const QuintTypedef = Schema.Struct({
  kind: Schema.Literal("typedef"),
  name: Schema.String,
  type: Schema.Struct({ fields: QuintRow })
})

function parseQuintStateFields(): Array<string> {
  const tmpFile = path.join(os.tmpdir(), `quint_ast_${process.pid}.json`)
  try {
    execSync(`quint parse ${path.resolve(import.meta.dirname, "../../savage.qnt")} --out ${tmpFile}`)
    const raw = JSON.parse(fs.readFileSync(tmpFile, "utf8")) as {
      modules: Array<{ declarations: Array<Record<string, unknown>> }>
    }
    const rawDecl = raw.modules[0]?.declarations.find((d) => d.kind === "typedef" && d.name === "State")
    if (!rawDecl) throw new Error("State typedef not found in Quint AST")

    const stateType = Schema.decodeUnknownSync(QuintTypedef)(rawDecl)

    function getFields(row: QuintRow): Array<string> {
      const fields: Array<string> = row.fields.map((f) => f.fieldName)
      if (row.other.kind === "row") fields.push(...getFields(row.other))
      return fields
    }
    return getFields(stateType.type.fields)
  } finally {
    try {
      fs.unlinkSync(tmpFile)
    } catch {}
  }
}

describe("MBT driver sync", () => {
  it("no NEW Quint State fields missing from QuintState schema", () => {
    const quintFields = parseQuintStateFields()
    const schemaKeys = Object.keys(QuintState.shape)
    const missing = quintFields.filter((f: string) => !schemaKeys.includes(f) && !KNOWN_MISSING_FIELDS.has(f))
    expect(missing, `New Quint State fields not in QuintState or KNOWN_MISSING_FIELDS: ${missing.join(", ")}`).toEqual(
      []
    )
  })

  it("KNOWN_MISSING_FIELDS entries are actually missing (remove when fixed)", () => {
    const schemaKeys = new Set(Object.keys(QuintState.shape))
    const stale = [...KNOWN_MISSING_FIELDS].filter((f) => schemaKeys.has(f))
    expect(stale, `These fields are now in QuintState — remove from KNOWN_MISSING_FIELDS: ${stale.join(", ")}`).toEqual(
      []
    )
  })
})

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
