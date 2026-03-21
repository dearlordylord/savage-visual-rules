import { createFileRoute } from '@tanstack/react-router'
import { useState, useCallback, useRef, useEffect } from 'react'
import { createActor } from 'xstate'
import {
  savageMachine,
  isShaken,
  isStunned,
  isDistracted,
  isVulnerable,
  isActive,
  canAct,
  canMove,
  totalPenalty,
  isDead,
  type SavageSnapshot,
  type SavageEvent,
} from '../machine'

export const Route = createFileRoute('/')({ component: App })

// ============================================================
// Types
// ============================================================

interface LogEntry {
  id: number
  event: SavageEvent
  fromState: string
  toState: string
}

function stateLabel(snap: SavageSnapshot): string {
  if (isDead(snap)) return 'DEAD'
  if (snap.matches({ alive: { damageTrack: { incapacitated: 'bleedingOut' } } })) return 'Incap/BleedingOut'
  if (snap.matches({ alive: { damageTrack: { incapacitated: 'stable' } } })) return 'Incap/Stable'
  if (snap.matches({ alive: { damageTrack: { active: 'shaken' } } })) return 'Shaken'
  if (snap.matches({ alive: { damageTrack: { active: 'wounded' } } })) return 'Wounded'
  return 'Active'
}

// ============================================================
// Main app
// ============================================================

function App() {
  const actorRef = useRef<ReturnType<typeof createActor<typeof savageMachine>> | null>(null)
  const [snapshot, setSnapshot] = useState<SavageSnapshot | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [isWildCard, setIsWildCard] = useState(true)
  const logIdRef = useRef(0)

  const initActor = useCallback(
    (wc: boolean) => {
      actorRef.current?.stop()
      const actor = createActor(savageMachine, { input: { isWildCard: wc } })
      actor.subscribe((s) => setSnapshot(s))
      actor.start()
      actorRef.current = actor
      setSnapshot(actor.getSnapshot())
      setLog([])
      logIdRef.current = 0
    },
    [],
  )

  useEffect(() => {
    initActor(isWildCard)
    return () => { actorRef.current?.stop() }
  }, [])

  const send = useCallback(
    (event: SavageEvent) => {
      if (!actorRef.current) return
      const before = stateLabel(actorRef.current.getSnapshot())
      actorRef.current.send(event)
      const after = stateLabel(actorRef.current.getSnapshot())
      setLog((prev) => [
        { id: ++logIdRef.current, event, fromState: before, toState: after },
        ...prev.slice(0, 49),
      ])
    },
    [],
  )

  const reset = useCallback(
    (wc: boolean) => {
      setIsWildCard(wc)
      initActor(wc)
    },
    [initActor],
  )

  if (!snapshot) return null

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--sea-ink)]">SWADE Status Machine</h1>
        <div className="flex gap-2">
          <button
            onClick={() => reset(true)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${isWildCard ? 'border-[var(--lagoon)] bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]' : 'border-[var(--line)] text-[var(--sea-ink-soft)]'}`}
          >
            Wild Card
          </button>
          <button
            onClick={() => reset(false)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${!isWildCard ? 'border-[var(--lagoon)] bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]' : 'border-[var(--line)] text-[var(--sea-ink-soft)]'}`}
          >
            Extra
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Left column: state tree + derived */}
        <div className="flex flex-col gap-4">
          <StateTree snapshot={snapshot} />
          <DerivedValues snapshot={snapshot} />
        </div>
        {/* Right column: events + log */}
        <div className="flex flex-col gap-4">
          <EventPanel send={send} snapshot={snapshot} />
          <TransitionLog log={log} />
        </div>
      </div>
    </main>
  )
}

// ============================================================
// State tree visualization
// ============================================================

function StateTree({ snapshot }: { snapshot: SavageSnapshot }) {
  const dead = isDead(snapshot)

  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">State Tree</p>
      {dead ? (
        <div className="rounded-lg bg-red-500/20 p-4 text-center text-lg font-bold text-red-700">
          DEAD
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <StateRegion title="Damage Track">
            <StateNode
              label="active"
              active={snapshot.matches({ alive: { damageTrack: 'active' } })}
            >
              <StateLeaf label="unshaken" active={snapshot.matches({ alive: { damageTrack: { active: 'unshaken' } } })} />
              <StateLeaf label="shaken" active={snapshot.matches({ alive: { damageTrack: { active: 'shaken' } } })} />
              <StateLeaf label="wounded" active={snapshot.matches({ alive: { damageTrack: { active: 'wounded' } } })} />
            </StateNode>
            <StateNode
              label="incapacitated"
              active={snapshot.matches({ alive: { damageTrack: 'incapacitated' } })}
            >
              <StateLeaf label="stable" active={snapshot.matches({ alive: { damageTrack: { incapacitated: 'stable' } } })} />
              <StateLeaf label="bleedingOut" active={snapshot.matches({ alive: { damageTrack: { incapacitated: 'bleedingOut' } } })} />
            </StateNode>
          </StateRegion>

          <StateRegion title="Conditions">
            <div className="flex gap-4">
              <StateLeaf label="stunned" active={isStunned(snapshot)} />
              <StateLeaf
                label={`distracted (${snapshot.context.distractedTimer === -1 ? 'off' : snapshot.context.distractedTimer + 1})`}
                active={snapshot.matches({ alive: { conditionTrack: { distraction: 'distracted' } } })}
              />
              <StateLeaf
                label={`vulnerable (${snapshot.context.vulnerableTimer === -1 ? 'off' : snapshot.context.vulnerableTimer + 1})`}
                active={snapshot.matches({ alive: { conditionTrack: { vulnerability: 'vulnerable' } } })}
              />
            </div>
          </StateRegion>

          <StateRegion title="Fatigue">
            <div className="flex gap-3">
              {(['fresh', 'fatigued', 'exhausted', 'incapByFatigue'] as const).map((s) => (
                <StateLeaf
                  key={s}
                  label={s}
                  active={snapshot.matches({ alive: { fatigueTrack: s } })}
                />
              ))}
            </div>
          </StateRegion>

          <StateRegion title="Turn Phase">
            <div className="flex gap-3">
              <StateLeaf label="othersTurn" active={snapshot.matches({ alive: { turnPhase: 'othersTurn' } })} />
              <StateLeaf label="ownTurn" active={snapshot.matches({ alive: { turnPhase: 'ownTurn' } })} />
            </div>
          </StateRegion>
        </div>
      )}
    </section>
  )
}

function StateRegion({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
        {title}
      </p>
      <div className="rounded-lg border border-[var(--line)] p-2">{children}</div>
    </div>
  )
}

function StateNode({
  label,
  active,
  children,
}: {
  label: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`mb-1 rounded-lg border p-2 ${active ? 'border-[var(--lagoon)] bg-[rgba(79,184,178,0.08)]' : 'border-transparent opacity-40'}`}>
      <span className={`text-xs font-semibold ${active ? 'text-[var(--lagoon-deep)]' : ''}`}>
        {label}
      </span>
      <div className="ml-3 mt-1 flex gap-2">{children}</div>
    </div>
  )
}

function StateLeaf({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${active ? 'bg-[var(--lagoon)] text-white' : 'bg-[var(--surface)] text-[var(--sea-ink-soft)] opacity-50'}`}
    >
      {label}
    </span>
  )
}

// ============================================================
// Derived values
// ============================================================

function DerivedValues({ snapshot }: { snapshot: SavageSnapshot }) {
  const ctx = snapshot.context

  const items = [
    { label: 'Wounds', value: `${ctx.wounds} / ${ctx.maxWounds}` },
    { label: 'Penalty', value: totalPenalty(snapshot).toString() },
    { label: 'Shaken', value: isShaken(snapshot) },
    { label: 'Stunned', value: isStunned(snapshot) },
    { label: 'Distracted', value: isDistracted(snapshot) },
    { label: 'Vulnerable', value: isVulnerable(snapshot) },
    { label: 'Can Act', value: canAct(snapshot) },
    { label: 'Can Move', value: canMove(snapshot) },
    { label: 'Active', value: isActive(snapshot) },
    { label: 'Wild Card', value: ctx.isWildCard },
  ]

  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">Derived Values</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {items.map(({ label, value }) => (
          <div key={label} className="flex justify-between">
            <span className="text-[var(--sea-ink-soft)]">{label}</span>
            <span className="font-semibold">
              {typeof value === 'boolean' ? (
                <span className={value ? 'text-green-600' : 'text-[var(--sea-ink-soft)] opacity-50'}>
                  {value ? 'yes' : 'no'}
                </span>
              ) : (
                value
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ============================================================
// Event panel
// ============================================================

function EventPanel({
  send,
  snapshot,
}: {
  send: (e: SavageEvent) => void
  snapshot: SavageSnapshot
}) {
  const [margin, setMargin] = useState(4)
  const [soak, setSoak] = useState(0)
  const [incapRoll, setIncapRoll] = useState(0)
  const [vigorRoll, setVigorRoll] = useState(1)
  const [spiritRoll, setSpiritRoll] = useState(1)
  const [healAmount, setHealAmount] = useState(1)

  const dead = isDead(snapshot)

  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">Events</p>
      <div className="space-y-3 text-sm">
        {/* TAKE_DAMAGE */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold">Take Damage</p>
          <div className="mb-2 flex gap-3">
            <NumInput label="margin" value={margin} onChange={setMargin} min={0} max={20} title="Damage minus Toughness. 0 = Shaken only. Every full 4 = one wound (raise)." />
            <NumInput label="soak" value={soak} onChange={setSoak} min={0} max={4} title="Wounds negated by spending a Benny + Vigor roll. Each success/raise removes 1 wound. If all wounds soaked, also clears Shaken." />
            <NumInput label="incapRoll" value={incapRoll} onChange={setIncapRoll} min={-1} max={3} title="Vigor roll at the moment of becoming incapacitated. Only used if this hit pushes wounds past max. -1 = crit fail (dead). 0 = fail (bleeding out). 1+ = success (stable with injury)." />
          </div>
          <EventBtn
            disabled={dead}
            onClick={() => send({ type: 'TAKE_DAMAGE', margin, soakSuccesses: soak, incapRoll })}
          >
            Fire
          </EventBtn>
        </div>

        {/* START_OF_TURN */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold">Start of Turn</p>
          <div className="mb-2 flex gap-3">
            <NumInput label="vigorRoll" value={vigorRoll} onChange={setVigorRoll} min={0} max={3} title="Vigor check result. Used for Stunned recovery and Bleeding Out. 0 = fail. 1 = success. 2+ = raise." />
            <NumInput label="spiritRoll" value={spiritRoll} onChange={setSpiritRoll} min={0} max={3} title="Spirit check result. Used for Shaken recovery. 0 = fail. 1 = success. 2+ = raise." />
          </div>
          <EventBtn disabled={dead} onClick={() => send({ type: 'START_OF_TURN', vigorRoll, spiritRoll })}>
            Fire
          </EventBtn>
        </div>

        {/* Simple events */}
        <div className="flex flex-wrap gap-2">
          <EventBtn disabled={dead} onClick={() => send({ type: 'END_OF_TURN' })}>
            End of Turn
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: 'SPEND_BENNY' })}>
            Spend Benny
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: 'APPLY_STUNNED' })}>
            Apply Stunned
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: 'APPLY_DISTRACTED' })}>
            Apply Distracted
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: 'APPLY_VULNERABLE' })}>
            Apply Vulnerable
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: 'APPLY_FATIGUE' })}>
            Apply Fatigue
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: 'RECOVER_FATIGUE' })}>
            Recover Fatigue
          </EventBtn>
        </div>

        {/* HEAL */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold">Heal</p>
          <div className="mb-2">
            <NumInput label="amount" value={healAmount} onChange={setHealAmount} min={1} max={3} title="Number of wounds healed (1-3). Healing while incapacitated also removes incapacitation." />
          </div>
          <EventBtn
            disabled={dead}
            onClick={() => send({ type: 'HEAL', amount: healAmount })}
          >
            Fire
          </EventBtn>
        </div>
      </div>
    </section>
  )
}

function NumInput({
  label,
  value,
  onChange,
  min,
  max,
  title,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  title?: string
}) {
  return (
    <label className="flex items-center gap-1.5" title={title}>
      <span className={`text-xs text-[var(--sea-ink-soft)] ${title ? 'cursor-help underline decoration-dotted underline-offset-2' : ''}`}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-14 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-center text-sm"
      />
    </label>
  )
}

function EventBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-3 py-1.5 text-xs font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.24)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

// ============================================================
// Transition log
// ============================================================

function TransitionLog({ log }: { log: LogEntry[] }) {
  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">Transition Log</p>
      {log.length === 0 ? (
        <p className="text-xs text-[var(--sea-ink-soft)]">No events yet.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto text-xs">
          <table className="w-full">
            <thead>
              <tr className="text-left text-[var(--sea-ink-soft)]">
                <th className="pb-1 pr-2">#</th>
                <th className="pb-1 pr-2">Event</th>
                <th className="pb-1 pr-2">From</th>
                <th className="pb-1">To</th>
              </tr>
            </thead>
            <tbody>
              {log.map((entry) => (
                <tr key={entry.id} className="border-t border-[var(--line)]">
                  <td className="py-1 pr-2 text-[var(--sea-ink-soft)]">{entry.id}</td>
                  <td className="py-1 pr-2 font-mono">{formatEvent(entry.event)}</td>
                  <td className="py-1 pr-2">{entry.fromState}</td>
                  <td
                    className={`py-1 ${entry.fromState !== entry.toState ? 'font-semibold text-[var(--lagoon-deep)]' : ''}`}
                  >
                    {entry.toState}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function formatEvent(e: SavageEvent): string {
  switch (e.type) {
    case 'TAKE_DAMAGE':
      return `TAKE_DAMAGE(m:${e.margin} s:${e.soakSuccesses} i:${e.incapRoll})`
    case 'START_OF_TURN':
      return `START_OF_TURN(vig:${e.vigorRoll} spi:${e.spiritRoll})`
    case 'HEAL':
      return `HEAL(${e.amount})`
    default:
      return e.type
  }
}
