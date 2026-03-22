import { createFileRoute, Link } from "@tanstack/react-router"
import { useCallback, useState } from "react"

import { ScenarioBrowser } from "../cookbook/ScenarioBrowser"
import { ScenarioPlayer } from "../cookbook/ScenarioPlayer"
import { type Scenario, scenarios } from "../scenarios"

export const Route = createFileRoute("/cookbook")({ component: CookbookPage })

function CookbookPage() {
  const [selected, setSelected] = useState<Scenario | null>(scenarios[0] ?? null)

  const handleSelect = useCallback((s: Scenario) => {
    setSelected(s)
  }, [])

  // Reset player when scenario changes via key prop
  const key = selected?.id ?? "none"

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-xs font-semibold text-[var(--sea-ink-soft)] transition hover:bg-[rgba(79,184,178,0.08)]"
        >
          &larr;
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-xl font-bold text-[var(--sea-ink)]">
          Примеры механик SWADE
        </h1>
      </div>

      {/* Content */}
      <div className="grid flex-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <div className="island-shell rounded-2xl p-3">
          <ScenarioBrowser selected={selected} onSelect={handleSelect} />
        </div>

        {/* Main */}
        <div className="island-shell rounded-2xl p-5">
          {selected ? (
            <ScenarioPlayer key={key} scenario={selected} />
          ) : (
            <p className="text-sm text-[var(--sea-ink-soft)]">Выберите сценарий</p>
          )}
        </div>
      </div>
    </div>
  )
}
