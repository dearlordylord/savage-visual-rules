/* eslint-disable max-lines -- TODO: split this file into smaller components */
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { createActor } from "xstate"

import {
  canAct,
  canMove,
  isActive,
  isDead,
  isDistracted,
  isProne,
  isShaken,
  isStunned,
  isVulnerable,
  type SavageEvent,
  savageMachine,
  type SavageSnapshot,
  totalPenalty
} from "../machine"

export const Route = createFileRoute("/")({ component: App })

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
  if (isDead(snap)) return "DEAD"
  if (snap.matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })) return "Incap/BleedingOut"
  if (snap.matches({ alive: { damageTrack: { incapacitated: "stable" } } })) return "Incap/Stable"
  if (snap.matches({ alive: { damageTrack: { active: "shaken" } } })) return "Shaken"
  if (snap.matches({ alive: { damageTrack: { active: "wounded" } } })) return "Wounded"
  return "Active"
}

// ============================================================
// Replay helper — creates a fresh actor, replays events, returns snapshot
// ============================================================

function replayEvents(
  wc: boolean,
  events: Array<SavageEvent>
): { actor: ReturnType<typeof createActor<typeof savageMachine>>; snapshot: SavageSnapshot } {
  const actor = createActor(savageMachine, { input: { isWildCard: wc } })
  actor.start()
  for (const ev of events) {
    actor.send(ev)
  }
  return { actor, snapshot: actor.getSnapshot() }
}

// ============================================================
// Main app
// ============================================================

function App() {
  const actorRef = useRef<ReturnType<typeof createActor<typeof savageMachine>> | null>(null)
  const [snapshot, setSnapshot] = useState<SavageSnapshot | null>(null)
  // Log stored in chronological order (index 0 = first event)
  const [log, setLog] = useState<Array<LogEntry>>([])
  // Cursor: index of the last applied event. -1 = initial state (no events applied).
  const [cursor, setCursor] = useState(-1)
  const [isWildCard, setIsWildCard] = useState(true)
  const logIdRef = useRef(0)
  const cursorRef = useRef(-1)

  // Keep ref in sync with state
  const updateCursor = useCallback((val: number) => {
    cursorRef.current = val
    setCursor(val)
  }, [])

  const initActor = useCallback(
    (wc: boolean) => {
      actorRef.current?.stop()
      const actor = createActor(savageMachine, { input: { isWildCard: wc } })
      actor.subscribe(setSnapshot)
      actor.start()
      actorRef.current = actor
      setSnapshot(actor.getSnapshot())
      setLog([])
      updateCursor(-1)
      logIdRef.current = 0
    },
    [updateCursor]
  )

  useEffect(() => {
    initActor(isWildCard)
    return () => {
      actorRef.current?.stop()
    }
  }, [])

  const send = useCallback(
    (event: SavageEvent) => {
      if (!actorRef.current) return
      const before = stateLabel(actorRef.current.getSnapshot())
      actorRef.current.send(event)
      const after = stateLabel(actorRef.current.getSnapshot())
      const newEntry: LogEntry = {
        id: ++logIdRef.current,
        event,
        fromState: before,
        toState: after
      }
      const truncateAt = cursorRef.current + 1
      setLog((prev) => [...prev.slice(0, truncateAt), newEntry])
      updateCursor(truncateAt)
    },
    [updateCursor]
  )

  const jumpTo = useCallback(
    (targetIndex: number) => {
      // targetIndex: -1 = initial state, 0..log.length-1 = after that event
      setLog((currentLog) => {
        if (targetIndex < -1 || targetIndex >= currentLog.length) return currentLog
        actorRef.current?.stop()
        const eventsToReplay = currentLog.slice(0, targetIndex + 1).map((e) => e.event)
        const { actor, snapshot: newSnap } = replayEvents(isWildCard, eventsToReplay)
        actor.subscribe(setSnapshot)
        actorRef.current = actor
        setSnapshot(newSnap)
        updateCursor(targetIndex)
        return currentLog
      })
    },
    [isWildCard, updateCursor]
  )

  const canUndo = cursor >= 0
  const canRedo = cursor < log.length - 1

  const reset = useCallback(
    (wc: boolean) => {
      setIsWildCard(wc)
      initActor(wc)
    },
    [initActor]
  )

  if (!snapshot) return null

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--sea-ink)]">SWADE Status Machine</h1>
        <div className="flex gap-2">
          <button
            onClick={() => reset(true)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${isWildCard ? "border-[var(--lagoon)] bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]" : "border-[var(--line)] text-[var(--sea-ink-soft)]"}`}
          >
            Wild Card
          </button>
          <button
            onClick={() => reset(false)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${!isWildCard ? "border-[var(--lagoon)] bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]" : "border-[var(--line)] text-[var(--sea-ink-soft)]"}`}
          >
            Extra
          </button>
        </div>
      </div>

      <StatusReference snapshot={snapshot} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Left column: state tree + derived */}
        <div className="flex flex-col gap-4">
          <StateTree snapshot={snapshot} />
          <DerivedValues snapshot={snapshot} />
        </div>
        {/* Right column: events + log */}
        <div className="flex flex-col gap-4">
          <EventPanel send={send} snapshot={snapshot} />
          <TransitionLog
            log={log}
            cursor={cursor}
            canUndo={canUndo}
            canRedo={canRedo}
            onJumpTo={jumpTo}
            onUndo={() => jumpTo(cursor - 1)}
            onRedo={() => jumpTo(cursor + 1)}
            onClear={() => initActor(isWildCard)}
          />
        </div>
      </div>

      <footer className="mt-8 flex justify-center border-t border-[var(--line)] pt-4">
        <a
          href="https://github.com/dearlordylord/savage-visual-rules"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--sea-ink-soft)] transition hover:text-[var(--lagoon-deep)]"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          GitHub
        </a>
      </footer>
    </main>
  )
}

// ============================================================
// Status reference table
// ============================================================

const STATUS_DATA: Array<{
  name: string
  nameEn: string
  cause: string
  effects: string
  removal: string
  isActive: (snap: SavageSnapshot) => boolean
  /** Returns true when this status is active only because of stunned (implied), not directly */
  isImplied?: (snap: SavageSnapshot) => boolean
}> = [
  {
    name: "Шок",
    nameEn: "Shaken",
    cause: "Урон >= Стойкости; провал проверки Страха.",
    effects: "Можно только Свободные действия и движение. Защита не падает.",
    removal: "Проверка Характера в начале хода. Фишка — мгновенно.",
    isActive: isShaken
  },
  {
    name: "Оглушение",
    nameEn: "Stunned",
    cause: "Электрошокеры, сила оглушение, способности существ.",
    effects: "Отвлечён и Уязвим. Падает навзничь. Не может действовать.",
    removal: "Выносливость в начале хода. Успех → Уязвим до конца след. хода.",
    isActive: isStunned
  },
  {
    name: "Отвлечён",
    nameEn: "Distracted",
    cause: "Уловки, магия, способности существ; побочный эффект Оглушения.",
    effects: "–2 ко всем проверкам параметров.",
    removal: "В конце твоего следующего хода.",
    isActive: isDistracted,
    isImplied: (snap) => isStunned(snap) && !snap.matches({ alive: { conditionTrack: { distraction: "distracted" } } })
  },
  {
    name: "Уязвим",
    nameEn: "Vulnerable",
    cause: "Уловки, магия, способности существ; побочный эффект Оглушения.",
    effects: "Враги получают +2 ко всем проверкам против персонажа.",
    removal: "В конце твоего следующего хода.",
    isActive: isVulnerable,
    isImplied: (snap) =>
      isStunned(snap) && !snap.matches({ alive: { conditionTrack: { vulnerability: "vulnerable" } } })
  },
  {
    name: "Ранение",
    nameEn: "Wounded",
    cause: "Каждый подъём на броске урона (на 4+ больше Стойкости).",
    effects: "–1 за каждое ранение (макс. –3) к проверкам и Шагу.",
    removal: "Лечение (в течение часа) или естественное исцеление (5 дней).",
    isActive: (snap) => snap.context.wounds > 0
  }
]

function StatusReference({ snapshot }: { snapshot: SavageSnapshot }) {
  const dead = isDead(snapshot)

  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">Справочник состояний</p>
      <div className="overflow-x-auto text-xs">
        <table className="w-full">
          <thead>
            <tr className="text-left text-[var(--sea-ink-soft)]">
              <th className="pb-2 pr-3">Состояние</th>
              <th className="pb-2 pr-3">Как возникает</th>
              <th className="pb-2 pr-3">Эффекты и штрафы</th>
              <th className="pb-2">Как снять</th>
            </tr>
          </thead>
          <tbody>
            {STATUS_DATA.map((s) => {
              const active = !dead && s.isActive(snapshot)
              const implied = active && s.isImplied?.(snapshot)
              return (
                <tr
                  key={s.nameEn}
                  className={`border-t border-[var(--line)] transition-colors ${
                    active ? (implied ? "bg-[rgba(79,184,178,0.07)]" : "bg-[rgba(79,184,178,0.15)]") : ""
                  }`}
                >
                  <td className="py-2 pr-3 font-semibold whitespace-nowrap">
                    <span className={active ? (implied ? "text-[var(--lagoon)]" : "text-[var(--lagoon-deep)]") : ""}>
                      {s.name}
                      <span className="ml-1 font-normal text-[var(--sea-ink-soft)]">({s.nameEn})</span>
                    </span>
                    {active &&
                      (implied ? (
                        <span className="ml-2 text-[10px] text-[var(--sea-ink-soft)]">via Stunned</span>
                      ) : (
                        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-[var(--lagoon)]" />
                      ))}
                  </td>
                  <td className="py-2 pr-3">{s.cause}</td>
                  <td className="py-2 pr-3">{s.effects}</td>
                  <td className="py-2">{s.removal}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
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
        <div className="rounded-lg bg-red-500/20 p-4 text-center text-lg font-bold text-red-700">DEAD</div>
      ) : (
        <div className="space-y-3 text-sm">
          <StateRegion title="Damage Track">
            <StateNode label="active" active={snapshot.matches({ alive: { damageTrack: "active" } })}>
              <StateLeaf
                label="unshaken"
                active={snapshot.matches({ alive: { damageTrack: { active: "unshaken" } } })}
              />
              <StateLeaf label="shaken" active={snapshot.matches({ alive: { damageTrack: { active: "shaken" } } })} />
              <StateLeaf label="wounded" active={snapshot.matches({ alive: { damageTrack: { active: "wounded" } } })} />
            </StateNode>
            <StateNode label="incapacitated" active={snapshot.matches({ alive: { damageTrack: "incapacitated" } })}>
              <StateLeaf
                label="stable"
                active={snapshot.matches({ alive: { damageTrack: { incapacitated: "stable" } } })}
                title="Incapacitated with injury. Injury Table roll not modeled — lookup is external."
              />
              <StateLeaf
                label="bleedingOut"
                active={snapshot.matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })}
                title="Dying. Vigor roll each turn: fail = dead, raise = stabilized. Injury Table roll not modeled."
              />
            </StateNode>
          </StateRegion>

          <StateRegion title="Conditions">
            <div className="flex gap-4">
              <StateLeaf label="stunned" active={isStunned(snapshot)} />
              <StateLeaf
                label={`distracted (${snapshot.context.distractedTimer === -1 ? "off" : snapshot.context.distractedTimer + 1})`}
                active={snapshot.matches({ alive: { conditionTrack: { distraction: "distracted" } } })}
              />
              <StateLeaf
                label={`vulnerable (${snapshot.context.vulnerableTimer === -1 ? "off" : snapshot.context.vulnerableTimer + 1})`}
                active={snapshot.matches({ alive: { conditionTrack: { vulnerability: "vulnerable" } } })}
              />
            </div>
          </StateRegion>

          <StateRegion title="Fatigue">
            <div className="flex gap-3">
              {(["fresh", "fatigued", "exhausted", "incapByFatigue"] as const).map((s) => (
                <StateLeaf key={s} label={s} active={snapshot.matches({ alive: { fatigueTrack: s } })} />
              ))}
            </div>
          </StateRegion>

          <StateRegion title="Turn Phase">
            <div className="flex gap-3">
              <StateLeaf label="othersTurn" active={snapshot.matches({ alive: { turnPhase: "othersTurn" } })} />
              <StateLeaf label="ownTurn" active={snapshot.matches({ alive: { turnPhase: "ownTurn" } })} />
            </div>
          </StateRegion>

          <StateRegion title="Position">
            <div className="flex gap-3">
              <StateLeaf label="standing" active={snapshot.matches({ alive: { positionTrack: "standing" } })} />
              <StateLeaf label="prone" active={isProne(snapshot)} />
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

// ============================================================
// Derived values
// ============================================================

function DerivedValues({ snapshot }: { snapshot: SavageSnapshot }) {
  const ctx = snapshot.context

  const items: Array<{ label: string; value: string | boolean; title?: string }> = [
    { label: "Wounds", value: `${ctx.wounds} / ${ctx.maxWounds}` },
    {
      label: "Penalty",
      value: totalPenalty(snapshot).toString(),
      title: "Cumulative penalty to all trait rolls from Wounds (max -3) and Fatigue levels."
    },
    { label: "Shaken", value: isShaken(snapshot) },
    { label: "Stunned", value: isStunned(snapshot) },
    { label: "Distracted", value: isDistracted(snapshot) },
    { label: "Vulnerable", value: isVulnerable(snapshot) },
    { label: "Prone", value: isProne(snapshot) },
    { label: "Can Act", value: canAct(snapshot) },
    { label: "Can Move", value: canMove(snapshot) },
    { label: "Active", value: isActive(snapshot) },
    { label: "Wild Card", value: ctx.isWildCard }
  ]

  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">Derived Values</p>
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
                  {value ? "yes" : "no"}
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

function EventPanel({ send, snapshot }: { send: (e: SavageEvent) => void; snapshot: SavageSnapshot }) {
  const [margin, setMargin] = useState(4)
  const [soak, setSoak] = useState(0)
  const [incapRoll, setIncapRoll] = useState(0)
  const [vigorRoll, setVigorRoll] = useState(1)
  const [spiritRoll, setSpiritRoll] = useState(1)
  const [healAmount, setHealAmount] = useState(1)

  const dead = isDead(snapshot)
  const incapacitated = !dead && snapshot.matches({ alive: { damageTrack: "incapacitated" } })

  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">Events</p>
      <div className="space-y-3 text-sm">
        {/* TAKE_DAMAGE */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold">Take Damage</p>
          <div className="mb-2 flex gap-3">
            <NumInput
              label="margin"
              value={margin}
              onChange={setMargin}
              min={0}
              max={20}
              title="Damage minus Toughness. 0 = Shaken only. Every full 4 = one wound (raise)."
            />
            <NumInput
              label="soak"
              value={soak}
              onChange={setSoak}
              min={0}
              max={4}
              title="Wounds negated by spending a Benny + Vigor roll. Each success/raise removes 1 wound. If all wounds soaked, also clears Shaken."
            />
            <NumInput
              label="incapRoll"
              value={incapRoll}
              onChange={setIncapRoll}
              min={-1}
              max={3}
              title="Vigor roll at the moment of becoming incapacitated. Only used if this hit pushes wounds past max. -1 = crit fail (dead). 0 = fail (bleeding out). 1+ = success (stable with injury)."
            />
          </div>
          <EventBtn
            disabled={dead}
            onClick={() => send({ type: "TAKE_DAMAGE", margin, soakSuccesses: soak, incapRoll })}
          >
            Fire
          </EventBtn>
        </div>

        {/* START_OF_TURN */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold">Start of Turn</p>
          <div className="mb-2 flex gap-3">
            <NumInput
              label="vigorRoll"
              value={vigorRoll}
              onChange={setVigorRoll}
              min={0}
              max={3}
              title="Vigor check result. Used for Stunned recovery and Bleeding Out. 0 = fail. 1 = success. 2+ = raise."
            />
            <NumInput
              label="spiritRoll"
              value={spiritRoll}
              onChange={setSpiritRoll}
              min={0}
              max={3}
              title="Spirit check result. Used for Shaken recovery. 0 = fail. 1 = success. 2+ = raise."
            />
          </div>
          <EventBtn disabled={dead} onClick={() => send({ type: "START_OF_TURN", vigorRoll, spiritRoll })}>
            Fire
          </EventBtn>
        </div>

        {/* Simple events */}
        <div className="flex flex-wrap gap-2">
          <EventBtn disabled={dead} onClick={() => send({ type: "END_OF_TURN" })}>
            End of Turn
          </EventBtn>
          <EventBtn
            disabled={dead}
            onClick={() => send({ type: "SPEND_BENNY" })}
            title="Spend a Benny to immediately remove Shaken (any time, even on others' turns)."
          >
            Spend Benny
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: "APPLY_STUNNED" })}>
            Apply Stunned
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: "APPLY_DISTRACTED" })}>
            Apply Distracted
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: "APPLY_VULNERABLE" })}>
            Apply Vulnerable
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: "APPLY_FATIGUE" })}>
            Apply Fatigue
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: "RECOVER_FATIGUE" })}>
            Recover Fatigue
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: "DROP_PRONE" })}>
            Drop Prone
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: "STAND_UP" })}>
            Stand Up
          </EventBtn>
          {incapacitated && <EventBtn onClick={() => send({ type: "FINISHING_MOVE" })}>Finishing Move</EventBtn>}
        </div>

        {/* HEAL */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold">Heal</p>
          <div className="mb-2">
            <NumInput
              label="amount"
              value={healAmount}
              onChange={setHealAmount}
              min={1}
              max={3}
              title="Number of wounds healed (1-3). Healing while incapacitated also removes incapacitation."
            />
          </div>
          <EventBtn disabled={dead} onClick={() => send({ type: "HEAL", amount: healAmount })}>
            Fire
          </EventBtn>
        </div>
      </div>
    </section>
  )
}

function NumInput({
  label,
  max,
  min,
  onChange,
  title,
  value
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
      <span
        className={`text-xs text-[var(--sea-ink-soft)] ${title ? "cursor-help underline decoration-dotted underline-offset-2" : ""}`}
      >
        {label}
      </span>
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
  disabled,
  onClick,
  title
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-lg border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-3 py-1.5 text-xs font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.24)] disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

// ============================================================
// Transition log
// ============================================================

function TransitionLog({
  canRedo,
  canUndo,
  cursor,
  log,
  onClear,
  onJumpTo,
  onRedo,
  onUndo
}: {
  log: Array<LogEntry>
  cursor: number
  canUndo: boolean
  canRedo: boolean
  onJumpTo: (index: number) => void
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
}) {
  // Display in reverse chronological order (most recent first)
  const reversed = [...log].reverse()

  return (
    <section className="island-shell rounded-2xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="island-kicker">Transition Log</p>
        {log.length > 0 && (
          <div className="flex gap-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo — roll back to previous event"
              className="rounded border border-[var(--line)] px-2 py-0.5 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              Undo
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo — replay next event"
              className="rounded border border-[var(--line)] px-2 py-0.5 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              Redo
            </button>
            <button
              onClick={onClear}
              title="Clear log and reset to fresh state"
              className="rounded border border-[var(--line)] px-2 py-0.5 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)]"
            >
              Clear
            </button>
          </div>
        )}
      </div>
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
              {reversed.map((entry, revIdx) => {
                const chronIdx = log.length - 1 - revIdx
                const isCurrent = chronIdx === cursor
                const isFuture = chronIdx > cursor
                return (
                  <tr
                    key={entry.id}
                    onClick={() => onJumpTo(chronIdx)}
                    className={`cursor-pointer border-t border-[var(--line)] transition-colors ${
                      isCurrent ? "bg-[rgba(79,184,178,0.12)]" : isFuture ? "opacity-35" : ""
                    } hover:bg-[rgba(79,184,178,0.08)]`}
                  >
                    <td className="py-1 pr-2 text-[var(--sea-ink-soft)]">
                      {isCurrent ? "\u25B6" : ""} {entry.id}
                    </td>
                    <td className="py-1 pr-2 font-mono">{formatEvent(entry.event)}</td>
                    <td className="py-1 pr-2">{entry.fromState}</td>
                    <td
                      className={`py-1 ${entry.fromState !== entry.toState ? "font-semibold text-[var(--lagoon-deep)]" : ""}`}
                    >
                      {entry.toState}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function formatEvent(e: SavageEvent): string {
  switch (e.type) {
    case "TAKE_DAMAGE":
      return `TAKE_DAMAGE(m:${e.margin} s:${e.soakSuccesses} i:${e.incapRoll})`
    case "START_OF_TURN":
      return `START_OF_TURN(vig:${e.vigorRoll} spi:${e.spiritRoll})`
    case "HEAL":
      return `HEAL(${e.amount})`
    default:
      return e.type
  }
}
