# MBT Driver Sync Tasks

The MBT driver (`app/src/machine.mbt.test.ts`) is severely out of date. It was written once and never updated as features were added to the Quint spec and XState machine.

**Acceptance criteria for every task below:** after completing the task, verify `npx tsc --noEmit` passes (EventActionMap compile-time check) and `npx vitest run src/machine.mbt.test.ts -t "sync"` passes (Quint AST state field check). Remove completed fields from `KNOWN_MISSING_FIELDS` in `machine.mbt.test.ts`.

## PREREQUISITE: Add sync enforcement checks

Prevent future drift. Must be done FIRST so all subsequent work is covered.

- [x] **Compile-time: exhaustive EventActionMap** — type-level map from every `SavageEvent["type"]` to its Quint `do*` action name. Compile error if a new event exists without a map entry.
- [x] **Test-time: Quint AST state field check** — parse `savage.qnt` at test time, extract all `State` fields, assert new ones are in `QuintState` zod schema.

## Replace `any` in Quint AST parsing with Effect Schema

`parseQuintStateFields` in `machine.mbt.test.ts` uses `any` for the Quint AST. Define an Effect Schema for the subset of the AST we use (modules, declarations, typedef, row fields) and parse with `Schema.decodeUnknownSync`. No `any` casts.

- [ ] Define Effect Schema for Quint AST (only the parts we traverse)
- [ ] Replace `JSON.parse` + `any` casts with `Schema.decodeUnknownSync`

## Fix existing driver bugs

- [ ] `doTakeDamage`: add `injuryRoll` parameter (Quint sends it, driver ignores it)
- [ ] `doEndOfTurn`: accept `vigorRoll` from Quint instead of hardcoding `vigorRollResult(0)` (blinded recovery never fires in MBT)

## Add missing state fields to QuintState schema + snapshotToQuintState

- [ ] `prone`
- [ ] `onHold`
- [ ] `holdUsed`
- [ ] `restrained`
- [ ] `grappledBy`
- [ ] `blinded`
- [ ] `injuries`
- [ ] `afflictionType`
- [ ] `afflictionTimer`
- [ ] `activeEffects`
- [ ] `defending`

## Add missing driver actions

- [ ] `doDropProne` -> `DROP_PRONE`
- [ ] `doStandUp` -> `STAND_UP`
- [ ] `doGoOnHold` -> `GO_ON_HOLD`
- [ ] `doActFromHold` -> `ACT_FROM_HOLD`
- [ ] `doInterrupt(athleticsRoll)` -> `INTERRUPT`
- [ ] `doDefend` -> `DEFEND`
- [ ] `doApplyEntangled` -> `APPLY_ENTANGLED`
- [ ] `doApplyBound` -> `APPLY_BOUND`
- [ ] `doEscapeAttempt(rollResult)` -> `ESCAPE_ATTEMPT`
- [ ] `doGrappleAttempt(rollResult, opponent)` -> `GRAPPLE_ATTEMPT`
- [ ] `doGrappleEscape(rollResult)` -> `GRAPPLE_ESCAPE`
- [ ] `doPinAttempt(rollResult)` -> `PIN_ATTEMPT`
- [ ] `doApplyBlinded(severity)` -> `APPLY_BLINDED`
- [ ] `doApplyAffliction(aType, duration)` -> `APPLY_AFFLICTION`
- [ ] `doCureAffliction` -> `CURE_AFFLICTION`
- [ ] `doApplyEffect(etype, duration)` -> `APPLY_POWER_EFFECT`
- [ ] `doDismissEffect(etype)` -> `DISMISS_EFFECT`
- [ ] `doBacklash` -> `BACKLASH`
