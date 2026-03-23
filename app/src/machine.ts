/* eslint-disable max-lines -- xstate machine definition is inherently dense */
import { and, assign, not, or, raise, setup, stateIn } from "xstate"

import {
  ACTING,
  asAffliction,
  asBlinded,
  asDamage,
  asDismissEffect,
  asEndOfTurn,
  asEscape,
  asGrapple,
  asGrappleEscape,
  asHeal,
  asInterrupt,
  asPin,
  asPowerEffect,
  asRecovery,
  BOUND_STATE,
  computeDamage,
  DAMAGE_ACTIVE,
  DEFENDING_STATE,
  ENTANGLED_STATE,
  FATIGUE_INCAP,
  GRABBED_STATE,
  HOLDING_ACTION,
  IDLE,
  PARALYTIC_STATE,
  PINNED_STATE,
  resolveInjury,
  SHAKEN_STATE,
  SLEEP_STATE,
  STUNNED_STATE,
  tickTimer
} from "./machine-helpers"
import type { InjuryType } from "./machine-queries"
import type {
  AfflictionDuration,
  AfflictionType,
  AthleticsRollResult,
  BlindedSeverity,
  ConditionTimer,
  DamageMargin,
  EscapeRollResult,
  GrappleEscapeRollResult,
  GrappleRollResult,
  HealAmount,
  IncapRollResult,
  InjuryRoll,
  MaxWounds,
  PinRollResult,
  SoakSuccesses,
  SpiritRollResult,
  VigorRollResult,
  Wounds
} from "./types"
import { conditionTimer, maxWounds, wounds } from "./types"

// ============================================================
// Types
// ============================================================

export interface SavageContext {
  wounds: Wounds
  distractedTimer: ConditionTimer
  vulnerableTimer: ConditionTimer
  isWildCard: boolean
  hardy: boolean
  maxWounds: MaxWounds
  ownTurn: boolean // mirrors turnPhase "acting" — needed because assign actions can't call stateIn()
  onHold: boolean // persists across idle→holdingAction round boundaries; guards on idle read this to re-enter holdingAction
  holdUsed: boolean
  interruptedSuccessfully: boolean
  injuries: Array<InjuryType>
  grappledBy: string
  afflictionTimer: number
  activeEffects: Array<{ etype: string; timer: number }> // empty = none; each entry has timer > 0
}

export type SavageEvent =
  | {
      type: "TAKE_DAMAGE"
      margin: DamageMargin
      soakSuccesses: SoakSuccesses
      incapRoll: IncapRollResult
      injuryRoll?: InjuryRoll
    }
  | { type: "START_OF_TURN"; vigorRoll: VigorRollResult; spiritRoll: SpiritRollResult }
  | { type: "END_OF_TURN"; vigorRoll: VigorRollResult }
  | { type: "SPEND_BENNY" }
  | { type: "APPLY_STUNNED" }
  | { type: "APPLY_DISTRACTED" }
  | { type: "APPLY_VULNERABLE" }
  | { type: "APPLY_FATIGUE" }
  | { type: "RECOVER_FATIGUE" }
  | { type: "HEAL"; amount: HealAmount }
  | { type: "FINISHING_MOVE" }
  | { type: "DROP_PRONE" }
  | { type: "STAND_UP" }
  | { type: "GO_ON_HOLD" }
  | { type: "ACT_FROM_HOLD" }
  | { type: "INTERRUPT"; athleticsRoll: AthleticsRollResult }
  | { type: "APPLY_ENTANGLED" }
  | { type: "APPLY_BOUND" }
  | { type: "ESCAPE_ATTEMPT"; rollResult: EscapeRollResult }
  | { type: "GRAPPLE_ATTEMPT"; rollResult: GrappleRollResult; opponent: string }
  | { type: "GRAPPLE_ESCAPE"; rollResult: GrappleEscapeRollResult }
  | { type: "PIN_ATTEMPT"; rollResult: PinRollResult }
  | { type: "APPLY_BLINDED"; severity: BlindedSeverity }
  | { type: "APPLY_AFFLICTION"; afflictionType: AfflictionType; duration: AfflictionDuration }
  | { type: "CURE_AFFLICTION" }
  | { type: "_LETHAL_TICK" }
  | { type: "DEFEND" }
  | { type: "APPLY_POWER_EFFECT"; etype: string; duration: number }
  | { type: "DISMISS_EFFECT"; etype: string }
  | { type: "BACKLASH" }
  | { type: "SET_HARDY"; hardy: boolean }

// ============================================================
// Re-exports from machine-queries and machine-helpers
// ============================================================

export { resolveInjury } from "./machine-helpers"
export type { InjuryType } from "./machine-queries"
export {
  activeEffectsList,
  afflictionType,
  blindedPenalty,
  canAct,
  canMove,
  type FearResult,
  hasEffect,
  hasInjury,
  injuryPenalty,
  isAfflicted,
  isBleedingOut,
  isBlinded,
  isBound,
  isConscious,
  isDead,
  isDefending,
  isDistracted,
  isEntangled,
  isFullyBlinded,
  isGrabbed,
  isGrappled,
  isIncapStable,
  isOnHold,
  isPinned,
  isProne,
  isRestrained,
  isShaken,
  isStunned,
  isVulnerable,
  resolveFear,
  type SavageSnapshot,
  totalPenalty
} from "./machine-queries"

// ============================================================
// Machine
// ============================================================

export const savageMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup() requires this pattern
    context: {} as SavageContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup() requires this pattern
    events: {} as SavageEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup() requires this pattern
    input: {} as { isWildCard?: boolean; hardy?: boolean }
  },
  guards: {
    // --- Damage guards (from unshaken / wounded — not currently shaken) ---
    extraDies: ({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, false)
      return !context.isWildCard && actualWounds > 0
    },
    exceedsMax: ({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, false)
      return context.isWildCard && context.wounds + actualWounds > context.maxWounds
    },
    allSoaked: ({ event }) => {
      const { allSoaked } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, false)
      return allSoaked
    },
    woundsNotExceedMax: ({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, false)
      return actualWounds > 0 && context.isWildCard && context.wounds + actualWounds <= context.maxWounds
    },

    // --- Damage guards (from shaken) ---
    extraDiesShaken: ({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, true, context.hardy)
      return !context.isWildCard && actualWounds > 0
    },
    exceedsMaxShaken: ({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, true, context.hardy)
      return context.isWildCard && context.wounds + actualWounds > context.maxWounds
    },
    allSoakedShaken: ({ context, event }) => {
      const { allSoaked } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, true, context.hardy)
      return allSoaked
    },
    woundsNotExceedMaxShaken: ({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, true, context.hardy)
      return actualWounds > 0 && context.isWildCard && context.wounds + actualWounds <= context.maxWounds
    },

    // --- Incap roll guards ---
    incapCritFail: ({ event }) => asDamage(event).incapRoll < 0,
    incapFail: ({ event }) => asDamage(event).incapRoll === 0,
    incapSuccess: ({ event }) => asDamage(event).incapRoll >= 1,

    // --- Margin guard ---
    marginNonNeg: ({ event }) => asDamage(event).margin >= 0,

    // --- Recovery guards (Vigor: stunned + bleeding out, Spirit: shaken) ---
    vigorSuccess: ({ event }) => asRecovery(event).vigorRoll >= 1,
    vigorRaise: ({ event }) => asRecovery(event).vigorRoll >= 2,
    vigorSuccessNoRaise: ({ event }) => asRecovery(event).vigorRoll === 1,
    vigorFail: ({ event }) => asRecovery(event).vigorRoll === 0,
    spiritSuccess: ({ event }) => asRecovery(event).spiritRoll >= 1,

    // --- Context guards ---
    hasWounds: ({ context }) => context.wounds > 0,
    healToZero: ({ context, event }) => Math.max(0, context.wounds - asHeal(event).amount) === 0,

    // --- Timer guards (for always transitions) ---
    distractedTimerExpired: ({ context }) => context.distractedTimer === -1,
    vulnerableTimerExpired: ({ context }) => context.vulnerableTimer === -1,

    // --- Hold guards ---
    isOnHold: ({ context }) => context.onHold,
    holdNotUsed: ({ context }) => !context.holdUsed,

    // --- Interrupt guards ---
    interruptSuccess: ({ event }) => asInterrupt(event).athleticsRoll >= 1,

    // --- Escape guards ---
    escapeSuccess: ({ event }) => asEscape(event).rollResult >= 1,
    escapeRaise: ({ event }) => asEscape(event).rollResult >= 2,

    // --- Grapple guards ---
    grappleSuccess: ({ event }) => asGrapple(event).rollResult >= 1,
    grappleRaise: ({ event }) => asGrapple(event).rollResult >= 2,
    grappleEscapeSuccess: ({ event }) => asGrappleEscape(event).rollResult >= 1,
    grappleEscapeRaise: ({ event }) => asGrappleEscape(event).rollResult >= 2,
    grappleEscapeSuccessNoRaise: ({ event }) => asGrappleEscape(event).rollResult === 1,
    pinSuccess: ({ event }) => asPin(event).rollResult >= 1,

    // --- Blinded guards ---
    blindedSeverityFull: ({ event }) => asBlinded(event).severity === 4,

    // --- Affliction guards ---
    afflictionParalytic: ({ event }) => asAffliction(event).afflictionType === "paralytic",
    afflictionWeak: ({ event }) => asAffliction(event).afflictionType === "weak",
    afflictionLethal: ({ event }) => asAffliction(event).afflictionType === "lethal",
    afflictionSleep: ({ event }) => asAffliction(event).afflictionType === "sleep",
    afflictionTimerExpired: ({ context }) => context.afflictionTimer === -1,
    lethalExtraDies: ({ context }) => !context.isWildCard,
    lethalExceedsMax: ({ context }) => context.isWildCard && context.wounds + 1 > context.maxWounds,

    // --- End-of-turn vigor guards (for blinded recovery) ---
    endVigorRaise: ({ event }) => asEndOfTurn(event).vigorRoll >= 2,
    endVigorSuccessNoRaise: ({ event }) => asEndOfTurn(event).vigorRoll === 1,
    endVigorSuccess: ({ event }) => asEndOfTurn(event).vigorRoll >= 1,

    // --- Power effect guards ---
    hasActiveEffects: ({ context }) => context.activeEffects.length > 0,
    durationPositive: ({ event }) => asPowerEffect(event).duration > 0
  },
  actions: {
    addWounds: assign(({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, false)
      return { wounds: wounds(context.wounds + actualWounds) }
    }),
    addWoundsShaken: assign(({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, true, context.hardy)
      return { wounds: wounds(context.wounds + actualWounds) }
    }),
    setWoundsToMax: assign(({ context }) => ({
      wounds: wounds(context.maxWounds)
    })),
    healWounds: assign(({ context, event }) => ({
      wounds: wounds(context.wounds - asHeal(event).amount)
    })),
    setDistractedTimer: assign(({ context }) => ({
      distractedTimer: conditionTimer(Math.max(context.distractedTimer, context.ownTurn ? 1 : 0))
    })),
    setVulnerableTimer: assign(({ context }) => ({
      vulnerableTimer: conditionTimer(Math.max(context.vulnerableTimer, context.ownTurn ? 1 : 0))
    })),
    setVulnerableTimerPersistent: assign({
      vulnerableTimer: conditionTimer(99)
    }),
    clearVulnerableTimer: assign({
      vulnerableTimer: conditionTimer(-1)
    }),
    setVulnerableTimerRecoverySuccess: assign(({ context }) => ({
      vulnerableTimer: conditionTimer(Math.max(context.vulnerableTimer, 1))
    })),
    setVulnerableTimerRecoveryRaise: assign(({ context }) => ({
      vulnerableTimer: conditionTimer(Math.max(context.vulnerableTimer, 0))
    })),
    tickTimers: assign(({ context }) => ({
      distractedTimer: tickTimer(context.distractedTimer),
      vulnerableTimer: tickTimer(context.vulnerableTimer)
    })),
    tickDistractedOnly: assign(({ context }) => ({
      distractedTimer: tickTimer(context.distractedTimer)
    })),
    tickVulnerableOnly: assign(({ context }) => ({
      vulnerableTimer: tickTimer(context.vulnerableTimer)
    })),
    setOwnTurnTrue: assign({ ownTurn: true }),
    clearHoldUsed: assign({ holdUsed: false }),
    setOwnTurnFalse: assign({ ownTurn: false }),
    setOnHold: assign({ onHold: true, holdUsed: true, ownTurn: false }),
    clearOnHold: assign({ onHold: false }),
    setInterruptSuccess: assign({ interruptedSuccessfully: true }),
    setInterruptFail: assign({ interruptedSuccessfully: false }),
    appendInjury: assign(({ context, event }) => {
      const roll = asDamage(event).injuryRoll
      if (roll === undefined) return {}
      return { injuries: [...context.injuries, resolveInjury(roll)] }
    }),
    clearDistractedTimer: assign({ distractedTimer: conditionTimer(-1) }),
    setAfflictionTimer: assign(({ event }) => ({
      afflictionTimer: asAffliction(event).duration
    })),
    clearAfflictionTimer: assign({ afflictionTimer: -1 }),
    tickAfflictionTimer: assign(({ context }) => {
      if (context.afflictionTimer > 0) return { afflictionTimer: context.afflictionTimer - 1 }
      if (context.afflictionTimer === 0) return { afflictionTimer: -1 }
      return {}
    }),
    applyPowerEffect: assign(({ context, event }) => {
      const e = asPowerEffect(event)
      return { activeEffects: [...context.activeEffects, { etype: e.etype, timer: e.duration }] }
    }),
    setGrappledBy: assign(({ event }) => ({
      grappledBy: asGrapple(event).opponent
    })),
    clearGrappledBy: assign({ grappledBy: "" }),
    dismissEffect: assign(({ context, event }) => {
      const e = asDismissEffect(event)
      let found = false
      return {
        activeEffects: context.activeEffects.filter((eff) => {
          if (!found && eff.etype === e.etype) {
            found = true
            return false
          }
          return true
        })
      }
    }),
    backlashClearEffects: assign({ activeEffects: [] }),
    tickEffectTimers: assign(({ context }) => ({
      activeEffects: context.activeEffects.map((e) => ({ ...e, timer: e.timer - 1 })).filter((e) => e.timer > 0)
    })),
    raiseFatigue: raise({ type: "APPLY_FATIGUE" }),
    raiseLethalTick: raise({ type: "_LETHAL_TICK" }),
    raiseDropProne: raise({ type: "DROP_PRONE" }),
    lethalAddWound: assign(({ context }) => ({
      wounds: wounds(context.wounds + 1)
    }))
  }
}).createMachine({
  id: "savage",
  initial: "alive",
  context: ({ input }) => ({
    wounds: wounds(0),
    distractedTimer: conditionTimer(-1),
    vulnerableTimer: conditionTimer(-1),
    isWildCard: input.isWildCard ?? true,
    hardy: input.hardy ?? false,
    maxWounds: maxWounds((input.isWildCard ?? true) ? 3 : 1),
    ownTurn: false,
    onHold: false,
    holdUsed: false,
    interruptedSuccessfully: false,
    injuries: [],
    grappledBy: "",
    afflictionTimer: -1,
    activeEffects: []
  }),
  on: {
    SET_HARDY: { actions: [assign(({ event }) => ({ hardy: (event as { hardy: boolean }).hardy }))] }
  },
  states: {
    alive: {
      type: "parallel",
      on: {
        APPLY_POWER_EFFECT: { guard: "durationPositive", actions: ["applyPowerEffect"] },
        DISMISS_EFFECT: { actions: ["dismissEffect"] },
        BACKLASH: { actions: ["backlashClearEffects", "raiseFatigue"] }
      },
      states: {
        // ========================================
        // DAMAGE TRACK
        // ========================================
        damageTrack: {
          initial: "active",
          states: {
            active: {
              initial: "unshaken",
              states: {
                // --- UNSHAKEN: not shaken, wounds == 0 ---
                unshaken: {
                  on: {
                    TAKE_DAMAGE: [
                      { guard: "extraDies", target: "#savage.dead", actions: ["setWoundsToMax"] },
                      {
                        guard: and(["exceedsMax", "incapCritFail"]),
                        target: "#savage.dead",
                        actions: ["setWoundsToMax"]
                      },
                      {
                        guard: and(["exceedsMax", "incapFail"]),
                        target: "#savage.alive.damageTrack.incapacitated.bleedingOut",
                        actions: ["setWoundsToMax"]
                      },
                      {
                        guard: and(["exceedsMax", "incapSuccess"]),
                        target: "#savage.alive.damageTrack.incapacitated.stable",
                        actions: ["setWoundsToMax", "appendInjury"]
                      },
                      { guard: "allSoaked" }, // All soaked from unshaken — no effect
                      { guard: "woundsNotExceedMax", target: "shaken", actions: ["addWounds"] },
                      { guard: "marginNonNeg", target: "shaken" } // Just shaken, no wounds
                    ],
                    _LETHAL_TICK: [
                      { guard: "lethalExtraDies", target: "#savage.dead", actions: ["setWoundsToMax"] },
                      {
                        guard: "lethalExceedsMax",
                        target: "#savage.alive.damageTrack.incapacitated.bleedingOut",
                        actions: ["setWoundsToMax"]
                      },
                      { target: "shaken", actions: ["lethalAddWound"] }
                    ]
                  }
                },

                // --- SHAKEN: currently shaken, any wound count ---
                shaken: {
                  on: {
                    TAKE_DAMAGE: [
                      { guard: "extraDiesShaken", target: "#savage.dead", actions: ["setWoundsToMax"] },
                      {
                        guard: and(["exceedsMaxShaken", "incapCritFail"]),
                        target: "#savage.dead",
                        actions: ["setWoundsToMax"]
                      },
                      {
                        guard: and(["exceedsMaxShaken", "incapFail"]),
                        target: "#savage.alive.damageTrack.incapacitated.bleedingOut",
                        actions: ["setWoundsToMax"]
                      },
                      {
                        guard: and(["exceedsMaxShaken", "incapSuccess"]),
                        target: "#savage.alive.damageTrack.incapacitated.stable",
                        actions: ["setWoundsToMax", "appendInjury"]
                      },
                      { guard: and(["allSoakedShaken", "hasWounds"]), target: "wounded" }, // Soak clears shaken, wounds remain
                      { guard: "allSoakedShaken", target: "unshaken" }, // Soak clears shaken, no wounds
                      { guard: "woundsNotExceedMaxShaken", actions: ["addWoundsShaken"] } // Stay shaken, add wounds
                    ],
                    START_OF_TURN: [
                      {
                        guard: and([
                          stateIn(IDLE),
                          not(stateIn(FATIGUE_INCAP)),
                          not(stateIn(SLEEP_STATE)),
                          "spiritSuccess",
                          "hasWounds"
                        ]),
                        target: "wounded"
                      },
                      {
                        guard: and([
                          stateIn(IDLE),
                          not(stateIn(FATIGUE_INCAP)),
                          not(stateIn(SLEEP_STATE)),
                          "spiritSuccess"
                        ]),
                        target: "unshaken"
                      }
                    ],
                    SPEND_BENNY: [{ guard: "hasWounds", target: "wounded" }, { target: "unshaken" }],
                    HEAL: [
                      { guard: "hasWounds", actions: ["healWounds"] } // Stay shaken, reduce wounds
                    ],
                    _LETHAL_TICK: [
                      { guard: "lethalExtraDies", target: "#savage.dead", actions: ["setWoundsToMax"] },
                      {
                        guard: "lethalExceedsMax",
                        target: "#savage.alive.damageTrack.incapacitated.bleedingOut",
                        actions: ["setWoundsToMax"]
                      },
                      { actions: ["lethalAddWound"] }
                    ]
                  }
                },

                // --- WOUNDED: not shaken, wounds > 0 ---
                wounded: {
                  on: {
                    TAKE_DAMAGE: [
                      { guard: "extraDies", target: "#savage.dead", actions: ["setWoundsToMax"] },
                      {
                        guard: and(["exceedsMax", "incapCritFail"]),
                        target: "#savage.dead",
                        actions: ["setWoundsToMax"]
                      },
                      {
                        guard: and(["exceedsMax", "incapFail"]),
                        target: "#savage.alive.damageTrack.incapacitated.bleedingOut",
                        actions: ["setWoundsToMax"]
                      },
                      {
                        guard: and(["exceedsMax", "incapSuccess"]),
                        target: "#savage.alive.damageTrack.incapacitated.stable",
                        actions: ["setWoundsToMax", "appendInjury"]
                      },
                      { guard: "allSoaked" }, // All soaked — stay wounded (no shaken to clear)
                      { guard: "woundsNotExceedMax", target: "shaken", actions: ["addWounds"] },
                      { guard: "marginNonNeg", target: "shaken" } // No new wounds, just shaken
                    ],
                    HEAL: [
                      { guard: "healToZero", target: "unshaken", actions: ["healWounds"] },
                      { actions: ["healWounds"] } // Partial heal, stay wounded
                    ],
                    _LETHAL_TICK: [
                      { guard: "lethalExtraDies", target: "#savage.dead", actions: ["setWoundsToMax"] },
                      {
                        guard: "lethalExceedsMax",
                        target: "#savage.alive.damageTrack.incapacitated.bleedingOut",
                        actions: ["setWoundsToMax"]
                      },
                      { target: "shaken", actions: ["lethalAddWound"] }
                    ]
                  }
                }
              }
            },

            incapacitated: {
              initial: "stable",
              states: {
                stable: {},
                bleedingOut: {
                  on: {
                    START_OF_TURN: [
                      { guard: and([stateIn(IDLE), "vigorFail"]), target: "#savage.dead" },
                      { guard: and([stateIn(IDLE), "vigorRaise"]), target: "stable" }
                      // roll == 1: survive, stay bleedingOut
                    ]
                  }
                }
              },
              on: {
                HEAL: [
                  { guard: "healToZero", target: "#savage.alive.damageTrack.active.unshaken", actions: ["healWounds"] },
                  { guard: "hasWounds", target: "#savage.alive.damageTrack.active.wounded", actions: ["healWounds"] }
                ],
                FINISHING_MOVE: "#savage.dead"
              }
            }
          }
        },

        // ========================================
        // CONDITION TRACK (parallel sub-regions)
        // ========================================
        conditionTrack: {
          type: "parallel",
          states: {
            stun: {
              initial: "normal",
              states: {
                normal: {
                  on: {
                    APPLY_STUNNED: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      target: "stunned",
                      actions: ["raiseDropProne"]
                    }
                  }
                },
                stunned: {
                  on: {
                    APPLY_STUNNED: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      actions: ["raiseDropProne"]
                    },
                    START_OF_TURN: [
                      {
                        guard: and([
                          stateIn(IDLE),
                          stateIn(DAMAGE_ACTIVE),
                          not(stateIn(FATIGUE_INCAP)),
                          not(stateIn(PARALYTIC_STATE)),
                          not(stateIn(SLEEP_STATE)),
                          "vigorRaise"
                        ]),
                        target: "normal",
                        actions: ["setVulnerableTimerRecoveryRaise"]
                      },
                      {
                        guard: and([
                          stateIn(IDLE),
                          stateIn(DAMAGE_ACTIVE),
                          not(stateIn(FATIGUE_INCAP)),
                          not(stateIn(PARALYTIC_STATE)),
                          not(stateIn(SLEEP_STATE)),
                          "vigorSuccessNoRaise"
                        ]),
                        target: "normal",
                        actions: ["setVulnerableTimerRecoverySuccess"]
                      }
                    ]
                  },
                  always: {
                    guard: not(stateIn(DAMAGE_ACTIVE)),
                    target: "normal"
                  }
                }
              }
            },

            distraction: {
              initial: "clear",
              states: {
                clear: {
                  on: {
                    APPLY_DISTRACTED: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      target: "distracted",
                      actions: ["setDistractedTimer"]
                    },
                    APPLY_STUNNED: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      target: "distracted",
                      actions: ["setDistractedTimer"]
                    },
                    APPLY_BOUND: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      target: "distracted",
                      actions: ["setDistractedTimer"]
                    },
                    GRAPPLE_ATTEMPT: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleRaise"]),
                      target: "distracted",
                      actions: ["setDistractedTimer"]
                    }
                  }
                },
                distracted: {
                  on: {
                    APPLY_DISTRACTED: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      actions: ["setDistractedTimer"]
                    },
                    APPLY_STUNNED: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      actions: ["setDistractedTimer"]
                    },
                    APPLY_BOUND: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      actions: ["setDistractedTimer"]
                    },
                    GRAPPLE_ATTEMPT: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleRaise"]),
                      actions: ["setDistractedTimer"]
                    }
                  },
                  always: {
                    guard: and([
                      "distractedTimerExpired",
                      not(stateIn(BOUND_STATE)),
                      not(stateIn(PINNED_STATE)),
                      not(stateIn(STUNNED_STATE))
                    ]),
                    target: "clear"
                  }
                }
              }
            },

            vulnerability: {
              initial: "clear",
              states: {
                clear: {
                  on: {
                    APPLY_VULNERABLE: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      target: "vulnerable",
                      actions: ["setVulnerableTimer"]
                    },
                    APPLY_ENTANGLED: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      target: "vulnerable",
                      actions: ["setVulnerableTimerPersistent"]
                    },
                    APPLY_BOUND: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      target: "vulnerable",
                      actions: ["setVulnerableTimer"]
                    },
                    GRAPPLE_ATTEMPT: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleSuccess"]),
                      target: "vulnerable",
                      actions: ["setVulnerableTimer"]
                    },
                    // Stunned recovery also triggers vulnerability
                    START_OF_TURN: [
                      {
                        guard: and([
                          stateIn(IDLE),
                          stateIn(DAMAGE_ACTIVE),
                          not(stateIn(FATIGUE_INCAP)),
                          not(stateIn(PARALYTIC_STATE)),
                          not(stateIn(SLEEP_STATE)),
                          stateIn(STUNNED_STATE),
                          "vigorSuccess"
                        ]),
                        target: "vulnerable"
                      }
                    ]
                  }
                },
                vulnerable: {
                  on: {
                    APPLY_VULNERABLE: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      actions: ["setVulnerableTimer"]
                    },
                    APPLY_ENTANGLED: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      actions: ["setVulnerableTimerPersistent"]
                    },
                    APPLY_BOUND: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                      actions: ["setVulnerableTimer"]
                    },
                    GRAPPLE_ATTEMPT: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleSuccess"]),
                      actions: ["setVulnerableTimer"]
                    }
                  },
                  always: {
                    guard: and([
                      "vulnerableTimerExpired",
                      not(stateIn(ENTANGLED_STATE)),
                      not(stateIn(BOUND_STATE)),
                      not(stateIn(GRABBED_STATE)),
                      not(stateIn(PINNED_STATE))
                    ]),
                    target: "clear"
                  }
                }
              }
            },

            vision: {
              initial: "clear",
              states: {
                clear: {
                  on: {
                    APPLY_BLINDED: [
                      {
                        guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "blindedSeverityFull"]),
                        target: "blinded"
                      },
                      {
                        guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                        target: "impaired"
                      }
                    ]
                  }
                },
                impaired: {
                  on: {
                    APPLY_BLINDED: {
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "blindedSeverityFull"]),
                      target: "blinded"
                    },
                    END_OF_TURN: [
                      {
                        guard: and([
                          not(stateIn(HOLDING_ACTION)),
                          stateIn(DAMAGE_ACTIVE),
                          not(stateIn(FATIGUE_INCAP)),
                          not(stateIn(SLEEP_STATE)),
                          "endVigorSuccess"
                        ]),
                        target: "clear"
                      }
                    ]
                  },
                  always: [
                    { guard: not(stateIn(DAMAGE_ACTIVE)), target: "clear" },
                    { guard: stateIn(FATIGUE_INCAP), target: "clear" }
                  ]
                },
                blinded: {
                  on: {
                    END_OF_TURN: [
                      {
                        guard: and([
                          not(stateIn(HOLDING_ACTION)),
                          stateIn(DAMAGE_ACTIVE),
                          not(stateIn(FATIGUE_INCAP)),
                          not(stateIn(SLEEP_STATE)),
                          "endVigorRaise"
                        ]),
                        target: "clear"
                      },
                      {
                        guard: and([
                          not(stateIn(HOLDING_ACTION)),
                          stateIn(DAMAGE_ACTIVE),
                          not(stateIn(FATIGUE_INCAP)),
                          not(stateIn(SLEEP_STATE)),
                          "endVigorSuccessNoRaise"
                        ]),
                        target: "impaired"
                      }
                    ]
                  },
                  always: [
                    { guard: not(stateIn(DAMAGE_ACTIVE)), target: "clear" },
                    { guard: stateIn(FATIGUE_INCAP), target: "clear" }
                  ]
                }
              }
            },

            defense: {
              initial: "notDefending",
              states: {
                notDefending: {
                  on: {
                    DEFEND: {
                      guard: and([
                        stateIn(DAMAGE_ACTIVE),
                        not(stateIn(FATIGUE_INCAP)),
                        not(stateIn(STUNNED_STATE)),
                        not(stateIn(SHAKEN_STATE)),
                        not(stateIn(SLEEP_STATE)),
                        stateIn(ACTING)
                      ]),
                      target: "defending"
                    }
                  }
                },
                defending: {
                  on: {
                    START_OF_TURN: {
                      guard: stateIn(IDLE),
                      target: "notDefending"
                    }
                  },
                  always: [
                    { guard: not(stateIn(DAMAGE_ACTIVE)), target: "notDefending" },
                    { guard: stateIn(STUNNED_STATE), target: "notDefending" },
                    { guard: stateIn(FATIGUE_INCAP), target: "notDefending" }
                  ]
                }
              }
            }
          }
        },

        // ========================================
        // FATIGUE TRACK
        // ========================================
        fatigueTrack: {
          initial: "fresh",
          states: {
            fresh: {
              on: { APPLY_FATIGUE: "fatigued" }
            },
            fatigued: {
              on: {
                APPLY_FATIGUE: "exhausted",
                RECOVER_FATIGUE: "fresh"
              }
            },
            exhausted: {
              on: {
                APPLY_FATIGUE: "incapByFatigue",
                RECOVER_FATIGUE: "fatigued"
              }
            },
            incapByFatigue: {
              on: { RECOVER_FATIGUE: "exhausted" }
            }
          }
        },

        // ========================================
        // TURN PHASE
        // ========================================
        turnPhase: {
          initial: "idle",
          states: {
            idle: {
              on: {
                START_OF_TURN: [
                  {
                    guard: "isOnHold",
                    target: "holdingAction",
                    actions: ["setOwnTurnFalse"]
                  },
                  {
                    target: "acting",
                    actions: ["setOwnTurnTrue", "clearHoldUsed"]
                  }
                ]
              }
            },
            acting: {
              on: {
                END_OF_TURN: [
                  // Bound/pinned: freeze both distracted and vulnerable timers
                  {
                    guard: or([stateIn(BOUND_STATE), stateIn(PINNED_STATE)]),
                    target: "idle",
                    actions: ["tickAfflictionTimer", "tickEffectTimers", "setOwnTurnFalse"]
                  },
                  // Stunned: freeze distracted, tick vulnerable
                  {
                    guard: stateIn(STUNNED_STATE),
                    target: "idle",
                    actions: ["tickVulnerableOnly", "tickAfflictionTimer", "tickEffectTimers", "setOwnTurnFalse"]
                  },
                  // Entangled/grabbed: tick distracted, freeze vulnerable
                  {
                    guard: or([stateIn(ENTANGLED_STATE), stateIn(GRABBED_STATE)]),
                    target: "idle",
                    actions: ["tickDistractedOnly", "tickAfflictionTimer", "tickEffectTimers", "setOwnTurnFalse"]
                  },
                  // Free: tick both timers
                  {
                    target: "idle",
                    actions: ["tickTimers", "tickAfflictionTimer", "tickEffectTimers", "setOwnTurnFalse"]
                  }
                ],
                GO_ON_HOLD: {
                  guard: and([
                    stateIn(DAMAGE_ACTIVE),
                    not(stateIn(FATIGUE_INCAP)),
                    not(stateIn(SHAKEN_STATE)),
                    not(stateIn(STUNNED_STATE)),
                    not(stateIn(DEFENDING_STATE)),
                    "holdNotUsed"
                  ]),
                  target: "holdingAction",
                  actions: ["setOnHold"]
                }
              }
            },
            holdingAction: {
              on: {
                ACT_FROM_HOLD: {
                  target: "acting",
                  actions: ["clearOnHold", "setOwnTurnTrue"]
                },
                INTERRUPT: [
                  {
                    guard: "interruptSuccess",
                    target: "acting",
                    actions: ["clearOnHold", "setOwnTurnTrue", "setInterruptSuccess"]
                  },
                  {
                    target: "acting",
                    actions: ["clearOnHold", "setOwnTurnTrue", "setInterruptFail"]
                  }
                ],
                END_OF_TURN: { target: "idle", actions: ["setOwnTurnFalse"] }
              },
              always: [
                {
                  guard: not(stateIn(DAMAGE_ACTIVE)),
                  target: "idle",
                  actions: ["clearOnHold", "setOwnTurnFalse"]
                },
                {
                  guard: stateIn(STUNNED_STATE),
                  target: "idle",
                  actions: ["clearOnHold", "setOwnTurnFalse"]
                },
                {
                  guard: stateIn(SHAKEN_STATE),
                  target: "idle",
                  actions: ["clearOnHold", "setOwnTurnFalse"]
                },
                {
                  guard: stateIn(FATIGUE_INCAP),
                  target: "idle",
                  actions: ["clearOnHold", "setOwnTurnFalse"]
                }
              ]
            }
          }
        },

        // ========================================
        // POSITION TRACK (prone/standing)
        // ========================================
        positionTrack: {
          initial: "standing",
          states: {
            standing: {
              on: {
                DROP_PRONE: {
                  guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                  target: "prone"
                }
              }
            },
            prone: {
              on: {
                STAND_UP: {
                  guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                  target: "standing"
                }
              },
              always: {
                guard: not(and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))])),
                target: "standing"
              }
            }
          }
        },

        // ========================================
        // RESTRAINT TRACK (entangled/bound)
        // ========================================
        restraintTrack: {
          initial: "free",
          states: {
            free: {
              on: {
                APPLY_ENTANGLED: {
                  guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                  target: "entangled",
                  actions: ["setVulnerableTimerPersistent"]
                },
                APPLY_BOUND: {
                  guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                  target: "bound"
                },
                GRAPPLE_ATTEMPT: [
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleRaise"]),
                    target: "pinned",
                    actions: ["setGrappledBy"]
                  },
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleSuccess"]),
                    target: "grabbed",
                    actions: ["setGrappledBy"]
                  }
                ]
              }
            },
            entangled: {
              on: {
                APPLY_BOUND: {
                  guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                  target: "bound"
                },
                ESCAPE_ATTEMPT: {
                  guard: "escapeSuccess",
                  target: "free",
                  actions: ["clearVulnerableTimer"]
                },
                GRAPPLE_ATTEMPT: [
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleRaise"]),
                    target: "pinned",
                    actions: ["setGrappledBy"]
                  },
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleSuccess"]),
                    target: "grabbed",
                    actions: ["setGrappledBy"]
                  }
                ]
              },
              always: [
                { guard: not(stateIn(DAMAGE_ACTIVE)), target: "free" },
                { guard: stateIn(FATIGUE_INCAP), target: "free" }
              ]
            },
            bound: {
              on: {
                ESCAPE_ATTEMPT: [
                  { guard: "escapeRaise", target: "free", actions: ["clearDistractedTimer", "clearVulnerableTimer"] },
                  { guard: "escapeSuccess", target: "entangled" }
                ],
                GRAPPLE_ATTEMPT: [
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleRaise"]),
                    target: "pinned",
                    actions: ["setGrappledBy"]
                  },
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleSuccess"]),
                    target: "grabbed",
                    actions: ["setGrappledBy"]
                  }
                ]
              },
              always: [
                { guard: not(stateIn(DAMAGE_ACTIVE)), target: "free" },
                { guard: stateIn(FATIGUE_INCAP), target: "free" }
              ]
            },
            grabbed: {
              on: {
                PIN_ATTEMPT: {
                  guard: "pinSuccess",
                  target: "pinned"
                },
                GRAPPLE_ESCAPE: {
                  guard: "grappleEscapeSuccess",
                  target: "free",
                  actions: ["clearGrappledBy"]
                },
                APPLY_BOUND: {
                  target: "bound",
                  actions: ["clearGrappledBy"]
                }
              },
              always: [
                { guard: not(stateIn(DAMAGE_ACTIVE)), target: "free", actions: ["clearGrappledBy"] },
                { guard: stateIn(FATIGUE_INCAP), target: "free", actions: ["clearGrappledBy"] }
              ]
            },
            pinned: {
              on: {
                GRAPPLE_ESCAPE: [
                  {
                    guard: "grappleEscapeRaise",
                    target: "free",
                    actions: ["clearGrappledBy"]
                  },
                  {
                    guard: "grappleEscapeSuccessNoRaise",
                    target: "grabbed"
                  }
                ],
                APPLY_BOUND: {
                  target: "bound",
                  actions: ["clearGrappledBy"]
                }
              },
              always: [
                { guard: not(stateIn(DAMAGE_ACTIVE)), target: "free", actions: ["clearGrappledBy"] },
                { guard: stateIn(FATIGUE_INCAP), target: "free", actions: ["clearGrappledBy"] }
              ]
            }
          }
        },

        // ========================================
        // AFFLICTION TRACK (poison/disease)
        // ========================================
        afflictionTrack: {
          initial: "healthy",
          states: {
            healthy: {
              on: {
                APPLY_AFFLICTION: [
                  { guard: "afflictionParalytic", target: "afflicted.paralytic", actions: ["setAfflictionTimer"] },
                  {
                    guard: "afflictionWeak",
                    target: "afflicted.weak",
                    actions: ["setAfflictionTimer", "raiseFatigue"]
                  },
                  {
                    guard: "afflictionLethal",
                    target: "afflicted.lethal",
                    actions: ["setAfflictionTimer", "raiseLethalTick"]
                  },
                  { guard: "afflictionSleep", target: "afflicted.sleep", actions: ["setAfflictionTimer"] }
                ]
              }
            },
            afflicted: {
              initial: "paralytic",
              on: {
                CURE_AFFLICTION: { target: "healthy", actions: ["clearAfflictionTimer"] },
                APPLY_AFFLICTION: [
                  { guard: "afflictionParalytic", target: ".paralytic", actions: ["setAfflictionTimer"] },
                  { guard: "afflictionWeak", target: ".weak", actions: ["setAfflictionTimer", "raiseFatigue"] },
                  { guard: "afflictionLethal", target: ".lethal", actions: ["setAfflictionTimer", "raiseLethalTick"] },
                  { guard: "afflictionSleep", target: ".sleep", actions: ["setAfflictionTimer"] }
                ]
              },
              always: {
                guard: "afflictionTimerExpired",
                target: "healthy",
                actions: ["clearAfflictionTimer"]
              },
              states: {
                paralytic: {},
                weak: {},
                lethal: {
                  always: {
                    guard: "afflictionTimerExpired",
                    target: "#savage.dead",
                    actions: ["clearAfflictionTimer"]
                  }
                },
                sleep: {}
              }
            }
          }
        }
      }
    },

    dead: {
      type: "final",
      entry: assign({
        distractedTimer: conditionTimer(-1),
        vulnerableTimer: conditionTimer(-1),
        onHold: false,
        holdUsed: false,
        interruptedSuccessfully: false,
        grappledBy: "",
        afflictionTimer: -1,
        activeEffects: [],
        injuries: []
      })
    }
  }
})
