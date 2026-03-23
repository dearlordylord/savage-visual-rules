import {
  blindedPenalty,
  isAfflicted,
  isBound,
  isDead,
  isDefending,
  isDistracted,
  isEntangled,
  isGrabbed,
  isOnHold,
  isPinned,
  isProne,
  isShaken,
  isStunned,
  isVulnerable,
  type SavageSnapshot
} from "../machine"
import * as m from "../paraglide/messages"

const STATUS_DATA: Array<{
  key: string
  nameMsg: () => string
  causeMsg: () => string
  effectsMsg: () => string
  removalMsg: () => string
  isActive: (snap: SavageSnapshot) => boolean
  /** Returns true when this status is active only because of stunned (implied), not directly */
  isImplied?: (snap: SavageSnapshot) => boolean
}> = [
  {
    key: "shaken",
    nameMsg: m.status_shaken_name,
    causeMsg: m.status_shaken_cause,
    effectsMsg: m.status_shaken_effects,
    removalMsg: m.status_shaken_removal,
    isActive: isShaken
  },
  {
    key: "stunned",
    nameMsg: m.status_stunned_name,
    causeMsg: m.status_stunned_cause,
    effectsMsg: m.status_stunned_effects,
    removalMsg: m.status_stunned_removal,
    isActive: isStunned
  },
  {
    key: "distracted",
    nameMsg: m.status_distracted_name,
    causeMsg: m.status_distracted_cause,
    effectsMsg: m.status_distracted_effects,
    removalMsg: m.status_distracted_removal,
    isActive: isDistracted,
    isImplied: (snap) => isStunned(snap) && !snap.matches({ alive: { conditionTrack: { distraction: "distracted" } } })
  },
  {
    key: "vulnerable",
    nameMsg: m.status_vulnerable_name,
    causeMsg: m.status_vulnerable_cause,
    effectsMsg: m.status_vulnerable_effects,
    removalMsg: m.status_vulnerable_removal,
    isActive: isVulnerable,
    isImplied: (snap) =>
      isStunned(snap) && !snap.matches({ alive: { conditionTrack: { vulnerability: "vulnerable" } } })
  },
  {
    key: "wounded",
    nameMsg: m.status_wounded_name,
    causeMsg: m.status_wounded_cause,
    effectsMsg: m.status_wounded_effects,
    removalMsg: m.status_wounded_removal,
    isActive: (snap) => snap.context.wounds > 0
  },
  {
    key: "incapacitated",
    nameMsg: m.status_incapacitated_name,
    causeMsg: m.status_incapacitated_cause,
    effectsMsg: m.status_incapacitated_effects,
    removalMsg: m.status_incapacitated_removal,
    isActive: (snap) =>
      snap.matches({ alive: { damageTrack: "incapacitated" } }) ||
      snap.matches({ alive: { fatigueTrack: "incapByFatigue" } })
  },
  {
    key: "fatigued",
    nameMsg: m.status_fatigued_name,
    causeMsg: m.status_fatigued_cause,
    effectsMsg: m.status_fatigued_effects,
    removalMsg: m.status_fatigued_removal,
    isActive: (snap) => snap.matches({ alive: { fatigueTrack: "fatigued" } })
  },
  {
    key: "exhausted",
    nameMsg: m.status_exhausted_name,
    causeMsg: m.status_exhausted_cause,
    effectsMsg: m.status_exhausted_effects,
    removalMsg: m.status_exhausted_removal,
    isActive: (snap) => snap.matches({ alive: { fatigueTrack: "exhausted" } })
  },
  {
    key: "prone",
    nameMsg: m.status_prone_name,
    causeMsg: m.status_prone_cause,
    effectsMsg: m.status_prone_effects,
    removalMsg: m.status_prone_removal,
    isActive: isProne
  },
  {
    key: "on_hold",
    nameMsg: m.status_on_hold_name,
    causeMsg: m.status_on_hold_cause,
    effectsMsg: m.status_on_hold_effects,
    removalMsg: m.status_on_hold_removal,
    isActive: isOnHold
  },
  {
    key: "entangled",
    nameMsg: m.status_entangled_name,
    causeMsg: m.status_entangled_cause,
    effectsMsg: m.status_entangled_effects,
    removalMsg: m.status_entangled_removal,
    isActive: isEntangled
  },
  {
    key: "bound",
    nameMsg: m.status_bound_name,
    causeMsg: m.status_bound_cause,
    effectsMsg: m.status_bound_effects,
    removalMsg: m.status_bound_removal,
    isActive: isBound
  },
  {
    key: "grabbed",
    nameMsg: m.status_grabbed_name,
    causeMsg: m.status_grabbed_cause,
    effectsMsg: m.status_grabbed_effects,
    removalMsg: m.status_grabbed_removal,
    isActive: isGrabbed
  },
  {
    key: "pinned",
    nameMsg: m.status_pinned_name,
    causeMsg: m.status_pinned_cause,
    effectsMsg: m.status_pinned_effects,
    removalMsg: m.status_pinned_removal,
    isActive: isPinned
  },
  {
    key: "blinded",
    nameMsg: m.status_blinded_name,
    causeMsg: m.status_blinded_cause,
    effectsMsg: m.status_blinded_effects,
    removalMsg: m.status_blinded_removal,
    isActive: (snap) => blindedPenalty(snap) !== 0
  },
  {
    key: "affliction",
    nameMsg: m.status_affliction_name,
    causeMsg: m.status_affliction_cause,
    effectsMsg: m.status_affliction_effects,
    removalMsg: m.status_affliction_removal,
    isActive: isAfflicted
  },
  {
    key: "defending",
    nameMsg: m.status_defending_name,
    causeMsg: m.status_defending_cause,
    effectsMsg: m.status_defending_effects,
    removalMsg: m.status_defending_removal,
    isActive: isDefending
  }
]

export function StatusReference({ snapshot }: { snapshot: SavageSnapshot }) {
  const dead = isDead(snapshot)

  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">{m.section_status_reference()}</p>
      <div className="overflow-x-auto text-xs">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[var(--sea-ink-soft)]">
              <th className="pb-2 pr-3">{m.status_col_condition()}</th>
              <th className="pb-2 pr-3">{m.status_col_cause()}</th>
              <th className="pb-2 pr-3">{m.status_col_effects()}</th>
              <th className="pb-2">{m.status_col_removal()}</th>
            </tr>
          </thead>
          <tbody>
            {STATUS_DATA.map((s) => {
              const active = !dead && s.isActive(snapshot)
              const implied = active && s.isImplied?.(snapshot)
              return (
                <tr
                  key={s.key}
                  className={`border-t border-[var(--line)] transition-colors ${
                    active ? (implied ? "bg-[rgba(79,184,178,0.07)]" : "bg-[rgba(79,184,178,0.15)]") : ""
                  }`}
                >
                  <td className="py-2 pr-3 font-semibold whitespace-nowrap">
                    <span className={active ? (implied ? "text-[var(--lagoon)]" : "text-[var(--lagoon-deep)]") : ""}>
                      {s.nameMsg()}
                    </span>
                    {active &&
                      (implied ? (
                        <span className="ml-2 text-[10px] text-[var(--sea-ink-soft)]">{m.status_via_stunned()}</span>
                      ) : (
                        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-[var(--lagoon)]" />
                      ))}
                  </td>
                  <td className="py-2 pr-3">{s.causeMsg()}</td>
                  <td className="py-2 pr-3">{s.effectsMsg()}</td>
                  <td className="py-2">{s.removalMsg()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
