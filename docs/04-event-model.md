# 04. Event model

Single append-only list. Each event: `{seq, ts, type, actor: 'user'|'coach'|'system', payload}`. `seq` is monotonically increasing and unique. State is `reduce(events)`. Projections: board, chat feed, Mermaid, report, replay.

## Event types
Existing (from the prototype):
- `ProblemLoaded {problemId}`
- `NodeAdded {id, role, label, fx, y}`  (`fx` is 0..1 horizontal fraction, `y` pixels; pinned at creation)
- `NodeMoved {id, fx, y}`  (coalesce bursts within 1.5 s)
- `NodeRenamed {id, label}`
- `NodeDeleted {id}`  (also removes its edges and note)
- `EdgeAdded {id, a, b, pa, pb}`  (pa/pb are ports `t|r|b|l`; optional, auto-chosen if absent)
- `EdgeDeleted {id}`
- `LayoutReset {pos}`  (map id -> {fx,y}; from Tidy up)
- `UserMessaged {text}`
- `CoachResponded {kind: 'opening'|'reply'|'hint'|'ack', message, level?, ruleId?, move?}`
- `SessionFinished {}`

New in Milestone 1:
- `StageChanged {stage: 1..5}`  (system or user via the pill)
- `ContractNoteUpdated {block: 'functional'|'nonfunctional'|'entities'|'api', text}`
- `EdgeLabeled {id, label}`
- `NodeNoteUpdated {id, text}`
- `UserActionUndone {targetSeq}` and `UserActionRedone {targetSeq}`  (see undo)
- `HintRequested {level}`
- `RuleFired {ruleId, stage, evidence}` and `RuleResolved {ruleId}`  (system; emitted when evaluate output changes, so the report can show when each issue appeared and cleared)
- `CoachReplyRejected {reason, move}`  (system; grounding gate failures, for evals)
- `ContextChanged {lens}`  (scale lens, Phase later)

Removed from training mode: `CoachStep` and `CoachEditUndone` (the ReAct loop). Keep the reducer able to read old logs.

## Undo
Undo is an event, not a deletion. `UserActionUndone {targetSeq}` makes the reducer ignore the effect of the user event at `targetSeq` (and its pair events, e.g. a node add and its auto-rename). Undo walks back through the user's non-undone, non-silent events. Redo re-enables the most recently undone one if no newer user event happened. The report notes undone steps.

## Reducer rules
- Pure; unknown event types are ignored.
- Deleting a node removes edges touching it.
- Edge uniqueness: at most one edge per ordered pair (a to b). Reverse pair is allowed.
- Rename trims; empty rename is ignored.
- Selection, editing and connect mode are UI state, NOT events.

## State shape (sketch)
```ts
State {
  problemId, stage, finished,
  nodes: {id, role, label, fx, y, note?}[],
  edges: {id, a, b, pa?, pb?, label?}[],
  contract: {functional, nonfunctional, entities, api: string},
  hintsUsed: {level counts per rule},
  violations?: derived, not stored
}
```

## Projections
- Board: `State` -> positions via `slotLayout` (pinned positions win).
- Feed: chat events -> messages with actor.
- Mermaid: nodes by category shape, edges with labels.
- Report: `narrate(events)` -> structured outline -> fixed HTML and LaTeX templates. The model may add short prose commentary per section, never structure or LaTeX.
- Replay: reduce a prefix of the log.

## Tests required
Reducer unit tests per event; undo/redo property tests; log round-trip (copy events, reload, same state); replay prefix equals live state at that seq.
