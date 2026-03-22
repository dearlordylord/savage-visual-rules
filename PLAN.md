# Phase 2: Scenario Cookbook — Cross-Feature Mechanics

Phase 1 (done) covered isolated mechanics — one track at a time.
Phase 2 adds scenarios where multiple tracks interact: damage + recovery + turn flow, stunned + shaken simultaneous recovery, hold broken by damage, timer freezing, affliction cascades, etc.

## What changes

Only `app/src/scenarios.ts`:
- Add a new category `cross` (or several sub-categories) to `categoryLabels`
- Append ~20 cross-feature `Scenario` entries to the `scenarios` array

No component changes needed — `ScenarioBrowser` and `ScenarioPlayer` already handle any scenario data.

## Cross-feature categories

Group under a few sub-categories to keep the sidebar organized:

| Category key | Russian label | Scenarios |
|---|---|---|
| crossCombat | Бой: цикл раунда | 2.1, 2.11, 2.18 |
| crossRecovery | Оправление: комбинации | 2.2, 2.8, 2.9 |
| crossHold | Наготове: взаимодействия | 2.3, 2.13, 2.14 |
| crossRestraint | Путы и захват: связи | 2.4, 2.5, 2.6 |
| crossAffliction | Недуги: каскады | 2.7, 2.16 |
| crossDefense | Оборона и состояния | 2.10, 2.20 |
| crossHealing | Лечение и возврат в бой | 2.12, 2.15 |
| crossFear | Страх: каскады | 2.17 |
| crossDeath | Гибель и выживание | 2.19 |

## Scenarios (from PLAN.md Phase 2)

### 2.1 — Полный боевой раунд
Hit → shaken → start of turn → spirit success → act → end of turn.
Events: TAKE_DAMAGE, START_OF_TURN(spirit=1), END_OF_TURN

### 2.2 — Оглушение + шок: одновременное оправление
Both stunned and shaken. START_OF_TURN resolves Vigor (stun) and Spirit (shaken) independently.
Three sub-scenarios: both succeed, mixed results (vigor ok / spirit fail), (vigor fail / spirit ok).
Events: TAKE_DAMAGE, APPLY_STUNNED, START_OF_TURN (3 variants)

### 2.3 — Шок отменяет наготове
On hold, enemy hits → shaken → hold lost.
Events: START_OF_TURN, GO_ON_HOLD, TAKE_DAMAGE

### 2.4 — Уязвимость не истекает, пока персонаж схвачен
Entangled sets persistent vulnerable. Turns pass, timer doesn't expire. Escape clears it.
Events: APPLY_ENTANGLED, START_OF_TURN, END_OF_TURN (multiple), ESCAPE_ATTEMPT

### 2.5 — Обездвижен замораживает таймеры
Bound freezes distracted/vulnerable timers on END_OF_TURN.
Events: APPLY_DISTRACTED, APPLY_BOUND, START_OF_TURN, END_OF_TURN

### 2.6 — Захват → путы
Grabbed → pin → APPLY_BOUND transitions to bound, clears grappledBy.
Events: GRAPPLE_ATTEMPT, PIN_ATTEMPT, APPLY_BOUND

### 2.7 — Смертельный яд + существующие ранения
Already at 3 wounds. Lethal affliction adds 1 wound → exceeds max → incap.
Events: TAKE_DAMAGE(margin=12), START_OF_TURN(spirit=1), END_OF_TURN, APPLY_AFFLICTION(lethal)

### 2.8 — Сон блокирует восстановление зрения
Sleep blocks blinded recovery at end of turn.
Events: APPLY_AFFLICTION(sleep), APPLY_BLINDED(4), START_OF_TURN, END_OF_TURN(vigor=2)

### 2.9 — Усталость до потери сознания снимает всё
Fatigue incap clears entangled, blinded, etc.
Events: APPLY_ENTANGLED, APPLY_BLINDED(4), APPLY_FATIGUE x3

### 2.10 — Оглушение отменяет оборону
Defending, get stunned → defense drops.
Events: START_OF_TURN, DEFEND, APPLY_STUNNED

### 2.11 — Серия попаданий до потери сознания
Progressive damage over 4 rounds with recovery attempts.
Events: TAKE_DAMAGE, START_OF_TURN, END_OF_TURN (multi-round sequence)

### 2.12 — Лечение возвращает в бой
Incapacitated → heal 1 wound → back to active → heal rest.
Events: setup to bleedingOut, HEAL(1), HEAL(2)

### 2.13 — Наготове сохраняется между раундами
Go on hold, skip rounds, finally act.
Events: START_OF_TURN, GO_ON_HOLD, END_OF_TURN, START_OF_TURN (repeat), ACT_FROM_HOLD

### 2.14 — Таймер отвлечения замораживается наготове
Distracted timer doesn't tick while on hold.
Events: APPLY_DISTRACTED, START_OF_TURN, GO_ON_HOLD, END_OF_TURN (multiple), ACT_FROM_HOLD, END_OF_TURN

### 2.15 — Полное поглощение снимает предшествующий шок
Already shaken, new hit soaked completely → shaken cleared.
Events: TAKE_DAMAGE(soak=0), TAKE_DAMAGE(soak=1)

### 2.16 — Цепочка откатов
Caster maintains 2 powers, already fatigued. Backlash → all powers gone + exhausted.
Events: APPLY_POWER_EFFECT x2, APPLY_FATIGUE, BACKLASH

### 2.17 — Страх → оглушение → каскад
Fear roll 13 → APPLY_STUNNED → stunned + prone + distracted + vulnerable.
Events: APPLY_STUNNED (from fear result)

### 2.18 — Дикая карта vs статист: один и тот же урон
Same damage margin, WC survives, extra dies. Two scenarios (WC + extra) side by side.
Events: TAKE_DAMAGE(margin=8)

### 2.19 — Гонка со смертью
Bleeding out, multiple Vigor checks across rounds.
Events: setup to bleedingOut, START_OF_TURN(vigor=1) x2, START_OF_TURN(vigor=2)

### 2.20 — Ограничения обороны
Can't defend when shaken/stunned/idle/on hold. Defend blocks hold.
Events: multiple sub-scenarios showing each restriction

## Implementation

1. Add category keys to `categoryLabels` in `scenarios.ts`
2. Append scenario objects to `scenarios` array
3. Verify: `tsc --noEmit`, `vitest run`, dev server + curl `/cookbook`
4. Commit, merge into master, clean worktree
