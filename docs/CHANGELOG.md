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
