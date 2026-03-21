# Plan: Grow SWADE Character State Machine

## Architectural Decisions

1. **Quint-first workflow**: every new region is specced in `savage.qnt` with invariants, verified via `quint test` and `quint verify`, then mechanically ported to XState in `app/src/machine.ts`. Tests in `savageTest.qnt` are mirrored to `app/src/machine.test.ts`.

2. **Parallel region pattern**: new capabilities are new parallel regions inside the `alive` state (or extensions of existing regions). XState v5 processes all regions atomically per event.

3. **Single-character scope**: one machine instance per character. Multi-character coordination (e.g., grapple attacker becoming vulnerable) is handled by the game layer dispatching events to each machine independently.

4. **Pre-resolved inputs**: all dice rolls and skill check results arrive as event payloads. The machine contains no randomness — it is a pure state function.

5. **Derived helpers for UI**: queries like `isProne()`, `isBound()` are pure functions over snapshots, not additional state nodes. The UI layer reads these.

6. **Death clears all**: entering `dead` resets every region to its default. This is a structural guarantee enforced by Quint invariant and XState `dead` entry action.

7. **Incapacitation blocks conditions**: all condition-application guards check `stateIn(DAMAGE_ACTIVE) && !stateIn(FATIGUE_INCAP)`, same pattern used by existing stunned/distracted/vulnerable.

---

## Phase 1: Prone

> Character can go prone and stand up, affecting attack modifiers.

### Slice 1.1: Quint spec for prone [DONE]

- Add `prone: bool` to `State` type
- Add `pDropProne(s: State)` and `pStandUp(s: State)` pure functions
  - Guard: `isActive(s)` — can't change posture when incapacitated/dead
  - `pDropProne`: sets `prone = true`
  - `pStandUp`: sets `prone = false`
- Extend `die()` to reset `prone = false`
- Add `doDropProne` and `doStandUp` actions, add to `step`
- Add invariant: `proneImpliesActive = state.prone implies state.isActive()`
- Add 4-6 tests: drop/stand cycle, blocked when incapacitated, clears on death, prone persists across turns

**Acceptance criteria:**
- [x] `quint test --main savageTest` passes with all existing + new tests
- [x] `quint verify --invariant safetyInv` passes (safetyInv extended with proneImpliesActive)

### Slice 1.2: XState port for prone [DONE]

- Add `positionTrack` parallel region inside `alive`: states `standing | prone`
- Events: `DROP_PRONE`, `STAND_UP`
- Guards: `stateIn(DAMAGE_ACTIVE) && !stateIn(FATIGUE_INCAP)`
- Dead entry action: reset positionTrack (structural — entering dead exits alive)
- Add derived helpers: `isProne(snap): boolean`
- Mirror all Quint tests in vitest

**Acceptance criteria:**
- [x] All existing 27+ tests still pass
- [x] New prone tests pass
- [x] `isProne()` returns correct values in all states

**Review notes (commit 1ef13b6):**
- **BUG**: `always` transition on `prone` state only checks `not(stateIn(DAMAGE_ACTIVE))` but misses `stateIn(FATIGUE_INCAP)`. A fatigue-incapacitated character stays prone, violating `proneImpliesActive`. Fix: change guard to `not(and([stateIn(DAMAGE_ACTIVE), not(stateIn(FATIGUE_INCAP))]))`.
- Added test: "prone clears when fatigue-incapacitated"
- **Reference worktree (DO NOT cherry-pick — apply fix on master)**: `worktree-agent-a2b7e6f3` at `.claude/worktrees/agent-a2b7e6f3`

### Slice 1.3: UI indicator for prone [DONE]

- Add prone badge/indicator to character status display
- Wire to `isProne()` derived helper

**Acceptance criteria:**
- [x] Prone status visible in UI when character is prone
- [x] Prone indicator disappears on stand up, death, or incapacitation

---

## Phase 2: Hold/Interrupt

> Character can hold action and interrupt another character's turn.

### Slice 2.1: Quint spec for hold/interrupt [DONE]

- Extend turn model: `ownTurn` bool becomes richer — add `onHold: bool` to State
- Add `pGoOnHold(s: State)`:
  - Guard: `s.ownTurn && !s.shaken && !s.stunned && isActive(s)`
  - Sets `onHold = true`, `ownTurn = false` (yields current turn, waits)
- Add `pInterrupt(s: State, athleticsRoll: int)`:
  - Guard: `s.onHold`
  - Success (>= 1): `onHold = false`, `ownTurn = true` (acts before interruptee)
  - Fail (< 1): `onHold = false`, `ownTurn = true` (acts after interruptee — still gets turn)
- Extend `pStartOfTurn`: if `onHold`, skip (can't start new turn while holding)
- Extend existing recovery transitions: entering shaken or stunned while `onHold` → `onHold = false`
- Add invariant: `holdImpliesActive = state.onHold implies (state.isActive() and not(state.shaken) and not(state.stunned))`
- Add 6-8 tests

**Acceptance criteria:**
- [x] `quint test` and `quint verify` pass
- [x] Hold is lost when shaken/stunned applied
- [x] Interrupt success/fail both yield a turn (differ in ordering — context flag)

### Slice 2.2: XState port for hold/interrupt [DONE]

- Extend `turnPhase`: `othersTurn | ownTurn | onHold`
- `ownTurn` → `onHold` via `GO_ON_HOLD`
- `onHold` → `ownTurn` via `INTERRUPT` (always transitions back; athleticsRoll determines ordering context)
- `always` transition: `onHold` → `othersTurn` when `stateIn(STUNNED)` or `stateIn(shaken)` (lose hold)
- `END_OF_TURN` from `onHold` → `othersTurn` (round ends, hold expires)
- Context: `onHold: boolean`, `interruptedSuccessfully: boolean` (for UI/game layer to read ordering)
- Add `isOnHold(snap)` derived helper
- Mirror Quint tests

**Acceptance criteria:**
- [x] All existing tests pass
- [x] Hold/interrupt tests pass
- [x] Cross-region guard (lose hold on shaken/stunned) works

**Review notes (commits c8acd6b, d8c9742):**
- **No machine bugs** — implementation correct.
- **TEST BUG**: "cannot go on hold when stunned" test actually tested recovery path (vigorRoll: 1 recovers before GO_ON_HOLD). The stunned guard was never exercised. Fix: split into two tests — one that genuinely blocks, one for recovery path.
- **Missing tests added**: GO_ON_HOLD from othersTurn no-op, START_OF_TURN while on hold ignored, GO_ON_HOLD blocked when fatigue-incap, onHold context sync through cycle.
- **Reference worktree (DO NOT cherry-pick — apply fix on master)**: `worktree-agent-a15bd9dc` at `.claude/worktrees/agent-a15bd9dc`

### Slice 2.3: UI indicator for hold [DONE]

- Hold badge on character status
- Interrupt action button (visible when on hold)

**Acceptance criteria:**
- [x] Hold status visible, interrupt button functional

---

## Phase 3: Bound/Entangled

> Character can be restrained (entangled/bound) with cascading condition effects.

### Slice 3.1: Quint spec for restraint

- Add `restrained: int` to State (-1 = free, 0 = entangled, 1 = bound)
- Add `pApplyEntangled(s)`, `pApplyBound(s)`:
  - Guard: `isActive(s)`
  - `pApplyEntangled`: `restrained = max(restrained, 0)`
  - `pApplyBound`: `restrained = 1`, also sets `distracted = max(distracted, timer)` and `vulnerable = max(vulnerable, timer)` (cascading)
- Add `pEscapeAttempt(s, rollResult: int)`:
  - From bound: success (>= 1) → entangled; raise (>= 2) → free
  - From entangled: success (>= 1) → free
- Extend `die()`: reset `restrained = -1`
- Add invariant: `boundImpliesConditions = (state.restrained == 1) implies (state.isDistracted() and state.isVulnerable())`
- Add invariant: `restrainedImpliesActive = (state.restrained >= 0) implies state.isActive()`
- Add 8-10 tests

**Acceptance criteria:**
- [ ] `quint test` and `quint verify` pass
- [ ] Bound cascades distracted + vulnerable
- [ ] Escape logic correct for each level

### Slice 3.2: XState port for restraint [DONE]

- New parallel region `restraintTrack` inside `alive`: `free | entangled | bound`
- Events: `APPLY_ENTANGLED`, `APPLY_BOUND`, `ESCAPE_ATTEMPT { rollResult }`
- Entering `bound`: actions `setDistractedTimer` + `setVulnerableTimer` (reuse existing)
- Guards: `stateIn(DAMAGE_ACTIVE) && !stateIn(FATIGUE_INCAP)`
- Escape guards: `rollResult >= 1` (success), `rollResult >= 2` (raise)
- Derived helpers: `isBound(snap)`, `isEntangled(snap)`, `isRestrained(snap)`
- Mirror Quint tests

**Acceptance criteria:**
- [x] All existing tests pass
- [x] Restraint + escape tests pass
- [x] Bound correctly triggers distracted + vulnerable timers

**Review notes (commit c9ed88f):**
- **BUG**: `boundImpliesConditions` invariant violated. Bound sets distracted/vulnerable timers on entry, but timers tick down and expire independently via `always` transitions. After one turn cycle, conditions clear while character is still bound. Fix: add `not(stateIn(BOUND_STATE))` to distracted and vulnerable `always` guards so conditions persist while bound.
- Added 4 tests: boundImpliesConditions invariant across turns, fatigue-incap blocking restraint, conditions clearing after escape (raise + success).
- Also noted: Ralph skipped Quint spec (Slice 3.1) — process deviation from Quint-first workflow.
- **Reference worktree (DO NOT cherry-pick — apply fix on master)**: `worktree-agent-aa2aeca3` at `.claude/worktrees/agent-aa2aeca3`

### Slice 3.3: UI for restraint [DONE]

- Restraint status indicator (entangled/bound)
- Escape attempt action

**Acceptance criteria:**
- [x] Restraint status visible, escape action functional

---

## Phase 4: Injury Table

> Incapacitation produces permanent injuries that persist after healing.

### Slice 4.1: Quint spec for injuries

- Define injury types as constants (arm, leg, head, gut, broken, scarred — per SWADE Injury Table)
- Add `injuries: List[str]` to State (list of injury type identifiers)
- Add `pResolveInjury(tableRoll: int): str` pure function mapping d6 → injury type
- Modify `pTakeDamage`: when incapacitating with `incapRoll >= 1`, also append `resolveInjury(injuryRoll)` to injuries
  - Requires new parameter: `injuryRoll: int` on TAKE_DAMAGE (only used when incapacitation occurs)
- Injuries persist: `pHeal` does NOT modify injuries list
- Extend `die()`: optionally preserve injuries (they're historical record) or clear — design choice
- Add invariant: `injuriesNeverShrink` (injuries list length is monotonically non-decreasing, except on death)
- Add 6-8 tests

**Acceptance criteria:**
- [ ] `quint test` and `quint verify` pass
- [ ] Injuries only added on incapacitation with success/raise
- [ ] Injuries persist through healing

### Slice 4.2: XState port for injuries [DONE]

- Add `injuries: InjuryType[]` to context
- Add `resolveInjury(tableRoll)` pure function
- Extend `TAKE_DAMAGE` event type: add optional `injuryRoll: number`
- Extend incapacitation transitions (exceedsMax + incapSuccess): action appends injury
- Add `injuryPenalty(snap)` and `hasInjury(snap, type)` derived helpers
- Mirror Quint tests

**Acceptance criteria:**
- [x] All existing tests pass (injuryRoll defaults to 0 or is ignored when not incapacitated)
- [x] Injury tests pass
- [x] `injuryPenalty()` computes correct cumulative penalty

**Review notes (commit 2973936):**
- **BUG**: `appendInjury` action attached to `incapFail` transitions (bleedingOut). Spec says injuries only on incapSuccess/raise. Fix: remove `"appendInjury"` from all 3 `incapFail` transition action arrays (unshaken, shaken, wounded states). Note: actual SWADE rules DO give injuries on fail too — if rules-accurate behavior desired, revert this fix.
- **ZERO TESTS added** despite claiming "54 tests passing". Classic AI antipattern: compliance by not breaking existing tests. Fix: added 18 tests covering resolveInjury mapping, injury on incapSuccess, no injury on incapFail, persistence through healing, accumulation, helpers, injuriesNeverShrink invariant.
- Also: `totalPenalty()` doesn't incorporate `injuryPenalty()`, death doesn't clear injuries (acceptable design choice but should be explicit).
- **Reference worktree (DO NOT cherry-pick — apply fix on master)**: `worktree-agent-ac4b7435` at `.claude/worktrees/agent-ac4b7435`

### Slice 4.3: UI for injuries [DONE]

- Injury list on character sheet
- Penalty display incorporating injury modifiers

**Acceptance criteria:**
- [x] Injuries listed with descriptions
- [x] Penalty total updated to include injury penalties

---

## Phase 5: Grapple

> Character can be grabbed/pinned, with attacker paying a vulnerability cost.

### Slice 5.1: Quint spec for grapple

- Extend `restrained` model: values -1 (free), 0 (entangled), 1 (bound), 2 (grabbed), 3 (pinned)
  - Or use separate field `grappled: int` (-1 = free, 0 = grabbed, 1 = pinned) alongside restrained
  - Design decision: mutual exclusion — character can't be both entangled AND grabbed
- Add `grappledBy: str` context (opponent identifier, empty if not grappled)
- Add `pGrappleAttempt(s, rollResult)`: success → grabbed, raise → pinned
- Add `pGrappleEscape(s, rollResult)`: success → free from grapple
- Add `pPinAttempt(s, rollResult)`: upgrade grabbed → pinned on success
- Grabbed/pinned: character is distracted + vulnerable (like bound)
- Key rule: opponent stunned/shaken does NOT release grapple (unlike most conditions)
- Add 8-10 tests

**Acceptance criteria:**
- [ ] `quint test` and `quint verify` pass
- [ ] Grapple and restraint are mutually exclusive
- [ ] Grabbed/pinned applies distracted + vulnerable
- [ ] External signals for attacker vulnerability documented

### Slice 5.2: XState port for grapple [DONE]

- Extend `restraintTrack`: `free | entangled | bound | grabbed | pinned`
- Events: `GRAPPLE_ATTEMPT { rollResult }`, `GRAPPLE_ESCAPE { rollResult }`, `PIN_ATTEMPT { rollResult }`
- Context: `grappledBy: string | null`
- Entering grabbed/pinned: set distracted + vulnerable timers
- Derived helpers: `isGrabbed(snap)`, `isPinned(snap)`, `isGrappled(snap)`
- Mirror Quint tests

**Acceptance criteria:**
- [x] All existing tests pass
- [x] Grapple tests pass
- [x] Mutual exclusion with entangled/bound enforced

**Review notes (commits 41a6337, 79c1cd0):**
- **BUG (confirmed, same pattern as Phase 3)**: distracted+vulnerable expire while grabbed/pinned. Fix: add `not(stateIn(GRABBED_STATE))` and `not(stateIn(PINNED_STATE))` to distracted/vulnerable `always` guards (alongside existing `not(stateIn(BOUND_STATE))`).
- Added 6 tests: grabbed/pinned condition persistence across turns, conditions clear on escape, grapple blocked by fatigue-incap, death clears grappledBy, bound persistence (pre-existing bug).
- Also: `grappledBy` context field is declared but never set (no `attacker` field on GRAPPLE_ATTEMPT event) — dead context.
- 69 tests passing (63 + 6 new).
- **Reference worktree (DO NOT cherry-pick — apply fix on master)**: `worktree-agent-a4977822` at `.claude/worktrees/agent-a4977822`

### Slice 5.3: UI for grapple [DONE]

- Grapple indicator showing grabbed/pinned + opponent
- Escape action

**Acceptance criteria:**
- [x] Grapple status and opponent visible
- [x] Escape action functional

---

## Phase 6: Blinded

> Blinded condition with severity levels and per-turn Vigor recovery.

### Slice 6.1: Quint spec for blinded

- Add `blinded: int` to State (0 = clear, 2 = impaired, 4 = blinded)
- Add `pApplyBlinded(s, severity: int)`: guard `isActive(s)`, sets `blinded = max(blinded, severity)`
- Extend `pStartOfTurn`: if blinded > 0, Vigor check reduces severity
  - Raise (>= 2): clear entirely (blinded = 0)
  - Success (>= 1): reduce by 2 (blinded = max(0, blinded - 2))
  - Fail: no change
  - Requires new parameter or reuse `vigorRoll` (already on START_OF_TURN)
- Extend `die()`: reset `blinded = 0`
- Add invariant: `blindedValid = state.blinded >= 0 and state.blinded <= 4`
- Add invariant: `blindedImpliesActive`
- Add 6-8 tests

**Acceptance criteria:**
- [ ] `quint test` and `quint verify` pass
- [ ] Severity step-down works correctly
- [ ] Raise clears entirely

### Slice 6.2: XState port for blinded [DONE]

- New sub-region in `conditionTrack`: `vision` with states `clear | impaired | blinded`
- Events: `APPLY_BLINDED { severity: 2 | 4 }`
- Recovery: on `START_OF_TURN`, vigorRoll determines step-down (reuse existing vigorRoll parameter)
- Guards: `vigorRaise` → clear, `vigorSuccessNoRaise` → step down, fail → stay
- Derived helper: `isBlinded(snap)`, `blindedPenalty(snap)`
- Mirror Quint tests

**Acceptance criteria:**
- [x] All existing tests pass
- [x] Blinded tests pass
- [x] Recovery uses same vigorRoll as stunned (no new event params needed)

**Review notes (commit 7629d31):**
- **NOT YET REVIEWED** — review was not launched before Ralph was stopped. Needs review on next run.

### Slice 6.3: UI for blinded [DONE]

- Blinded indicator with severity level
- Penalty display

**Acceptance criteria:**
- [x] Severity visible, penalty applied to display

---

## Phase 7: Fear Resolver

> Fear table results auto-dispatch as existing machine events.

### Slice 7.1: Fear table pure function

> **Note**: Ralph started this but was killed mid-implementation. Partial work (resolveFear function + tests) was discarded from working tree. Start fresh.

- Implement `resolveFear(tableRoll: number, modifier: number): SavageEvent[]` as exported pure function (not a machine region)
- Mapping (tableRoll + modifier):
  - 1-3: Adrenaline rush → `[]` (handled at game layer — joker-like bonus)
  - 4-6: → `[APPLY_DISTRACTED]`
  - 7-9: → `[APPLY_VULNERABLE]`
  - 10-12: → `[APPLY_STUNNED]` (rules say "Shaken" but mechanically closer to stunned for fear)
  - 13: Fear mark → `[APPLY_STUNNED]` + injury context addition (scar)
  - 14-15: Slowness → hindrance context addition
  - 16-17: Panic → `[APPLY_STUNNED]` (game layer handles forced movement)
  - 18-19: Minor phobia → hindrance context addition
  - 20-21: Major phobia → hindrance context addition
  - 22+: Heart attack → special TAKE_DAMAGE or APPLY_STUNNED depending on Vigor check
- Add to Quint as `fearTableResult(roll: int): List[str]`
- 10-12 tests covering every bracket + modifier shifts

**Acceptance criteria:**
- [ ] Every table bracket maps to correct events
- [ ] Modifier correctly shifts result
- [ ] Edge cases (heart attack, phobia) produce appropriate output

### Slice 7.2: UI for fear resolution

- Fear check dialog/button
- Displays table result and auto-applies events to machine

**Acceptance criteria:**
- [ ] GM can trigger fear check, result dispatched to character machine

---

## Phase 8: Poison/Disease

> Afflictions auto-generate fatigue/wounds/conditions each turn.

### Slice 8.1: Quint spec for afflictions

- Add affliction model to State:
  - `afflictionType: str` ("none", "paralytic", "weak", "lethal", "sleep")
  - `afflictionTimer: int` (-1 = none, >= 0 = turns remaining)
- Add `pApplyAffliction(s, type, duration)`:
  - Guard: `!dead`
  - Sets afflictionType and afflictionTimer
- Add `pCureAffliction(s)`: clears affliction
- Extend `pStartOfTurn` for affliction tick:
  - Paralytic: blocks stunned recovery (add guard `afflictionType != "paralytic"` to stun recovery)
  - Weak: +1 fatigue each turn
  - Lethal: +1 fatigue + set shaken + wound each turn (can cascade to incap/death)
  - Sleep: blocks all actions (like incapacitated but not wound-based)
- Affliction timer ticks down on `pEndOfTurn`; when expired, type resets to "none"
- Extend `die()`: clear affliction
- 10-12 tests covering each type

**Acceptance criteria:**
- [ ] `quint test` and `quint verify` pass
- [ ] Each affliction type produces correct per-turn effects
- [ ] Paralytic blocks stun recovery
- [ ] Cure and timer expiry both clear

### Slice 8.2: XState port for afflictions

- New parallel region `afflictionTrack` inside `alive`: `healthy | afflicted`
- Afflicted sub-states: `paralytic | weak | lethal | sleep`
- Events: `APPLY_AFFLICTION { type, duration }`, `CURE_AFFLICTION`
- `START_OF_TURN` in each sub-state generates appropriate side effects
- Timer in context, ticked on `END_OF_TURN`
- `always` transition from afflicted → healthy when timer expires
- Cross-region: paralytic adds guard to stun recovery; lethal triggers wound/fatigue
- Derived helpers: `isAfflicted(snap)`, `afflictionType(snap)`
- Mirror Quint tests

**Acceptance criteria:**
- [ ] All existing tests pass
- [ ] Affliction tests pass
- [ ] Cross-region effects (blocked stun recovery, fatigue/wound generation) work

### Slice 8.3: UI for afflictions

- Affliction indicator with type and remaining duration
- Cure action

**Acceptance criteria:**
- [ ] Affliction type, severity, and timer visible
- [ ] Per-turn effects reflected in status updates

---

## Phase 9: Power Durations

> Buff/debuff timers with backlash cascade.

### Slice 9.1: Quint spec for power effects

- Add `activeEffects: List[{etype: str, timer: int}]` to State
- Add `pApplyEffect(s, type, duration)`: appends to list
- Add `pDismissEffect(s, type)`: removes from list
- Add `pBacklash(s)`: clears entire list + increments fatigue
- Extend `pEndOfTurn`: tick all timers, remove expired (timer <= 0)
- Effect types: "armor", "shield", "smite", "boost", "lower_attribute", "speed", "fly"
- Add invariant: `activeEffectsValid = state.activeEffects.forall(e => e.timer > 0)` (no expired entries linger)
- Extend `die()`: clear activeEffects
- 8-10 tests

**Acceptance criteria:**
- [ ] `quint test` and `quint verify` pass
- [ ] Duration tick-down works
- [ ] Backlash clears all + adds fatigue
- [ ] Dismiss removes individual effect

### Slice 9.2: XState port for power effects

- Add `activeEffects: { type: string, roundsRemaining: number }[]` to context
- Events: `APPLY_POWER_EFFECT { type, duration }`, `DISMISS_EFFECT { type }`, `BACKLASH`
- `END_OF_TURN` action extended: tick all effects, filter expired
- `BACKLASH` action: clear array + internal fatigue increment
- Dead entry: clear array
- Derived helpers: `hasEffect(snap, type)`, `effectBonus(snap, type)`, `activeEffectsList(snap)`
- Mirror Quint tests

**Acceptance criteria:**
- [ ] All existing tests pass
- [ ] Power effect tests pass
- [ ] Backlash cascade (clear + fatigue) works atomically

### Slice 9.3: UI for power effects

- Active effects list with remaining duration per effect
- Dismiss button per effect
- Backlash indicator (triggered on crit fail at game layer)

**Acceptance criteria:**
- [ ] Active effects visible with countdown
- [ ] Dismiss and backlash actions functional
