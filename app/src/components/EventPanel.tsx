import { useState } from "react"

import {
  isAfflicted,
  isDead,
  isGrappled,
  isOnHold,
  isRestrained,
  type SavageEvent,
  type SavageSnapshot
} from "../machine"
import * as m from "../paraglide/messages"
import {
  athleticsRollResult,
  blindedSeverity,
  damageMargin,
  escapeRollResult,
  grappleEscapeRollResult,
  grappleRollResult,
  healAmount as mkHealAmount,
  incapRollResult,
  injuryRoll as mkInjuryRoll,
  pinRollResult,
  soakSuccesses,
  spiritRollResult,
  vigorRollResult
} from "../types"
import { AfflictionPanel } from "./AfflictionPanel"
import { FearPanel } from "./FearPanel"
import { PowerEffectPanel } from "./PowerEffectPanel"
import { EventBtn, NumInput } from "./ui"

export function EventPanel({ send, snapshot }: { send: (e: SavageEvent) => void; snapshot: SavageSnapshot }) {
  const [margin, setMargin] = useState(4)
  const [soak, setSoak] = useState(0)
  const [incapRoll, setIncapRoll] = useState(0)
  const [injuryRoll, setInjuryRoll] = useState(52)
  const [vigorRoll, setVigorRoll] = useState(1)
  const [spiritRoll, setSpiritRoll] = useState(1)
  const [healAmount, setHealAmount] = useState(1)
  const [athleticsRoll, setAthleticsRoll] = useState(1)
  const [escapeRoll, setEscapeRoll] = useState(1)
  const [grappleRoll, setGrappleRoll] = useState(1)

  const dead = isDead(snapshot)
  const incapacitated = !dead && snapshot.matches({ alive: { damageTrack: "incapacitated" } })
  const grappled = !dead && isGrappled(snapshot)
  const onHold = !dead && isOnHold(snapshot)
  const restrained = !dead && isRestrained(snapshot)

  return (
    <section className="island-shell rounded-2xl p-5">
      <p className="island-kicker mb-3">{m.section_events()}</p>
      <div className="space-y-3 text-sm">
        {/* TAKE_DAMAGE */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold cursor-help" title={m.tooltip_take_damage()}>
            {m.event_take_damage()}
          </p>
          <div className="mb-2 flex gap-3">
            <NumInput
              label={m.label_margin()}
              value={margin}
              onChange={setMargin}
              min={0}
              max={20}
              title={m.tooltip_margin()}
            />
            <NumInput label={m.label_soak()} value={soak} onChange={setSoak} min={0} max={4} title={m.tooltip_soak()} />
            <NumInput
              label={m.label_incap_roll()}
              value={incapRoll}
              onChange={setIncapRoll}
              min={-1}
              max={3}
              title={m.tooltip_incap_roll()}
            />
            <NumInput
              label={m.label_injury_roll()}
              value={injuryRoll}
              onChange={setInjuryRoll}
              min={0}
              max={126}
              title={m.tooltip_injury_roll()}
            />
          </div>
          <EventBtn
            disabled={dead}
            onClick={() =>
              send({
                type: "TAKE_DAMAGE",
                margin: damageMargin(margin),
                soakSuccesses: soakSuccesses(soak),
                incapRoll: incapRollResult(incapRoll),
                injuryRoll: mkInjuryRoll(injuryRoll)
              })
            }
          >
            {m.btn_fire()}
          </EventBtn>
        </div>

        {/* START_OF_TURN */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold cursor-help" title={m.tooltip_start_of_turn()}>
            {m.event_start_of_turn()}
          </p>
          <div className="mb-2 flex gap-3">
            <NumInput
              label={m.label_vigor_roll()}
              value={vigorRoll}
              onChange={setVigorRoll}
              min={0}
              max={3}
              title={m.tooltip_vigor_roll()}
            />
            <NumInput
              label={m.label_spirit_roll()}
              value={spiritRoll}
              onChange={setSpiritRoll}
              min={0}
              max={3}
              title={m.tooltip_spirit_roll()}
            />
          </div>
          <EventBtn
            disabled={
              !snapshot.can({ type: "START_OF_TURN", vigorRoll: vigorRollResult(0), spiritRoll: spiritRollResult(0) })
            }
            onClick={() =>
              send({
                type: "START_OF_TURN",
                vigorRoll: vigorRollResult(vigorRoll),
                spiritRoll: spiritRollResult(spiritRoll)
              })
            }
          >
            {m.btn_fire()}
          </EventBtn>
        </div>

        {/* Simple events */}
        <div className="flex flex-wrap gap-2">
          <EventBtn
            disabled={!snapshot.can({ type: "END_OF_TURN", vigorRoll: vigorRollResult(0) })}
            onClick={() => send({ type: "END_OF_TURN", vigorRoll: vigorRollResult(vigorRoll) })}
          >
            {m.event_end_of_turn()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "SPEND_BENNY" })}
            onClick={() => send({ type: "SPEND_BENNY" })}
            title={m.tooltip_spend_benny()}
          >
            {m.event_spend_benny()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "APPLY_STUNNED" })} onClick={() => send({ type: "APPLY_STUNNED" })}>
            {m.event_apply_stunned()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "APPLY_DISTRACTED" })}
            onClick={() => send({ type: "APPLY_DISTRACTED" })}
          >
            {m.event_apply_distracted()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "APPLY_VULNERABLE" })}
            onClick={() => send({ type: "APPLY_VULNERABLE" })}
          >
            {m.event_apply_vulnerable()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "APPLY_FATIGUE" })} onClick={() => send({ type: "APPLY_FATIGUE" })}>
            {m.event_apply_fatigue()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "RECOVER_FATIGUE" })}
            onClick={() => send({ type: "RECOVER_FATIGUE" })}
          >
            {m.event_recover_fatigue()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "DROP_PRONE" })} onClick={() => send({ type: "DROP_PRONE" })}>
            {m.event_drop_prone()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "STAND_UP" })} onClick={() => send({ type: "STAND_UP" })}>
            {m.event_stand_up()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "GO_ON_HOLD" })} onClick={() => send({ type: "GO_ON_HOLD" })}>
            {m.event_go_on_hold()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "DEFEND" })}
            onClick={() => send({ type: "DEFEND" })}
            title={m.tooltip_defend()}
          >
            {m.event_defend()}
          </EventBtn>
          <EventBtn
            disabled={!snapshot.can({ type: "APPLY_ENTANGLED" })}
            onClick={() => send({ type: "APPLY_ENTANGLED" })}
          >
            {m.event_apply_entangled()}
          </EventBtn>
          <EventBtn disabled={!snapshot.can({ type: "APPLY_BOUND" })} onClick={() => send({ type: "APPLY_BOUND" })}>
            {m.event_apply_bound()}
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: "APPLY_BLINDED", severity: blindedSeverity(2) })}>
            {m.event_impair_vision()}
          </EventBtn>
          <EventBtn disabled={dead} onClick={() => send({ type: "APPLY_BLINDED", severity: blindedSeverity(4) })}>
            {m.event_blind()}
          </EventBtn>
          {incapacitated && (
            <EventBtn
              disabled={!snapshot.can({ type: "FINISHING_MOVE" })}
              onClick={() => send({ type: "FINISHING_MOVE" })}
            >
              {m.event_finishing_move()}
            </EventBtn>
          )}
        </div>

        {/* ON HOLD ACTIONS (visible when on hold) */}
        {onHold && (
          <div className="rounded-lg border border-[var(--line)] p-3">
            <p className="mb-2 font-semibold cursor-help" title={m.tooltip_on_hold()}>
              {m.event_on_hold()}
            </p>
            <EventBtn
              disabled={!snapshot.can({ type: "ACT_FROM_HOLD" })}
              onClick={() => send({ type: "ACT_FROM_HOLD" })}
              title={m.tooltip_act_from_hold()}
            >
              {m.btn_act()}
            </EventBtn>
            <p className="mt-3 mb-2 font-semibold cursor-help" title={m.tooltip_interrupt()}>
              {m.event_interrupt()}
            </p>
            <div className="mb-2 flex gap-3">
              <NumInput
                label={m.label_athletics_roll()}
                value={athleticsRoll}
                onChange={setAthleticsRoll}
                min={0}
                max={3}
                title={m.tooltip_athletics_roll()}
              />
            </div>
            <EventBtn onClick={() => send({ type: "INTERRUPT", athleticsRoll: athleticsRollResult(athleticsRoll) })}>
              {m.btn_fire()}
            </EventBtn>
          </div>
        )}

        {/* ESCAPE ATTEMPT (visible when restrained) */}
        {restrained && (
          <div className="rounded-lg border border-[var(--line)] p-3">
            <p className="mb-2 font-semibold cursor-help" title={m.tooltip_escape_attempt()}>
              {m.event_escape_attempt()}
            </p>
            <div className="mb-2 flex gap-3">
              <NumInput
                label={m.label_roll_result()}
                value={escapeRoll}
                onChange={setEscapeRoll}
                min={0}
                max={3}
                title={m.tooltip_escape_roll()}
              />
            </div>
            <EventBtn onClick={() => send({ type: "ESCAPE_ATTEMPT", rollResult: escapeRollResult(escapeRoll) })}>
              {m.btn_fire()}
            </EventBtn>
          </div>
        )}

        {/* GRAPPLE */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold cursor-help" title={m.tooltip_grapple()}>
            {m.event_grapple()}
          </p>
          <div className="mb-2 flex gap-3">
            <NumInput
              label={m.label_roll_result()}
              value={grappleRoll}
              onChange={setGrappleRoll}
              min={0}
              max={3}
              title={m.tooltip_grapple_roll()}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <EventBtn
              disabled={dead}
              onClick={() =>
                send({ type: "GRAPPLE_ATTEMPT", rollResult: grappleRollResult(grappleRoll), opponent: "opp1" })
              }
            >
              {m.btn_grapple()}
            </EventBtn>
            {grappled && (
              <>
                <EventBtn
                  onClick={() => send({ type: "GRAPPLE_ESCAPE", rollResult: grappleEscapeRollResult(grappleRoll) })}
                >
                  {m.btn_escape_grapple()}
                </EventBtn>
                <EventBtn onClick={() => send({ type: "PIN_ATTEMPT", rollResult: pinRollResult(grappleRoll) })}>
                  {m.btn_pin()}
                </EventBtn>
              </>
            )}
          </div>
        </div>

        {/* HEAL */}
        <div className="rounded-lg border border-[var(--line)] p-3">
          <p className="mb-2 font-semibold cursor-help" title={m.tooltip_heal()}>
            {m.event_heal()}
          </p>
          <div className="mb-2">
            <NumInput
              label={m.label_amount()}
              value={healAmount}
              onChange={setHealAmount}
              min={1}
              max={3}
              title={m.tooltip_heal_amount()}
            />
          </div>
          <EventBtn
            disabled={!snapshot.can({ type: "HEAL", amount: mkHealAmount(1) })}
            onClick={() => send({ type: "HEAL", amount: mkHealAmount(healAmount) })}
          >
            {m.btn_fire()}
          </EventBtn>
        </div>

        {/* FEAR CHECK */}
        <FearPanel send={send} dead={dead} />

        {/* AFFLICTION */}
        <AfflictionPanel send={send} snapshot={snapshot} afflicted={!dead && isAfflicted(snapshot)} />

        {/* POWER EFFECTS */}
        <PowerEffectPanel send={send} snapshot={snapshot} effects={snapshot.context.activeEffects} />
      </div>
    </section>
  )
}
