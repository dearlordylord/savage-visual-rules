import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"

import { LocaleToggle } from "../components/LocaleToggle"
import { ScenarioBrowser } from "../cookbook/ScenarioBrowser"
import { ScenarioPlayer } from "../cookbook/ScenarioPlayer"
import * as m from "../paraglide/messages"
import { scenarios } from "../scenarios"

function parseSplat(splat: string): { scenarioId: string | undefined; step: number | undefined } {
  const parts = splat.split("/").filter(Boolean)
  const scenarioId = parts[0]
  const rawStep = parts[1] ? Number(parts[1]) : undefined
  return { scenarioId, step: Number.isFinite(rawStep) ? rawStep : undefined }
}

export const Route = createFileRoute("/cookbook/$")({
  component: CookbookPage
})

function CookbookPage() {
  const { _splat } = Route.useParams()
  const navigate = useNavigate()
  const { scenarioId, step } = parseSplat(_splat ?? "")
  const selected = scenarios.find((sc) => sc.id === scenarioId) ?? scenarios[0]
  const key = selected.id

  const setSelected = (sc: (typeof scenarios)[number] | null) => {
    void navigate({ to: "/cookbook/$", params: { _splat: sc?.id ?? "" }, replace: true })
  }

  const setStep = (stepNum: number | undefined) => {
    const id = selected.id
    const splat = stepNum != null ? `${id}/${String(stepNum)}` : id
    void navigate({ to: "/cookbook/$", params: { _splat: splat }, replace: true })
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[rgba(79,184,178,0.08)]"
        >
          &larr;
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--sea-ink)]">
          {m.cookbook_title()}
        </h1>
        <LocaleToggle />
      </div>

      <div className="grid flex-1 gap-4 lg:grid-cols-[260px_1fr]">
        <div className="island-shell rounded-2xl p-3">
          <ScenarioBrowser selected={selected} onSelect={setSelected} />
        </div>

        <div className="island-shell rounded-2xl p-5">
          <ScenarioPlayer key={key} scenario={selected} step={step} onStepChange={setStep} />
        </div>
      </div>
    </div>
  )
}
