import { useState } from "react"

import { isDead, type SavageEvent, type SavageSnapshot } from "../machine"
import * as m from "../paraglide/messages"
import { EventBtn, NumInput } from "./ui"

const EFFECT_TYPES = ["armor", "shield", "smite", "boost", "lower_attribute", "speed", "fly"] as const

export function PowerEffectPanel({
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
            className="mt-0.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--sea-ink)]"
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
