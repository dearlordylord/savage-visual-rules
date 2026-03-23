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

import {
  afflictionType,
  blindedPenalty,
  isDead,
  isShaken,
  isStunned,
  type SavageEvent,
  savageMachine,
  type SavageSnapshot
} from "./machine"
import {
  afflictionDuration,
  type AfflictionType,
  athleticsRollResult,
  blindedSeverity,
  damageMargin,
  escapeRollResult,
  grappleEscapeRollResult,
  grappleRollResult,
  healAmount,
  incapRollResult,
  injuryRoll,
  pinRollResult,
  soakSuccesses,
  spiritRollResult,
  vigorRollResult
} from "./types"

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
  hardy: z.boolean(),
  maxWounds: z.bigint(),
  ownTurn: z.boolean(),
  prone: z.boolean(),
  onHold: z.boolean(),
  holdUsed: z.boolean(),
  restrained: z.bigint(),
  grappledBy: z.string(),
  blinded: z.bigint(),
  injuries: z.array(z.string()),
  afflictionType: z.string(),
  afflictionTimer: z.bigint(),
  activeEffects: z.array(z.object({ etype: z.string(), timer: z.bigint() })),
  defending: z.boolean()
})

// ============================================================
// XState snapshot → flat Quint state
// ============================================================

function fatigueLevel(dead: boolean, snap: SavageSnapshot): number {
  if (dead) return 0
  if (
    snap.matches({ alive: { fatigueTrack: "exhausted" } }) ||
    snap.matches({ alive: { fatigueTrack: "incapByFatigue" } })
  )
    return 2
  if (snap.matches({ alive: { fatigueTrack: "fatigued" } })) return 1
  return 0
}

function restrainedLevel(dead: boolean, snap: SavageSnapshot): number {
  if (dead) return -1
  if (snap.matches({ alive: { restraintTrack: "pinned" } })) return 3
  if (snap.matches({ alive: { restraintTrack: "grabbed" } })) return 2
  if (snap.matches({ alive: { restraintTrack: "bound" } })) return 1
  if (snap.matches({ alive: { restraintTrack: "entangled" } })) return 0
  return -1
}

function snapshotToQuintState(snap: SavageSnapshot) {
  const dead = isDead(snap)
  return {
    shaken: !dead && isShaken(snap),
    stunned: !dead && isStunned(snap),
    distracted: BigInt(snap.context.distractedTimer),
    vulnerable: BigInt(snap.context.vulnerableTimer),
    wounds: BigInt(snap.context.wounds),
    incapacitated: !dead && snap.matches({ alive: { damageTrack: "incapacitated" } }),
    bleedingOut: !dead && snap.matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } }),
    dead,
    fatigue: BigInt(fatigueLevel(dead, snap)),
    incapByFatigue: !dead && snap.matches({ alive: { fatigueTrack: "incapByFatigue" } }),
    isWildCard: snap.context.isWildCard,
    hardy: snap.context.hardy,
    maxWounds: BigInt(snap.context.maxWounds),
    ownTurn: !dead && snap.matches({ alive: { turnPhase: "acting" } }),
    prone: !dead && snap.matches({ alive: { positionTrack: "prone" } }),
    onHold: !dead && snap.matches({ alive: { turnPhase: "holdingAction" } }),
    holdUsed: snap.context.holdUsed,
    restrained: BigInt(restrainedLevel(dead, snap)),
    grappledBy: snap.context.grappledBy,
    blinded: dead ? BigInt(0) : BigInt(-blindedPenalty(snap)),
    injuries: snap.context.injuries,
    afflictionType: dead ? "none" : (afflictionType(snap) ?? "none"),
    afflictionTimer: BigInt(snap.context.afflictionTimer),
    activeEffects: snap.context.activeEffects.map((e) => ({ etype: e.etype, timer: BigInt(e.timer) })),
    defending: !dead && snap.matches({ alive: { conditionTrack: { defense: "defending" } } })
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
  doTakeDamage: { margin: ITFBigInt, soak: ITFBigInt, incapRoll: ITFBigInt, injuryRoll: ITFBigInt },
  doStartOfTurn: { vigorRoll: ITFBigInt, spiritRoll: ITFBigInt },
  doEndOfTurn: { endVigorRoll: ITFBigInt },
  doUnshake: {},
  doApplyStunned: {},
  doApplyDistracted: {},
  doApplyVulnerable: {},
  doApplyFatigue: {},
  doRecoverFatigue: {},
  doHeal: { amount: ITFBigInt },
  doFinishingMove: {},
  doDropProne: {},
  doStandUp: {},
  doGoOnHold: {},
  doActFromHold: {},
  doInterrupt: { athleticsRoll: ITFBigInt },
  doDefend: {},
  doApplyEntangled: {},
  doApplyBound: {},
  doEscapeAttempt: { escapeRoll: ITFBigInt },
  doGrappleAttempt: { grappleRoll: ITFBigInt },
  doGrappleEscape: { grappleEscapeRoll: ITFBigInt },
  doPinAttempt: { pinRoll: ITFBigInt },
  doApplyBlinded: { blindSev: ITFBigInt },
  doApplyAffliction: { affType: z.string(), affDuration: ITFBigInt },
  doCureAffliction: {},
  doApplyEffect: { effectType: z.string(), effectDuration: ITFBigInt },
  doDismissEffect: { dismissType: z.string() },
  doBacklash: {},
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
    doTakeDamage: ({ incapRoll, injuryRoll: ir, margin, soak }) => {
      ensureActor().send({
        type: "TAKE_DAMAGE",
        margin: damageMargin(Number(margin)),
        soakSuccesses: soakSuccesses(Number(soak)),
        incapRoll: incapRollResult(Number(incapRoll)),
        injuryRoll: injuryRoll(Number(ir))
      })
    },
    doStartOfTurn: ({ spiritRoll: sr, vigorRoll: vr }) => {
      ensureActor().send({
        type: "START_OF_TURN",
        vigorRoll: vigorRollResult(Number(vr)),
        spiritRoll: spiritRollResult(Number(sr))
      })
    },
    doEndOfTurn: ({ endVigorRoll: vr }) => {
      ensureActor().send({ type: "END_OF_TURN", vigorRoll: vigorRollResult(Number(vr)) })
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
    doDropProne: () => {
      ensureActor().send({ type: "DROP_PRONE" })
    },
    doStandUp: () => {
      ensureActor().send({ type: "STAND_UP" })
    },
    doGoOnHold: () => {
      ensureActor().send({ type: "GO_ON_HOLD" })
    },
    doActFromHold: () => {
      ensureActor().send({ type: "ACT_FROM_HOLD" })
    },
    doInterrupt: ({ athleticsRoll: ar }) => {
      ensureActor().send({ type: "INTERRUPT", athleticsRoll: athleticsRollResult(Number(ar)) })
    },
    doDefend: () => {
      ensureActor().send({ type: "DEFEND" })
    },
    doApplyEntangled: () => {
      ensureActor().send({ type: "APPLY_ENTANGLED" })
    },
    doApplyBound: () => {
      ensureActor().send({ type: "APPLY_BOUND" })
    },
    doEscapeAttempt: ({ escapeRoll }) => {
      ensureActor().send({ type: "ESCAPE_ATTEMPT", rollResult: escapeRollResult(Number(escapeRoll)) })
    },
    doGrappleAttempt: ({ grappleRoll }) => {
      ensureActor().send({
        type: "GRAPPLE_ATTEMPT",
        rollResult: grappleRollResult(Number(grappleRoll)),
        opponent: "opp1"
      })
    },
    doGrappleEscape: ({ grappleEscapeRoll }) => {
      ensureActor().send({ type: "GRAPPLE_ESCAPE", rollResult: grappleEscapeRollResult(Number(grappleEscapeRoll)) })
    },
    doPinAttempt: ({ pinRoll }) => {
      ensureActor().send({ type: "PIN_ATTEMPT", rollResult: pinRollResult(Number(pinRoll)) })
    },
    doApplyBlinded: ({ blindSev }) => {
      ensureActor().send({ type: "APPLY_BLINDED", severity: blindedSeverity(Number(blindSev)) })
    },
    doApplyAffliction: ({ affDuration, affType }) => {
      ensureActor().send({
        type: "APPLY_AFFLICTION",
        afflictionType: affType as AfflictionType,
        duration: afflictionDuration(Number(affDuration))
      })
    },
    doCureAffliction: () => {
      ensureActor().send({ type: "CURE_AFFLICTION" })
    },
    doApplyEffect: ({ effectDuration, effectType }) => {
      ensureActor().send({ type: "APPLY_POWER_EFFECT", etype: effectType, duration: Number(effectDuration) })
    },
    doDismissEffect: ({ dismissType }) => {
      ensureActor().send({ type: "DISMISS_EFFECT", etype: dismissType })
    },
    doBacklash: () => {
      ensureActor().send({ type: "BACKLASH" })
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
const KNOWN_MISSING_FIELDS = new Set<string>([])

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
            const sv = spec[k]
            const iv = impl[k]
            if (Array.isArray(sv) && Array.isArray(iv)) {
              if (sv.length !== iv.length) return false
              for (let i = 0; i < sv.length; i++) {
                const a = sv[i]
                const b = iv[i]
                if (typeof a === "object" && typeof b === "object") {
                  for (const p of Object.keys(a))
                    if ((a as Record<string, unknown>)[p] !== (b as Record<string, unknown>)[p]) return false
                } else if (a !== b) return false
              }
            } else if (sv !== iv) return false
          }
          return true
        }
      )
    })
  }, 120_000)
})
