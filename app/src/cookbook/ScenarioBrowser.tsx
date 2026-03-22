import { useState } from "react"

import { CATEGORY_LABELS, type Scenario, type ScenarioCategory, scenarios } from "../scenarios"

// eslint-disable-next-line functional/no-mixed-types -- props naturally mix data + callbacks
type ScenarioBrowserProps = Readonly<{
  selected: Scenario | null
  onSelect: (scenario: Scenario) => void
}>

const groups: Map<ScenarioCategory, Array<Scenario>> = (() => {
  const g = new Map<ScenarioCategory, Array<Scenario>>()
  for (const s of scenarios) {
    const list = g.get(s.category) ?? []
    list.push(s)
    g.set(s.category, list)
  }
  return g
})()

const visibleCategories = (Object.keys(CATEGORY_LABELS) as Array<ScenarioCategory>).filter((cat) => groups.has(cat))

export function ScenarioBrowser({ onSelect, selected }: ScenarioBrowserProps) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(selected ? [selected.category] : [visibleCategories[0]])
  )

  function toggle(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <nav className="flex flex-col gap-0.5 overflow-y-auto pr-1">
      {visibleCategories.map((cat) => {
        const label = CATEGORY_LABELS[cat]()
        const items = groups.get(cat)!
        const isOpen = expanded.has(cat)
        return (
          <div key={cat}>
            <button
              type="button"
              onClick={() => toggle(cat)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-[var(--sea-ink)] transition hover:bg-[rgba(79,184,178,0.1)]"
            >
              <span className="text-[10px] text-[var(--sea-ink-soft)]">{isOpen ? "▾" : "▸"}</span>
              {label}
              <span className="ml-auto text-[10px] text-[var(--sea-ink-soft)]">{items.length}</span>
            </button>
            {isOpen && (
              <div className="ml-3 flex flex-col gap-0.5">
                {items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onSelect(s)}
                    className={`rounded-md px-2.5 py-1 text-left text-xs transition ${
                      selected?.id === s.id
                        ? "bg-[rgba(79,184,178,0.18)] font-semibold text-[var(--lagoon-deep)]"
                        : "text-[var(--sea-ink-soft)] hover:bg-[rgba(79,184,178,0.08)]"
                    }`}
                  >
                    {s.title()}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
