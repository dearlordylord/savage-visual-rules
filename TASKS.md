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

## Phase 3: Minor fixes — DONE

- [x] **m1** `{ts}` Extract named event extractors for APPLY_BLINDED, APPLY_POWER_EFFECT, DISMISS_EFFECT.
- [x] **m2** `{ts}` Deduplicate `raiseBacklashFatigue` / `raiseApplyFatigue` into `raiseFatigue`.
- [x] **m3** `{quint}` Add `canAct`/`canMove` sleep check to Quint spec.
- [x] **m5** `{quint, ts}` Backlash causes fatigue even with no active effects (per SWADE).
- [x] **m7** `{ui}` Add parameter info to `formatEvent` for APPLY_AFFLICTION, APPLY_BLINDED, APPLY_POWER_EFFECT, DISMISS_EFFECT, END_OF_TURN.
- [x] **m8** `{ui}` Replace IIFE in JSX for affliction type display with computed variable.
- [x] **m10** `{types}` Add validation to `InjuryRoll` constructor (tableRoll 2-12, subRoll 1-6).
- [x] **m11** `{test}` Replace `brands.ts` test helpers with `types.ts` constructors. Deleted `brands.ts`.

---

## Phase 4: Missing tests — DONE

- [x] **T1** `{test}` Add 8 injury system tests (resolveInjury, accumulation, penalty).
- [x] **T2** `{test}` Add hold/interrupt edge case tests (startOfTurn on hold, hold lost on fatigue incap).
- [x] **T3** `{test}` Add restraint edge case tests (entangled no-downgrade, bound escape fail, death clears).
- [x] **T4** `{test}` Add grapple edge case tests (blocked when grappled, conditions persist, clears on death).
- [x] **T5** `{test}` Add blinded edge case tests (impaired no-downgrade, blocked when incap, hold blocks recovery).
- [x] **T6** `{test}` Add affliction edge case tests (blocked when dead, cure fails when healthy, sleep blocks blinded).
- [x] **T7** `{test}` Add power effects edge case tests (blocked when dead, dismiss non-existent).

---

## Test counts

- Quint: 147 passing (was 120 before review)
- XState: 155 passing (was 102 before review)
- TypeScript: compiles clean
