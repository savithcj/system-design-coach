# 05. Engine, rules and evals

The engine is the product's brain. It is plain TypeScript, deterministic, and heavily tested. The model only phrases what the engine decided.

## Pipeline
`evaluate(state, problem, stage, lens) -> Violation[]` then `selector(violations, history, level) -> CoachMove` then wording (scripted or model) then `grounding` gate.

## Violation
```ts
Violation { ruleId, stage, severity: 'info'|'warn'|'block', evidence: string[] /* node/edge ids or note excerpts */, summary: string /* neutral, no spoilers */ }
```

## Rule registry
One rule = one file, registered in `engine/rules/registry.ts`.
```ts
Rule {
  id, stage: 1..5 | 'any',
  applies(state, problem, lens): boolean,
  check(state, problem, lens): Violation | null,
  hints: { l1: string, l2: (v)=>string, l3: (v)=>string },   // scripted wording per level
  spoilers: string[],           // terms that must NOT appear in L1/L2 wording or model replies at this stage
  resolvedBy?: string           // human description, for the report
}
```
Rules look at: arrows (graph reachability, direct client-to-database, missing queue between producer and consumer, single point of failure by counting parallel paths named replicas/instances in labels or notes), names and notes (text match with small, explicit term lists kept IN the rule file), and contract notes (counts, presence of a below-the-line section, measurable numbers in NFR lines). Capacity math runs in TypeScript from numbers the learner wrote in notes (`QPS`, `TTL 10m`, `DAU`), never from the model.

Avoid whack-a-mole: no ad hoc word lists in UI code; a technology-to-category mapping is only a hint and the learner's chosen CATEGORY always wins.

## Rules to implement in Milestone 1 (starter set; write each hint in our own words)
Stage 1 Requirements
- `REQ_TOO_MANY_FEATURES`: more than 4 functional lines.
- `REQ_NO_OUT_OF_SCOPE`: no `---` section.
- `REQ_VAGUE_NFR`: an NFR line like "low latency" or "scalable" with no number, no scope (which path) or no stated priority between consistency and availability.
- `REQ_CAP_UNSCOPED`: consistency and availability claimed with no mention of where each applies.
Stage 2 Entities
- `ENT_PREMATURE_DETAIL`: columns/SQL types or QPS numbers in the entities block.
Stage 3 API
- `API_NO_COVERAGE`: a functional requirement with no API/step line mapped to it (match by shared nouns; model may assist).
- `API_USER_ID_IN_BODY`: identity passed in a request body instead of an auth header or token.
- `API_SINGLE_STEP_BOOKING`: a booking/purchase endpoint with no reserve-then-confirm pair (Ticketmaster).
Stage 4 High-level design
- `HLD_CLIENT_TO_DB`: client connects directly to a database.
- `HLD_NO_ENTRY_POINT`: no load balancer / gateway-like Server between the client and services (when more than one server exists).
- `HLD_UNFINISHED_PATH`: a required API path has no end-to-end route on the board.
- `HLD_PREMATURE_OPTIMISATION`: caches/queues added before an end-to-end path exists.
Stage 5 Deep dives (problem-specific challenges, see docs/07)
- `DD_RESERVATION_NO_EXPIRY`: a reservation/status with no expiry mechanism noted.
- `DD_CRON_STALE_WINDOW`: periodic cleanup as the only expiry (stale window up to the interval).
- `DD_SEARCH_FULL_SCAN`: search implemented as a substring scan on the main database.
- `DD_SEARCH_PRIMARY_STORE`: a search index used as the only source of truth.
- `DD_SURGE_NO_CHOKEPOINT`: a hot event with direct access to the booking store and no admission control.
- `DD_LOCK_STORE_OUTAGE`: a lock/cache holding reservations with no stated fallback for its failure.

## Selector (no model)
A small state machine over the current stage and the violations:
- Chooses ONE move: `ask_clarifying`, `probe_bottleneck`, `challenge_assumption`, `scale_curveball`, `offer_hint`, `affirm_and_advance`, `stay_quiet`.
- Never speaks twice in a row about the same rule unless asked. Escalates hint level only on request ("Stuck?" at level n+1) or after repeated unresolved violation across stages.
- Premature-optimisation guard: in stage 4, defer deep-dive rules ("pin it as a deep dive and finish the end-to-end path first").
- Level calibration: an optional `level` setting (mid / senior / staff) widens or narrows how many curveballs are thrown. Default mid.

## Grounding gate (`grounding.ts`)
Applied to every model reply (and to scripted text in tests):
1. **No ghost components**: every component name the reply mentions must exist on the board (case-insensitive, category synonyms allowed) or be a generic term. Mentioning a technology the learner has not added fails the gate.
2. **No spoilers**: the reply must not contain any term in the active rule's `spoilers` list nor any term from the problem's `stageSpoilers[stage]` for later stages.
3. **One question max**, under a length cap, no code fences, no numbered lists, no "the answer is".
4. Failure triggers one retry with a stricter instruction, then scripted fallback. Record `CoachReplyRejected`.

## Fixtures and the headless eval runner
A fixture is JSON. Write them in our own words from the failure patterns the product teaches.
```json
{
  "id": "tm_hld_cron_and_like",
  "problem": "ticketmaster",
  "stage": 4,
  "lens": "default",
  "events": [ /* a full event log as produced by the app */ ],
  "expect": {
    "flags": ["API_USER_ID_IN_BODY", "DD_SEARCH_FULL_SCAN", "DD_CRON_STALE_WINDOW"],
    "notFlags": ["HLD_CLIENT_TO_DB"],
    "move": "probe_bottleneck",
    "moveAbout": ["API_USER_ID_IN_BODY", "DD_SEARCH_FULL_SCAN", "DD_CRON_STALE_WINDOW"],
    "forbiddenInReply": ["waiting queue", "server-sent events"]
  }
}
```
`npm run evals`:
- Layer A (deterministic): every fixture's flags match exactly; `notFlags` absent. Zero variance.
- Layer B (policy): selector's move and `moveAbout`; level calibration cases (mid-level fixture must not receive staff-level curveballs).
- Layer C (reply): for each fixture with a model adapter configured, phrase the move and run the grounding gate; report spoiler-leak rate and ghost-component rate. These two numbers are release gates for any model (target 0%).
- The prototype's `t2.js`/`t4.js` scenarios become the first fixtures and reducer/UI tests.
- Also include "valid alternative" fixtures: the same requirement satisfied with different technologies must NOT flag.

Aim for 10 to 15 fixtures in Milestone 1 and keep growing. Every bug found by hand becomes a fixture first.
