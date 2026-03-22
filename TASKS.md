# Review Fixes — DAG Task List

Each task has `[id]`, dependencies in `AFTER: [ids]`, and scope tags `{quint|ts|ui|types|test}`.
Tasks with no shared dependencies can run in parallel.

---

## Phase 0: DONE — Quint compiles

- [x] **P0** `{quint}` Fix `isActive` → `isConscious` rename (15 callsites)

---

## Phase 1: Critical rule fixes (parallel, no deps)

- [ ] **C2** `{quint, ts}` AFTER: —
  Fear table: results 10-12 and 16-17 should be APPLY_SHAKEN, not APPLY_STUNNED.
  - `savage.qnt` line ~587, 590: change `APPLY_STUNNED` → `APPLY_SHAKEN`
  - `machine.ts` `resolveFear()`: same fix
  - Add/fix Quint + XState tests for those fear brackets
  - Ref: `rules/34-fear.md` lines 145-162

- [ ] **C3** `{quint, ts}` AFTER: —
  Hold must persist across rounds — NOT cleared at end of round.
  - `savage.qnt` `pEndOfTurn` lines ~321-323: remove `onHold: false` branch
  - `machine.ts` `END_OF_TURN` on `onHold` state: redesign to NOT exit hold
  - Model: held character keeps hold; new round deals new cards but hold persists
  - Add Quint test: hold persists after endOfTurn
  - Add XState test: same
  - Ref: `rules/20-situational-rules.md` lines 499-503

- [ ] **C4** `{quint, ts, types}` AFTER: —
  Grapple escape from pinned: success → step-down to grabbed, raise → free.
  - `types.ts`: change `GrappleEscapeRollResult` from `Literal(0, 1)` to `Literal(0, 1, 2)`
  - `machine.ts` pinned state: add branching — `rollResult == 1` → grabbed, `rollResult >= 2` → free
  - `savage.qnt`: verify `pGrappleEscape` already models this correctly (it does)
  - Add XState tests: pinned+success→grabbed, pinned+raise→free
  - Ref: `rules/20-situational-rules.md` grapple section

- [ ] **C5** `{ts}` AFTER: —
  END_OF_TURN from hold must NOT tick timers.
  - `machine.ts` line ~830: remove `tickTimers`, `tickAfflictionTimer`, `tickEffectTimers` from onHold END_OF_TURN actions
  - Add XState test: conditions don't expire while on hold
  - Ref: Quint `pEndOfTurn` when `s.onHold` — only sets `onHold: false`

---

## Phase 2: Major rule fixes (parallel after deps met)

- [ ] **M1** `{quint, ts}` AFTER: —
  Stunned must cause Prone.
  - `savage.qnt` `pApplyStunned` line ~369: add `prone: true`
  - `machine.ts`: `applyStunned` action must also set prone (or raise APPLY_PRONE)
  - Add tests both sides
  - Ref: `rules/20-situational-rules.md` lines 708-709

- [ ] **M2** `{quint, ts}` AFTER: —
  Entangled must set Vulnerable (persistent, not timer-based).
  - `savage.qnt` `pApplyEntangled`: set `vulnerable: 99` (sentinel for "until freed")
  - `savage.qnt` `pEscapeAttempt`: clear vulnerable on escape from entangled
  - `machine.ts`: mirror — entangled entry sets vulnerable, escape clears it
  - Fix `pEndOfTurn` to not tick vulnerable when restrained (already done for bound, missing for entangled)
  - Update `boundImpliesConditions` invariant to cover entangled
  - Ref: `rules/20-situational-rules.md` line 592-593

- [ ] **M3** `{quint, ts}` AFTER: —
  Affliction damage model: weak = one-time fatigue, lethal = stun + 1 wound + death countdown.
  - `savage.qnt` `pStartOfTurn` affliction section: redesign per SWADE
  - `machine.ts`: mirror changes
  - Update tests
  - Ref: `rules/27-hazards.md` lines 540-549

- [ ] **M4** `{quint, ts}` AFTER: —
  Blinded recovery must happen at END of turn, not start.
  - `savage.qnt`: move blinded recovery from `pStartOfTurn` to `pEndOfTurn`
  - `machine.ts`: move recovery logic to END_OF_TURN actions
  - Update tests
  - Ref: `rules/38-powers-list.md` lines 885-891

- [ ] **M5** `{quint, ts}` AFTER: —
  Grapple success (grabbed) should set Vulnerable only, not Distracted.
  - `savage.qnt` `pGrappleAttempt` line ~538: remove distracted for rollResult==1, keep it for rollResult>=2
  - `machine.ts`: mirror — grabbed entry sets vulnerable only, pinned sets both
  - Update tests
  - Ref: `rules/20-situational-rules.md` grapple section

- [ ] **M6** `{ts}` AFTER: C4
  Remove dead `grappledBy` context field and `CharacterId` brand.
  - `machine.ts`: remove `grappledBy` from context, remove `clearGrappledBy` action
  - `types.ts`: remove `CharacterId` brand and `characterId()` constructor
  - OR: implement `grappledBy` properly if keeping it (add opponent to GRAPPLE_ATTEMPT event)
  - Decision: remove for now, add back when multiplayer context exists

- [ ] **M7** `{ts}` AFTER: M5
  Handle APPLY_BOUND from grabbed/pinned states in restraintTrack.
  - `machine.ts`: add `APPLY_BOUND` transition in grabbed and pinned states → bound

- [ ] **M8** `{ts}` AFTER: —
  Clear `injuries` array on death.
  - `machine.ts` dead entry action: add `injuries: []`
  - Add XState test: death clears injuries

- [ ] **M12** `{ui}` AFTER: —
  Fix blinded StateLeaf: use `isFullyBlinded()` for the "-4" leaf.
  - `index.tsx` line ~411: change `isBlinded(snapshot)` → `isFullyBlinded(snapshot)`

---

## Phase 3: Minor fixes (parallel, low priority)

- [ ] **m1** `{ts}` AFTER: —
  Extract named event extractors for APPLY_BLINDED, APPLY_POWER_EFFECT, DISMISS_EFFECT.

- [ ] **m2** `{ts}` AFTER: —
  Deduplicate `raiseBacklashFatigue` / `raiseApplyFatigue` into one action.

- [ ] **m3** `{quint}` AFTER: —
  Add `canAct`/`canMove` sleep check to Quint spec (or remove from TS if wrong).

- [ ] **m5** `{quint, ts}` AFTER: —
  Backlash should cause fatigue even with no active effects (per SWADE).

- [ ] **m6** `{quint, ts}` AFTER: M2
  Escape from restraint must clear residual Distracted/Vulnerable conditions.

- [ ] **m7** `{ui}` AFTER: —
  Add parameter info to `formatEvent` for APPLY_AFFLICTION, APPLY_BLINDED, APPLY_POWER_EFFECT.

- [ ] **m8** `{ui}` AFTER: —
  Replace IIFE in JSX for affliction type display with computed variable.

- [ ] **m9** `{types}` AFTER: M6
  Remove unused `characterId()` constructor (if M6 removes grappledBy).

- [ ] **m10** `{types}` AFTER: —
  Add validation to `InjuryRoll` constructor (tableRoll 2-12, subRoll 1-6).

- [ ] **m11** `{test}` AFTER: —
  Replace `brands.ts` test helpers with `types.ts` constructors. Delete `brands.ts`.

---

## Phase 4: Missing tests (after fixes land)

- [ ] **T1** `{test}` AFTER: M8
  Add 8 injury system tests (entire subsystem untested).

- [ ] **T2** `{test}` AFTER: C3, C5
  Add hold/interrupt edge case tests (startOfTurn on hold, hold from others' turn, hold lost on fatigue incap).

- [ ] **T3** `{test}` AFTER: M2, M7
  Add restraint edge case tests (entangled no-downgrade, bound escape fail, bound from grapple).

- [ ] **T4** `{test}` AFTER: C4, M5
  Add grapple edge case tests (pinned step-down, raise free, blocked when grappled, conditions persist, clears on death).

- [ ] **T5** `{test}` AFTER: M4
  Add blinded edge case tests (impaired no-downgrade, blocked when incap).

- [ ] **T6** `{test}` AFTER: M3
  Add affliction edge case tests (blocked when dead, cure fails when healthy, lethal Extra dies).

- [ ] **T7** `{test}` AFTER: —
  Add power effects edge case tests (blocked when dead, dismiss non-existent fails).

- [ ] **T8** `{test}` AFTER: M1
  Add test: stunned character becomes prone.

---

## Dependency graph (text DAG)

```
P0 ✓

C2 ──────────────────────────────────┐
C3 ──────────────── T2               │
C4 ──── M6 ── m9   T4               │
C5 ──── T2                           │
                                     │
M1 ──── T8                           │
M2 ──── m6 ── T3                     │ all feed into
M3 ──── T6                           │ final test pass
M4 ──── T5                           │
M5 ──── M7 ── T3                     │
M8 ──── T1                           │
M12                                  │
                                     │
m1..m11 (independent minors)         │
T1..T8 (test tasks, after deps)  ────┘
```

## Parallelism guide for subagents

**Wave 1** (all independent — run simultaneously):
  C2, C3, C4, C5, M1, M2, M3, M4, M5, M8, M12

**Wave 2** (after Wave 1 deps):
  M6 (after C4), M7 (after M5), m6 (after M2)

**Wave 3** (minors, independent):
  m1, m2, m3, m5, m7, m8, m9 (after M6), m10, m11

**Wave 4** (tests, after corresponding fixes):
  T1-T8
