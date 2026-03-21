# Ralph Development Instructions

## Context
You are an autonomous development agent working on **Savage** — a Savage Worlds SWADE combat tracker built with XState v5, TanStack Start, and React 19.

## Task Source
All tasks in `TASKS.md`. Pick the first unfinished task (not marked `[DONE]`) in document order. **Document order is strict** — do NOT skip ahead. If Slice 1.1 is not `[DONE]`, do Slice 1.1 even if 1.2 and 1.3 are `[DONE]`.

## Quint-First Workflow (CRITICAL)
The project uses a **Quint-first** workflow. Quint spec slices (X.1) MUST be done before XState port slices (X.2). This is non-negotiable.

### How to work with Quint
- Quint spec: `savage.qnt` — state types, pure transition functions, actions, step function
- Quint tests: `savageTest.qnt` — test runs and invariants
- **Run tests**: `quint test --main savageTest savageTest.qnt`
- **Run verification**: `quint verify --main savageTest --invariant safetyInv savageTest.qnt`
- Read existing `savage.qnt` and `savageTest.qnt` carefully before modifying — follow existing patterns
- Quint files use the `.qnt` extension and Quint language syntax (not TypeScript)

## Loop Protocol
1. Read `TASKS.md` — find the first task not marked `[DONE]`, in document order
2. Read `CLAUDE.md` for project conventions
3. Read `rules/` for Savage Worlds rules reference as needed
4. Read relevant source files (`savage.qnt` for Quint tasks, `app/src/machine.ts` for XState tasks)
5. **Start implementing quickly** — max 5 tool calls on exploration before writing code
6. For Quint slices: write spec first, then tests, then run `quint test` and `quint verify`
7. For XState slices: implement machine changes, write vitest tests, run `cd app && npx vitest run src/machine.test.ts`
8. Commit: `feat(TASK_ID): description`
9. Mark `[DONE]` in `TASKS.md`
10. Report status

## Tool Usage — CRITICAL
- **ALWAYS** use `Write` to create files, `Edit` to modify files
- **NEVER** use `Bash(cat >)`, `Bash(printf)`, `Bash(cp)`, `Bash(python3 -c)` for file ops
- **NEVER** use `Bash(node -e ...)` to explore APIs — just write code and fix errors
- **NEVER** use MCP tools (mcp__effect-docs__*, mcp__quint-kb__*) — they are not available in this environment
- **NEVER** use variable assignments in Bash commands (`VAR=x; cmd`) — use inline values instead
- Bash only for: git, npm, quint, running tests

## Rules
- `npm` (not pnpm). No type casts (`as T`).
- Quint tests: `quint test --main savageTest savageTest.qnt`
- Quint verify: `quint verify --main savageTest --invariant safetyInv savageTest.qnt`
- XState tests: `cd app && npx vitest run src/machine.test.ts`
- Dev: `cd app && npm run dev`
- **Every feature commit MUST include tests.** Zero-test commits are not acceptable.

## Protected Files
`.ralph/`, `.ralphrc`, `CLAUDE.md`, `rules/` — do not modify

## Status Reporting
```
---RALPH_STATUS---
STATUS: IN_PROGRESS | COMPLETE | BLOCKED
TASK_ID: <id>
TASKS_COMPLETED_THIS_LOOP: <n>
FILES_MODIFIED: <n>
TESTS_STATUS: PASSING | FAILING | NOT_RUN
WORK_TYPE: IMPLEMENTATION | TESTING | DOCUMENTATION | REFACTORING
EXIT_SIGNAL: false | true
RECOMMENDATION: <next task and summary>
---END_RALPH_STATUS---
```
EXIT_SIGNAL: true only when ALL tasks [DONE]. BLOCKED if deps unmet or unresolvable.
