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
