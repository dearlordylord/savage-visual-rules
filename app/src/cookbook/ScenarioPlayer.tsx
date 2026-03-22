import { useCallback, useRef, useState } from "react"
import { createActor } from "xstate"

import { savageMachine, type SavageSnapshot } from "../machine"
import type { Scenario } from "../scenarios"
import { StateSummary } from "./StateSummary"

interface ScenarioPlayerProps {
  scenario: Scenario
}

interface StepResult {
  stepIndex: number
  snapshot: SavageSnapshot
  assertions: Array<{ desc: string; passed: boolean }>
}

export function ScenarioPlayer({ scenario }: ScenarioPlayerProps) {
  const [results, setResults] = useState<Array<StepResult>>([])
  const [currentStep, setCurrentStep] = useState(0)
  const actorRef = useRef<ReturnType<typeof createActor<typeof savageMachine>> | null>(null)

  const reset = useCallback(() => {
    actorRef.current?.stop()
    actorRef.current = null
    setResults([])
    setCurrentStep(0)
  }, [])

  const advance = useCallback(() => {
    if (currentStep >= scenario.steps.length) return

    if (!actorRef.current) {
      const actor = createActor(savageMachine, {
        input: { isWildCard: scenario.characterType === "wildCard" }
      })
      actor.start()
      actorRef.current = actor
    }

    const step = scenario.steps[currentStep]
    if (step.event) {
      actorRef.current.send(step.event)
    }

    const snap = actorRef.current.getSnapshot()
    const assertions = step.expect.map((e) => ({
      desc: e.desc,
      passed: e.check(snap)
    }))

    setResults((prev) => [...prev, { stepIndex: currentStep, snapshot: snap, assertions }])
    setCurrentStep((prev) => prev + 1)
  }, [currentStep, scenario])

  const playAll = useCallback(() => {
    reset()

    const actor = createActor(savageMachine, {
      input: { isWildCard: scenario.characterType === "wildCard" }
    })
    actor.start()
    actorRef.current = actor

    const allResults: Array<StepResult> = []
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i]
      if (step.event) {
        actor.send(step.event)
      }
      const snap = actor.getSnapshot()
      const assertions = step.expect.map((e) => ({
        desc: e.desc,
        passed: e.check(snap)
      }))
      allResults.push({ stepIndex: i, snapshot: snap, assertions })
    }
    setResults(allResults)
    setCurrentStep(scenario.steps.length)
  }, [scenario, reset])

  const done = currentStep >= scenario.steps.length
  const lastSnap = results.length > 0 ? results[results.length - 1].snapshot : null

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-[var(--sea-ink)]">{scenario.title}</h2>
        <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">{scenario.description}</p>
        <p className="mt-1 text-[10px] text-[var(--sea-ink-soft)] opacity-60">
          {scenario.characterType === "wildCard" ? "Дикая карта" : "Статист"}
        </p>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-2">
        {scenario.steps.map((step, i) => {
          const isCurrent = i === currentStep
          const isPast = i < currentStep
          const result = isPast || (isCurrent && results.length > i) ? results[i] : undefined

          return (
            <div
              key={i}
              className={`rounded-lg border px-3 py-2 text-xs transition ${
                isCurrent
                  ? "border-[var(--lagoon)] bg-[rgba(79,184,178,0.06)]"
                  : isPast
                    ? "border-[var(--line)] bg-[var(--surface)]"
                    : "border-transparent bg-[var(--surface)] opacity-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-[var(--sea-ink-soft)]">{i + 1}.</span>
                <span
                  className={`font-medium ${isPast || isCurrent ? "text-[var(--sea-ink)]" : "text-[var(--sea-ink-soft)]"}`}
                >
                  {step.label}
                </span>
                {step.event && (
                  <code className="ml-auto text-[10px] text-[var(--sea-ink-soft)]">{step.event.type}</code>
                )}
              </div>
              {result !== undefined && result.assertions.length > 0 && (
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {result.assertions.map((a, j) => (
                    <div key={j} className="flex items-center gap-1.5 text-[11px]">
                      <span className={a.passed ? "text-green-600" : "text-red-500"}>
                        {a.passed ? "\u2713" : "\u2717"}
                      </span>
                      <span className={a.passed ? "text-[var(--sea-ink-soft)]" : "font-semibold text-red-600"}>
                        {a.desc}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* State summary */}
      {lastSnap && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
            Состояние
          </div>
          <StateSummary snapshot={lastSnap} />
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={advance}
          disabled={done}
          className="rounded-lg border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-3 py-1.5 text-xs font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.24)] disabled:opacity-30"
        >
          Далее
        </button>
        <button
          type="button"
          onClick={playAll}
          disabled={done}
          className="rounded-lg border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-3 py-1.5 text-xs font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.24)] disabled:opacity-30"
        >
          Показать всё
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[rgba(79,184,178,0.08)]"
        >
          Сброс
        </button>
      </div>
    </div>
  )
}
