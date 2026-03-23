import type { SnapshotFrom } from "xstate"

import type { savageMachine } from "./machine"
import type { AfflictionType, FearResultType } from "./types"

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

export function isDefending(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { conditionTrack: { defense: "defending" } } })
}

export function isOnHold(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { turnPhase: "holdingAction" } })
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

export function isBleedingOut(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })
}

export function isIncapStable(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { damageTrack: { incapacitated: "stable" } } })
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

export function blindedPenalty(snap: SavageSnapshot): 0 | -2 | -4 {
  if (snap.matches({ alive: { conditionTrack: { vision: "blinded" } } })) return -4
  if (snap.matches({ alive: { conditionTrack: { vision: "impaired" } } })) return -2
  return 0
}

/** Conscious and in the fight: not dead, not incapacitated. Does NOT imply ability to act or move. */
export function isConscious(snap: SavageSnapshot): boolean {
  return (
    snap.matches({ alive: { damageTrack: "active" } }) && !snap.matches({ alive: { fatigueTrack: "incapByFatigue" } })
  )
}

const SLEEP_STATE = { alive: { afflictionTrack: { afflicted: "sleep" as const } } }

export function canAct(snap: SavageSnapshot): boolean {
  return isConscious(snap) && !isShaken(snap) && !isStunned(snap) && !snap.matches(SLEEP_STATE)
}

export function canMove(snap: SavageSnapshot): boolean {
  return isConscious(snap) && !isStunned(snap) && !snap.matches(SLEEP_STATE)
}

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

export function hasInjury(snap: SavageSnapshot, type: InjuryType): boolean {
  return snap.context.injuries.includes(type)
}

export function injuryPenalty(snap: SavageSnapshot): number {
  return snap.context.injuries.filter(
    (i) => i === "guts_broken" || i === "guts_battered" || i === "guts_busted" || i === "head_brain_damage"
  ).length
}

export function isAfflicted(snap: SavageSnapshot): boolean {
  return snap.matches({ alive: { afflictionTrack: "afflicted" } })
}

export function afflictionType(snap: SavageSnapshot): AfflictionType | null {
  if (snap.matches({ alive: { afflictionTrack: { afflicted: "paralytic" } } })) return "paralytic"
  if (snap.matches({ alive: { afflictionTrack: { afflicted: "weak" } } })) return "weak"
  if (snap.matches({ alive: { afflictionTrack: { afflicted: "lethal" } } })) return "lethal"
  if (snap.matches({ alive: { afflictionTrack: { afflicted: "sleep" } } })) return "sleep"
  return null
}

export function hasEffect(snap: SavageSnapshot, etype: string): boolean {
  return snap.context.activeEffects.some((e) => e.etype === etype)
}

export function activeEffectsList(snap: SavageSnapshot): Array<{ etype: string; timer: number }> {
  return snap.context.activeEffects
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

export type FearResult = FearResultType

export function resolveFear(tableRoll: number, modifier: number): Array<FearResult> {
  const total = tableRoll + modifier
  if (total <= 3) return ["ADRENALINE"]
  if (total <= 6) return ["APPLY_DISTRACTED"]
  if (total <= 9) return ["APPLY_VULNERABLE"]
  if (total <= 12) return ["APPLY_SHAKEN"]
  if (total === 13) return ["APPLY_STUNNED", "HINDRANCE_SCAR"]
  if (total <= 15) return ["HINDRANCE_SLOWNESS"]
  if (total <= 17) return ["APPLY_SHAKEN", "PANIC_FLEE"]
  if (total <= 19) return ["HINDRANCE_MINOR_PHOBIA"]
  if (total <= 21) return ["HINDRANCE_MAJOR_PHOBIA"]
  return ["HEART_ATTACK"]
}
