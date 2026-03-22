import {
  afflictionType,
  blindedPenalty,
  isDead,
  isDefending,
  isDistracted,
  isGrabbed,
  isOnHold,
  isPinned,
  isProne,
  isShaken,
  isStunned,
  isVulnerable,
  type SavageSnapshot,
  totalPenalty
} from "../machine"
import * as m from "../paraglide/messages"

interface StateSummaryProps {
  snapshot: SavageSnapshot
}

function Badge({ active, label }: { label: string; active: boolean }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        active ? "bg-[var(--lagoon)] text-white" : "bg-[var(--surface)] text-[var(--sea-ink-soft)] opacity-40"
      }`}
    >
      {label}
    </span>
  )
}

export function StateSummary({ snapshot }: StateSummaryProps) {
  if (isDead(snapshot)) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        {m.cookbook_dead()}
      </div>
    )
  }

  const wounds = snapshot.context.wounds
  const penalty = totalPenalty(snapshot)
  const aff = afflictionType(snapshot)
  const bp = blindedPenalty(snapshot)

  const isIncap =
    snapshot.matches({ alive: { damageTrack: "incapacitated" } }) ||
    snapshot.matches({ alive: { fatigueTrack: "incapByFatigue" } })

  const isBleeding = snapshot.matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <Badge label={m.cookbook_badge_shaken()} active={isShaken(snapshot)} />
        <Badge label={m.cookbook_badge_stunned()} active={isStunned(snapshot)} />
        <Badge label={m.cookbook_badge_distracted()} active={isDistracted(snapshot)} />
        <Badge label={m.cookbook_badge_vulnerable()} active={isVulnerable(snapshot)} />
        <Badge label={m.cookbook_badge_prone()} active={isProne(snapshot)} />
        <Badge label={m.cookbook_badge_on_hold()} active={isOnHold(snapshot)} />
        <Badge label={m.cookbook_badge_defending()} active={isDefending(snapshot)} />
        <Badge label={m.cookbook_badge_grabbed()} active={isGrabbed(snapshot)} />
        <Badge label={m.cookbook_badge_pinned()} active={isPinned(snapshot)} />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-[var(--sea-ink-soft)]">
        <span>
          {m.cookbook_stat_wounds()}: <strong className="text-[var(--sea-ink)]">{wounds}</strong>
        </span>
        {penalty !== 0 && (
          <span>
            {m.cookbook_stat_penalty()}: <strong className="text-[var(--sea-ink)]">{penalty}</strong>
          </span>
        )}
        {bp !== 0 && (
          <span>
            {m.cookbook_stat_vision()}: <strong className="text-[var(--sea-ink)]">{bp}</strong>
          </span>
        )}
        {aff && (
          <span>
            {m.cookbook_stat_affliction()}: <strong className="text-[var(--sea-ink)]">{aff}</strong>
          </span>
        )}
        {isIncap && (
          <span className="font-semibold text-red-600">
            {isBleeding ? m.cookbook_stat_bleeding() : m.cookbook_stat_incap()}
          </span>
        )}
      </div>
    </div>
  )
}
