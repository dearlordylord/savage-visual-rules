# TYPING_FIX: Narrowing broad types in `machine.ts`

## Approach

Use **Effect Schema `Schema.brand()`** for all branded types. Each semantically distinct value gets its own brand even if the underlying literal union is identical. Constructors must clamp/saturate rather than throw so the frontend never crashes on out-of-range input.

## Pattern

```typescript
import { Schema } from "effect"

// Schema + brand
const VigorRollResult = Schema.Literal(0, 1, 2).pipe(Schema.brand("VigorRollResult"))
type VigorRollResult = Schema.Schema.Type<typeof VigorRollResult>

// Safe constructor (clamps instead of throwing)
function vigorRollResult(n: number): VigorRollResult {
  const clamped = Math.max(0, Math.min(2, Math.floor(n)))
  return VigorRollResult.make(clamped as 0 | 1 | 2)
}
```

Test helpers go in a `test/helpers/brands.ts` file using direct casts:

```typescript
const vigorRoll = (n: 0 | 1 | 2) => n as VigorRollResult
```

---

## Context Fields

| Field | Current Type | Proposed Type | Underlying | Justification | Breaking? |
|---|---|---|---|---|---|
| `wounds` | `number` | `Wounds` | `0 \| 1 \| 2 \| 3` | Quint invariant: `0 <= wounds <= maxWounds`, max is 3. Arithmetic in `addWounds`/`healWounds` needs clamped constructor. | Yes — all assign actions doing arithmetic |
| `distractedTimer` | `number` | `ConditionTimer` | `-1 \| 0 \| 1` | Only values produced: `-1` (inactive), `0` (expires end of next turn), `1` (expires end of turn after next). Confirmed by `tickTimer` and `Math.max` calls. | Yes — `tickTimer` return, `Math.max` calls |
| `vulnerableTimer` | `number` | `ConditionTimer` | `-1 \| 0 \| 1` | Same type as `distractedTimer` — identical lifecycle semantics, shared brand. | Yes — same |
| `maxWounds` | `number` | `MaxWounds` | `1 \| 3` | Set once at init: `3` for WC, `1` for Extra. Never mutated. | Minimal — only compared against |
| `grappledBy` | `string \| null` | `CharacterId \| null` | branded `string` | Identifies opponent. Quint has consistency invariants on this field. Brand prevents accidental bare string assignment. | Low — only set/cleared |
| `isWildCard` | `boolean` | `boolean` | — | Already correct | No |
| `ownTurn` | `boolean` | `boolean` | — | Mirrors state intentionally (needed by timer-setting actions). Fine as-is. | No |
| `onHold` | `boolean` | `boolean` | — | Mirrors state. Fine. | No |
| `interruptedSuccessfully` | `boolean` | `boolean` | — | Correct | No |
| `injuries` | `InjuryType[]` | `InjuryType[]` | — | Already a literal union. Good. | No |

## Event Payload Fields

Each roll result is a **separate branded type** even when the underlying literal union is the same. They represent different skills/checks and must not be interchangeable.

| Event | Field | Current Type | Proposed Type | Underlying | Justification | Breaking? |
|---|---|---|---|---|---|---|
| `TAKE_DAMAGE` | `margin` | `number` | `DamageMargin` | non-negative `number`, capped to `15` | `damage - toughness`. Quint test range `0..15`. Clamp: `Math.max(0, Math.min(15, n))`. | Yes |
| `TAKE_DAMAGE` | `soakSuccesses` | `number` | `SoakSuccesses` | non-negative `number`, capped to `4` | Soak count, not a roll result. Quint: `0..4`. Clamp to range. | Yes |
| `TAKE_DAMAGE` | `incapRoll` | `number` | `IncapRollResult` | `-1 \| 0 \| 1` | Guards: `< 0` (crit fail), `=== 0` (fail), `>= 1` (success). Only roll with crit fail semantics. | Yes |
| `TAKE_DAMAGE` | `injuryRoll` | `number \| undefined` | `InjuryRoll \| undefined` | branded `number` | Composite encoding `tableRoll * 10 + subRoll`. 17 valid values in Quint. Brand prevents confusion with other numeric fields. | Minimal |
| `START_OF_TURN` | `vigorRoll` | `number` | `VigorRollResult` | `0 \| 1 \| 2` | `=== 0` fail, `=== 1` success, `>= 2` raise. Used for stunned/blinded/bleedingOut recovery. | Yes |
| `START_OF_TURN` | `spiritRoll` | `number` | `SpiritRollResult` | `0 \| 1` | `>= 1` success. Used only for shaken recovery. Distinct from vigor. | Yes |
| `HEAL` | `amount` | `number` | `HealAmount` | `1 \| 2 \| 3` | Quint: `HEAL_RANGE = 1.to(3)`. Zero is meaningless, >3 same as 3. | Yes |
| `INTERRUPT` | `athleticsRoll` | `number` | `AthleticsRollResult` | `0 \| 1` | `>= 1` success. Athletics check for interrupt. Distinct from vigor/spirit. | Yes |
| `ESCAPE_ATTEMPT` | `rollResult` | `number` | `EscapeRollResult` | `0 \| 1 \| 2` | `>= 1` success, `>= 2` raise. Strength/Athletics escape check. | Yes |
| `GRAPPLE_ATTEMPT` | `rollResult` | `number` | `GrappleRollResult` | `0 \| 1 \| 2` | `>= 1` grabbed, `>= 2` pinned. Opposed Athletics. Distinct from escape. | Yes |
| `GRAPPLE_ESCAPE` | `rollResult` | `number` | `GrappleEscapeRollResult` | `0 \| 1` | `>= 1` success. No raise distinction. Distinct from grapple attempt. | Yes |
| `PIN_ATTEMPT` | `rollResult` | `number` | `PinRollResult` | `0 \| 1` | `>= 1` success. Distinct from other rolls. | Yes |
| `APPLY_BLINDED` | `severity` | `2 \| 4` | `BlindedSeverity` | `2 \| 4` | Already narrowed to literals. Just needs a named brand. | Minimal |

## Other Types

| Item | Current Type | Proposed Type | Justification | Breaking? |
|---|---|---|---|---|
| `FearResult` (line 1008) | `string` | `FearResultType` literal union: `"ADRENALINE" \| "APPLY_DISTRACTED" \| "APPLY_VULNERABLE" \| "APPLY_STUNNED" \| "HINDRANCE_SCAR" \| "HINDRANCE_SLOWNESS" \| "PANIC_FLEE" \| "HINDRANCE_MINOR_PHOBIA" \| "HINDRANCE_MAJOR_PHOBIA" \| "HEART_ATTACK"` | `resolveFear` returns exactly these 10 literals. `string` hides errors. | Yes — consumers |
| `blindedPenalty` return | `number` | `0 \| -2 \| -4` | Only 3 possible return values | Minimal |

## Brand grouping (same underlying, MUST be separate brands)

| Underlying | Brands | Why separate |
|---|---|---|
| `0 \| 1` | `SpiritRollResult`, `AthleticsRollResult`, `GrappleEscapeRollResult`, `PinRollResult` | Different skills, different game contexts, different state transitions |
| `0 \| 1 \| 2` | `VigorRollResult`, `EscapeRollResult`, `GrappleRollResult` | Different skills, raise means different things (recover vs escape vs pin) |
| `-1 \| 0 \| 1` | `IncapRollResult`, `ConditionTimer` | Completely unrelated semantics (roll outcome vs timer countdown) |

## Clamping contract

All branded constructors MUST clamp/saturate to range rather than throw. The frontend calls these constructors with potentially arbitrary user input or dice results. Crashing is never acceptable.

```typescript
// Example: VigorRollResult constructor
function vigorRollResult(n: number): VigorRollResult {
  const clamped = Math.max(0, Math.min(2, Math.floor(n))) as 0 | 1 | 2
  return VigorRollResult.make(clamped)
}

// Example: Wounds constructor
function wounds(n: number): Wounds {
  const clamped = Math.max(0, Math.min(3, Math.floor(n))) as 0 | 1 | 2 | 3
  return Wounds.make(clamped)
}

// Example: DamageMargin constructor
function damageMargin(n: number): DamageMargin {
  const clamped = Math.max(0, Math.min(15, Math.floor(n)))
  return DamageMargin.make(clamped)
}
```

## Implementation order

1. Define all branded types + clamping constructors in a new `app/src/types.ts`
2. Update `SavageContext` interface to use branded context fields
3. Update `SavageEvent` union to use branded event payload fields
4. Update `FearResult` to literal union
5. Fix all `assign()` actions to use constructors (arithmetic results go through clamping constructors)
6. Fix all guards (comparisons against branded values — may need unwrapping or direct comparison since branded types are still primitives at runtime)
7. Update test helpers to use test brand factories
8. Run tests: `cd app && npx vitest run src/machine.test.ts`

## Notes

- `ConditionTimer` is shared between `distractedTimer` and `vulnerableTimer` — same lifecycle semantics, one brand.
- `tickTimer` return type becomes `ConditionTimer`. Its logic already only produces `-1 | 0 | 1`.
- `resolveInjury` param stays `InjuryRoll` (branded `number`) — the composite encoding makes a finite literal union impractical but the brand still prevents mixing with other numbers.
- `Schema.brand()` brands are erased at runtime — no perf cost. Guards comparing branded values to literals work without unwrapping since the brand is phantom.
