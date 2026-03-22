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

## Phase 1: Prone [DONE]

### Slice 1.1: Quint spec for prone [DONE]
### Slice 1.2: XState port for prone [DONE] (review fixes applied)
### Slice 1.3: UI indicator for prone [DONE]

---

## Phase 2: Hold/Interrupt [DONE]

### Slice 2.1: Quint spec for hold/interrupt [DONE]
### Slice 2.2: XState port for hold/interrupt [DONE] (review fixes applied)
### Slice 2.3: UI indicator for hold [DONE]

---

## Phase 3: Bound/Entangled [DONE]

### Slice 3.1: Quint spec for restraint [DONE]
### Slice 3.2: XState port for restraint [DONE] (review fixes applied)
### Slice 3.3: UI for restraint [DONE]

---

## Phase 4: Injury Table

> Incapacitation produces permanent injuries that persist after healing.

### Slice 4.1: Quint spec for injuries [DONE]

- Define injury types as constants (arm, leg, head, gut, broken, scarred — per SWADE Injury Table)
- Add `injuries: List[str]` to State (list of injury type identifiers)
- Add `pResolveInjury(tableRoll: int): str` pure function mapping d6 → injury type
- Modify `pTakeDamage`: when incapacitating with `incapRoll >= 1`, also append `resolveInjury(injuryRoll)` to injuries
  - Requires new parameter: `injuryRoll: int` on TAKE_DAMAGE (only used when incapacitation occurs)
- Injuries persist: `pHeal` does NOT modify injuries list
- Extend `die()`: optionally preserve injuries (they're historical record) or clear — design choice
- Add invariant: `injuriesNeverShrink` (injuries list length is monotonically non-decreasing, except on death)
- Add 6-8 tests
- **Do NOT leak grapple code into this slice — keep scope tight**

**Acceptance criteria:**
- [ ] `quint test --main savageTest` passes with all existing + new tests
- [ ] `quint verify --invariant safetyInv` passes (may need to skip temporal property if Apalache chokes on List[str])
- [ ] Injuries only added on incapacitation with success/raise
- [ ] Injuries persist through healing

### Slice 4.2: XState port for injuries [DONE] (review fixes applied)

- appendInjury removed from incapFail transitions (injuries only on success/raise)
- 71 vitest tests passing

### Slice 4.3: UI for injuries [DONE]

---

## Phase 5: Grapple

> Character can be grabbed/pinned, with attacker paying a vulnerability cost.

### Slice 5.1: Quint spec for grapple [DONE]

- Extend `restrained` model: values -1 (free), 0 (entangled), 1 (bound), 2 (grabbed), 3 (pinned)
  - Or use separate field `grappled: int` (-1 = free, 0 = grabbed, 1 = pinned) alongside restrained
  - Design decision: mutual exclusion — character can't be both entangled AND grabbed
- Add `grappledBy: str` context (opponent identifier, empty if not grappled)
- Add `pGrappleAttempt(s, rollResult)`: success → grabbed, raise → pinned
- Add `pGrappleEscape(s, rollResult)`: pinned success→grabbed, pinned raise→free, grabbed success→free
- Add `pPinAttempt(s, rollResult)`: upgrade grabbed → pinned on success
- Grabbed/pinned: character is distracted + vulnerable (like bound) — conditions must NOT expire while grabbed/pinned
- Key rule: opponent stunned/shaken does NOT release grapple (unlike most conditions)
- **Update `restrainedValid` invariant to allow values 2 and 3**
- Add 8-10 tests including: escape from pinned (step-down), condition persistence across turns
- **Do NOT leak blinded code into this slice — keep scope tight**

**Acceptance criteria:**
- [ ] `quint test` and `quint verify` pass
- [ ] Grapple and restraint are mutually exclusive
- [ ] Grabbed/pinned applies distracted + vulnerable
- [ ] Escape from pinned steps down to grabbed (not directly free)
- [ ] External signals for attacker vulnerability documented

### Slice 5.2: XState port for grapple [DONE] (review fixes applied)

- Condition persistence guards applied: distracted/vulnerable `always` guards include `not(stateIn(GRABBED_STATE))` and `not(stateIn(PINNED_STATE))`
- 71 vitest tests passing

### Slice 5.3: UI for grapple [DONE]

---

## Phase 6: Blinded

> Blinded condition with severity levels and per-turn Vigor recovery.

### Slice 6.1: Quint spec for blinded [DONE]

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
### Slice 6.3: UI for blinded [DONE]

---

## Phase 7: Fear Resolver

> Fear table results auto-dispatch as existing machine events.

### Slice 7.1: Fear table pure function [DONE]

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
- **Both Quint AND TypeScript must be implemented** — this slice requires both
- **Follow the mapping above exactly** — do not substitute APPLY_SHAKEN for APPLY_STUNNED
- 10-12 tests covering every bracket + modifier shifts

**Acceptance criteria:**
- [ ] Every table bracket maps to correct events
- [ ] Modifier correctly shifts result
- [ ] Edge cases (heart attack, phobia) produce appropriate output
- [ ] Both Quint and TypeScript implementations exist and are tested

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
