import {
  afflictionType,
  blindedPenalty,
  canAct,
  canMove,
  injuryPenalty,
  type InjuryType,
  isAfflicted,
  isConscious,
  isDefending,
  isDistracted,
  isGrappled,
  isOnHold,
  isProne,
  isRestrained,
  isShaken,
  isStunned,
  isVulnerable,
  type SavageSnapshot,
  totalPenalty
} from "../machine"
import * as m from "../paraglide/messages"
import type { AfflictionType } from "../types"

const AFFLICTION_LABELS: Record<AfflictionType, () => string> = {
  paralytic: m.affliction_paralytic,
  weak: m.affliction_weak,
  lethal: m.affliction_lethal,
  sleep: m.affliction_sleep
}

const INJURY_LABELS: Record<InjuryType, () => string> = {
  unmentionables: m.injury_unmentionables,
  arm: m.injury_arm,
  guts_broken: m.injury_guts_broken,
  guts_battered: m.injury_guts_battered,
  guts_busted: m.injury_guts_busted,
  leg: m.injury_leg,
  head_scar: m.injury_head_scar,
  head_blinded: m.injury_head_blinded,
  head_brain_damage: m.injury_head_brain_damage
}

export function DerivedValues({ snapshot }: { snapshot: SavageSnapshot }) {
  const ctx = snapshot.context
  const currentAfflictionType = afflictionType(snapshot)
  const afflictionLabel = currentAfflictionType ? AFFLICTION_LABELS[currentAfflictionType]() : null

  const items: Array<{ label: string; value: string | boolean; title?: string }> = [
    { label: m.derived_wounds(), value: `${ctx.wounds} / ${ctx.maxWounds}` },
    {
      label: m.derived_penalty(),
      value: totalPenalty(snapshot).toString(),
      title: m.tooltip_penalty()
    },
    { label: m.derived_shaken(), value: isShaken(snapshot) },
    { label: m.derived_stunned(), value: isStunned(snapshot) },
    { label: m.derived_distracted(), value: isDistracted(snapshot) },
    { label: m.derived_vulnerable(), value: isVulnerable(snapshot) },
    { label: m.derived_prone(), value: isProne(snapshot) },
    { label: m.derived_defending(), value: isDefending(snapshot), title: m.tooltip_defending() },
    { label: m.derived_on_hold(), value: isOnHold(snapshot) },
    { label: m.derived_restrained(), value: isRestrained(snapshot) },
    { label: m.derived_grappled(), value: isGrappled(snapshot) },
    {
      label: m.derived_blinded_penalty(),
      value: (-blindedPenalty(snapshot)).toString(),
      title: m.tooltip_blinded_penalty()
    },
    { label: m.derived_can_act(), value: canAct(snapshot) },
    { label: m.derived_can_move(), value: canMove(snapshot) },
    { label: m.derived_conscious(), value: isConscious(snapshot) },
    { label: m.derived_wild_card(), value: ctx.isWildCard },
    { label: m.derived_hardy(), value: ctx.hardy },
    { label: m.derived_afflicted(), value: isAfflicted(snapshot), title: m.tooltip_afflicted() },
    { label: m.derived_injuries(), value: ctx.injuries.length.toString() },
    {
      label: m.derived_injury_penalty(),
      value: injuryPenalty(snapshot).toString(),
      title: m.tooltip_injury_penalty()
    }
  ]

  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">{m.section_derived_values()}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {items.map(({ label, title, value }) => (
          <div key={label} className="flex justify-between" title={title}>
            <span
              className={`text-[var(--sea-ink-soft)] ${title ? "cursor-help underline decoration-dotted underline-offset-2" : ""}`}
            >
              {label}
            </span>
            <span className="font-semibold">
              {typeof value === "boolean" ? (
                <span className={value ? "text-green-600" : "text-[var(--sea-ink-soft)] opacity-50"}>
                  {value ? m.bool_yes() : m.bool_no()}
                </span>
              ) : (
                value
              )}
            </span>
          </div>
        ))}
      </div>
      {isAfflicted(snapshot) && (
        <div className="mt-3 border-t border-[var(--line)] pt-2">
          <p className="mb-1 text-xs font-semibold text-[var(--sea-ink-soft)]">{m.derived_section_affliction()}</p>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-purple-500/15 px-2 py-0.5 text-xs font-medium text-purple-700">
              {afflictionLabel}
            </span>
            <span className="text-xs text-[var(--sea-ink-soft)]">
              {ctx.afflictionTimer >= 0 ? m.derived_affliction_timer({ count: ctx.afflictionTimer }) : ""}
            </span>
          </div>
        </div>
      )}
      {ctx.activeEffects.length > 0 && (
        <div className="mt-3 border-t border-[var(--line)] pt-2">
          <p className="mb-1 text-xs font-semibold text-[var(--sea-ink-soft)]">{m.derived_section_active_effects()}</p>
          <div className="flex flex-wrap gap-1">
            {ctx.activeEffects.map((eff, i) => (
              <span
                key={`${eff.etype}-${i}`}
                className="rounded-md bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-700"
              >
                {eff.etype} ({m.derived_effect_rnd({ count: eff.timer })})
              </span>
            ))}
          </div>
        </div>
      )}
      {ctx.injuries.length > 0 && (
        <div className="mt-3 border-t border-[var(--line)] pt-2">
          <p className="mb-1 text-xs font-semibold text-[var(--sea-ink-soft)]">{m.derived_section_injuries()}</p>
          <div className="flex flex-wrap gap-1">
            {ctx.injuries.map((inj, i) => (
              <span
                key={`${inj}-${i}`}
                className="rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700"
              >
                {INJURY_LABELS[inj]()}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
