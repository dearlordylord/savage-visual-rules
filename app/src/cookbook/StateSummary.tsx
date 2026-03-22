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
        МЁРТВ
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
        <Badge label="Шок" active={isShaken(snapshot)} />
        <Badge label="Оглушён" active={isStunned(snapshot)} />
        <Badge label="Отвлечён" active={isDistracted(snapshot)} />
        <Badge label="Уязвим" active={isVulnerable(snapshot)} />
        <Badge label="Лежит" active={isProne(snapshot)} />
        <Badge label="Наготове" active={isOnHold(snapshot)} />
        <Badge label="Оборона" active={isDefending(snapshot)} />
        <Badge label="Схвачен" active={isGrabbed(snapshot)} />
        <Badge label="Обездвижен" active={isPinned(snapshot)} />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-[var(--sea-ink-soft)]">
        <span>
          Ранения: <strong className="text-[var(--sea-ink)]">{wounds}</strong>
        </span>
        {penalty !== 0 && (
          <span>
            Штраф: <strong className="text-[var(--sea-ink)]">{penalty}</strong>
          </span>
        )}
        {bp !== 0 && (
          <span>
            Зрение: <strong className="text-[var(--sea-ink)]">{bp}</strong>
          </span>
        )}
        {aff && (
          <span>
            Недуг: <strong className="text-[var(--sea-ink)]">{aff}</strong>
          </span>
        )}
        {isIncap && <span className="font-semibold text-red-600">{isBleeding ? "Истекает кровью" : "При смерти"}</span>}
      </div>
    </div>
  )
}
