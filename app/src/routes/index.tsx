/* eslint-disable max-lines -- TODO: split this file into smaller components */
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { createActor } from "xstate"

import {
  afflictionType,
  blindedPenalty,
  canAct,
  canMove,
  type FearResult,
  injuryPenalty,
  type InjuryType,
  isAfflicted,
  isBound,
  isConscious,
  isDead,
  isDefending,
  isDistracted,
  isEntangled,
  isFullyBlinded,
  isGrabbed,
  isGrappled,
  isOnHold,
  isPinned,
  isProne,
  isRestrained,
  isShaken,
  isStunned,
  isVulnerable,
  resolveFear,
  type SavageEvent,
  savageMachine,
  type SavageSnapshot,
  totalPenalty
} from "../machine"
import * as m from "../paraglide/messages"
import { getLocale, locales, setLocale } from "../paraglide/runtime"
import type { AfflictionType } from "../types"
import {
  afflictionDuration,
  athleticsRollResult,
  blindedSeverity,
  damageMargin,
  escapeRollResult,
  grappleEscapeRollResult,
  grappleRollResult,
  healAmount as mkHealAmount,
  incapRollResult,
  injuryRoll as mkInjuryRoll,
  pinRollResult,
  soakSuccesses,
  spiritRollResult,
  vigorRollResult
} from "../types"

export const Route = createFileRoute("/")({ component: App })

// ============================================================
// Types
// ============================================================

type StateKey = "dead" | "incap_bleeding" | "incap_stable" | "shaken" | "wounded" | "active"

interface LogEntry {
  id: number
  event: SavageEvent
  fromState: StateKey
  toState: StateKey
}

function stateKey(snap: SavageSnapshot): StateKey {
  if (isDead(snap)) return "dead"
  if (snap.matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })) return "incap_bleeding"
  if (snap.matches({ alive: { damageTrack: { incapacitated: "stable" } } })) return "incap_stable"
  if (snap.matches({ alive: { damageTrack: { active: "shaken" } } })) return "shaken"
  if (snap.matches({ alive: { damageTrack: { active: "wounded" } } })) return "wounded"
  return "active"
}

const STATE_LABELS: Record<StateKey, () => string> = {
  dead: m.statelabel_dead,
  incap_bleeding: m.statelabel_incap_bleeding,
  incap_stable: m.statelabel_incap_stable,
  shaken: m.statelabel_shaken,
  wounded: m.statelabel_wounded,
  active: m.statelabel_active
}

function stateLabel(key: StateKey): string {
  return STATE_LABELS[key]()
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
      const before = stateKey(actorRef.current.getSnapshot())
      actorRef.current.send(event)
      const after = stateKey(actorRef.current.getSnapshot())
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
        <h1 className="text-2xl font-bold text-[var(--sea-ink)]">{m.app_title()}</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {locales.map((locale) => (
              <button
                key={locale}
                onClick={() => setLocale(locale)}
                className={`rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                  locale === getLocale()
                    ? "border-[var(--lagoon)] bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]"
                    : "border-[var(--line)] text-[var(--sea-ink-soft)]"
                }`}
              >
                {locale.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => reset(true)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${isWildCard ? "border-[var(--lagoon)] bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]" : "border-[var(--line)] text-[var(--sea-ink-soft)]"}`}
            >
              {m.wild_card()}
            </button>
            <button
              onClick={() => reset(false)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${!isWildCard ? "border-[var(--lagoon)] bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]" : "border-[var(--line)] text-[var(--sea-ink-soft)]"}`}
            >
              {m.extra()}
            </button>
          </div>
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
          {m.github()}
        </a>
      </footer>
    </main>
  )
}

// ============================================================
// Status reference table
// ============================================================

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

function StatusReference({ snapshot }: { snapshot: SavageSnapshot }) {
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

// ============================================================
// State tree visualization
// ============================================================

function StateTree({ snapshot }: { snapshot: SavageSnapshot }) {
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
                label={m.state_shaken()}
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
              <StateLeaf
                label={m.state_others_turn()}
                active={snapshot.matches({ alive: { turnPhase: "othersTurn" } })}
              />
              <StateLeaf label={m.state_own_turn()} active={snapshot.matches({ alive: { turnPhase: "ownTurn" } })} />
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

// ============================================================
// Derived values
// ============================================================

function DerivedValues({ snapshot }: { snapshot: SavageSnapshot }) {
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

// ============================================================
// Event panel
// ============================================================

function EventPanel({ send, snapshot }: { send: (e: SavageEvent) => void; snapshot: SavageSnapshot }) {
  const [margin, setMargin] = useState(4)
  const [soak, setSoak] = useState(0)
  const [incapRoll, setIncapRoll] = useState(0)
  const [injuryRoll, setInjuryRoll] = useState(52)
  const [vigorRoll, setVigorRoll] = useState(1)
  const [spiritRoll, setSpiritRoll] = useState(1)
  const [healAmount, setHealAmount] = useState(1)
  const [athleticsRoll, setAthleticsRoll] = useState(1)
  const [escapeRoll, setEscapeRoll] = useState(1)
  const [grappleRoll, setGrappleRoll] = useState(1)

  const dead = isDead(snapshot)
  const incapacitated = !dead && snapshot.matches({ alive: { damageTrack: "incapacitated" } })
  const grappled = !dead && isGrappled(snapshot)
  const onHold = !dead && isOnHold(snapshot)
  const restrained = !dead && isRestrained(snapshot)

  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">{m.section_events()}</p>
      <div className="space-y-3 text-sm">
        {/* TAKE_DAMAGE */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold cursor-help" title={m.tooltip_take_damage()}>
            {m.event_take_damage()}
          </p>
          <div className="mb-2 flex gap-3">
            <NumInput
              label={m.label_margin()}
              value={margin}
              onChange={setMargin}
              min={0}
              max={20}
              title={m.tooltip_margin()}
            />
            <NumInput label={m.label_soak()} value={soak} onChange={setSoak} min={0} max={4} title={m.tooltip_soak()} />
            <NumInput
              label={m.label_incap_roll()}
              value={incapRoll}
              onChange={setIncapRoll}
              min={-1}
              max={3}
              title={m.tooltip_incap_roll()}
            />
            <NumInput
              label={m.label_injury_roll()}
              value={injuryRoll}
              onChange={setInjuryRoll}
              min={0}
              max={126}
              title={m.tooltip_injury_roll()}
            />
          </div>
          <EventBtn
            disabled={dead}
            onClick={() =>
              send({
                type: "TAKE_DAMAGE",
                margin: damageMargin(margin),
                soakSuccesses: soakSuccesses(soak),
                incapRoll: incapRollResult(incapRoll),
                injuryRoll: mkInjuryRoll(injuryRoll)
              })
            }
          >
            {m.btn_fire()}
          </EventBtn>
        </div>

        {/* START_OF_TURN */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold cursor-help" title={m.tooltip_start_of_turn()}>
            {m.event_start_of_turn()}
          </p>
          <div className="mb-2 flex gap-3">
            <NumInput
              label={m.label_vigor_roll()}
              value={vigorRoll}
              onChange={setVigorRoll}
              min={0}
              max={3}
              title={m.tooltip_vigor_roll()}
            />
            <NumInput
              label={m.label_spirit_roll()}
              value={spiritRoll}
              onChange={setSpiritRoll}
              min={0}
              max={3}
              title={m.tooltip_spirit_roll()}
            />
          </div>
          <EventBtn
            disabled={
              !snapshot.can({ type: "START_OF_TURN", vigorRoll: vigorRollResult(0), spiritRoll: spiritRollResult(0) })
            }
            onClick={() =>
              send({
                type: "START_OF_TURN",
                vigorRoll: vigorRollResult(vigorRoll),
                spiritRoll: spiritRollResult(spiritRoll)
              })
            }
          >
            {m.btn_fire()}
          </EventBtn>
        </div>

        {/* Simple events */}
        <div className="flex flex-wrap gap-2">
          <EventBtn
            disabled={!snapshot.can({ type: "END_OF_TURN", vigorRoll: vigorRollResult(0) })}
            onClick={() => send({ type: "END_OF_TURN", vigorRoll: vigorRollResult(vigorRoll) })}
          >
            {m.event_end_of_turn()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "SPEND_BENNY" })}
            onClick={() => send({ type: "SPEND_BENNY" })}
            title={m.tooltip_spend_benny()}
          >
            {m.event_spend_benny()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "APPLY_STUNNED" })} onClick={() => send({ type: "APPLY_STUNNED" })}>
            {m.event_apply_stunned()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "APPLY_DISTRACTED" })}
            onClick={() => send({ type: "APPLY_DISTRACTED" })}
          >
            {m.event_apply_distracted()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "APPLY_VULNERABLE" })}
            onClick={() => send({ type: "APPLY_VULNERABLE" })}
          >
            {m.event_apply_vulnerable()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "APPLY_FATIGUE" })} onClick={() => send({ type: "APPLY_FATIGUE" })}>
            {m.event_apply_fatigue()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "RECOVER_FATIGUE" })}
            onClick={() => send({ type: "RECOVER_FATIGUE" })}
          >
            {m.event_recover_fatigue()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "DROP_PRONE" })} onClick={() => send({ type: "DROP_PRONE" })}>
            {m.event_drop_prone()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "STAND_UP" })} onClick={() => send({ type: "STAND_UP" })}>
            {m.event_stand_up()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "GO_ON_HOLD" })} onClick={() => send({ type: "GO_ON_HOLD" })}>
            {m.event_go_on_hold()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "DEFEND" })}
            onClick={() => send({ type: "DEFEND" })}
            title={m.tooltip_defend()}
          >
            {m.event_defend()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "APPLY_ENTANGLED" })}
            onClick={() => send({ type: "APPLY_ENTANGLED" })}
          >
            {m.event_apply_entangled()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "APPLY_BOUND" })} onClick={() => send({ type: "APPLY_BOUND" })}>
            {m.event_apply_bound()}
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: "APPLY_BLINDED", severity: blindedSeverity(2) })}>
            {m.event_impair_vision()}
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: "APPLY_BLINDED", severity: blindedSeverity(4) })}>
            {m.event_blind()}
          </EventBtn>
          {incapacitated && (
            <EventBtn
              disabled={!snapshot.can({ type: "FINISHING_MOVE" })}
              onClick={() => send({ type: "FINISHING_MOVE" })}
            >
              {m.event_finishing_move()}
            </EventBtn>
          )}
        </div>

        {/* ON HOLD ACTIONS (visible when on hold) */}
        {onHold && (
          <div className="rounded-lg border border-[var(--line)] p-3">
            <p className="mb-2 font-semibold cursor-help" title={m.tooltip_on_hold()}>
              {m.event_on_hold()}
            </p>
            <EventBtn
              disabled={!snapshot.can({ type: "ACT_FROM_HOLD" })}
              onClick={() => send({ type: "ACT_FROM_HOLD" })}
              title={m.tooltip_act_from_hold()}
            >
              {m.btn_act()}
            </EventBtn>
            <p className="mt-3 mb-2 font-semibold cursor-help" title={m.tooltip_interrupt()}>
              {m.event_interrupt()}
            </p>
            <div className="mb-2 flex gap-3">
              <NumInput
                label={m.label_athletics_roll()}
                value={athleticsRoll}
                onChange={setAthleticsRoll}
                min={0}
                max={3}
                title={m.tooltip_athletics_roll()}
              />
            </div>
            <EventBtn onClick={() => send({ type: "INTERRUPT", athleticsRoll: athleticsRollResult(athleticsRoll) })}>
              {m.btn_fire()}
            </EventBtn>
          </div>
        )}

        {/* ESCAPE ATTEMPT (visible when restrained) */}
        {restrained && (
          <div className="rounded-lg border border-[var(--line)] p-3">
            <p className="mb-2 font-semibold cursor-help" title={m.tooltip_escape_attempt()}>
              {m.event_escape_attempt()}
            </p>
            <div className="mb-2 flex gap-3">
              <NumInput
                label={m.label_roll_result()}
                value={escapeRoll}
                onChange={setEscapeRoll}
                min={0}
                max={3}
                title={m.tooltip_escape_roll()}
              />
            </div>
            <EventBtn onClick={() => send({ type: "ESCAPE_ATTEMPT", rollResult: escapeRollResult(escapeRoll) })}>
              {m.btn_fire()}
            </EventBtn>
          </div>
        )}

        {/* GRAPPLE */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold cursor-help" title={m.tooltip_grapple()}>
            {m.event_grapple()}
          </p>
          <div className="mb-2 flex gap-3">
            <NumInput
              label={m.label_roll_result()}
              value={grappleRoll}
              onChange={setGrappleRoll}
              min={0}
              max={3}
              title={m.tooltip_grapple_roll()}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <EventBtn
              disabled={dead}
              onClick={() => send({ type: "GRAPPLE_ATTEMPT", rollResult: grappleRollResult(grappleRoll) })}
            >
              {m.btn_grapple()}
            </EventBtn>
            {grappled && (
              <>
                <EventBtn
                  onClick={() => send({ type: "GRAPPLE_ESCAPE", rollResult: grappleEscapeRollResult(grappleRoll) })}
                >
                  {m.btn_escape_grapple()}
                </EventBtn>
                <EventBtn onClick={() => send({ type: "PIN_ATTEMPT", rollResult: pinRollResult(grappleRoll) })}>
                  {m.btn_pin()}
                </EventBtn>
              </>
            )}
          </div>
        </div>

        {/* HEAL */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold cursor-help" title={m.tooltip_heal()}>
            {m.event_heal()}
          </p>
          <div className="mb-2">
            <NumInput
              label={m.label_amount()}
              value={healAmount}
              onChange={setHealAmount}
              min={1}
              max={3}
              title={m.tooltip_heal_amount()}
            />
          </div>
          <EventBtn
            disabled={!snapshot.can({ type: "HEAL", amount: mkHealAmount(1) })}
            onClick={() => send({ type: "HEAL", amount: mkHealAmount(healAmount) })}
          >
            {m.btn_fire()}
          </EventBtn>
        </div>

        {/* FEAR CHECK */}
        <FearPanel send={send} dead={dead} />

        {/* AFFLICTION */}
        <AfflictionPanel send={send} snapshot={snapshot} afflicted={!dead && isAfflicted(snapshot)} />

        {/* POWER EFFECTS */}
        <PowerEffectPanel send={send} snapshot={snapshot} effects={snapshot.context.activeEffects} />
      </div>
    </section>
  )
}

const FEAR_RESULT_LABELS: Record<FearResult, () => string> = {
  ADRENALINE: m.fear_adrenaline,
  APPLY_DISTRACTED: m.fear_distracted,
  APPLY_VULNERABLE: m.fear_vulnerable,
  APPLY_SHAKEN: m.fear_shaken,
  APPLY_STUNNED: m.fear_stunned,
  HINDRANCE_SCAR: m.fear_scar,
  HINDRANCE_SLOWNESS: m.fear_slowness,
  PANIC_FLEE: m.fear_panic,
  HINDRANCE_MINOR_PHOBIA: m.fear_minor_phobia,
  HINDRANCE_MAJOR_PHOBIA: m.fear_major_phobia,
  HEART_ATTACK: m.fear_heart_attack
}

const FEAR_MACHINE_EVENTS: Partial<Record<FearResult, SavageEvent>> = {
  APPLY_DISTRACTED: { type: "APPLY_DISTRACTED" },
  APPLY_VULNERABLE: { type: "APPLY_VULNERABLE" },
  APPLY_STUNNED: { type: "APPLY_STUNNED" }
}

function FearPanel({ dead, send }: { send: (e: SavageEvent) => void; dead: boolean }) {
  const [fearRoll, setFearRoll] = useState(10)
  const [fearMod, setFearMod] = useState(0)
  const [lastResults, setLastResults] = useState<Array<FearResult> | null>(null)

  const handleFear = () => {
    const results = resolveFear(fearRoll, fearMod)
    setLastResults(results)
    for (const r of results) {
      const ev = FEAR_MACHINE_EVENTS[r]
      if (ev) send(ev)
    }
  }

  return (
    <div className="rounded-lg border border-[var(--line)] p-3">
      <p className="mb-2 font-semibold cursor-help" title={m.tooltip_fear_check()}>
        {m.event_fear_check()}
      </p>
      <div className="mb-2 flex gap-3">
        <NumInput
          label={m.label_d20_roll()}
          value={fearRoll}
          onChange={setFearRoll}
          min={1}
          max={20}
          title={m.tooltip_fear_d20()}
        />
        <NumInput
          label={m.label_modifier()}
          value={fearMod}
          onChange={setFearMod}
          min={-10}
          max={10}
          title={m.tooltip_fear_modifier()}
        />
      </div>
      <EventBtn disabled={dead} onClick={handleFear}>
        {m.btn_resolve_fear()}
      </EventBtn>
      {lastResults && (
        <div className="mt-2 rounded border border-[var(--line)] bg-[var(--sand-soft)] p-2 text-xs">
          <p className="mb-1 font-semibold">{m.fear_result_total({ total: (fearRoll + fearMod).toString() })}</p>
          <ul className="list-inside list-disc">
            {lastResults.map((r, i) => (
              <li
                key={i}
                className={FEAR_MACHINE_EVENTS[r] ? "text-[var(--lagoon-deep)]" : "text-[var(--sea-ink-soft)]"}
              >
                {FEAR_RESULT_LABELS[r]()}
                {FEAR_MACHINE_EVENTS[r] ? ` ${m.fear_applied()}` : ` ${m.fear_manual()}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function AfflictionPanel({
  afflicted,
  send,
  snapshot
}: {
  send: (e: SavageEvent) => void
  snapshot: SavageSnapshot
  afflicted: boolean
}) {
  const [affType, setAffType] = useState<AfflictionType>("weak")
  const [affDur, setAffDur] = useState(3)

  return (
    <div className="rounded-lg border border-[var(--line)] p-3">
      <p className="mb-2 font-semibold cursor-help" title={m.tooltip_affliction()}>
        {m.event_affliction()}
      </p>
      <div className="mb-2 flex gap-3">
        <label className="flex flex-col text-xs text-[var(--sea-ink-soft)]">
          {m.label_type()}
          <select
            className="mt-0.5 rounded border border-[var(--line)] bg-white px-2 py-1 text-sm"
            value={affType}
            onChange={(e) => {
              const v = e.target.value
              if (v === "paralytic" || v === "weak" || v === "lethal" || v === "sleep") setAffType(v)
            }}
          >
            <option value="paralytic">{m.affliction_opt_paralytic()}</option>
            <option value="weak">{m.affliction_opt_weak()}</option>
            <option value="lethal">{m.affliction_opt_lethal()}</option>
            <option value="sleep">{m.affliction_opt_sleep()}</option>
          </select>
        </label>
        <NumInput
          label={m.label_duration()}
          value={affDur}
          onChange={setAffDur}
          min={0}
          max={10}
          title={m.tooltip_affliction_duration()}
        />
      </div>
      <div className="flex gap-2">
        <EventBtn
          disabled={isDead(snapshot)}
          onClick={() =>
            send({ type: "APPLY_AFFLICTION", afflictionType: affType, duration: afflictionDuration(affDur) })
          }
        >
          {m.btn_apply()}
        </EventBtn>
        {afflicted && (
          <EventBtn
            disabled={!snapshot.can({ type: "CURE_AFFLICTION" })}
            onClick={() => send({ type: "CURE_AFFLICTION" })}
          >
            {m.btn_cure()}
          </EventBtn>
        )}
      </div>
    </div>
  )
}

const EFFECT_TYPES = ["armor", "shield", "smite", "boost", "lower_attribute", "speed", "fly"] as const

function PowerEffectPanel({
  effects,
  send,
  snapshot
}: {
  send: (e: SavageEvent) => void
  snapshot: SavageSnapshot
  effects: Array<{ etype: string; timer: number }>
}) {
  const [effectType, setEffectType] = useState("armor")
  const [effectDur, setEffectDur] = useState(3)

  return (
    <div className="rounded-lg border border-[var(--line)] p-3">
      <p className="mb-2 font-semibold cursor-help" title={m.tooltip_power_effects()}>
        {m.event_power_effects()}
      </p>
      <div className="mb-2 flex gap-3">
        <label className="flex flex-col text-xs text-[var(--sea-ink-soft)]">
          {m.label_type()}
          <select
            className="mt-0.5 rounded border border-[var(--line)] bg-white px-2 py-1 text-sm"
            value={effectType}
            onChange={(e) => setEffectType(e.target.value)}
          >
            {EFFECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <NumInput
          label={m.label_duration()}
          value={effectDur}
          onChange={setEffectDur}
          min={1}
          max={10}
          title={m.tooltip_power_duration()}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <EventBtn
          disabled={isDead(snapshot)}
          onClick={() => send({ type: "APPLY_POWER_EFFECT", etype: effectType, duration: effectDur })}
        >
          {m.btn_apply()}
        </EventBtn>
        <EventBtn disabled={!snapshot.can({ type: "BACKLASH" })} onClick={() => send({ type: "BACKLASH" })}>
          {m.btn_backlash()}
        </EventBtn>
      </div>
      {effects.length > 0 && (
        <div className="mt-2 space-y-1">
          {effects.map((eff, i) => (
            <div
              key={`${eff.etype}-${i}`}
              className="flex items-center justify-between rounded border border-[var(--line)] px-2 py-1 text-xs"
            >
              <span>
                {eff.etype}{" "}
                <span className="text-[var(--sea-ink-soft)]">({m.derived_effect_rnd({ count: eff.timer })})</span>
              </span>
              <button
                className="text-red-500 hover:text-red-700"
                onClick={() => send({ type: "DISMISS_EFFECT", etype: eff.etype })}
              >
                {m.btn_dismiss()}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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
        <p className="island-kicker">{m.section_transition_log()}</p>
        {log.length > 0 && (
          <div className="flex gap-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              title={m.log_tooltip_undo()}
              className="rounded border border-[var(--line)] px-2 py-0.5 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {m.btn_undo()}
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              title={m.log_tooltip_redo()}
              className="rounded border border-[var(--line)] px-2 py-0.5 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {m.btn_redo()}
            </button>
            <button
              onClick={onClear}
              title={m.log_tooltip_clear()}
              className="rounded border border-[var(--line)] px-2 py-0.5 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[var(--surface)]"
            >
              {m.btn_clear()}
            </button>
          </div>
        )}
      </div>
      {log.length === 0 ? (
        <p className="text-xs text-[var(--sea-ink-soft)]">{m.log_no_events()}</p>
      ) : (
        <div className="max-h-64 overflow-y-auto text-xs">
          <table className="w-full">
            <thead>
              <tr className="text-left text-[var(--sea-ink-soft)]">
                <th className="pb-1 pr-2">{m.log_col_number()}</th>
                <th className="pb-1 pr-2">{m.log_col_event()}</th>
                <th className="pb-1 pr-2">{m.log_col_from()}</th>
                <th className="pb-1">{m.log_col_to()}</th>
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
                    <td className="py-1 pr-2">{stateLabel(entry.fromState)}</td>
                    <td
                      className={`py-1 ${entry.fromState !== entry.toState ? "font-semibold text-[var(--lagoon-deep)]" : ""}`}
                    >
                      {stateLabel(entry.toState)}
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
      return m.log_event_take_damage({
        margin: String(e.margin),
        soak: String(e.soakSuccesses),
        incap: String(e.incapRoll)
      })
    case "START_OF_TURN":
      return m.log_event_start_of_turn({ vigor: String(e.vigorRoll), spirit: String(e.spiritRoll) })
    case "HEAL":
      return m.log_event_heal({ amount: String(e.amount) })
    case "INTERRUPT":
      return m.log_event_interrupt({ athletics: String(e.athleticsRoll) })
    case "ESCAPE_ATTEMPT":
      return m.log_event_escape_attempt({ roll: String(e.rollResult) })
    case "GRAPPLE_ATTEMPT":
      return m.log_event_grapple_attempt({ roll: String(e.rollResult) })
    case "GRAPPLE_ESCAPE":
      return m.log_event_grapple_escape({ roll: String(e.rollResult) })
    case "PIN_ATTEMPT":
      return m.log_event_pin_attempt({ roll: String(e.rollResult) })
    case "APPLY_AFFLICTION":
      return m.log_event_apply_affliction({ type: e.afflictionType, duration: String(e.duration) })
    case "APPLY_BLINDED":
      return m.log_event_apply_blinded({ severity: String(e.severity) })
    case "APPLY_POWER_EFFECT":
      return m.log_event_apply_power_effect({ type: e.etype, duration: String(e.duration) })
    case "DISMISS_EFFECT":
      return m.log_event_dismiss_effect({ type: e.etype })
    case "END_OF_TURN":
      return m.log_event_end_of_turn({ vigor: String(e.vigorRoll) })
    default:
      return e.type
  }
}
