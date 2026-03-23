import { useState } from "react"

import { type FearResult, resolveFear, type SavageEvent } from "../machine"
import * as m from "../paraglide/messages"
import { EventBtn, NumInput } from "./ui"

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

export function FearPanel({ dead, send }: { send: (e: SavageEvent) => void; dead: boolean }) {
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
