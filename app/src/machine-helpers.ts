// SavageEvent is imported as type-only to avoid circular runtime deps
import type { SavageEvent } from "./machine"
import type { InjuryType } from "./machine-queries"
import type { ConditionTimer, DamageMargin, InjuryRoll, SoakSuccesses } from "./types"
import { conditionTimer } from "./types"

// ============================================================
// Helpers (mirror Quint spec pure functions)
// ============================================================

export function computeDamage(margin: DamageMargin, soakSuccesses: SoakSuccesses, isShaken: boolean) {
  const raises = Math.floor(margin / 4)
  const rawWounds = isShaken ? Math.max(raises, 1) : raises
  const effectiveSoak = rawWounds > 0 ? soakSuccesses : 0
  const actualWounds = Math.max(0, rawWounds - effectiveSoak)
  const allSoaked = actualWounds === 0 && effectiveSoak > 0
  return { raises, rawWounds, effectiveSoak, actualWounds, allSoaked }
}

export function tickTimer(timer: ConditionTimer): ConditionTimer {
  if (timer > 0) return conditionTimer(timer - 1)
  return conditionTimer(-1)
}

// Resolve 2d6 Injury Table roll to InjuryType
// injuryRoll encodes both 2d6 and sub-roll: tableRoll * 10 + subRoll
// e.g., 52 = table roll 5, sub roll 2 → guts_broken
export function resolveInjury(injuryRoll: InjuryRoll): InjuryType {
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

// Type-safe event extractors
export function asDamage(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "TAKE_DAMAGE" }>
}
export function asRecovery(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "START_OF_TURN" }>
}
export function asHeal(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "HEAL" }>
}
export function asInterrupt(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "INTERRUPT" }>
}
export function asEscape(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "ESCAPE_ATTEMPT" }>
}
export function asGrapple(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "GRAPPLE_ATTEMPT" }>
}
export function asGrappleEscape(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "GRAPPLE_ESCAPE" }>
}
export function asPin(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "PIN_ATTEMPT" }>
}
export function asAffliction(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "APPLY_AFFLICTION" }>
}
export function asEndOfTurn(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "END_OF_TURN" }>
}
export function asBlinded(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "APPLY_BLINDED" }>
}
export function asPowerEffect(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "APPLY_POWER_EFFECT" }>
}
export function asDismissEffect(event: SavageEvent) {
  return event as Extract<SavageEvent, { type: "DISMISS_EFFECT" }>
}

// ============================================================
// State path constants
// ============================================================
export const STUNNED_STATE = { alive: { conditionTrack: { stun: "stunned" as const } } }
export const SHAKEN_STATE = { alive: { damageTrack: { active: "shaken" as const } } }
export const IDLE = { alive: { turnPhase: "idle" as const } }
export const DAMAGE_ACTIVE = { alive: { damageTrack: "active" as const } }
export const FATIGUE_INCAP = { alive: { fatigueTrack: "incapByFatigue" as const } }
export const ENTANGLED_STATE = { alive: { restraintTrack: "entangled" as const } }
export const BOUND_STATE = { alive: { restraintTrack: "bound" as const } }
export const GRABBED_STATE = { alive: { restraintTrack: "grabbed" as const } }
export const PINNED_STATE = { alive: { restraintTrack: "pinned" as const } }
export const HOLDING_ACTION = { alive: { turnPhase: "holdingAction" as const } }
export const PARALYTIC_STATE = { alive: { afflictionTrack: { afflicted: "paralytic" as const } } }
export const SLEEP_STATE = { alive: { afflictionTrack: { afflicted: "sleep" as const } } }
export const ACTING = { alive: { turnPhase: "acting" as const } }
export const DEFENDING_STATE = { alive: { conditionTrack: { defense: "defending" as const } } }
