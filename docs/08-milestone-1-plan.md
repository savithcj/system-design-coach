# 08. Milestone 1 plan (everything in one milestone, built in this order)

Each step ends with `npm test`, `npm run evals`, `npm run build` green, plus e2e and a real-Chrome screenshot check for UI steps. Do not skip ahead; later steps depend on earlier seams.

## Step 1. Scaffold and port the core
- Vite + TypeScript strict + Vitest + Playwright. Scripts per CLAUDE.md.
- Port to `core/`: events, reducer, geometry, layout, Mermaid, report from the prototype. Port `reference/tests/t2.js` and `t4.js` scenarios to Vitest. Behaviour must match.
- Acceptance: reducer tests and ported scenarios pass; replay prefix equals live state.

## Step 2. Port the UI exactly
- Port the board, chat, top bar, picker, details dialog, report view, resizer, a11y helpers.
- Port `chrome_check.py` to a Playwright test: connecting must not move boxes; arrows stay inside the canvas; double-click rename; copy/paste; dots hover-only.
- Acceptance: side-by-side with the prototype in Chrome shows no visible difference; keyboard-only flow works.

## Step 3. Canvas upgrades
- Arrow labels (`EdgeLabeled`), node notes (`NodeNoteUpdated`), user undo/redo (`UserActionUndone/Redone`).
- Acceptance: reducer tests including undo of adds, renames, edges and notes; e2e for label edit and note edit; screen reader announcements.

## Step 4. Stage pill and contract notes
- Stage state (`StageChanged`), pill with elapsed time, zone highlight, four collapsible plain-text blocks with `---` handling (`ContractNoteUpdated`), report organised by stage with pacing.
- Acceptance: typing in notes never rerenders the board or steals focus; pacing appears in the report.

## Step 5. Engine
- Rule registry, evaluate, selector, scripted hints, grounding gate, `RuleFired/Resolved` events.
- Implement the starter rules from docs/05.
- Acceptance: unit test per rule (positive, negative, valid-alternative).

## Step 6. Problems and fixtures
- New problem format; port the three problems; add Ticketmaster.
- Write 10 to 15 fixtures (docs/05) including the ported scenarios and valid-alternative cases. Build `npm run evals` with the layers.
- Acceptance: evals table printed; layer A and B green; layer C runs with the scripted adapter at 0% leaks.

## Step 7. Wire the coach (scripted)
- Replace the prototype's regex chat routing: chat is "ask the coach". "Stuck?" requests hints L1/L2/L3 (L3 behind confirmation). Remove the training-mode ReAct board editing.
- Acceptance: a full session on each problem works end to end with no model; no spoiler appears before its stage.

## Step 8. In-browser model adapter
- `CoachModel` interface, `webllm` adapter in a Worker, lazy load, status dot, JSON turn contract with schema-constrained decoding, grounding gate with retry then fallback.
- Acceptance: with a model loaded, replies phrase the selected move; layer C numbers for the model are reported by a browser-run eval page (`/evals` dev route) and are 0% leak before enabling by default. If the model fails, the scripted coach continues silently.

## Step 9. Report, replay, polish
- Replay scrubber; report shows rule flags fired and cleared; Copy LaTeX verified compiles (document class and packages kept minimal; test with a LaTeX install if available, else lint).
- Accessibility pass: full keyboard walkthrough, screen reader announcements, dark mode, reduced motion, contrast.

## Later milestones (not now)
2. Two-player rooms (blind build, reveal, difference spotter), via a small realtime relay.
3. Capacity simulation worker and isolation drills.
4. Fine-tuning the coach model on the owner's machines using fixture-derived data.
