/* eslint-disable max-lines -- xstate machine definition is inherently dense */
import { and, assign, not, setup, type SnapshotFrom, stateIn } from "xstate"

// ============================================================
// Types
// ============================================================

// Injury types per SWADE Injury Table (2d6)
export type InjuryType =
  | "unmentionables" // 2
  | "arm" // 3-4
  | "guts_broken" // 5-9, sub 1-2: Agility reduced
  | "guts_battered" // 5-9, sub 3-4: Vigor reduced
  | "guts_busted" // 5-9, sub 5-6: Strength reduced
  | "leg" // 10-11
  | "head_scar" // 12, sub 1-3: Ugly hindrance
  | "head_blinded" // 12, sub 4-5: One Eye/Blind
  | "head_brain_damage" // 12, sub 6: Smarts reduced

export interface SavageContext {
  wounds: number
  distractedTimer: number // -1 = inactive, >= 0 = turns until expiry
  vulnerableTimer: number // -1 = inactive, >= 0 = turns until expiry
  isWildCard: boolean
  maxWounds: number // 3 for WC, 1 for Extra
  ownTurn: boolean // mirrors turnPhase state for use in guards/actions
  onHold: boolean // mirrors turnPhase onHold state for use in guards/actions
  interruptedSuccessfully: boolean // true when last interrupt roll succeeded (acts before interruptee)
  injuries: InjuryType[] // permanent injuries from Injury Table
  grappledBy: string | null // opponent identifier when grabbed/pinned
}

export type SavageEvent =
  | { type: "TAKE_DAMAGE"; margin: number; soakSuccesses: number; incapRoll: number; injuryRoll?: number }
  | { type: "START_OF_TURN"; vigorRoll: number; spiritRoll: number }
  | { type: "END_OF_TURN" }
  | { type: "SPEND_BENNY" }
  | { type: "APPLY_STUNNED" }
  | { type: "APPLY_DISTRACTED" }
  | { type: "APPLY_VULNERABLE" }
  | { type: "APPLY_FATIGUE" }
  | { type: "RECOVER_FATIGUE" }
  | { type: "HEAL"; amount: number }
  | { type: "FINISHING_MOVE" }
  | { type: "DROP_PRONE" }
  | { type: "STAND_UP" }
  | { type: "GO_ON_HOLD" }
  | { type: "INTERRUPT"; athleticsRoll: number }
  | { type: "APPLY_ENTANGLED" }
  | { type: "APPLY_BOUND" }
  | { type: "ESCAPE_ATTEMPT"; rollResult: number }
  | { type: "GRAPPLE_ATTEMPT"; rollResult: number }
  | { type: "GRAPPLE_ESCAPE"; rollResult: number }
  | { type: "PIN_ATTEMPT"; rollResult: number }
  | { type: "APPLY_BLINDED"; severity: 2 | 4 }

// ============================================================
// Helpers (mirror Quint spec pure functions)
// ============================================================

function computeDamage(margin: number, soakSuccesses: number, isShaken: boolean) {
  const raises = Math.floor(margin / 4)
  const rawWounds = isShaken ? Math.max(raises, 1) : raises
  const effectiveSoak = rawWounds > 0 ? soakSuccesses : 0
  const actualWounds = Math.max(0, rawWounds - effectiveSoak)
  const allSoaked = actualWounds === 0 && effectiveSoak > 0
  return { raises, rawWounds, effectiveSoak, actualWounds, allSoaked }
}

function tickTimer(timer: number): number {
  if (timer > 0) return timer - 1
  if (timer === 0) return -1
  return -1
}

// Type-safe event extractors
function asDamage(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "TAKE_DAMAGE" }>
}
function asRecovery(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "START_OF_TURN" }>
}
function asHeal(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "HEAL" }>
}
function asInterrupt(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "INTERRUPT" }>
}

// Resolve 2d6 Injury Table roll to InjuryType
// injuryRoll encodes both 2d6 and sub-roll: tableRoll * 10 + subRoll
// e.g., 52 = table roll 5, sub roll 2 → guts_broken
export function resolveInjury(injuryRoll: number): InjuryType {
  const tableRoll = Math.floor(injuryRoll / 10)
  const subRoll = injuryRoll % 10
  if (tableRoll <= 2) return "unmentionables"
  if (tableRoll <= 4) return "arm"
  if (tableRoll <= 9) {
    if (subRoll <= 2) return "guts_broken"
    if (subRoll <= 4) return "guts_battered"
    return "guts_busted"
  }
  if (tableRoll <= 11) return "leg"
  // 12
  if (subRoll <= 3) return "head_scar"
  if (subRoll <= 5) return "head_blinded"
  return "head_brain_damage"
}
function asEscape(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "ESCAPE_ATTEMPT" }>
}
function asGrapple(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "GRAPPLE_ATTEMPT" }>
}
function asGrappleEscape(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "GRAPPLE_ESCAPE" }>
}
function asPin(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "PIN_ATTEMPT" }>
}

// ============================================================
// State path constants
// ============================================================
const STUNNED_STATE = { alive: { conditionTrack: { stun: "stunned" as const } } }
const SHAKEN_STATE = { alive: { damageTrack: { active: "shaken" as const } } }
const OTHERS_TURN = { alive: { turnPhase: "othersTurn" as const } }
const DAMAGE_ACTIVE = { alive: { damageTrack: "active" as const } }
const FATIGUE_INCAP = { alive: { fatigueTrack: "incapByFatigue" as const } }
const BOUND_STATE = { alive: { restraintTrack: "bound" as const } }
const GRABBED_STATE = { alive: { restraintTrack: "grabbed" as const } }
const PINNED_STATE = { alive: { restraintTrack: "pinned" as const } }

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
    input: {} as { isWildCard?: boolean }
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
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, true)
      return !context.isWildCard && actualWounds > 0
    },
    exceedsMaxShaken: ({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, true)
      return context.isWildCard && context.wounds + actualWounds > context.maxWounds
    },
    allSoakedShaken: ({ event }) => {
      const { allSoaked } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, true)
      return allSoaked
    },
    woundsNotExceedMaxShaken: ({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, true)
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

    // --- Interrupt guards ---
    interruptSuccess: ({ event }) => asInterrupt(event).athleticsRoll >= 1,

    // --- Escape guards ---
    escapeSuccess: ({ event }) => asEscape(event).rollResult >= 1,
    escapeRaise: ({ event }) => asEscape(event).rollResult >= 2,

    // --- Grapple guards ---
    grappleSuccess: ({ event }) => asGrapple(event).rollResult >= 1,
    grappleRaise: ({ event }) => asGrapple(event).rollResult >= 2,
    grappleEscapeSuccess: ({ event }) => asGrappleEscape(event).rollResult >= 1,
    pinSuccess: ({ event }) => asPin(event).rollResult >= 1,

    // --- Blinded guards ---
    blindedSeverityFull: ({ event }) =>
      (event as Extract<SavageEvent, { type: "APPLY_BLINDED" }>).severity === 4
  },
  actions: {
    addWounds: assign(({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, false)
      return { wounds: context.wounds + actualWounds }
    }),
    addWoundsShaken: assign(({ context, event }) => {
      const { actualWounds } = computeDamage(asDamage(event).margin, asDamage(event).soakSuccesses, true)
      return { wounds: context.wounds + actualWounds }
    }),
    setWoundsToMax: assign(({ context }) => ({
      wounds: context.maxWounds
    })),
    healWounds: assign(({ context, event }) => ({
      wounds: Math.max(0, context.wounds - asHeal(event).amount)
    })),
    setDistractedTimer: assign(({ context }) => ({
      distractedTimer: Math.max(context.distractedTimer, context.ownTurn ? 1 : 0)
    })),
    setVulnerableTimer: assign(({ context }) => ({
      vulnerableTimer: Math.max(context.vulnerableTimer, context.ownTurn ? 1 : 0)
    })),
    setVulnerableTimerRecoverySuccess: assign(({ context }) => ({
      vulnerableTimer: Math.max(context.vulnerableTimer, 1)
    })),
    setVulnerableTimerRecoveryRaise: assign(({ context }) => ({
      vulnerableTimer: Math.max(context.vulnerableTimer, 0)
    })),
    tickTimers: assign(({ context }) => ({
      distractedTimer: tickTimer(context.distractedTimer),
      vulnerableTimer: tickTimer(context.vulnerableTimer)
    })),
    setOwnTurnTrue: assign({ ownTurn: true }),
    setOwnTurnFalse: assign({ ownTurn: false }),
    setOnHold: assign({ onHold: true, ownTurn: false }),
    clearOnHold: assign({ onHold: false }),
    setInterruptSuccess: assign({ interruptedSuccessfully: true }),
    setInterruptFail: assign({ interruptedSuccessfully: false }),
    appendInjury: assign(({ context, event }) => {
      const roll = asDamage(event).injuryRoll ?? 0
      if (roll === 0) return {}
      return { injuries: [...context.injuries, resolveInjury(roll)] }
    }),
    clearGrappledBy: assign({ grappledBy: null })
  }
}).createMachine({
  id: "savage",
  initial: "alive",
  context: ({ input }) => ({
    wounds: 0,
    distractedTimer: -1,
    vulnerableTimer: -1,
    isWildCard: input.isWildCard ?? true,
    maxWounds: (input.isWildCard ?? true) ? 3 : 1,
    ownTurn: false,
    onHold: false,
    interruptedSuccessfully: false,
    injuries: [],
    grappledBy: null
  }),
  states: {
    alive: {
      type: "parallel",
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
                        guard: and([stateIn(OTHERS_TURN), not(stateIn(FATIGUE_INCAP)), "spiritSuccess", "hasWounds"]),
                        target: "wounded"
                      },
                      {
                        guard: and([stateIn(OTHERS_TURN), not(stateIn(FATIGUE_INCAP)), "spiritSuccess"]),
                        target: "unshaken"
                      }
                    ],
                    SPEND_BENNY: [{ guard: "hasWounds", target: "wounded" }, { target: "unshaken" }],
                    HEAL: [
                      { guard: "hasWounds", actions: ["healWounds"] } // Stay shaken, reduce wounds
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
                      { guard: and([stateIn(OTHERS_TURN), "vigorFail"]), target: "#savage.dead" },
                      { guard: and([stateIn(OTHERS_TURN), "vigorRaise"]), target: "stable" }
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
                      target: "stunned"
                    }
                  }
                },
                stunned: {
                  on: {
                    START_OF_TURN: [
                      {
                        guard: and([
                          stateIn(OTHERS_TURN),
                          stateIn(DAMAGE_ACTIVE),
                          not(stateIn(FATIGUE_INCAP)),
                          "vigorRaise"
                        ]),
                        target: "normal",
                        actions: ["setVulnerableTimerRecoveryRaise"]
                      },
                      {
                        guard: and([
                          stateIn(OTHERS_TURN),
                          stateIn(DAMAGE_ACTIVE),
                          not(stateIn(FATIGUE_INCAP)),
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
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleSuccess"]),
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
                      guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleSuccess"]),
                      actions: ["setDistractedTimer"]
                    }
                  },
                  always: {
                    guard: and([
                      "distractedTimerExpired",
                      not(stateIn(BOUND_STATE)),
                      not(stateIn(GRABBED_STATE)),
                      not(stateIn(PINNED_STATE))
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
                          stateIn(OTHERS_TURN),
                          stateIn(DAMAGE_ACTIVE),
                          not(stateIn(FATIGUE_INCAP)),
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
                    START_OF_TURN: [
                      {
                        guard: and([stateIn(OTHERS_TURN), stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "vigorSuccess"]),
                        target: "clear"
                      }
                    ]
                  },
                  always: {
                    guard: not(stateIn(DAMAGE_ACTIVE)),
                    target: "clear"
                  }
                },
                blinded: {
                  on: {
                    START_OF_TURN: [
                      {
                        guard: and([stateIn(OTHERS_TURN), stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "vigorRaise"]),
                        target: "clear"
                      },
                      {
                        guard: and([stateIn(OTHERS_TURN), stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "vigorSuccessNoRaise"]),
                        target: "impaired"
                      }
                    ]
                  },
                  always: {
                    guard: not(stateIn(DAMAGE_ACTIVE)),
                    target: "clear"
                  }
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
          initial: "othersTurn",
          states: {
            othersTurn: {
              on: {
                START_OF_TURN: { target: "ownTurn", actions: ["setOwnTurnTrue"] }
              }
            },
            ownTurn: {
              on: {
                END_OF_TURN: { target: "othersTurn", actions: ["tickTimers", "setOwnTurnFalse"] },
                GO_ON_HOLD: {
                  guard: and([
                    stateIn(DAMAGE_ACTIVE),
                    not(stateIn(FATIGUE_INCAP)),
                    not(stateIn(SHAKEN_STATE)),
                    not(stateIn(STUNNED_STATE))
                  ]),
                  target: "onHold",
                  actions: ["setOnHold"]
                }
              }
            },
            onHold: {
              on: {
                INTERRUPT: [
                  {
                    guard: "interruptSuccess",
                    target: "ownTurn",
                    actions: ["clearOnHold", "setOwnTurnTrue", "setInterruptSuccess"]
                  },
                  {
                    target: "ownTurn",
                    actions: ["clearOnHold", "setOwnTurnTrue", "setInterruptFail"]
                  }
                ],
                END_OF_TURN: { target: "othersTurn", actions: ["clearOnHold", "tickTimers", "setOwnTurnFalse"] }
              },
              always: [
                {
                  guard: stateIn(STUNNED_STATE),
                  target: "othersTurn",
                  actions: ["clearOnHold", "setOwnTurnFalse"]
                },
                {
                  guard: stateIn(SHAKEN_STATE),
                  target: "othersTurn",
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
                  target: "entangled"
                },
                APPLY_BOUND: {
                  guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]),
                  target: "bound"
                },
                GRAPPLE_ATTEMPT: [
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleRaise"]),
                    target: "pinned"
                  },
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleSuccess"]),
                    target: "grabbed"
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
                  target: "free"
                },
                GRAPPLE_ATTEMPT: [
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleRaise"]),
                    target: "pinned"
                  },
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleSuccess"]),
                    target: "grabbed"
                  }
                ]
              },
              always: {
                guard: not(stateIn(DAMAGE_ACTIVE)),
                target: "free"
              }
            },
            bound: {
              on: {
                ESCAPE_ATTEMPT: [
                  { guard: "escapeRaise", target: "free" },
                  { guard: "escapeSuccess", target: "entangled" }
                ],
                GRAPPLE_ATTEMPT: [
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleRaise"]),
                    target: "pinned"
                  },
                  {
                    guard: and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP)), "grappleSuccess"]),
                    target: "grabbed"
                  }
                ]
              },
              always: {
                guard: not(stateIn(DAMAGE_ACTIVE)),
                target: "free"
              }
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
                }
              },
              always: {
                guard: not(stateIn(DAMAGE_ACTIVE)),
                target: "free"
              }
            },
            pinned: {
              on: {
                GRAPPLE_ESCAPE: {
                  guard: "grappleEscapeSuccess",
                  target: "free",
                  actions: ["clearGrappledBy"]
                }
              },
              always: {
                guard: not(stateIn(DAMAGE_ACTIVE)),
                target: "free"
              }
            }
          }
        }
      }
    },

    dead: {
      type: "final",
      entry: assign({
        distractedTimer: -1,
        vulnerableTimer: -1,
        onHold: false,
        interruptedSuccessfully: false,
        grappledBy: null
      })
    }
  }
})

// ============================================================
// Derived state helpers
// ============================================================

export type SavageSnapshot = SnapshotFrom<typeof savageMachine>

export function isDead(snap: SavageSnapshot): boolean {
  return snap.matches("dead")
}

export function isShaken(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { damageTrack: { active: "shaken" } } })
}

export function isStunned(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { conditionTrack: { stun: "stunned" } } })
}

export function isDistracted(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { conditionTrack: { distraction: "distracted" } } }) || isStunned(snap)
}

export function isVulnerable(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { conditionTrack: { vulnerability: "vulnerable" } } }) || isStunned(snap)
}

export function isOnHold(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { turnPhase: "onHold" } })
}

export function isProne(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { positionTrack: "prone" } })
}

export function isBound(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { restraintTrack: "bound" } })
}

export function isEntangled(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { restraintTrack: "entangled" } })
}

export function isRestrained(snap: SavageSnapshot): boolean {
  return isBound(snap) || isEntangled(snap)
}

export function isGrabbed(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { restraintTrack: "grabbed" } })
}

export function isPinned(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { restraintTrack: "pinned" } })
}

export function isGrappled(snap: SavageSnapshot): boolean {
  return isGrabbed(snap) || isPinned(snap)
}

export function isBlinded(snap: SavageSnapshot): boolean {
  return (
    snap.matches({ alive: { conditionTrack: { vision: "blinded" } } }) ||
    snap.matches({ alive: { conditionTrack: { vision: "impaired" } } })
  )
}

export function isFullyBlinded(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { conditionTrack: { vision: "blinded" } } })
}

export function blindedPenalty(snap: SavageSnapshot): number {
  if (snap.matches({ alive: { conditionTrack: { vision: "blinded" } } })) return -4
  if (snap.matches({ alive: { conditionTrack: { vision: "impaired" } } })) return -2
  return 0
}

export function isActive(snap: SavageSnapshot): boolean {
  return (
    snap.matches({ alive: { damageTrack: "active" } }) && !snap.matches({ alive: { fatigueTrack: "incapByFatigue" } })
  )
}

export function canAct(snap: SavageSnapshot): boolean {
  return isActive(snap) && !isShaken(snap) && !isStunned(snap)
}

export function canMove(snap: SavageSnapshot): boolean {
  return isActive(snap) && !isStunned(snap)
}

export function hasInjury(snap: SavageSnapshot, type: InjuryType): boolean {
  return snap.context.injuries.includes(type)
}

export function injuryPenalty(snap: SavageSnapshot): number {
  // Each injury that reduces a die type counts as -1 penalty for display purposes
  // In practice, injuries affect specific attributes, not a global penalty
  // This counts the number of die-reducing injuries for a summary
  return snap.context.injuries.filter(
    (i) =>
      i === "guts_broken" ||
      i === "guts_battered" ||
      i === "guts_busted" ||
      i === "head_brain_damage"
  ).length
}

export function totalPenalty(snap: SavageSnapshot): number {
  const wp = Math.min(snap.context.wounds, 3)
  const fatigue =
    snap.matches({ alive: { fatigueTrack: "exhausted" } }) ||
    snap.matches({ alive: { fatigueTrack: "incapByFatigue" } })
      ? 2
      : snap.matches({ alive: { fatigueTrack: "fatigued" } })
        ? 1
        : 0
  return -(wp + fatigue)
}

// Fear table result types
export type FearResult = string

// Resolve fear table: d20 roll + modifier → list of event/effect strings
export function resolveFear(tableRoll: number, modifier: number): FearResult[] {
  const total = tableRoll + modifier
  if (total <= 3) return ["ADRENALINE"]
  if (total <= 6) return ["APPLY_DISTRACTED"]
  if (total <= 9) return ["APPLY_VULNERABLE"]
  if (total <= 12) return ["APPLY_STUNNED"]
  if (total === 13) return ["APPLY_STUNNED", "HINDRANCE_SCAR"]
  if (total <= 15) return ["HINDRANCE_SLOWNESS"]
  if (total <= 17) return ["APPLY_STUNNED", "PANIC_FLEE"]
  if (total <= 19) return ["HINDRANCE_MINOR_PHOBIA"]
  if (total <= 21) return ["HINDRANCE_MAJOR_PHOBIA"]
  return ["HEART_ATTACK"]
}
