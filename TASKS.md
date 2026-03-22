# MBT Driver Sync Tasks

The MBT driver (`app/src/machine.mbt.test.ts`) is severely out of date. It was written once and never updated as features were added to the Quint spec and XState machine.

**Acceptance criteria for every task below:** after completing the task, verify `npx tsc --noEmit` passes (EventActionMap compile-time check) and `npx vitest run src/machine.mbt.test.ts -t "sync"` passes (Quint AST state field check). Remove completed fields from `KNOWN_MISSING_FIELDS` in `machine.mbt.test.ts`.

## PREREQUISITE: Add sync enforcement checks

Prevent future drift. Must be done FIRST so all subsequent work is covered.

- [x] **Compile-time: exhaustive EventActionMap** — type-level map from every `SavageEvent["type"]` to its Quint `do*` action name. Compile error if a new event exists without a map entry.
- [x] **Test-time: Quint AST state field check** — parse `savage.qnt` at test time, extract all `State` fields, assert new ones are in `QuintState` zod schema.

## Replace `any` in Quint AST parsing with Effect Schema

`parseQuintStateFields` in `machine.mbt.test.ts` uses `any` for the Quint AST. Define an Effect Schema for the subset of the AST we use (modules, declarations, typedef, row fields) and parse with `Schema.decodeUnknownSync`. No `any` casts.

- [x] Define Effect Schema for Quint AST (only the parts we traverse)
- [x] Replace `JSON.parse` + `any` casts with `Schema.decodeUnknownSync`

## Fix existing driver bugs

- [x] `doTakeDamage`: add `injuryRoll` parameter (Quint sends it, driver ignores it)
- [x] `doEndOfTurn`: accept `vigorRoll` from Quint instead of hardcoding `vigorRollResult(0)` (blinded recovery never fires in MBT)

## Add missing state fields to QuintState schema + snapshotToQuintState

- [x] `prone`
- [x] `onHold`
- [x] `holdUsed`
- [x] `restrained`
- [x] `grappledBy`
- [x] `blinded`
- [x] `injuries`
- [x] `afflictionType`
- [x] `afflictionTimer`
- [x] `activeEffects`
- [x] `defending`

## Add missing driver actions

- [x] `doDropProne` -> `DROP_PRONE`
- [x] `doStandUp` -> `STAND_UP`
- [x] `doGoOnHold` -> `GO_ON_HOLD`
- [x] `doActFromHold` -> `ACT_FROM_HOLD`
- [x] `doInterrupt(athleticsRoll)` -> `INTERRUPT`
- [x] `doDefend` -> `DEFEND`
- [x] `doApplyEntangled` -> `APPLY_ENTANGLED`
- [x] `doApplyBound` -> `APPLY_BOUND`
- [x] `doEscapeAttempt(rollResult)` -> `ESCAPE_ATTEMPT`
- [x] `doGrappleAttempt(rollResult, opponent)` -> `GRAPPLE_ATTEMPT`
- [x] `doGrappleEscape(rollResult)` -> `GRAPPLE_ESCAPE`
- [x] `doPinAttempt(rollResult)` -> `PIN_ATTEMPT`
- [x] `doApplyBlinded(severity)` -> `APPLY_BLINDED`
- [x] `doApplyAffliction(aType, duration)` -> `APPLY_AFFLICTION`
- [x] `doCureAffliction` -> `CURE_AFFLICTION`
- [x] `doApplyEffect(etype, duration)` -> `APPLY_POWER_EFFECT`
- [x] `doDismissEffect(etype)` -> `DISMISS_EFFECT`
- [x] `doBacklash` -> `BACKLASH`

## Tech debt / design concerns

### turnPhase naming vs Quint semantics

- [x] Renamed: `othersTurn` → `idle`, `ownTurn` → `acting`, `onHold` → `holdingAction`

### context.ownTurn / context.onHold duplicate state path

- [x] `snapshotToQuintState` now derives `ownTurn`/`onHold` from `snap.matches()` instead of context
