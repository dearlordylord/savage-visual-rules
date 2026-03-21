# SWADE Status Machine

Formal model of Savage Worlds Adventure Edition character status tracking — from [Quint](https://quint-lang.org/) spec to interactive web app.

## Architecture

```
savage.qnt          ──  formal spec (source of truth)
  │                      states, transitions, invariants, 27 tests
  │
  ├─ quint-connect  ──  model-based testing bridge
  │                      replays Quint traces against TS implementation
  │
  ├─ machine.ts     ──  XState v5 parallel state machine
  │                      4 regions: damage, conditions, fatigue, turn phase
  │                      (developing the XState machine provided useful
  │                      feedback for refining the Quint model too)
  │
  └─ app/           ──  TanStack Start + React 19 + Tailwind CSS
                         interactive UI with event log, undo/redo, state tree
```

## What it models

- **Damage track**: active → shaken → wounded → incapacitated → bleeding out → dead
- **Conditions**: stunned, distracted, vulnerable (with timer-based expiry)
- **Fatigue**: fresh → fatigued → exhausted → incapacitated
- **Turn phase**: own turn / others' turn (affects recovery rolls, timer ticks)
- Wild Card vs Extra characters (different wound thresholds)

## Stack

| Layer | Tech |
|-------|------|
| Formal spec | Quint |
| MBT bridge | [quint-connect](https://www.npmjs.com/package/@firfi/quint-connect) |
| State machine | XState v5 |
| App framework | TanStack Start |
| UI | React 19, Tailwind CSS |

## Dev

```sh
cd app
npm install
npm run dev      # dev server on :3000
npm test         # unit tests (30) + MBT traces (50×30 steps)
```
