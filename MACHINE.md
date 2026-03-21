# Savage Worlds Status State Machine

## Purpose

A learning/reference tool that models the SWADE character status system as a formal state machine. Users fire events (damage, recovery rolls, turn boundaries) and see status transitions in real time. Helps players understand the most confusing part of the rules: interacting conditions, Shaken-on-Shaken wounds, Stunned recovery chains, timer expiry.

## Approach

### Phase 1: Formal verification (DONE)

Quint spec (`savage.qnt`) validates the game logic. Flat state + pure functions + invariants. All 27 tests pass, safety invariants hold across 50k random traces.

The Quint spec uses a flat state model (boolean flags + numeric counters) because Quint has no hierarchical state concept. It validated:
- Damage → Shaken → Wound → Incapacitation → BleedingOut → Death chain
- Shaken-on-Shaken = wound (at least 1 wound when already Shaken)
- Soak removes wounds; if ALL soaked, also clears Shaken (even pre-existing)
- Stunned → recovery → timed Vulnerable
- Distracted/Vulnerable timer expiry (during-own-turn vs outside)
- Fatigue stacking with wound penalties
- Extras eliminated on any wound, Wild Cards incapacitated at wounds > maxWounds
- Dead is absorbing (no transition can un-dead)

### Phase 2: XState implementation (NEXT)

Port to XState v5 + TanStack Start UI.

#### Why hierarchical/parallel states, not flat

The flat Quint model has implicit constraints enforced only by function discipline and checked by invariants (e.g., "bleedingOut implies incapacitated", "extra with wounds implies dead"). In XState, hierarchical states make these constraints **structurally unrepresentable** rather than merely checked:

- `bleedingOut` as a child of `incapacitated` → you cannot be bleeding out without being incapacitated. The invalid state doesn't exist.
- Damage progression `healthy → shaken → wounded → incapacitated` → you can't be wounded without passing through Shaken first (matches the rules).
- Fatigue ladder `fresh → fatigued → exhausted → incapByFatigue` → impossible to skip levels.

This is strictly more correct than the flat model. The Quint spec validated the logic; XState encodes it with stronger structural guarantees.

## XState Architecture

### Parallel state regions

Top-level parallel machine with 4 regions running simultaneously:

```
savage (parallel)
├── damageTrack
│   ├── active
│   │   ├── unshaken
│   │   ├── shaken
│   │   └── wounded (has context: wounds count)
│   ├── incapacitated
│   │   ├── stable
│   │   └── bleedingOut
│   └── dead (final)
│
├── conditionTrack (parallel)
│   ├── stun
│   │   ├── normal
│   │   └── stunned
│   ├── distraction
│   │   ├── clear
│   │   └── distracted (context: timer)
│   └── vulnerability
│       ├── clear
│       └── vulnerable (context: timer)
│
├── fatigueTrack
│   ├── fresh
│   ├── fatigued
│   ├── exhausted
│   └── incapByFatigue
│
└── turnPhase
    ├── othersTurn
    └── ownTurn
```

### Context (numeric/dynamic values alongside states)

```typescript
{
  wounds: number          // 0 to maxWounds
  distractedTimer: number // countdown, -1 = inactive
  vulnerableTimer: number // countdown, -1 = inactive
  isWildCard: boolean     // immutable after init
  maxWounds: number       // immutable after init (3 for WC, 1 for Extra)
}
```

### Events

All pre-resolved — the caller provides dice results, not raw stats.

| Event | Payload | Description |
|---|---|---|
| `TAKE_DAMAGE` | `{ margin, soakSuccesses, incapRoll }` | margin = damage - toughness. Soak: 0 = none/fail, 1+ = wounds negated. incapRoll: -1 critfail, 0 fail, 1+ success. |
| `START_OF_TURN` | `{ recoveryRoll }` | 0 = fail, 1 = success, 2+ = raise. Used for Stunned (Vigor), Shaken (Spirit), or BleedingOut (Vigor). |
| `END_OF_TURN` | — | Expire timed conditions, transition to othersTurn. |
| `SPEND_BENNY` | — | Clear Shaken instantly (any time). |
| `APPLY_STUNNED` | — | External stun effect. |
| `APPLY_DISTRACTED` | — | From trick, power, ability. |
| `APPLY_VULNERABLE` | — | From trick, power, ability. |
| `APPLY_FATIGUE` | — | One level from hazard/power/stress. |
| `RECOVER_FATIGUE` | — | One level (rest, remove cause). |
| `HEAL` | `{ amount }` | Wounds healed (1-3). Removes incapacitation. |

### Key transition logic (from validated Quint spec)

**Damage resolution (`TAKE_DAMAGE`):**
1. `raises = margin / 4`
2. `rawWounds = alreadyShaken ? max(raises, 1) : raises`
3. `effectiveSoak = rawWounds > 0 ? soakSuccesses : 0`
4. `actualWounds = max(0, rawWounds - effectiveSoak)`
5. If all wounds soaked: also clear Shaken (even pre-existing)
6. Extra + any wound → dead
7. Wild Card + total wounds > maxWounds → incapacitated + resolve incapRoll immediately

**Condition timers:**
- Applied during own turn: timer = 1 (survives current endOfTurn + next endOfTurn)
- Applied during others' turn: timer = 0 (clears at next endOfTurn)
- `endOfTurn`: if timer == 0 → clear, if timer > 0 → decrement

**Stunned recovery (at startOfTurn):**
- Fail: still Stunned
- Success: clear Stunned, set Vulnerable timer = 1 (until end of next turn)
- Raise: clear Stunned, set Vulnerable timer = 0 (clears at end of current turn)

**Derived values (computed, not stored):**
- `isDistracted = distraction.distracted OR stun.stunned`
- `isVulnerable = vulnerability.vulnerable OR stun.stunned`
- `totalPenalty = -(min(wounds, 3) + fatigueLevel)`
- `canAct = damageTrack.active.unshaken AND NOT stun.stunned`
- `canMove = damageTrack.active AND NOT stun.stunned`

## Tech stack

- **XState v5** — state machine runtime
- **TanStack Start** — fullstack React framework (SSR, routing)
- **UI**: fire events, see current state diagram + active states + context values + transition log

## Out of scope

- Dice rolling, stats, skills — caller provides resolved numbers
- Initiative, action economy — just startOfTurn/endOfTurn signals
- Attack rolls — we start from damage dealt
- Injury table — flag only, lookup is external
- Grapple (Grabbed/Restrained) — separate subsystem, could add later
- Powers, edges, equipment — they affect inputs, not the machine

## Reference files

- `savage.qnt` — validated Quint spec (source of truth for transition logic)
- `savageTest.qnt` — 27 test scenarios (acceptance criteria)
- `rules/` — SWADE rulebook in Russian (see `CLAUDE.md` for key file index)
- `STATUSES.csv` — quick-reference status table
