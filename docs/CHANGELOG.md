# Changelog
- Initial build pack assembled.

## Step 1: scaffold and port the core
- Vite + strict TypeScript + Vitest + Playwright (real Chrome via `channel: 'chrome'`). Scripts: `dev`, `build`, `test`, `evals`, `e2e`.
- `src/core/`: `events` (pure `append` with NodeMoved coalescing, log serialise/parse), `reduce` (+ `reduceUpTo` for replay), `layout` (grid, free slot, tidy), `geometry` (ports, curves, snapping), `mermaid`, `report`, `actions` (default/copy names, connect toggle).
- Ported t2/t4 scenarios that are logic rather than DOM (naming, copy names, connect toggle, delete cascade, coalescing, tidy pinning, layout stability, snap radius). DOM scenarios move to Playwright in Step 2.
- Added tests: replay prefix equals live state, log round-trip, arrows stay inside the canvas for every pair of grid boxes, connecting never moves a box.
- Deliberate differences from the prototype:
  - `NodeRenamed` now writes `label` (docs/04); `to` from old logs is still read.
  - The reducer enforces one arrow per ordered pair, no self-arrows, no dangling arrows, and ignores empty names.
  - The old regex judge, hints and ReAct loop are NOT ported (replaced by the engine in Steps 5 to 7). The report has no "reference design" or score yet; the baseline returns in Step 6, shown only after the session is finished.
  - `CLAUDE.md`: Chrome path replaced with `channel: 'chrome'` (the old path does not exist on macOS).

## Step 2: port the UI exactly
- `src/ui/` ports the prototype's board, picker, chat, top bar, Details dialog, report view and resizer to plain DOM/SVG. CSS and the HTML shell are the prototype's, extracted verbatim (`src/ui/style.css`, `index.html`).
- Verified side by side in real Chrome (light and dark): empty and populated boards are pixel-identical except 63 px of sub-pixel text rendering in the top-bar tab labels.
- Playwright (`tests/e2e/board.spec.ts`, 16 tests): the `chrome_check.py` regression (connecting must not move boxes; arrows inside the canvas), picker, rename (double-click, F2, Enter, blur), hover-only dots, click and key connect, arrow select and delete, copy/paste, key moves and coalescing, drag with dots following, Tidy, problem switching and Start over, chat, splitter, report with rendered diagram.
- Self-hosting: Mermaid is bundled from npm and imported lazily when the report opens; Inter is bundled via `@fontsource/inter`. No runtime request leaves the app.
- Deliberate differences from the prototype:
  - Ctrl/Cmd+C on a focused box now copies only. The prototype also started a connection (the `C` handler ignored modifiers).
  - Chat records the learner's message but the coach does not answer yet: the prototype's regex router and judge are gone, and the engine arrives in Steps 5 to 7. The opening message still shows.
  - The report omits score, requirement check and reference design for now (see Step 1).
- Dev only: `window.__sdc` exposes read-only `log()` and `state()` for Playwright. It is absent from production builds.
- Known quirk kept on purpose: a click within 60 ms of finishing a drag is ignored (it swallows the click the browser fires after pointer-up).

## Step 3: arrow labels, node notes, undo/redo
- **Core**: `EdgeLabeled`, `NodeNoteUpdated`, `UserActionUndone`, `UserActionRedone`. Undo is an event: the reducer skips the undone group, the log only grows (`core/undo.ts`).
  - One undo step per committed edit (Enter or blur), and a box's creation plus its immediate naming is one step. A drag or a burst of arrow-key moves within 1.5 s is one step (it is one coalesced event).
  - Redo restores the most recently undone step and is cleared by any newer board edit; chat does not clear it. Chat, coach events and the opening message are never undone.
  - The report keeps what happened and adds "Undid: ..." / "Redid: ..." lines.
- **Tests**: reducer tests per event, undo of every edit type including delete (box, note and arrows return), redo rules, replay with undo in the log, and a seeded model-based property test (k undos land on the state after n-k edits; m redos on n-k+m).
- **UI**
  - Arrow label: double-click (tap-timing, like boxes) or Enter/F2 on a focused arrow; Enter or blur saves, Escape reverts, empty clears. Labels are drawn in a layer above the boxes with a halo, because the grid gap is narrower than a label.
  - Node note: `N` on a focused box, the hover/focus note icon, or click the note. Enter or blur saves, Shift+Enter adds a line, Escape reverts. The note is as wide as its box and sits on a side whose dot has no arrow (below, else above, else right, else left; `noteSide`), so it never hides a connection. It moves with its box.
  - Undo/redo: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, announced through the live region ("Undid: Added ..."). Inside a text field the browser's own text undo wins.
- **Keyboard access to arrows** (not specified in the docs; needed because arrows were mouse-only): `E` on a focused box moves focus to one of its arrows; arrow keys switch between arrows; Enter/F2 labels, Delete removes, Escape returns to the box. Clicking an arrow now focuses it, so Enter/F2/Delete work right after a click. The arrow layer is no longer `aria-hidden` (arrows are real controls with labels). The hidden help text lists the new keys.
- Known limitation: on a very short gap between two boxes the label's halo covers the whole arrow. Dragging the boxes apart restores it.
- Verified in real Chrome (light and dark) including the keyboard focus halo on a selected arrow and the note editor. The screenshots caught two layout bugs the tests could not: notes covering neighbouring boxes and labels clipped by boxes.
