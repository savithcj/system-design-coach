# 03. Architecture

## Principles
Pure core, thin shell. Everything that decides something is a pure function over state or events. The browser UI and the model are adapters around it.

## Module layout (suggested)
```
src/
  core/                 # DOM-free; runs in Node and browser
    events.ts           # event types, append, ids, coalescing
    reduce.ts           # reduce(events) -> State
    state.ts            # State type, selectors
    mermaid.ts          # State -> Mermaid
    report.ts           # narrate(events) -> outline; renderHtml, renderLatex
    layout.ts           # slot layout, tidy layout (pure)
    geometry.ts         # ports, curves, edge paths (pure)
  engine/               # the "boundary engine"
    rules/              # one file per rule + registry.ts
    evaluate.ts         # State + problem + stage + lens -> Violation[]
    selector.ts         # Violation[] + history -> CoachMove (no model)
    hints.ts            # scripted wording per rule and level
    grounding.ts        # reply gate: unknown components, forbidden terms
    contract.ts         # parse contract notes (deterministic part)
  problems/             # problem specs (see docs/07)
  coach/
    turn.ts             # builds the JSON turn request, validates reply
    adapter.ts          # CoachModel interface
    scripted.ts         # fallback adapter using hints.ts
    webllm.ts           # in-browser adapter (lazy-loaded)
  ui/                   # DOM/SVG; port from reference/poc/index.html
    board/ chat/ topbar/ dialogs/ report/ a11y/
  main.ts
tests/
  core/ engine/ fixtures/   # fixtures are JSON event logs + expectations
  e2e/                      # Playwright
evals/
  run.ts                    # headless fixture runner
```

## Data flow
1. UI actions append events (`dispatch(type, payload, actor)`).
2. `reduce(events)` yields `State`.
3. `evaluate(state, problem, stage, lens)` yields `Violation[]` (pure, deterministic).
4. When the learner asks for help, or the engine decides to speak, `selector` chooses ONE `CoachMove` from violations and history.
5. `turn.ts` builds a request `{stage, move, violations(trimmed), board summary, last 2 chat turns}` and asks the active `CoachModel` adapter to phrase it. The scripted adapter returns template text.
6. `grounding.ts` checks the reply. If it fails, retry once with a stricter instruction, then fall back to the scripted text. Log the failure as an event (`CoachReplyRejected`) for the evals.
7. The reply is appended as `CoachResponded`.

## Seams that must stay clean
- `CoachModel` adapter: `phrase(request): Promise<Reply>`. Nothing outside `coach/` imports a model library.
- The engine never imports `ui/` or `coach/`.
- The hidden answer (problem rubric, challenges, spoiler lists) lives only in `problems/` and `engine/`; it must never be serialised into UI state, the event log, the report, or a model prompt (only the chosen move's neutral wording and the violation ids/short descriptions go to the model).

## Build tooling
Vite (library-free), TypeScript strict, Vitest, Playwright. `evals/run.ts` imports `core` and `engine` directly (no browser).

## Performance
`reduce` is O(events) and fine for sessions of thousands of events. If needed, memoise by event count. Coalesce `NodeMoved` bursts (consecutive moves of one box within 1.5 s).
