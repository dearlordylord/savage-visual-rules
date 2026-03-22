import { useMemo } from "react"
import { createActor } from "xstate"

import { savageMachine, type SavageSnapshot } from "../machine"
import * as m from "../paraglide/messages"
import type { Scenario } from "../scenarios"
import { StateSummary } from "./StateSummary"

// eslint-disable-next-line functional/no-mixed-types -- React component props
interface ScenarioPlayerProps {
  scenario: Scenario
  step: number | undefined
  onStepChange: (step: number | undefined) => void
}

interface StepResult {
  stepIndex: number
  snapshot: SavageSnapshot
  assertions: Array<{ desc: () => string; passed: boolean }>
}

function computeResults(scenario: Scenario, completedCount: number): ReadonlyArray<StepResult> {
  if (completedCount <= 0) return []
  const actor = createActor(savageMachine, {
    input: { isWildCard: scenario.characterType === "wildCard" }
  })
  actor.start()
  const count = Math.min(completedCount, scenario.steps.length)
  const results = scenario.steps.slice(0, count).map((step, i) => {
    if (step.event) actor.send(step.event)
    const snap = actor.getSnapshot()
    return {
      stepIndex: i,
      snapshot: snap,
      assertions: step.expect.map((e) => ({ desc: e.desc, passed: e.check(snap) }))
    }
  })
  actor.stop()
  return results
}

export function ScenarioPlayer({ onStepChange, scenario, step }: ScenarioPlayerProps) {
  const completedCount = step ?? 0
  const results = useMemo(() => computeResults(scenario, completedCount), [scenario, completedCount])

  const done = results.length >= scenario.steps.length
  const lastSnap = results.length > 0 ? results[results.length - 1].snapshot : null

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-[var(--sea-ink)]">{scenario.title()}</h2>
        <p className="mt-1 text-xs text-[var(--sea-ink-soft)]">{scenario.description()}</p>
        <p className="mt-1 text-[10px] text-[var(--sea-ink-soft)] opacity-60">
          {scenario.characterType === "wildCard" ? m.cookbook_wild_card() : m.cookbook_extra()}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {scenario.steps.map((scenarioStep, i) => {
          const isPast = i < results.length
          const isCurrent = i === results.length
          const result = isPast ? results[i] : undefined

          return (
            <div
              key={i}
              onClick={isCurrent ? undefined : () => onStepChange(i || undefined)}
              className={`rounded-lg border px-3 py-2 text-xs transition ${
                isCurrent
                  ? "border-[var(--lagoon)] bg-[rgba(79,184,178,0.06)]"
                  : isPast
                    ? "cursor-pointer border-[var(--line)] bg-[var(--surface)] hover:border-[var(--lagoon)] hover:bg-[rgba(79,184,178,0.04)]"
                    : "cursor-pointer border-transparent bg-[var(--surface)] opacity-50 hover:opacity-75"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-[var(--sea-ink-soft)]">{i + 1}.</span>
                <span
                  className={`font-medium ${isPast || isCurrent ? "text-[var(--sea-ink)]" : "text-[var(--sea-ink-soft)]"}`}
                >
                  {scenarioStep.label()}
                </span>
                {scenarioStep.event && (
                  <code className="ml-auto text-[10px] text-[var(--sea-ink-soft)]">{scenarioStep.event.type}</code>
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
                        {a.desc()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {lastSnap && (
        <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sea-ink-soft)]">
            {m.cookbook_state()}
          </div>
          <StateSummary snapshot={lastSnap} />
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onStepChange(completedCount + 1)}
          disabled={done}
          className="rounded-lg border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-3 py-1.5 text-xs font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.24)] disabled:opacity-30"
        >
          {m.cookbook_btn_next()}
        </button>
        <button
          type="button"
          onClick={() => onStepChange(scenario.steps.length)}
          disabled={done}
          className="rounded-lg border border-[rgba(50,143,151,0.3)] bg-[rgba(79,184,178,0.14)] px-3 py-1.5 text-xs font-semibold text-[var(--lagoon-deep)] transition hover:bg-[rgba(79,184,178,0.24)] disabled:opacity-30"
        >
          {m.cookbook_btn_play_all()}
        </button>
        {results.length > 0 && (
          <button
            type="button"
            onClick={() => onStepChange(undefined)}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[rgba(79,184,178,0.08)]"
          >
            {m.cookbook_btn_reset()}
          </button>
        )}
      </div>
    </div>
  )
}
