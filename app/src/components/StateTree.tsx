import {
  isBound,
  isDead,
  isDefending,
  isEntangled,
  isFullyBlinded,
  isGrabbed,
  isOnHold,
  isPinned,
  isProne,
  isStunned,
  type SavageSnapshot
} from "../machine"
import * as m from "../paraglide/messages"

export function StateTree({ snapshot }: { snapshot: SavageSnapshot }) {
  const dead = isDead(snapshot)

  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">{m.section_state_tree()}</p>
      {dead ? (
        <div className="rounded-lg bg-red-500/20 p-4 text-center text-lg font-bold text-red-700">{m.state_dead()}</div>
      ) : (
        <div className="space-y-3 text-sm">
          <StateRegion title={m.region_damage_track()}>
            <StateNode label={m.state_active()} active={snapshot.matches({ alive: { damageTrack: "active" } })}>
              <StateLeaf
                label={m.state_unshaken()}
                active={snapshot.matches({ alive: { damageTrack: { active: "unshaken" } } })}
              />
              <StateLeaf
                label={
                  snapshot.matches({ alive: { damageTrack: { active: "shaken" } } }) && snapshot.context.wounds > 0
                    ? `${m.state_shaken()} + ${m.state_wounded()} (${snapshot.context.wounds})`
                    : m.state_shaken()
                }
                active={snapshot.matches({ alive: { damageTrack: { active: "shaken" } } })}
              />
              <StateLeaf
                label={m.state_wounded()}
                active={snapshot.matches({ alive: { damageTrack: { active: "wounded" } } })}
              />
            </StateNode>
            <StateNode
              label={m.state_incapacitated()}
              active={snapshot.matches({ alive: { damageTrack: "incapacitated" } })}
            >
              <StateLeaf
                label={m.state_stable()}
                active={snapshot.matches({ alive: { damageTrack: { incapacitated: "stable" } } })}
                title={m.tooltip_stable()}
              />
              <StateLeaf
                label={m.state_bleeding_out()}
                active={snapshot.matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })}
                title={m.tooltip_bleeding_out()}
              />
            </StateNode>
          </StateRegion>

          <StateRegion title={m.region_conditions()}>
            <div className="flex flex-wrap gap-4">
              <StateLeaf label={m.state_stunned()} active={isStunned(snapshot)} />
              <StateLeaf
                label={`${m.state_distracted()} (${snapshot.context.distractedTimer === -1 ? m.state_off() : snapshot.context.distractedTimer + 1})`}
                active={snapshot.matches({ alive: { conditionTrack: { distraction: "distracted" } } })}
              />
              <StateLeaf
                label={`${m.state_vulnerable()} (${snapshot.context.vulnerableTimer === -1 ? m.state_off() : snapshot.context.vulnerableTimer + 1})`}
                active={snapshot.matches({ alive: { conditionTrack: { vulnerability: "vulnerable" } } })}
              />
              <StateLeaf
                label={m.state_impaired()}
                active={snapshot.matches({ alive: { conditionTrack: { vision: "impaired" } } })}
              />
              <StateLeaf label={m.state_blinded()} active={isFullyBlinded(snapshot)} />
              <StateLeaf label={m.state_defending()} active={isDefending(snapshot)} />
            </div>
          </StateRegion>

          <StateRegion title={m.region_fatigue()}>
            <div className="flex gap-3">
              {[
                { key: "fresh" as const, label: m.state_fresh },
                { key: "fatigued" as const, label: m.state_fatigued },
                { key: "exhausted" as const, label: m.state_exhausted },
                { key: "incapByFatigue" as const, label: m.state_incap_by_fatigue }
              ].map((s) => (
                <StateLeaf
                  key={s.key}
                  label={s.label()}
                  active={snapshot.matches({ alive: { fatigueTrack: s.key } })}
                />
              ))}
            </div>
          </StateRegion>

          <StateRegion title={m.region_turn_phase()}>
            <div className="flex gap-3">
              <StateLeaf label={m.state_others_turn()} active={snapshot.matches({ alive: { turnPhase: "idle" } })} />
              <StateLeaf label={m.state_own_turn()} active={snapshot.matches({ alive: { turnPhase: "acting" } })} />
              <StateLeaf label={m.state_on_hold()} active={isOnHold(snapshot)} />
            </div>
          </StateRegion>

          <StateRegion title={m.region_position()}>
            <div className="flex gap-3">
              <StateLeaf
                label={m.state_standing()}
                active={snapshot.matches({ alive: { positionTrack: "standing" } })}
              />
              <StateLeaf label={m.state_prone()} active={isProne(snapshot)} />
            </div>
          </StateRegion>

          <StateRegion title={m.region_restraint()}>
            <div className="flex flex-wrap gap-3">
              <StateLeaf label={m.state_free()} active={snapshot.matches({ alive: { restraintTrack: "free" } })} />
              <StateLeaf label={m.state_entangled()} active={isEntangled(snapshot)} />
              <StateLeaf label={m.state_bound()} active={isBound(snapshot)} />
              <StateLeaf label={m.state_grabbed()} active={isGrabbed(snapshot)} />
              <StateLeaf label={m.state_pinned()} active={isPinned(snapshot)} />
            </div>
          </StateRegion>
        </div>
      )}
    </section>
  )
}

function StateRegion({ children, title }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">{title}</p>
      <div className="rounded-lg border border-[var(--line)] p-2">{children}</div>
    </div>
  )
}

function StateNode({ active, children, label }: { label: string; active: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`mb-1 rounded-lg border p-2 ${active ? "border-[var(--lagoon)] bg-[rgba(79,184,178,0.08)]" : "border-transparent opacity-40"}`}
    >
      <span className={`text-xs font-semibold ${active ? "text-[var(--lagoon-deep)]" : ""}`}>{label}</span>
      <div className="ml-3 mt-1 flex gap-2">{children}</div>
    </div>
  )
}

function StateLeaf({ active, label, title }: { label: string; active: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${active ? "bg-[var(--lagoon)] text-white" : "bg-[var(--surface)] text-[var(--sea-ink-soft)] opacity-50"} ${title ? "cursor-help" : ""}`}
    >
      {label}
    </span>
  )
}
