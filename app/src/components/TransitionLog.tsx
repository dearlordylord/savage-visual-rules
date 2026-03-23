import type { SavageEvent, SavageSnapshot } from "../machine"
import { isDead } from "../machine"
import * as m from "../paraglide/messages"

type StateKey = "dead" | "incap_bleeding" | "incap_stable" | "shaken" | "wounded" | "active"

export interface LogEntry {
  id: number
  event: SavageEvent
  fromState: StateKey
  toState: StateKey
}

const STATE_LABELS: Record<StateKey, () => string> = {
  dead: m.statelabel_dead,
  incap_bleeding: m.statelabel_incap_bleeding,
  incap_stable: m.statelabel_incap_stable,
  shaken: m.statelabel_shaken,
  wounded: m.statelabel_wounded,
  active: m.statelabel_active
}

export function stateKey(snap: SavageSnapshot): StateKey {
  if (isDead(snap)) return "dead"
  if (snap.matches({ alive: { damageTrack: { incapacitated: "bleedingOut" } } })) return "incap_bleeding"
  if (snap.matches({ alive: { damageTrack: { incapacitated: "stable" } } })) return "incap_stable"
  if (snap.matches({ alive: { damageTrack: { active: "shaken" } } })) return "shaken"
  if (snap.matches({ alive: { damageTrack: { active: "wounded" } } })) return "wounded"
  return "active"
}

function stateLabel(key: StateKey): string {
  return STATE_LABELS[key]()
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

export function TransitionLog({
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
