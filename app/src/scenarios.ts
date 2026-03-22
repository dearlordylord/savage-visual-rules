/* eslint-disable max-lines -- scenario data file, inherently long */
import type { SavageEvent, SavageSnapshot } from "./machine"
import {
  activeEffectsList,
  afflictionType,
  blindedPenalty,
  hasEffect,
  isBleedingOut,
  isBlinded,
  isBound,
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
  isVulnerable
} from "./machine"
import * as m from "./paraglide/messages"
import {
  afflictionDuration as ad,
  athleticsRollResult as ar,
  blindedSeverity as bs,
  damageMargin as dm,
  escapeRollResult as er,
  grappleEscapeRollResult as ger,
  grappleRollResult as gr,
  healAmount as ha,
  incapRollResult as ir,
  injuryRoll as ij,
  pinRollResult as pr,
  soakSuccesses as sk,
  spiritRollResult as sr,
  vigorRollResult as vr
} from "./types"

// ============================================================
// Types
// ============================================================

// eslint-disable-next-line functional/no-mixed-types -- data + callbacks naturally mixed
export interface ScenarioStep {
  event: SavageEvent | null // null for narrative-only steps (e.g. fear table result display)
  label: () => string
  expect: Array<{
    desc: () => string
    check: (snap: SavageSnapshot) => boolean
  }>
}

// eslint-disable-next-line functional/no-mixed-types -- data + callbacks naturally mixed
export interface Scenario {
  id: string
  title: () => string
  description: () => string
  category: ScenarioCategory
  characterType: "wildCard" | "extra"
  steps: Array<ScenarioStep>
}

// ============================================================
// Category labels
// ============================================================

const CATEGORY_LABELS_INTERNAL = {
  damage: m.cat_damage,
  soak: m.cat_soak,
  shaken: m.cat_shaken,
  incap: m.cat_incap,
  bleedingOut: m.cat_bleedingOut,
  extras: m.cat_extras,
  stunned: m.cat_stunned,
  conditions: m.cat_conditions,
  fatigue: m.cat_fatigue,
  healing: m.cat_healing,
  hold: m.cat_hold,
  prone: m.cat_prone,
  restraint: m.cat_restraint,
  grapple: m.cat_grapple,
  blinded: m.cat_blinded,
  afflictions: m.cat_afflictions,
  powers: m.cat_powers,
  defense: m.cat_defense,
  fear: m.cat_fear,
  crossCombat: m.cat_crossCombat,
  crossRecovery: m.cat_crossRecovery,
  crossHold: m.cat_crossHold,
  crossRestraint: m.cat_crossRestraint,
  crossAffliction: m.cat_crossAffliction,
  crossDefense: m.cat_crossDefense,
  crossHealing: m.cat_crossHealing,
  crossFear: m.cat_crossFear,
  crossDeath: m.cat_crossDeath
} as const satisfies Record<string, () => string>

export type ScenarioCategory = keyof typeof CATEGORY_LABELS_INTERNAL
export const CATEGORY_LABELS: Record<ScenarioCategory, () => string> = CATEGORY_LABELS_INTERNAL

// ============================================================
// Scenarios
// ============================================================

export const scenarios: Array<Scenario> = [
  // ========================================
  // 1.1 Damage basics
  // ========================================
  {
    id: "damage-glancing",
    title: m.sc_damage_glancing_title,
    description: m.sc_damage_glancing_desc,
    category: "damage",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_damage_glancing_s0,
        expect: [
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_wounds_0, check: (s) => s.context.wounds === 0 }
        ]
      }
    ]
  },
  {
    id: "damage-solid",
    title: m.sc_damage_solid_title,
    description: m.sc_damage_solid_desc,
    category: "damage",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(5), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_damage_solid_s0,
        expect: [
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_wounds_1, check: (s) => s.context.wounds === 1 }
        ]
      }
    ]
  },
  {
    id: "damage-shaken-on-shaken",
    title: m.sc_damage_shaken_on_shaken_title,
    description: m.sc_damage_shaken_on_shaken_desc,
    category: "damage",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(2), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_damage_shaken_on_shaken_s0,
        expect: [
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_wounds_0, check: (s) => s.context.wounds === 0 }
        ]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(1), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_damage_shaken_on_shaken_s1,
        expect: [
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_wounds_1, check: (s) => s.context.wounds === 1 }
        ]
      }
    ]
  },
  {
    id: "damage-brutal",
    title: m.sc_damage_brutal_title,
    description: m.sc_damage_brutal_desc,
    category: "damage",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(8), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_damage_brutal_s0,
        expect: [
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_wounds_2, check: (s) => s.context.wounds === 2 }
        ]
      }
    ]
  },

  // ========================================
  // 1.2 Soak rolls
  // ========================================
  {
    id: "soak-partial",
    title: m.sc_soak_partial_title,
    description: m.sc_soak_partial_desc,
    category: "soak",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(1), incapRoll: ir(0) },
        label: m.sc_soak_partial_s0,
        expect: [
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_wounds_0, check: (s) => s.context.wounds === 0 }
        ]
      }
    ]
  },
  {
    id: "soak-clears-shaken",
    title: m.sc_soak_clears_shaken_title,
    description: m.sc_soak_clears_shaken_desc,
    category: "soak",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_soak_clears_shaken_s0,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(1), incapRoll: ir(0) },
        label: m.sc_soak_clears_shaken_s1,
        expect: [
          { desc: m.sc_chk_not_shaken, check: (s) => !isShaken(s) },
          { desc: m.sc_chk_wounds_0, check: (s) => s.context.wounds === 0 }
        ]
      }
    ]
  },

  // ========================================
  // 1.3 Shaken recovery
  // ========================================
  {
    id: "shaken-recovery-success",
    title: m.sc_shaken_recovery_success_title,
    description: m.sc_shaken_recovery_success_desc,
    category: "shaken",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_shaken_recovery_success_s0,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: m.sc_shaken_recovery_success_s1,
        expect: [
          { desc: m.sc_chk_not_shaken, check: (s) => !isShaken(s) },
          { desc: m.sc_shaken_recovery_success_s1_e1, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }
        ]
      }
    ]
  },
  {
    id: "shaken-recovery-fail",
    title: m.sc_shaken_recovery_fail_title,
    description: m.sc_shaken_recovery_fail_desc,
    category: "shaken",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_shaken_recovery_fail_s0,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_shaken_recovery_fail_s1,
        expect: [
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_shaken_recovery_fail_s1_e1, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }
        ]
      }
    ]
  },
  {
    id: "shaken-benny",
    title: m.sc_shaken_benny_title,
    description: m.sc_shaken_benny_desc,
    category: "shaken",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(2), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_shaken_benny_s0,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      },
      {
        event: { type: "SPEND_BENNY" },
        label: m.sc_shaken_benny_s1,
        expect: [{ desc: m.sc_chk_not_shaken, check: (s) => !isShaken(s) }]
      }
    ]
  },

  // ========================================
  // 1.4 Incapacitation
  // ========================================
  {
    id: "incap-crit-fail",
    title: m.sc_incap_crit_fail_title,
    description: m.sc_incap_crit_fail_desc,
    category: "incap",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_incap_crit_fail_s0,
        expect: [
          { desc: m.sc_chk_wounds_3, check: (s) => s.context.wounds === 3 },
          { desc: m.sc_chk_shaken, check: isShaken }
        ]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(-1) },
        label: m.sc_incap_crit_fail_s1,
        expect: [{ desc: m.sc_chk_dead, check: isDead }]
      }
    ]
  },
  {
    id: "incap-bleeding-out",
    title: m.sc_incap_bleeding_out_title,
    description: m.sc_incap_bleeding_out_desc,
    category: "incap",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_incap_bleeding_out_s0,
        expect: [{ desc: m.sc_chk_wounds_3, check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_incap_bleeding_out_s1,
        expect: [
          {
            desc: m.sc_chk_bleeding_out,
            check: isBleedingOut
          }
        ]
      }
    ]
  },
  {
    id: "incap-stable",
    title: m.sc_incap_stable_title,
    description: m.sc_incap_stable_desc,
    category: "incap",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_incap_stable_s0,
        expect: [{ desc: m.sc_chk_wounds_3, check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(1), injuryRoll: ij(52) },
        label: m.sc_incap_stable_s1,
        expect: [
          { desc: m.sc_chk_stable, check: isIncapStable },
          { desc: m.sc_incap_stable_s1_e1, check: (s) => s.context.injuries.includes("guts_broken") }
        ]
      }
    ]
  },

  // ========================================
  // 1.5 Bleeding out
  // ========================================
  {
    id: "bleeding-death",
    title: m.sc_bleeding_death_title,
    description: m.sc_bleeding_death_desc,
    category: "bleedingOut",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_bleeding_death_s0,
        expect: [{ desc: m.sc_chk_wounds_3, check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_bleeding_death_s1,
        expect: [
          {
            desc: m.sc_chk_bleeding_out,
            check: isBleedingOut
          }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_bleeding_death_s2,
        expect: [{ desc: m.sc_chk_dead, check: isDead }]
      }
    ]
  },
  {
    id: "bleeding-stabilized",
    title: m.sc_bleeding_stabilized_title,
    description: m.sc_bleeding_stabilized_desc,
    category: "bleedingOut",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_bleeding_stabilized_s0,
        expect: [{ desc: m.sc_chk_wounds_3, check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_bleeding_stabilized_s1,
        expect: [
          {
            desc: m.sc_chk_bleeding_out,
            check: isBleedingOut
          }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) },
        label: m.sc_bleeding_stabilized_s2,
        expect: [
          { desc: m.sc_chk_stable, check: isIncapStable },
          { desc: m.sc_chk_alive, check: (s) => !isDead(s) }
        ]
      }
    ]
  },

  // ========================================
  // 1.6 Extras vs Wild Cards
  // ========================================
  {
    id: "extra-dies",
    title: m.sc_extra_dies_title,
    description: m.sc_extra_dies_desc,
    category: "extras",
    characterType: "extra",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_extra_dies_s0,
        expect: [
          { desc: m.sc_chk_extra_dead, check: isDead },
          { desc: m.sc_chk_wounds_1, check: (s) => s.context.wounds === 1 }
        ]
      }
    ]
  },
  {
    id: "wc-survives",
    title: m.sc_wc_survives_title,
    description: m.sc_wc_survives_desc,
    category: "extras",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_wc_survives_s0,
        expect: [
          { desc: m.sc_chk_alive, check: (s) => !isDead(s) },
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_wounds_1, check: (s) => s.context.wounds === 1 }
        ]
      }
    ]
  },

  // ========================================
  // 1.7 Stunned
  // ========================================
  {
    id: "stunned-cascade",
    title: m.sc_stunned_cascade_title,
    description: m.sc_stunned_cascade_desc,
    category: "stunned",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_STUNNED" },
        label: m.sc_stunned_cascade_s0,
        expect: [
          { desc: m.sc_chk_stunned, check: isStunned },
          { desc: m.sc_chk_prone, check: isProne },
          { desc: m.sc_chk_distracted, check: isDistracted },
          { desc: m.sc_chk_vulnerable, check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "stunned-recovery-success",
    title: m.sc_stunned_recovery_success_title,
    description: m.sc_stunned_recovery_success_desc,
    category: "stunned",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_STUNNED" },
        label: m.sc_stunned_recovery_success_s0,
        expect: [{ desc: m.sc_chk_stunned, check: isStunned }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) },
        label: m.sc_stunned_recovery_success_s1,
        expect: [
          { desc: m.sc_chk_not_stunned, check: (s) => !isStunned(s) },
          {
            desc: m.sc_stunned_recovery_success_s1_e1,
            check: (s) => isVulnerable(s) && s.context.vulnerableTimer === 1
          }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_stunned_recovery_success_s2,
        expect: [{ desc: m.sc_stunned_recovery_success_s2_e0, check: (s) => s.context.vulnerableTimer === 0 }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_stunned_recovery_success_s3,
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_stunned_recovery_success_s4,
        expect: [{ desc: m.sc_chk_not_vulnerable, check: (s) => !isVulnerable(s) }]
      }
    ]
  },
  {
    id: "stunned-recovery-raise",
    title: m.sc_stunned_recovery_raise_title,
    description: m.sc_stunned_recovery_raise_desc,
    category: "stunned",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_STUNNED" },
        label: m.sc_stunned_recovery_raise_s0,
        expect: [{ desc: m.sc_chk_stunned, check: isStunned }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) },
        label: m.sc_stunned_recovery_raise_s1,
        expect: [
          { desc: m.sc_chk_not_stunned, check: (s) => !isStunned(s) },
          { desc: m.sc_stunned_recovery_raise_s1_e1, check: (s) => s.context.vulnerableTimer === 0 }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_stunned_recovery_raise_s2,
        expect: [{ desc: m.sc_chk_not_vulnerable, check: (s) => !isVulnerable(s) }]
      }
    ]
  },

  // ========================================
  // 1.8 Distracted/Vulnerable timing
  // ========================================
  {
    id: "distracted-outside-turn",
    title: m.sc_distracted_outside_turn_title,
    description: m.sc_distracted_outside_turn_desc,
    category: "conditions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_DISTRACTED" },
        label: m.sc_distracted_outside_turn_s0,
        expect: [
          { desc: m.sc_chk_distracted, check: isDistracted },
          { desc: m.sc_distracted_outside_turn_s0_e1, check: (s) => s.context.distractedTimer === 0 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_distracted_outside_turn_s1,
        expect: [{ desc: m.sc_chk_distracted, check: isDistracted }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_distracted_outside_turn_s2,
        expect: [
          { desc: m.sc_chk_not_distracted, check: (s) => !isDistracted(s) },
          { desc: m.sc_distracted_outside_turn_s2_e1, check: (s) => s.context.distractedTimer === -1 }
        ]
      }
    ]
  },
  {
    id: "distracted-during-turn",
    title: m.sc_distracted_during_turn_title,
    description: m.sc_distracted_during_turn_desc,
    category: "conditions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_distracted_during_turn_s0,
        expect: [
          { desc: m.sc_distracted_during_turn_s0_e0, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }
        ]
      },
      {
        event: { type: "APPLY_DISTRACTED" },
        label: m.sc_distracted_during_turn_s1,
        expect: [
          { desc: m.sc_chk_distracted, check: isDistracted },
          { desc: m.sc_distracted_during_turn_s1_e1, check: (s) => s.context.distractedTimer === 1 }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_distracted_during_turn_s2,
        expect: [{ desc: m.sc_distracted_during_turn_s2_e0, check: (s) => s.context.distractedTimer === 0 }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_distracted_during_turn_s3,
        expect: [{ desc: m.sc_distracted_during_turn_s3_e0, check: isDistracted }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_distracted_during_turn_s4,
        expect: [{ desc: m.sc_chk_not_distracted, check: (s) => !isDistracted(s) }]
      }
    ]
  },

  // ========================================
  // 1.9 Fatigue
  // ========================================
  {
    id: "fatigue-progression",
    title: m.sc_fatigue_progression_title,
    description: m.sc_fatigue_progression_desc,
    category: "fatigue",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_FATIGUE" },
        label: m.sc_fatigue_progression_s0,
        expect: [{ desc: m.sc_chk_fatigued, check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: m.sc_fatigue_progression_s1,
        expect: [{ desc: m.sc_chk_exhausted, check: (s) => s.matches({ alive: { fatigueTrack: "exhausted" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: m.sc_fatigue_progression_s2,
        expect: [
          {
            desc: m.sc_fatigue_progression_s2_e0,
            check: (s) => s.matches({ alive: { fatigueTrack: "incapByFatigue" } })
          }
        ]
      }
    ]
  },
  {
    id: "fatigue-recovery",
    title: m.sc_fatigue_recovery_title,
    description: m.sc_fatigue_recovery_desc,
    category: "fatigue",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_FATIGUE" },
        label: m.sc_fatigue_recovery_s0,
        expect: [{ desc: m.sc_chk_fatigued, check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: m.sc_fatigue_recovery_s1,
        expect: [{ desc: m.sc_chk_exhausted, check: (s) => s.matches({ alive: { fatigueTrack: "exhausted" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: m.sc_fatigue_recovery_s2,
        expect: [
          { desc: m.sc_fatigue_recovery_s2_e0, check: (s) => s.matches({ alive: { fatigueTrack: "incapByFatigue" } }) }
        ]
      },
      {
        event: { type: "RECOVER_FATIGUE" },
        label: m.sc_fatigue_recovery_s3,
        expect: [{ desc: m.sc_chk_exhausted, check: (s) => s.matches({ alive: { fatigueTrack: "exhausted" } }) }]
      },
      {
        event: { type: "RECOVER_FATIGUE" },
        label: m.sc_fatigue_recovery_s4,
        expect: [{ desc: m.sc_chk_fatigued, check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }]
      },
      {
        event: { type: "RECOVER_FATIGUE" },
        label: m.sc_fatigue_recovery_s5,
        expect: [{ desc: m.sc_chk_fresh, check: (s) => s.matches({ alive: { fatigueTrack: "fresh" } }) }]
      }
    ]
  },

  // ========================================
  // 1.10 Healing
  // ========================================
  {
    id: "heal-wounds",
    title: m.sc_heal_wounds_title,
    description: m.sc_heal_wounds_desc,
    category: "healing",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(8), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_heal_wounds_s0,
        expect: [{ desc: m.sc_chk_wounds_2, check: (s) => s.context.wounds === 2 }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: m.sc_heal_wounds_s1,
        expect: [{ desc: m.sc_chk_not_shaken, check: (s) => !isShaken(s) }]
      },
      {
        event: { type: "HEAL", amount: ha(1) },
        label: m.sc_heal_wounds_s2,
        expect: [{ desc: m.sc_chk_wounds_1, check: (s) => s.context.wounds === 1 }]
      }
    ]
  },
  {
    id: "heal-incap",
    title: m.sc_heal_incap_title,
    description: m.sc_heal_incap_desc,
    category: "healing",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_heal_incap_s0,
        expect: [{ desc: m.sc_chk_wounds_3, check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_heal_incap_s1,
        expect: [
          {
            desc: m.sc_chk_bleeding_out,
            check: isBleedingOut
          }
        ]
      },
      {
        event: { type: "HEAL", amount: ha(1) },
        label: m.sc_heal_incap_s2,
        expect: [
          { desc: m.sc_chk_wounds_2, check: (s) => s.context.wounds === 2 },
          { desc: m.sc_heal_incap_s2_e1, check: (s) => s.matches({ alive: { damageTrack: "active" } }) }
        ]
      }
    ]
  },

  // ========================================
  // 1.11 Hold & Interrupt
  // ========================================
  {
    id: "hold-basic",
    title: m.sc_hold_basic_title,
    description: m.sc_hold_basic_desc,
    category: "hold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_hold_basic_s0,
        expect: [{ desc: m.sc_chk_acting, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }]
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: m.sc_hold_basic_s1,
        expect: [
          { desc: m.sc_chk_on_hold, check: isOnHold },
          { desc: m.sc_hold_basic_s1_e1, check: (s) => !s.context.ownTurn }
        ]
      }
    ]
  },
  {
    id: "hold-interrupt-success",
    title: m.sc_hold_interrupt_success_title,
    description: m.sc_hold_interrupt_success_desc,
    category: "hold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_hold_interrupt_success_s0,
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: m.sc_hold_interrupt_success_s1,
        expect: [{ desc: m.sc_chk_on_hold, check: isOnHold }]
      },
      {
        event: { type: "INTERRUPT", athleticsRoll: ar(1) },
        label: m.sc_hold_interrupt_success_s2,
        expect: [
          { desc: m.sc_chk_acting, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) },
          { desc: m.sc_hold_interrupt_success_s2_e1, check: (s) => s.context.interruptedSuccessfully }
        ]
      }
    ]
  },
  {
    id: "hold-interrupt-fail",
    title: m.sc_hold_interrupt_fail_title,
    description: m.sc_hold_interrupt_fail_desc,
    category: "hold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_hold_interrupt_fail_s0,
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: m.sc_hold_interrupt_fail_s1,
        expect: [{ desc: m.sc_chk_on_hold, check: isOnHold }]
      },
      {
        event: { type: "INTERRUPT", athleticsRoll: ar(0) },
        label: m.sc_hold_interrupt_fail_s2,
        expect: [
          { desc: m.sc_hold_interrupt_fail_s2_e0, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) },
          { desc: m.sc_hold_interrupt_fail_s2_e1, check: (s) => !s.context.interruptedSuccessfully }
        ]
      }
    ]
  },
  {
    id: "hold-persist",
    title: m.sc_hold_persist_title,
    description: m.sc_hold_persist_desc,
    category: "hold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_hold_persist_s0,
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: m.sc_hold_persist_s1,
        expect: [{ desc: m.sc_chk_on_hold, check: isOnHold }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_hold_persist_s2,
        expect: [
          { desc: m.sc_hold_persist_s2_e0, check: (s) => s.matches({ alive: { turnPhase: "idle" } }) },
          { desc: m.sc_hold_persist_s2_e1, check: (s) => s.context.onHold }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_hold_persist_s3,
        expect: [{ desc: m.sc_chk_on_hold, check: isOnHold }]
      },
      {
        event: { type: "ACT_FROM_HOLD" },
        label: m.sc_hold_persist_s4,
        expect: [
          { desc: m.sc_chk_acting, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) },
          { desc: m.sc_chk_not_on_hold, check: (s) => !isOnHold(s) }
        ]
      }
    ]
  },

  // ========================================
  // 1.12 Prone
  // ========================================
  {
    id: "prone-cycle",
    title: m.sc_prone_cycle_title,
    description: m.sc_prone_cycle_desc,
    category: "prone",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "DROP_PRONE" },
        label: m.sc_prone_cycle_s0,
        expect: [{ desc: m.sc_chk_prone, check: isProne }]
      },
      {
        event: { type: "STAND_UP" },
        label: m.sc_prone_cycle_s1,
        expect: [{ desc: m.sc_chk_standing, check: (s) => !isProne(s) }]
      }
    ]
  },

  // ========================================
  // 1.13 Restraint
  // ========================================
  {
    id: "restraint-entangled",
    title: m.sc_restraint_entangled_title,
    description: m.sc_restraint_entangled_desc,
    category: "restraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_ENTANGLED" },
        label: m.sc_restraint_entangled_s0,
        expect: [
          { desc: m.sc_chk_entangled, check: isEntangled },
          { desc: m.sc_chk_vulnerable, check: isVulnerable },
          { desc: m.sc_restraint_entangled_s0_e2, check: (s) => s.context.vulnerableTimer === 99 }
        ]
      }
    ]
  },
  {
    id: "restraint-escape-entangled",
    title: m.sc_restraint_escape_entangled_title,
    description: m.sc_restraint_escape_entangled_desc,
    category: "restraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_ENTANGLED" },
        label: m.sc_restraint_escape_entangled_s0,
        expect: [{ desc: m.sc_chk_entangled, check: isEntangled }]
      },
      {
        event: { type: "ESCAPE_ATTEMPT", rollResult: er(1) },
        label: m.sc_restraint_escape_entangled_s1,
        expect: [
          { desc: m.sc_chk_free, check: (s: SavageSnapshot) => !isRestrained(s) },
          { desc: m.sc_chk_not_vulnerable, check: (s) => !isVulnerable(s) }
        ]
      }
    ]
  },
  {
    id: "restraint-bound",
    title: m.sc_restraint_bound_title,
    description: m.sc_restraint_bound_desc,
    category: "restraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_BOUND" },
        label: m.sc_restraint_bound_s0,
        expect: [
          { desc: m.sc_chk_bound, check: isBound },
          { desc: m.sc_chk_distracted, check: isDistracted },
          { desc: m.sc_chk_vulnerable, check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "restraint-escape-bound",
    title: m.sc_restraint_escape_bound_title,
    description: m.sc_restraint_escape_bound_desc,
    category: "restraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_BOUND" },
        label: m.sc_restraint_escape_bound_s0,
        expect: [{ desc: m.sc_chk_bound, check: isBound }]
      },
      {
        event: { type: "ESCAPE_ATTEMPT", rollResult: er(1) },
        label: m.sc_restraint_escape_bound_s1,
        expect: [{ desc: m.sc_restraint_escape_bound_s1_e0, check: (s) => isEntangled(s) && !isBound(s) }]
      },
      {
        event: { type: "ESCAPE_ATTEMPT", rollResult: er(1) },
        label: m.sc_restraint_escape_bound_s2,
        expect: [{ desc: m.sc_chk_free, check: (s: SavageSnapshot) => !isRestrained(s) }]
      }
    ]
  },

  // ========================================
  // 1.14 Grapple
  // ========================================
  {
    id: "grapple-grabbed",
    title: m.sc_grapple_grabbed_title,
    description: m.sc_grapple_grabbed_desc,
    category: "grapple",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "GRAPPLE_ATTEMPT", opponent: "opp1", rollResult: gr(1) },
        label: m.sc_grapple_grabbed_s0,
        expect: [
          { desc: m.sc_chk_grabbed, check: isGrabbed },
          { desc: m.sc_chk_vulnerable, check: isVulnerable },
          { desc: m.sc_chk_not_distracted, check: (s) => !isDistracted(s) }
        ]
      }
    ]
  },
  {
    id: "grapple-pinned",
    title: m.sc_grapple_pinned_title,
    description: m.sc_grapple_pinned_desc,
    category: "grapple",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "GRAPPLE_ATTEMPT", opponent: "opp1", rollResult: gr(2) },
        label: m.sc_grapple_pinned_s0,
        expect: [
          { desc: m.sc_chk_pinned, check: isPinned },
          { desc: m.sc_chk_distracted, check: isDistracted },
          { desc: m.sc_chk_vulnerable, check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "grapple-pin-from-grabbed",
    title: m.sc_grapple_pin_from_grabbed_title,
    description: m.sc_grapple_pin_from_grabbed_desc,
    category: "grapple",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "GRAPPLE_ATTEMPT", opponent: "opp1", rollResult: gr(1) },
        label: m.sc_grapple_pin_from_grabbed_s0,
        expect: [{ desc: m.sc_chk_entangled, check: isGrabbed }]
      },
      {
        event: { type: "PIN_ATTEMPT", rollResult: pr(1) },
        label: m.sc_grapple_pin_from_grabbed_s1,
        expect: [{ desc: m.sc_chk_bound, check: isPinned }]
      }
    ]
  },
  {
    id: "grapple-escape",
    title: m.sc_grapple_escape_title,
    description: m.sc_grapple_escape_desc,
    category: "grapple",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "GRAPPLE_ATTEMPT", opponent: "opp1", rollResult: gr(2) },
        label: m.sc_grapple_escape_s0,
        expect: [{ desc: m.sc_chk_bound, check: isPinned }]
      },
      {
        event: { type: "GRAPPLE_ESCAPE", rollResult: ger(1) },
        label: m.sc_grapple_escape_s1,
        expect: [{ desc: m.sc_grapple_escape_s1_e0, check: (s) => isGrabbed(s) && !isPinned(s) }]
      },
      {
        event: { type: "GRAPPLE_ESCAPE", rollResult: ger(1) },
        label: m.sc_grapple_escape_s2,
        expect: [{ desc: m.sc_chk_free, check: (s: SavageSnapshot) => !isGrappled(s) }]
      }
    ]
  },

  // ========================================
  // 1.15 Blinded
  // ========================================
  {
    id: "blinded-levels",
    title: m.sc_blinded_levels_title,
    description: m.sc_blinded_levels_desc,
    category: "blinded",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_BLINDED", severity: bs(2) },
        label: m.sc_blinded_levels_s0,
        expect: [
          { desc: m.sc_chk_blinded, check: isBlinded },
          { desc: m.sc_blinded_levels_s0_e1, check: (s) => !isFullyBlinded(s) },
          { desc: m.sc_blinded_levels_s0_e2, check: (s) => blindedPenalty(s) === -2 }
        ]
      }
    ]
  },
  {
    id: "blinded-recovery",
    title: m.sc_blinded_recovery_title,
    description: m.sc_blinded_recovery_desc,
    category: "blinded",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_BLINDED", severity: bs(4) },
        label: m.sc_blinded_recovery_s0,
        expect: [{ desc: m.sc_chk_fully_blinded, check: isFullyBlinded }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_blinded_recovery_s1,
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(1) },
        label: m.sc_blinded_recovery_s2,
        expect: [
          { desc: m.sc_blinded_recovery_s2_e0, check: (s) => isBlinded(s) && !isFullyBlinded(s) },
          { desc: m.sc_blinded_recovery_s2_e1, check: (s) => blindedPenalty(s) === -2 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_blinded_recovery_s3,
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(1) },
        label: m.sc_blinded_recovery_s4,
        expect: [
          { desc: m.sc_chk_not_blinded, check: (s) => !isBlinded(s) },
          { desc: m.sc_blinded_recovery_s4_e1, check: (s) => blindedPenalty(s) === 0 }
        ]
      }
    ]
  },

  // ========================================
  // 1.16 Afflictions
  // ========================================
  {
    id: "affliction-paralytic",
    title: m.sc_affliction_paralytic_title,
    description: m.sc_affliction_paralytic_desc,
    category: "afflictions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "paralytic", duration: ad(5) },
        label: m.sc_affliction_paralytic_s0,
        expect: [
          { desc: m.sc_affliction_paralytic_s0_e0, check: (s) => afflictionType(s) === "paralytic" },
          { desc: m.sc_affliction_paralytic_s0_e1, check: (s) => s.context.afflictionTimer === 5 }
        ]
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: m.sc_affliction_paralytic_s1,
        expect: [{ desc: m.sc_chk_stunned, check: isStunned }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) },
        label: m.sc_affliction_paralytic_s2,
        expect: [{ desc: m.sc_affliction_paralytic_s2_e0, check: isStunned }]
      }
    ]
  },
  {
    id: "affliction-weak",
    title: m.sc_affliction_weak_title,
    description: m.sc_affliction_weak_desc,
    category: "afflictions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "weak", duration: ad(5) },
        label: m.sc_affliction_weak_s0,
        expect: [
          { desc: m.sc_affliction_weak_s0_e0, check: (s) => afflictionType(s) === "weak" },
          { desc: m.sc_chk_fatigued, check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }
        ]
      }
    ]
  },
  {
    id: "affliction-lethal",
    title: m.sc_affliction_lethal_title,
    description: m.sc_affliction_lethal_desc,
    category: "afflictions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "lethal", duration: ad(1) },
        label: m.sc_affliction_lethal_s0,
        expect: [
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_wounds_1, check: (s) => s.context.wounds === 1 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_affliction_lethal_s1,
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_affliction_lethal_s2,
        expect: [{ desc: m.sc_affliction_lethal_s2_e0, check: (s) => s.context.afflictionTimer === 0 }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_affliction_lethal_s3,
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_affliction_lethal_s4,
        expect: [{ desc: m.sc_chk_dead, check: isDead }]
      }
    ]
  },
  {
    id: "affliction-sleep",
    title: m.sc_affliction_sleep_title,
    description: m.sc_affliction_sleep_desc,
    category: "afflictions",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_affliction_sleep_s0,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      },
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "sleep", duration: ad(3) },
        label: m.sc_affliction_sleep_s1,
        expect: [{ desc: m.sc_affliction_sleep_s1_e0, check: (s) => afflictionType(s) === "sleep" }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: m.sc_affliction_sleep_s2,
        expect: [{ desc: m.sc_affliction_sleep_s2_e0, check: isShaken }]
      }
    ]
  },

  // ========================================
  // 1.17 Power effects
  // ========================================
  {
    id: "power-apply-dismiss",
    title: m.sc_power_apply_dismiss_title,
    description: m.sc_power_apply_dismiss_desc,
    category: "powers",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_POWER_EFFECT", etype: "armor", duration: 3 },
        label: m.sc_power_apply_dismiss_s0,
        expect: [
          { desc: m.sc_power_apply_dismiss_s0_e0, check: (s) => hasEffect(s, "armor") },
          { desc: m.sc_power_apply_dismiss_s0_e1, check: (s) => activeEffectsList(s).length === 1 }
        ]
      },
      {
        event: { type: "DISMISS_EFFECT", etype: "armor" },
        label: m.sc_power_apply_dismiss_s1,
        expect: [
          { desc: m.sc_power_apply_dismiss_s1_e0, check: (s) => !hasEffect(s, "armor") },
          { desc: m.sc_power_apply_dismiss_s1_e1, check: (s) => activeEffectsList(s).length === 0 }
        ]
      }
    ]
  },
  {
    id: "power-backlash",
    title: m.sc_power_backlash_title,
    description: m.sc_power_backlash_desc,
    category: "powers",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_POWER_EFFECT", etype: "armor", duration: 3 },
        label: m.sc_power_backlash_s0,
        expect: [{ desc: m.sc_power_backlash_s0_e0, check: (s) => activeEffectsList(s).length === 1 }]
      },
      {
        event: { type: "APPLY_POWER_EFFECT", etype: "boost", duration: 2 },
        label: m.sc_power_backlash_s1,
        expect: [{ desc: m.sc_power_backlash_s1_e0, check: (s) => activeEffectsList(s).length === 2 }]
      },
      {
        event: { type: "BACKLASH" },
        label: m.sc_power_backlash_s2,
        expect: [
          { desc: m.sc_power_backlash_s2_e0, check: (s) => activeEffectsList(s).length === 0 },
          { desc: m.sc_chk_fatigued, check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }
        ]
      }
    ]
  },

  // ========================================
  // 1.18 Full defense
  // ========================================
  {
    id: "defense-basic",
    title: m.sc_defense_basic_title,
    description: m.sc_defense_basic_desc,
    category: "defense",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_defense_basic_s0,
        expect: [{ desc: m.sc_chk_acting, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }]
      },
      {
        event: { type: "DEFEND" },
        label: m.sc_defense_basic_s1,
        expect: [{ desc: m.sc_chk_defending, check: isDefending }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_defense_basic_s2,
        expect: [{ desc: m.sc_chk_still_defending, check: isDefending }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_defense_basic_s3,
        expect: [{ desc: m.sc_chk_not_defending, check: (s) => !isDefending(s) }]
      }
    ]
  },

  // ========================================
  // 1.19 Fear table (wrapped in machine events)
  // ========================================
  {
    id: "fear-distracted",
    title: m.sc_fear_distracted_title,
    description: m.sc_fear_distracted_desc,
    category: "fear",
    characterType: "wildCard",
    steps: [
      {
        event: null,
        label: m.sc_fear_distracted_s0,
        expect: []
      },
      {
        event: { type: "APPLY_DISTRACTED" },
        label: m.sc_fear_distracted_s1,
        expect: [{ desc: m.sc_chk_distracted, check: isDistracted }]
      }
    ]
  },
  {
    id: "fear-stunned-cascade",
    title: m.sc_fear_stunned_cascade_title,
    description: m.sc_fear_stunned_cascade_desc,
    category: "fear",
    characterType: "wildCard",
    steps: [
      {
        event: null,
        label: m.sc_fear_stunned_cascade_s0,
        expect: []
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: m.sc_fear_stunned_cascade_s1,
        expect: [
          { desc: m.sc_chk_stunned, check: isStunned },
          { desc: m.sc_chk_prone, check: isProne },
          { desc: m.sc_chk_distracted, check: isDistracted },
          { desc: m.sc_chk_vulnerable, check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "fear-shaken",
    title: m.sc_fear_shaken_title,
    description: m.sc_fear_shaken_desc,
    category: "fear",
    characterType: "wildCard",
    steps: [
      {
        event: null,
        label: m.sc_fear_shaken_s0,
        expect: []
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_fear_shaken_s1,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      }
    ]
  },

  // ========================================
  // 2.1 — Full combat round
  // ========================================
  {
    id: "cross-full-round",
    title: m.sc_cross_full_round_title,
    description: m.sc_cross_full_round_desc,
    category: "crossCombat",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_full_round_s0,
        expect: [
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_wounds_0, check: (s) => s.context.wounds === 0 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: m.sc_cross_full_round_s1,
        expect: [
          { desc: m.sc_chk_not_shaken, check: (s) => !isShaken(s) },
          { desc: m.sc_chk_acting, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_cross_full_round_s2,
        expect: [{ desc: m.sc_chk_idle, check: (s) => s.matches({ alive: { turnPhase: "idle" } }) }]
      }
    ]
  },

  // ========================================
  // 2.2 — Stunned + Shaken: both recoveries succeed
  // ========================================
  {
    id: "cross-stun-shaken-both-ok",
    title: m.sc_cross_stun_shaken_both_ok_title,
    description: m.sc_cross_stun_shaken_both_ok_desc,
    category: "crossRecovery",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_stun_shaken_both_ok_s0,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: m.sc_cross_stun_shaken_both_ok_s1,
        expect: [
          { desc: m.sc_chk_stunned, check: isStunned },
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_prone, check: isProne }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(1) },
        label: m.sc_cross_stun_shaken_both_ok_s2,
        expect: [
          { desc: m.sc_chk_not_stunned, check: (s) => !isStunned(s) },
          { desc: m.sc_chk_not_shaken, check: (s) => !isShaken(s) },
          { desc: m.sc_chk_vulnerable_after_stun, check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "cross-stun-shaken-vigor-ok-spirit-fail",
    title: m.sc_cross_stun_shaken_vigor_ok_spirit_fail_title,
    description: m.sc_cross_stun_shaken_vigor_ok_spirit_fail_desc,
    category: "crossRecovery",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_stun_shaken_vigor_ok_spirit_fail_s0,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: m.sc_cross_stun_shaken_vigor_ok_spirit_fail_s1,
        expect: [{ desc: m.sc_chk_stunned, check: isStunned }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) },
        label: m.sc_cross_stun_shaken_vigor_ok_spirit_fail_s2,
        expect: [
          { desc: m.sc_chk_not_stunned, check: (s) => !isStunned(s) },
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_vulnerable, check: isVulnerable }
        ]
      }
    ]
  },
  {
    id: "cross-stun-shaken-vigor-fail",
    title: m.sc_cross_stun_shaken_vigor_fail_title,
    description: m.sc_cross_stun_shaken_vigor_fail_desc,
    category: "crossRecovery",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_stun_shaken_vigor_fail_s0,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: m.sc_cross_stun_shaken_vigor_fail_s1,
        expect: [{ desc: m.sc_chk_stunned, check: isStunned }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: m.sc_cross_stun_shaken_vigor_fail_s2,
        expect: [
          { desc: m.sc_chk_stunned, check: isStunned },
          { desc: m.sc_chk_shaken, check: isShaken }
        ]
      }
    ]
  },

  // ========================================
  // 2.3 — Shaken breaks Hold
  // ========================================
  {
    id: "cross-hold-broken-by-damage",
    title: m.sc_cross_hold_broken_by_damage_title,
    description: m.sc_cross_hold_broken_by_damage_desc,
    category: "crossHold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_hold_broken_by_damage_s0,
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: m.sc_cross_hold_broken_by_damage_s1,
        expect: [{ desc: m.sc_chk_on_hold, check: isOnHold }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_hold_broken_by_damage_s2,
        expect: [
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_not_on_hold, check: (s) => !isOnHold(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.4 — Vulnerability persists while Entangled
  // ========================================
  {
    id: "cross-entangled-persistent-vulnerable",
    title: m.sc_cross_entangled_persistent_vulnerable_title,
    description: m.sc_cross_entangled_persistent_vulnerable_desc,
    category: "crossRestraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_ENTANGLED" },
        label: m.sc_cross_entangled_persistent_vulnerable_s0,
        expect: [
          { desc: m.sc_chk_entangled, check: isEntangled },
          { desc: m.sc_chk_vulnerable, check: isVulnerable },
          { desc: m.sc_chk_vulnerable_timer_99, check: (s) => s.context.vulnerableTimer === 99 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_entangled_persistent_vulnerable_s1,
        expect: [{ desc: m.sc_chk_vulnerable, check: isVulnerable }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_cross_entangled_persistent_vulnerable_s2,
        expect: [
          { desc: m.sc_chk_vulnerable, check: isVulnerable },
          { desc: m.sc_chk_vulnerable_timer_99_frozen, check: (s) => s.context.vulnerableTimer === 99 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_entangled_persistent_vulnerable_s3,
        expect: [{ desc: m.sc_chk_vulnerable, check: isVulnerable }]
      },
      {
        event: { type: "ESCAPE_ATTEMPT", rollResult: er(1) },
        label: m.sc_cross_entangled_persistent_vulnerable_s4,
        expect: [
          { desc: m.sc_chk_free, check: (s) => !isRestrained(s) },
          { desc: m.sc_chk_not_vulnerable, check: (s) => !isVulnerable(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.5 — Bound freezes timers
  // ========================================
  {
    id: "cross-bound-freezes-timers",
    title: m.sc_cross_bound_freezes_timers_title,
    description: m.sc_cross_bound_freezes_timers_desc,
    category: "crossRestraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_bound_freezes_timers_s0,
        expect: []
      },
      {
        event: { type: "APPLY_DISTRACTED" },
        label: m.sc_cross_bound_freezes_timers_s1,
        expect: [
          { desc: m.sc_chk_distracted, check: isDistracted },
          { desc: m.sc_chk_distracted_timer_1, check: (s) => s.context.distractedTimer === 1 }
        ]
      },
      {
        event: { type: "APPLY_BOUND" },
        label: m.sc_cross_bound_freezes_timers_s2,
        expect: [
          { desc: m.sc_chk_bound, check: isBound },
          { desc: m.sc_chk_distracted, check: isDistracted }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_cross_bound_freezes_timers_s3,
        expect: [
          { desc: m.sc_chk_distracted_timer_1_frozen, check: (s) => s.context.distractedTimer === 1 },
          { desc: m.sc_chk_distracted, check: isDistracted }
        ]
      }
    ]
  },

  // ========================================
  // 2.6 — Grapple → Pin → Bound
  // ========================================
  {
    id: "cross-grapple-to-bound",
    title: m.sc_cross_grapple_to_bound_title,
    description: m.sc_cross_grapple_to_bound_desc,
    category: "crossRestraint",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "GRAPPLE_ATTEMPT", opponent: "opp1", rollResult: gr(1) },
        label: m.sc_cross_grapple_to_bound_s0,
        expect: [
          { desc: m.sc_chk_grabbed_label, check: isGrabbed },
          { desc: m.sc_chk_grappled_by_opp1, check: (s) => s.context.grappledBy === "opp1" }
        ]
      },
      {
        event: { type: "PIN_ATTEMPT", rollResult: pr(1) },
        label: m.sc_cross_grapple_to_bound_s1,
        expect: [
          { desc: m.sc_chk_pinned_label, check: isPinned },
          { desc: m.sc_chk_grappled_by_opp1, check: (s) => s.context.grappledBy === "opp1" }
        ]
      },
      {
        event: { type: "APPLY_BOUND" },
        label: m.sc_cross_grapple_to_bound_s2,
        expect: [
          { desc: m.sc_chk_bound_label, check: isBound },
          { desc: m.sc_chk_grappled_by_empty, check: (s) => s.context.grappledBy === "" },
          { desc: m.sc_chk_distracted, check: isDistracted },
          { desc: m.sc_chk_vulnerable, check: isVulnerable }
        ]
      }
    ]
  },

  // ========================================
  // 2.7 — Lethal affliction + existing wounds
  // ========================================
  {
    id: "cross-lethal-plus-wounds",
    title: m.sc_cross_lethal_plus_wounds_title,
    description: m.sc_cross_lethal_plus_wounds_desc,
    category: "crossAffliction",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_lethal_plus_wounds_s0,
        expect: [
          { desc: m.sc_chk_wounds_3, check: (s) => s.context.wounds === 3 },
          { desc: m.sc_chk_shaken, check: isShaken }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: m.sc_cross_lethal_plus_wounds_s1,
        expect: [{ desc: m.sc_chk_not_shaken, check: (s) => !isShaken(s) }]
      },
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "lethal", duration: ad(3) },
        label: m.sc_cross_lethal_plus_wounds_s2,
        expect: [
          {
            desc: m.sc_chk_bleeding_out,
            check: isBleedingOut
          }
        ]
      }
    ]
  },

  // ========================================
  // 2.8 — Sleep blocks blinded recovery
  // ========================================
  {
    id: "cross-sleep-blocks-blinded",
    title: m.sc_cross_sleep_blocks_blinded_title,
    description: m.sc_cross_sleep_blocks_blinded_desc,
    category: "crossAffliction",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_AFFLICTION", afflictionType: "sleep", duration: ad(5) },
        label: m.sc_cross_sleep_blocks_blinded_s0,
        expect: [{ desc: m.sc_chk_affliction_sleep, check: (s) => afflictionType(s) === "sleep" }]
      },
      {
        event: { type: "APPLY_BLINDED", severity: bs(4) },
        label: m.sc_cross_sleep_blocks_blinded_s1,
        expect: [{ desc: m.sc_chk_fully_blinded, check: isFullyBlinded }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_sleep_blocks_blinded_s2,
        expect: []
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(2) },
        label: m.sc_cross_sleep_blocks_blinded_s3,
        expect: [{ desc: m.sc_chk_fully_blinded_no_change, check: isFullyBlinded }]
      }
    ]
  },

  // ========================================
  // 2.9 — Fatigue incap clears restraints and blindness
  // ========================================
  {
    id: "cross-fatigue-incap-clears-all",
    title: m.sc_cross_fatigue_incap_clears_all_title,
    description: m.sc_cross_fatigue_incap_clears_all_desc,
    category: "crossAffliction",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_ENTANGLED" },
        label: m.sc_cross_fatigue_incap_clears_all_s0,
        expect: [{ desc: m.sc_chk_entangled, check: isEntangled }]
      },
      {
        event: { type: "APPLY_BLINDED", severity: bs(4) },
        label: m.sc_cross_fatigue_incap_clears_all_s1,
        expect: [{ desc: m.sc_chk_fully_blinded, check: isFullyBlinded }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: m.sc_cross_fatigue_incap_clears_all_s2,
        expect: [{ desc: m.sc_chk_fatigued, check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: m.sc_cross_fatigue_incap_clears_all_s3,
        expect: [{ desc: m.sc_chk_exhausted, check: (s) => s.matches({ alive: { fatigueTrack: "exhausted" } }) }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: m.sc_cross_fatigue_incap_clears_all_s4,
        expect: [
          { desc: m.sc_chk_incap_by_fatigue, check: (s) => s.matches({ alive: { fatigueTrack: "incapByFatigue" } }) },
          { desc: m.sc_chk_not_entangled, check: (s) => !isEntangled(s) },
          { desc: m.sc_chk_not_blinded, check: (s) => !isBlinded(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.10 — Stunned breaks Full Defense
  // ========================================
  {
    id: "cross-stun-breaks-defense",
    title: m.sc_cross_stun_breaks_defense_title,
    description: m.sc_cross_stun_breaks_defense_desc,
    category: "crossDefense",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_stun_breaks_defense_s0,
        expect: [{ desc: m.sc_chk_acting, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }]
      },
      {
        event: { type: "DEFEND" },
        label: m.sc_cross_stun_breaks_defense_s1,
        expect: [{ desc: m.sc_chk_defending, check: isDefending }]
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: m.sc_cross_stun_breaks_defense_s2,
        expect: [
          { desc: m.sc_chk_stunned, check: isStunned },
          { desc: m.sc_chk_not_defending, check: (s) => !isDefending(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.11 — Progressive damage to incap
  // ========================================
  {
    id: "cross-progressive-damage",
    title: m.sc_cross_progressive_damage_title,
    description: m.sc_cross_progressive_damage_desc,
    category: "crossCombat",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(4), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_progressive_damage_s0,
        expect: [
          { desc: m.sc_chk_wounds_1, check: (s) => s.context.wounds === 1 },
          { desc: m.sc_chk_shaken, check: isShaken }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(1) },
        label: m.sc_cross_progressive_damage_s1,
        expect: [{ desc: m.sc_chk_not_shaken, check: (s) => !isShaken(s) }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_cross_progressive_damage_s2,
        expect: []
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(5), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_progressive_damage_s3,
        expect: [
          { desc: m.sc_chk_wounds_2, check: (s) => s.context.wounds === 2 },
          { desc: m.sc_chk_shaken, check: isShaken }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_progressive_damage_s4,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(8), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_progressive_damage_s5,
        expect: [
          {
            desc: m.sc_chk_bleeding_out,
            check: isBleedingOut
          }
        ]
      }
    ]
  },

  // ========================================
  // 2.12 — Healing returns from incap
  // ========================================
  {
    id: "cross-heal-from-incap",
    title: m.sc_cross_heal_from_incap_title,
    description: m.sc_cross_heal_from_incap_desc,
    category: "crossHealing",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_heal_from_incap_s0,
        expect: [{ desc: m.sc_chk_wounds_3, check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_heal_from_incap_s1,
        expect: [
          {
            desc: m.sc_chk_bleeding_out,
            check: isBleedingOut
          }
        ]
      },
      {
        event: { type: "HEAL", amount: ha(1) },
        label: m.sc_cross_heal_from_incap_s2,
        expect: [
          { desc: m.sc_chk_wounds_2, check: (s) => s.context.wounds === 2 },
          { desc: m.sc_chk_back_in_fight, check: (s) => s.matches({ alive: { damageTrack: "active" } }) }
        ]
      },
      {
        event: { type: "HEAL", amount: ha(2) },
        label: m.sc_cross_heal_from_incap_s3,
        expect: [
          { desc: m.sc_chk_wounds_0, check: (s) => s.context.wounds === 0 },
          { desc: m.sc_chk_fully_healed, check: (s) => !isShaken(s) && s.context.wounds === 0 }
        ]
      }
    ]
  },

  // ========================================
  // 2.13 — Hold persists across rounds
  // ========================================
  {
    id: "cross-hold-persists-rounds",
    title: m.sc_cross_hold_persists_rounds_title,
    description: m.sc_cross_hold_persists_rounds_desc,
    category: "crossHold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_hold_persists_rounds_s0,
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: m.sc_cross_hold_persists_rounds_s1,
        expect: [{ desc: m.sc_chk_on_hold, check: isOnHold }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_cross_hold_persists_rounds_s2,
        expect: [{ desc: m.sc_chk_on_hold_context, check: (s) => s.context.onHold }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_hold_persists_rounds_s3,
        expect: [{ desc: m.sc_chk_on_hold, check: isOnHold }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_cross_hold_persists_rounds_s4,
        expect: [{ desc: m.sc_chk_on_hold_context, check: (s) => s.context.onHold }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_hold_persists_rounds_s5,
        expect: [{ desc: m.sc_chk_on_hold, check: isOnHold }]
      },
      {
        event: { type: "ACT_FROM_HOLD" },
        label: m.sc_cross_hold_persists_rounds_s6,
        expect: [
          { desc: m.sc_chk_acting, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) },
          { desc: m.sc_chk_not_on_hold, check: (s) => !isOnHold(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.14 — Distracted timer frozen on hold
  // ========================================
  {
    id: "cross-distracted-frozen-on-hold",
    title: m.sc_cross_distracted_frozen_on_hold_title,
    description: m.sc_cross_distracted_frozen_on_hold_desc,
    category: "crossHold",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_DISTRACTED" },
        label: m.sc_cross_distracted_frozen_on_hold_s0,
        expect: [
          { desc: m.sc_chk_distracted, check: isDistracted },
          { desc: m.sc_chk_distracted_timer_0, check: (s) => s.context.distractedTimer === 0 }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_distracted_frozen_on_hold_s1,
        expect: []
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: m.sc_cross_distracted_frozen_on_hold_s2,
        expect: [{ desc: m.sc_chk_on_hold, check: isOnHold }]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_cross_distracted_frozen_on_hold_s3,
        expect: [
          { desc: m.sc_chk_distracted, check: isDistracted },
          { desc: m.sc_chk_distracted_timer_0_frozen, check: (s) => s.context.distractedTimer === 0 }
        ]
      }
    ]
  },

  // ========================================
  // 2.16 — Backlash chain
  // ========================================
  {
    id: "cross-backlash-chain",
    title: m.sc_cross_backlash_chain_title,
    description: m.sc_cross_backlash_chain_desc,
    category: "crossAffliction",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "APPLY_POWER_EFFECT", etype: "armor", duration: 3 },
        label: m.sc_cross_backlash_chain_s0,
        expect: [{ desc: m.sc_chk_effects_1, check: (s) => activeEffectsList(s).length === 1 }]
      },
      {
        event: { type: "APPLY_POWER_EFFECT", etype: "boost", duration: 2 },
        label: m.sc_cross_backlash_chain_s1,
        expect: [{ desc: m.sc_chk_effects_2, check: (s) => activeEffectsList(s).length === 2 }]
      },
      {
        event: { type: "APPLY_FATIGUE" },
        label: m.sc_cross_backlash_chain_s2,
        expect: [{ desc: m.sc_chk_fatigued, check: (s) => s.matches({ alive: { fatigueTrack: "fatigued" } }) }]
      },
      {
        event: { type: "BACKLASH" },
        label: m.sc_cross_backlash_chain_s3,
        expect: [
          { desc: m.sc_chk_effects_0, check: (s) => activeEffectsList(s).length === 0 },
          { desc: m.sc_chk_exhausted, check: (s) => s.matches({ alive: { fatigueTrack: "exhausted" } }) }
        ]
      }
    ]
  },

  // ========================================
  // 2.17 — Fear → Stun cascade
  // ========================================
  {
    id: "cross-fear-stun-cascade",
    title: m.sc_cross_fear_stun_cascade_title,
    description: m.sc_cross_fear_stun_cascade_desc,
    category: "crossFear",
    characterType: "wildCard",
    steps: [
      {
        event: null,
        label: m.sc_cross_fear_stun_cascade_s0,
        expect: []
      },
      {
        event: { type: "APPLY_STUNNED" },
        label: m.sc_cross_fear_stun_cascade_s1,
        expect: [
          { desc: m.sc_chk_stunned, check: isStunned },
          { desc: m.sc_chk_prone, check: isProne },
          { desc: m.sc_chk_distracted, check: isDistracted },
          { desc: m.sc_chk_vulnerable, check: isVulnerable }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) },
        label: m.sc_cross_fear_stun_cascade_s2,
        expect: [
          { desc: m.sc_chk_not_stunned, check: (s) => !isStunned(s) },
          { desc: m.sc_chk_prone_must_stand, check: isProne },
          { desc: m.sc_chk_vulnerable_after_stun, check: isVulnerable }
        ]
      }
    ]
  },

  // ========================================
  // 2.18 — Wild Card survives heavy hit
  // ========================================
  {
    id: "cross-wc-survives-heavy-hit",
    title: m.sc_cross_wc_survives_heavy_hit_title,
    description: m.sc_cross_wc_survives_heavy_hit_desc,
    category: "crossCombat",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(8), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_wc_survives_heavy_hit_s0,
        expect: [
          { desc: m.sc_chk_alive, check: (s) => !isDead(s) },
          { desc: m.sc_chk_shaken, check: isShaken },
          { desc: m.sc_chk_wounds_2, check: (s) => s.context.wounds === 2 }
        ]
      }
    ]
  },

  // ========================================
  // 2.19 — Death race
  // ========================================
  {
    id: "cross-death-race",
    title: m.sc_cross_death_race_title,
    description: m.sc_cross_death_race_desc,
    category: "crossDeath",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(12), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_death_race_s0,
        expect: [{ desc: m.sc_chk_wounds_3, check: (s) => s.context.wounds === 3 }]
      },
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_death_race_s1,
        expect: [
          {
            desc: m.sc_chk_bleeding_out,
            check: isBleedingOut
          }
        ]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(1), spiritRoll: sr(0) },
        label: m.sc_cross_death_race_s2,
        expect: [
          {
            desc: m.sc_chk_still_bleeding_out,
            check: isBleedingOut
          },
          { desc: m.sc_chk_alive, check: (s) => !isDead(s) }
        ]
      },
      {
        event: { type: "END_OF_TURN", vigorRoll: vr(0) },
        label: m.sc_cross_death_race_s3,
        expect: []
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(2), spiritRoll: sr(0) },
        label: m.sc_cross_death_race_s4,
        expect: [
          { desc: m.sc_chk_stable, check: isIncapStable },
          { desc: m.sc_chk_alive, check: (s) => !isDead(s) }
        ]
      }
    ]
  },

  // ========================================
  // 2.20 — Defense restrictions
  // ========================================
  {
    id: "cross-defense-blocked-shaken",
    title: m.sc_cross_defense_blocked_shaken_title,
    description: m.sc_cross_defense_blocked_shaken_desc,
    category: "crossDefense",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "TAKE_DAMAGE", margin: dm(0), soakSuccesses: sk(0), incapRoll: ir(0) },
        label: m.sc_cross_defense_blocked_shaken_s0,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      },
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_defense_blocked_shaken_s1,
        expect: [{ desc: m.sc_chk_shaken, check: isShaken }]
      },
      {
        event: { type: "DEFEND" },
        label: m.sc_cross_defense_blocked_shaken_s2,
        expect: [{ desc: m.sc_chk_not_defending, check: (s) => !isDefending(s) }]
      }
    ]
  },
  {
    id: "cross-defense-blocked-hold",
    title: m.sc_cross_defense_blocked_hold_title,
    description: m.sc_cross_defense_blocked_hold_desc,
    category: "crossDefense",
    characterType: "wildCard",
    steps: [
      {
        event: { type: "START_OF_TURN", vigorRoll: vr(0), spiritRoll: sr(0) },
        label: m.sc_cross_defense_blocked_hold_s0,
        expect: [{ desc: m.sc_chk_acting, check: (s) => s.matches({ alive: { turnPhase: "acting" } }) }]
      },
      {
        event: { type: "DEFEND" },
        label: m.sc_cross_defense_blocked_hold_s1,
        expect: [{ desc: m.sc_chk_defending, check: isDefending }]
      },
      {
        event: { type: "GO_ON_HOLD" },
        label: m.sc_cross_defense_blocked_hold_s2,
        expect: [
          { desc: m.sc_chk_not_on_hold, check: (s) => !isOnHold(s) },
          { desc: m.sc_chk_defending, check: isDefending }
        ]
      }
    ]
  }
]
