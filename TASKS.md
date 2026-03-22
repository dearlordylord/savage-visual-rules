# Review Fixes — DAG Task List

Each task has `[id]`, dependencies in `AFTER: [ids]`, and scope tags `{quint|ts|ui|types|test}`.
Tasks with no shared dependencies can run in parallel.

---

## Phase 0: DONE — Quint compiles

- [x] **P0** `{quint}` Fix `isActive` → `isConscious` rename (15 callsites)

---

## Phase 1: Critical rule fixes — DONE

- [x] **C2** `{quint, ts}` Fear table: results 10-12 and 16-17 → APPLY_SHAKEN, not APPLY_STUNNED
- [x] **C3** `{quint, ts}` Hold persists across rounds — not cleared at end of round
- [x] **C4** `{quint, ts, types}` Grapple escape from pinned: success → grabbed (step-down), raise → free
- [x] **C5** `{ts}` END_OF_TURN from hold: no timer ticking

---

## Phase 2: Major rule fixes — DONE

- [x] **M1** `{quint, ts}` Stunned causes Prone
- [x] **M2** `{quint, ts}` Entangled sets Vulnerable (persistent sentinel 99, until freed)
- [x] **M3** `{quint, ts}` Affliction: one-time effects, lethal death timer
- [x] **M4** `{quint, ts}` Blinded recovery at END of turn (added vigorRoll to END_OF_TURN event)
- [x] **M5** `{quint, ts}` Grapple success (grabbed) = Vulnerable only, not Distracted
- [x] **M6** `{ts}` Removed dead `grappledBy` context field and `CharacterId` brand
- [x] **M7** `{ts}` APPLY_BOUND from grabbed/pinned → bound
- [x] **M8** `{ts}` Clear injuries on death
- [x] **M12** `{ui}` Blinded StateLeaf: use `isFullyBlinded()` for "-4" leaf
- [x] **m6** `{quint, ts}` Escape from restraint clears residual Distracted/Vulnerable
- [x] **m9** `{types}` Removed unused `characterId()` constructor (part of M6)
- [x] **MBT fix** `{test}` Fixed END_OF_TURN vigorRoll in machine.mbt.test.ts

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

- [ ] **m7** `{ui}` AFTER: —
  Add parameter info to `formatEvent` for APPLY_AFFLICTION, APPLY_BLINDED, APPLY_POWER_EFFECT.

- [ ] **m8** `{ui}` AFTER: —
  Replace IIFE in JSX for affliction type display with computed variable.

- [ ] **m10** `{types}` AFTER: —
  Add validation to `InjuryRoll` constructor (tableRoll 2-12, subRoll 1-6).

- [ ] **m11** `{test}` AFTER: —
  Replace `brands.ts` test helpers with `types.ts` constructors. Delete `brands.ts`.

---

## Phase 4: Missing tests (after fixes land)

- [ ] **T1** `{test}` AFTER: —
  Add 8 injury system tests (entire subsystem untested).

- [ ] **T2** `{test}` AFTER: —
  Add hold/interrupt edge case tests (startOfTurn on hold, hold from others' turn, hold lost on fatigue incap).

- [ ] **T3** `{test}` AFTER: —
  Add restraint edge case tests (entangled no-downgrade, bound escape fail).

- [ ] **T4** `{test}` AFTER: —
  Add grapple edge case tests (blocked when grappled, conditions persist, clears on death).

- [ ] **T5** `{test}` AFTER: —
  Add blinded edge case tests (impaired no-downgrade, blocked when incap).

- [ ] **T6** `{test}` AFTER: —
  Add affliction edge case tests (blocked when dead, cure fails when healthy).

- [ ] **T7** `{test}` AFTER: —
  Add power effects edge case tests (blocked when dead, dismiss non-existent fails).

---

## Test counts

- Quint: 135 passing (was 120 before review)
- XState: 115 passing (was 102 before review)
- TypeScript: compiles clean
