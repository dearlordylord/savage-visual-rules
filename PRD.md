# PRD: Grow SWADE Character State Machine

## Problem Statement

The Savage Worlds SWADE character state machine currently models ~60% of combat-relevant character state: damage track (shaken/wounded/incapacitated/dead), conditions (stunned/distracted/vulnerable), fatigue levels, and turn phases. Many common combat situations — going prone, being grappled, holding actions, suffering injuries, being poisoned or blinded — have no representation. Players and GMs must track these manually, losing the formal verification guarantees the Quint spec provides for the existing states.

## Solution

Grow the state machine in 9 incremental steps organized into two phases. Each step adds a new parallel region or extends an existing one, following the established pattern: spec in Quint first, port to XState, port tests. Phase 1 (Steps 1-4) completes core combat status. Phase 2 (Steps 5-9) adds extended combat, powers, and environmental systems. Each step is independently shippable — the machine remains valid after any step.

## User Stories

1. As a player, I want to track my character's prone status, so that attack modifiers are automatically applied.
2. As a player, I want to hold my action and interrupt another character, so that I can react tactically to the initiative order.
3. As a GM, I want entangled/bound states to automatically apply distracted and vulnerable, so that I don't forget cascading condition rules.
4. As a player, I want injuries from incapacitation to persist on my character sheet, so that I know my permanent penalties.
5. As a GM, I want grapple states (grabbed/pinned) to automatically make the attacker vulnerable, so that the two-way cost of grappling is tracked.
6. As a player, I want blinded severity to auto-shed each turn via Vigor check, so that recovery is tracked without manual bookkeeping.
7. As a GM, I want to resolve a fear check and have the machine apply the correct combination of shaken/stunned/distracted/vulnerable/fatigue, so that fear table results are automated.
8. As a player, I want poison and disease effects to automatically generate fatigue/wounds/stunned each turn, so that ongoing afflictions don't get forgotten.
9. As a player, I want power buff/debuff durations tracked and auto-expired, so that spell maintenance is handled correctly.
10. As a GM, I want backlash (crit fail on casting) to automatically clear all active power effects and add fatigue, so that the cascade is instant and correct.
11. As a developer, I want each new region specified in Quint with invariants before XState implementation, so that formal verification continues to cover all state transitions.
12. As a developer, I want each step to be independently mergeable, so that the machine grows incrementally without big-bang integration risk.

## Implementation Decisions

### Architecture

The existing machine is a parallel XState v5 machine with 4 regions inside `alive`. Growth follows the same pattern: add new parallel regions or extend existing ones. The Quint spec (`savage.qnt`) remains the source of truth — each module is specced and verified in Quint first, then mechanically ported to XState.

### Phase 1: Combat Status Completion

#### Module A: Position Track (Step 1 — Prone)

New parallel region `positionTrack` inside `alive`.

- **States**: `standing | prone`
- **Events**: `DROP_PRONE`, `STAND_UP`
- **Guards**: must be in `damageTrack.active` and not `fatigueTrack.incapByFatigue`
- **Cross-region**: none — penalties are derived via helper functions (`isProne(snap)`)
- **Derived helpers**: `isProne()` affects attack modifier calculations
- **On death**: auto-clear (reset to standing via dead entry or structural guarantee)
- **Quint additions**: `prone: bool` field in State, `pDropProne`, `pStandUp` pure functions, invariant `proneImpliesActive`

#### Module B: Hold/Interrupt (Step 2 — Extend turnPhase)

Extend existing `turnPhase` region.

- **States**: `othersTurn | ownTurn | onHold`
- **New events**: `GO_ON_HOLD`, `INTERRUPT { athleticsRoll: number }`
- **Transitions**:
  - `ownTurn` → `onHold` via `GO_ON_HOLD`
  - `onHold` → `ownTurn` via `INTERRUPT` (athleticsRoll >= 1)
  - `onHold` → `othersTurn` via `INTERRUPT` (athleticsRoll < 1, failed interrupt)
  - `onHold` → `othersTurn` via `END_OF_ROUND` (hold expires, no new card next round)
- **Cross-region guards**: `always` transition from `onHold` → `othersTurn` when entering `stunned` or `shaken` (lose hold)
- **Context**: `onHold: boolean` mirror (like `ownTurn`) if needed by other guards
- **Quint additions**: extend `pStartOfTurn`/`pEndOfTurn`, add `pGoOnHold`, `pInterrupt`

#### Module C: Restraint Track (Step 3 — Bound/Entangled)

New parallel region `restraintTrack` inside `alive`.

- **States**: `free | entangled | bound`
- **Events**: `APPLY_ENTANGLED`, `APPLY_BOUND`, `ESCAPE_ATTEMPT { rollResult: number }`
- **Escape logic**:
  - From `bound`: rollResult >= 1 → `entangled`; rollResult >= 2 (raise) → `free`
  - From `entangled`: rollResult >= 1 → `free`
- **Cross-region side effects**: entering `bound` calls `setDistractedTimer` + `setVulnerableTimer` (reuses existing actions)
- **Guards**: must be in `damageTrack.active` and not `fatigueTrack.incapByFatigue`
- **On death**: auto-clear to `free`
- **Quint additions**: `restrained: int` (-1 = free, 0 = entangled, 1 = bound), `pApplyEntangled`, `pApplyBound`, `pEscapeAttempt`, invariant `boundImpliesDistractedAndVulnerable`

#### Module D: Injury System (Step 4 — Extend Incapacitated)

Extend `damageTrack.incapacitated` and add context.

- **New context**: `injuries: InjuryType[]` where `InjuryType` is a discriminated union (arm, leg, head, gut, broken, scarred, etc.)
- **Pure function**: `resolveInjury(tableRoll: number): InjuryType` — maps d6 result to injury type per SWADE Injury Table
- **Trigger**: when `TAKE_DAMAGE` leads to incapacitation with `incapRoll >= 1` (success or raise), also resolve injury and append to context
- **New event (optional)**: `APPLY_INJURY { tableRoll: number }` for injuries from sources other than incapacitation (e.g., called shots)
- **Derived helpers**: `injuryPenalty(snap): number` computes total penalty from accumulated injuries; `hasInjury(snap, type): boolean`
- **Injuries persist**: healing wounds does not remove injuries; injuries survive incapacitated → active transitions
- **Quint additions**: `injuries: List[InjuryType]` in State, `pResolveInjury` pure function, invariant `injuriesOnlyFromIncap` (injuries list only grows when incapacitated)

### Phase 2: Extended Combat

#### Module E: Grapple System (Step 5)

Extend `restraintTrack` with grapple-specific states or add sibling region.

- **States**: `free | grabbed | pinned` (grapple is distinct from entangled/bound — has active opponent)
- **Events**: `GRAPPLE_ATTEMPT { rollResult }`, `GRAPPLE_ESCAPE { rollResult }`, `PIN_ATTEMPT { rollResult }`
- **Key mechanic**: attacker becomes vulnerable while maintaining grapple (cross-character effect — attacker's machine receives `APPLY_VULNERABLE`)
- **Design decision**: grapple and restraint share the `restraintTrack` region (character can't be both entangled and grappled — they're mutually exclusive restraint types). States become: `free | entangled | bound | grabbed | pinned`.
- **Context**: `grappledBy: string | null` (reference to opponent, needed for two-actor resolution)
- **Quint**: extend restrained type, add `pGrappleAttempt`, `pGrappleEscape`, `pPinAttempt`

#### Module F: Sensory Conditions (Step 6 — Blinded)

New sub-region in `conditionTrack`.

- **States**: `clear | impaired | blinded` (impaired = -2, blinded = -4)
- **Events**: `APPLY_BLINDED { severity: 2 | 4 }`
- **Recovery**: on `START_OF_TURN`, Vigor check reduces severity by 2 (success) or clears entirely (raise)
- **Guards**: `vigorSuccess` reduces one step; `vigorRaise` clears to `clear`
- **Cross-region**: reads `turnPhase` for timing (same pattern as stunned recovery)
- **Quint**: `blinded: int` (0 = clear, 2 = impaired, 4 = blinded), `pApplyBlinded`, recovery in `pStartOfTurn`

#### Module G: Fear Table Resolver (Step 7)

Pure function, not a new state region.

- **Interface**: `resolveFear(tableRoll: number, modifier: number): SavageEvent[]`
- **Output examples**:
  - Roll 4-6 → `[{ type: 'APPLY_DISTRACTED' }]`
  - Roll 7-9 → `[{ type: 'APPLY_VULNERABLE' }]`
  - Roll 10-12 → `[{ type: 'APPLY_STUNNED' }]` (maps to shaken in original, but stunned is more accurate per table)
  - Roll 22+ → heart attack: `[{ type: 'TAKE_DAMAGE', margin: ..., soakSuccesses: 0, incapRoll: ... }]` or special event
- **Edge cases**: phobia (rolls 18-21) adds to `injuries`/hindrance context; slowness (rolls 14-15) similar
- **No machine changes needed** for most results — just dispatches existing events
- **Quint**: pure function `fearTableResult(roll: int): List[Action]`, no state variable changes

#### Module H: Poison/Disease Track (Step 8)

New parallel region `afflictionTrack` inside `alive`.

- **States**: `healthy | afflicted`
- **Afflicted sub-states by type**: `paralytic | weak | lethal | sleep`
- **Context**: `afflictionTimer: number` (turns/hours remaining), `afflictionType: string`
- **Events**: `APPLY_AFFLICTION { type, duration }`, `CURE_AFFLICTION`
- **Autonomous effects on `START_OF_TURN`**:
  - Paralytic: blocks stunned recovery for `afflictionTimer` turns (guard on stun recovery)
  - Weak: dispatches internal fatigue increment
  - Lethal: dispatches fatigue + wound each turn
  - Sleep: enters incapacitated-like state (unconscious), wakes on loud noise or contact
- **Cross-region**: generates events into fatigue/damage/condition tracks
- **Quint**: `affliction: {type: str, timer: int} | None`, `pApplyAffliction`, `pCureAffliction`, tick in `pStartOfTurn`

#### Module I: Power Duration System (Step 9)

Context-based effect array with tick-down.

- **Context**: `activeEffects: { type: EffectType, roundsRemaining: number }[]`
- **Events**: `APPLY_POWER_EFFECT { type, duration }`, `DISMISS_EFFECT { type }`, `BACKLASH`
- **On `END_OF_TURN`**: tick all `roundsRemaining--`, remove where `roundsRemaining <= 0`
- **Backlash**: clear entire `activeEffects` array + increment fatigue (APPLY_FATIGUE side effect)
- **Effect types**: `armor | shield | smite | boost | lower_attribute | speed | fly | ...`
- **Derived helpers**: `activeBonus(snap, type): number` returns current bonus for a given effect type
- **Maintenance** (power point cost) is outside machine scope — tracked at game layer
- **Quint**: `activeEffects: List[{etype: str, timer: int}]`, `pApplyEffect`, `pDismissEffect`, `pBacklash`, tick in `pEndOfTurn`

### Cross-cutting Concerns

- **Death clears everything**: entering `dead` resets all new regions to default (prone→standing, restraint→free, affliction→healthy, activeEffects→[], etc.). Follows existing pattern where `die()` in Quint clears all conditions.
- **Incapacitation blocks conditions**: guards on new condition applications check `stateIn(DAMAGE_ACTIVE)` and `not(stateIn(FATIGUE_INCAP))`, same as existing conditions.
- **Event ordering**: XState parallel regions process events atomically. Cross-region side effects (bound → distracted+vulnerable) happen via actions on the transition, not separate events.

## Testing Decisions

### Test strategy per module

Each module follows the established pattern: Quint spec with invariants verified first, then mirrored vitest tests in `app/src/machine.test.ts`.

- **Module A (Prone)**: 4-6 tests. Drop/stand cycle, can't stand when incapacitated, prone clears on death, prone persists across turns.
- **Module B (Hold)**: 6-8 tests. Hold → interrupt success/fail, lose hold on shaken, lose hold on stunned, hold expires at round end, hold carries to next round without new card.
- **Module C (Restraint)**: 8-10 tests. Entangle/bind/escape at each level, bound auto-applies distracted+vulnerable, escape with raise vs. success, can't restrain dead/incapacitated.
- **Module D (Injury)**: 6-8 tests. Each injury table entry, injuries persist after healing, multiple injuries accumulate, injury penalty calculation.
- **Module E (Grapple)**: 8-10 tests. Grab/pin/escape, attacker vulnerability, mutual exclusion with entangled, opponent stunned doesn't release grapple.
- **Module F (Blinded)**: 6-8 tests. Apply at each severity, recovery step-down via Vigor, full clear on raise, blinded clears on death.
- **Module G (Fear resolver)**: 10-12 tests. Each fear table bracket, modifier shifts, edge cases (heart attack, phobia).
- **Module H (Affliction)**: 10-12 tests. Each poison type produces correct side effects per turn, cure clears, duration expires, paralytic blocks stun recovery.
- **Module I (Power durations)**: 8-10 tests. Duration tick-down, removal on expiry, backlash clears all + fatigue, dismiss individual effect, multiple simultaneous effects.

### Quint invariants to add

- `proneImpliesActive`: prone only when alive and active
- `boundImpliesDistractedAndVulnerable`: bound state forces condition timers active
- `restraintMutualExclusion`: can't be both entangled and grabbed simultaneously
- `injuriesPersist`: injuries list never shrinks (no healing removes them)
- `afflictionTimerValid`: afflictionTimer >= -1 (same as existing timer pattern)
- `activeEffectsTimersValid`: all roundsRemaining > 0 in the array (expired entries removed)
- `deathClearsAll`: dead implies all regions at default

### Existing test suite

27 tests in `savageTest.qnt` already verify current behavior. Each module adds its own test run. Regression: all existing 27 tests must continue passing after each step.

## Out of Scope

- **Multi-character interactions**: grapple attacker's state changes are signaled externally (the machine models one character; the game layer coordinates two machines)
- **Power Points resource pool**: tracked at game/caster layer, not character status machine
- **Natural healing (5-day timer)**: out-of-combat long-term mechanic on a different timescale
- **Golden Hour enforcement**: per-healer attempt tracking requires healer identity — game layer concern
- **Equipment/inventory state**: armed/disarmed, weapon breakage — item system, not character status
- **Environmental modifiers**: cover, lighting, range, relative speed — scene-level, not character state
- **Action economy**: multi-action penalties, free action limits — turn resolution layer
- **Movement distances**: position engine concern, not status machine
- **Puppet/Charm**: behavioral control requiring two-actor turn sequencing — game layer
- **Mounted combat**: vehicle/mount state — separate subsystem
- **Permanent attribute damage**: heat stroke Vigor reduction — character sheet mutation, not combat state

## Further Notes

- **Coverage estimate**: Phase 1 brings combat-relevant character state coverage from ~60% to ~80%. Phase 2 brings it to ~90%. The remaining ~10% is inherently multi-character or environmental.
- **Quint-first workflow**: the Quint spec has caught subtle bugs in the XState port before (timer edge cases, cross-region guard ordering). Maintaining this workflow is non-negotiable for new modules.
- **Incremental delivery**: each step is independently shippable. The machine is valid and all tests pass after any step. No step depends on a later step. Steps 1-4 have no dependencies between them and could theoretically be parallelized.
- **UI implications**: each new state/condition needs a visual indicator in the TanStack Start app. The existing pattern (derived helper functions like `isShaken()`, `isStunned()`) extends naturally — add `isProne()`, `isBound()`, `isBlinded()`, etc.
- **Phase 2 design risk**: Module E (Grapple) has the highest design risk due to two-actor interaction. May need a prototype spike before full spec. Module H (Affliction) has the most sub-types and cross-region effects — budget extra testing time.
