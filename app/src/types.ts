import { Schema } from "effect"

// ============================================================
// Context field types
// ============================================================

const Wounds = Schema.Literal(0, 1, 2, 3).pipe(Schema.brand("Wounds"))
type Wounds = typeof Wounds.Type
export function wounds(n: number): Wounds {
  return Wounds.make(Math.max(0, Math.min(3, Math.floor(n))) as 0 | 1 | 2 | 3)
}

// 99 = persistent sentinel ("until freed", e.g., entangled → vulnerable)
const ConditionTimer = Schema.Literal(-1, 0, 1, 99).pipe(Schema.brand("ConditionTimer"))
type ConditionTimer = typeof ConditionTimer.Type
export function conditionTimer(n: number): ConditionTimer {
  if (n >= 99) return ConditionTimer.make(99)
  return ConditionTimer.make(Math.max(-1, Math.min(1, Math.floor(n))) as -1 | 0 | 1)
}

const MaxWounds = Schema.Literal(1, 3).pipe(Schema.brand("MaxWounds"))
type MaxWounds = typeof MaxWounds.Type
export function maxWounds(n: number): MaxWounds {
  return MaxWounds.make((n >= 3 ? 3 : 1) as 1 | 3)
}

const CharacterId = Schema.String.pipe(Schema.brand("CharacterId"))
type CharacterId = typeof CharacterId.Type
export function characterId(s: string): CharacterId {
  return CharacterId.make(s)
}

// ============================================================
// Event payload types
// ============================================================

const DamageMargin = Schema.Number.pipe(Schema.brand("DamageMargin"))
type DamageMargin = typeof DamageMargin.Type
export function damageMargin(n: number): DamageMargin {
  return DamageMargin.make(Math.max(0, Math.min(15, Math.floor(n))))
}

const SoakSuccesses = Schema.Number.pipe(Schema.brand("SoakSuccesses"))
type SoakSuccesses = typeof SoakSuccesses.Type
export function soakSuccesses(n: number): SoakSuccesses {
  return SoakSuccesses.make(Math.max(0, Math.min(4, Math.floor(n))))
}

const IncapRollResult = Schema.Literal(-1, 0, 1).pipe(Schema.brand("IncapRollResult"))
type IncapRollResult = typeof IncapRollResult.Type
export function incapRollResult(n: number): IncapRollResult {
  return IncapRollResult.make(Math.max(-1, Math.min(1, Math.floor(n))) as -1 | 0 | 1)
}

const InjuryRoll = Schema.Number.pipe(Schema.brand("InjuryRoll"))
type InjuryRoll = typeof InjuryRoll.Type
export function injuryRoll(n: number): InjuryRoll {
  return InjuryRoll.make(n)
}

const VigorRollResult = Schema.Literal(0, 1, 2).pipe(Schema.brand("VigorRollResult"))
type VigorRollResult = typeof VigorRollResult.Type
export function vigorRollResult(n: number): VigorRollResult {
  return VigorRollResult.make(Math.max(0, Math.min(2, Math.floor(n))) as 0 | 1 | 2)
}

const SpiritRollResult = Schema.Literal(0, 1).pipe(Schema.brand("SpiritRollResult"))
type SpiritRollResult = typeof SpiritRollResult.Type
export function spiritRollResult(n: number): SpiritRollResult {
  return SpiritRollResult.make(Math.max(0, Math.min(1, Math.floor(n))) as 0 | 1)
}

const HealAmount = Schema.Literal(1, 2, 3).pipe(Schema.brand("HealAmount"))
type HealAmount = typeof HealAmount.Type
export function healAmount(n: number): HealAmount {
  return HealAmount.make(Math.max(1, Math.min(3, Math.floor(n))) as 1 | 2 | 3)
}

const AthleticsRollResult = Schema.Literal(0, 1).pipe(Schema.brand("AthleticsRollResult"))
type AthleticsRollResult = typeof AthleticsRollResult.Type
export function athleticsRollResult(n: number): AthleticsRollResult {
  return AthleticsRollResult.make(Math.max(0, Math.min(1, Math.floor(n))) as 0 | 1)
}

const EscapeRollResult = Schema.Literal(0, 1, 2).pipe(Schema.brand("EscapeRollResult"))
type EscapeRollResult = typeof EscapeRollResult.Type
export function escapeRollResult(n: number): EscapeRollResult {
  return EscapeRollResult.make(Math.max(0, Math.min(2, Math.floor(n))) as 0 | 1 | 2)
}

const GrappleRollResult = Schema.Literal(0, 1, 2).pipe(Schema.brand("GrappleRollResult"))
type GrappleRollResult = typeof GrappleRollResult.Type
export function grappleRollResult(n: number): GrappleRollResult {
  return GrappleRollResult.make(Math.max(0, Math.min(2, Math.floor(n))) as 0 | 1 | 2)
}

const GrappleEscapeRollResult = Schema.Literal(0, 1, 2).pipe(Schema.brand("GrappleEscapeRollResult"))
type GrappleEscapeRollResult = typeof GrappleEscapeRollResult.Type
export function grappleEscapeRollResult(n: number): GrappleEscapeRollResult {
  return GrappleEscapeRollResult.make(Math.max(0, Math.min(2, Math.floor(n))) as 0 | 1 | 2)
}

const PinRollResult = Schema.Literal(0, 1).pipe(Schema.brand("PinRollResult"))
type PinRollResult = typeof PinRollResult.Type
export function pinRollResult(n: number): PinRollResult {
  return PinRollResult.make(Math.max(0, Math.min(1, Math.floor(n))) as 0 | 1)
}

const BlindedSeverity = Schema.Literal(2, 4).pipe(Schema.brand("BlindedSeverity"))
type BlindedSeverity = typeof BlindedSeverity.Type
export function blindedSeverity(n: number): BlindedSeverity {
  return BlindedSeverity.make((n >= 4 ? 4 : 2) as 2 | 4)
}

const AfflictionDuration = Schema.Number.pipe(Schema.brand("AfflictionDuration"))
type AfflictionDuration = typeof AfflictionDuration.Type
export function afflictionDuration(n: number): AfflictionDuration {
  return AfflictionDuration.make(Math.max(0, Math.floor(n)))
}

// ============================================================
// Other types
// ============================================================

export type AfflictionType = "paralytic" | "weak" | "lethal" | "sleep"

export type FearResultType =
  | "ADRENALINE"
  | "APPLY_DISTRACTED"
  | "APPLY_VULNERABLE"
  | "APPLY_SHAKEN"
  | "APPLY_STUNNED"
  | "HINDRANCE_SCAR"
  | "HINDRANCE_SLOWNESS"
  | "PANIC_FLEE"
  | "HINDRANCE_MINOR_PHOBIA"
  | "HINDRANCE_MAJOR_PHOBIA"
  | "HEART_ATTACK"

export type {
  AfflictionDuration,
  AthleticsRollResult,
  BlindedSeverity,
  CharacterId,
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
}
