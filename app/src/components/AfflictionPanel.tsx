import { useState } from "react"

import { isDead, type SavageEvent, type SavageSnapshot } from "../machine"
import * as m from "../paraglide/messages"
import type { AfflictionType } from "../types"
import { afflictionDuration } from "../types"
import { EventBtn, NumInput } from "./ui"

export function AfflictionPanel({
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
            className="mt-0.5 rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--sea-ink)]"
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
