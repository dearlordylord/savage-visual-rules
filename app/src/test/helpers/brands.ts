// Test-only brand factories using direct casts.
// These bypass validation for test convenience — use exact valid values only.
// Import as: import * as B from "./test/helpers/brands"
import type {
  AfflictionDuration,
  AthleticsRollResult,
  BlindedSeverity,
  DamageMargin,
  EscapeRollResult,
  GrappleEscapeRollResult,
  GrappleRollResult,
  HealAmount,
  IncapRollResult,
  InjuryRoll,
  PinRollResult,
  SoakSuccesses,
  SpiritRollResult,
  VigorRollResult
} from "../../types"

export const margin = (n: number) => n as unknown as DamageMargin
export const soak = (n: number) => n as unknown as SoakSuccesses
export const incap = (n: number) => n as unknown as IncapRollResult
export const injury = (n: number) => n as unknown as InjuryRoll
export const vigor = (n: number) => n as unknown as VigorRollResult
export const spirit = (n: number) => n as unknown as SpiritRollResult
export const heal = (n: number) => n as unknown as HealAmount
export const athletics = (n: number) => n as unknown as AthleticsRollResult
export const escape = (n: number) => n as unknown as EscapeRollResult
export const grapple = (n: number) => n as unknown as GrappleRollResult
export const grappleEsc = (n: number) => n as unknown as GrappleEscapeRollResult
export const pin = (n: number) => n as unknown as PinRollResult
export const severity = (n: number) => n as unknown as BlindedSeverity
export const affDur = (n: number) => n as unknown as AfflictionDuration
