# Agent Configuration

## Build & Verify
```bash
cd app && npm run build     # vite build
cd app && npm run test      # vitest run
cd app && npx tsc --noEmit  # typecheck
```

## Stack
- XState v5 state machine (`app/src/machine.ts`)
- TanStack Start + React 19
- Tailwind CSS v4
- Vitest for tests
- Quint spec (`savage.qnt`) as source of truth
