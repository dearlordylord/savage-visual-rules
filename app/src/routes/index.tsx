import { createFileRoute, Link } from "@tanstack/react-router"
import { useCallback, useEffect, useRef, useState } from "react"
import { createActor } from "xstate"

import { DerivedValues } from "../components/DerivedValues"
import { EventPanel } from "../components/EventPanel"
import { LocaleToggle } from "../components/LocaleToggle"
import { StateTree } from "../components/StateTree"
import { StatusReference } from "../components/StatusReference"
import { type LogEntry, stateKey, TransitionLog } from "../components/TransitionLog"
import { type SavageEvent, savageMachine, type SavageSnapshot } from "../machine"
import * as m from "../paraglide/messages"

export const Route = createFileRoute("/")({ component: App })

// ============================================================
// Replay helper — creates a fresh actor, replays events, returns snapshot
// ============================================================

interface CharInput {
  isWildCard: boolean
  hardy: boolean
}

function replayEvents(
  input: CharInput,
  events: Array<SavageEvent>
): { actor: ReturnType<typeof createActor<typeof savageMachine>>; snapshot: SavageSnapshot } {
  const actor = createActor(savageMachine, { input })
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
  const [hardy, setHardy] = useState(false)
  const logIdRef = useRef(0)
  const cursorRef = useRef(-1)
  // Keep ref in sync with state
  const updateCursor = useCallback((val: number) => {
    cursorRef.current = val
    setCursor(val)
  }, [])

  const initActor = useCallback(
    (input: CharInput) => {
      actorRef.current?.stop()
      const actor = createActor(savageMachine, { input })
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
    initActor({ isWildCard, hardy })
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

  const charInput: CharInput = { isWildCard, hardy }

  const jumpTo = useCallback(
    (targetIndex: number) => {
      // targetIndex: -1 = initial state, 0..log.length-1 = after that event
      setLog((currentLog) => {
        if (targetIndex < -1 || targetIndex >= currentLog.length) return currentLog
        actorRef.current?.stop()
        const eventsToReplay = currentLog.slice(0, targetIndex + 1).map((e) => e.event)
        const { actor, snapshot: newSnap } = replayEvents(charInput, eventsToReplay)
        actor.subscribe(setSnapshot)
        actorRef.current = actor
        setSnapshot(newSnap)
        updateCursor(targetIndex)
        return currentLog
      })
    },
    [isWildCard, hardy, updateCursor]
  )

  const canUndo = cursor >= 0
  const canRedo = cursor < log.length - 1

  const resetType = useCallback(
    (wc: boolean) => {
      setIsWildCard(wc)
      initActor({ isWildCard: wc, hardy })
    },
    [initActor, hardy]
  )

  const toggleHardy = useCallback(() => {
    const next = !hardy
    setHardy(next)
    actorRef.current?.send({ type: "SET_HARDY", hardy: next })
  }, [hardy])

  if (!snapshot) return null

  return (
    <main className="page-wrap px-4 pb-8 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--sea-ink)]">{m.app_title()}</h1>
        <div className="flex items-center gap-3">
          <LocaleToggle />
          <Link
            to="/cookbook/$"
            params={{ _splat: "" }}
            className="rounded-lg border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-3 py-1.5 text-xs font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.24)]"
          >
            {m.cookbook_link()}
          </Link>
          <div className="flex items-center gap-2">
            <button
              onClick={() => resetType(true)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${isWildCard ? "border-[var(--lagoon)] bg-[rgba(79,184,178,0.2)] text-[var(--lagoon-deep)]" : "border-[var(--line)] text-[var(--sea-ink-soft)]"}`}
            >
              {m.wild_card()}
            </button>
            <button
              onClick={() => resetType(false)}
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
          <EventPanel send={send} snapshot={snapshot} hardy={hardy} onToggleHardy={toggleHardy} />
          <TransitionLog
            log={log}
            cursor={cursor}
            canUndo={canUndo}
            canRedo={canRedo}
            onJumpTo={jumpTo}
            onUndo={() => jumpTo(cursor - 1)}
            onRedo={() => jumpTo(cursor + 1)}
            onClear={() => initActor(charInput)}
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
