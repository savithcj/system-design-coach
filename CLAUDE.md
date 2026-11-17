# CLAUDE.md: System Design Coach

A coaching app for system design interviews. The learner builds an architecture diagram on a board while an AI coach asks Socratic questions. Everything is event sourced; the session ends in a study guide (HTML and LaTeX) with a Mermaid diagram.

## Stack (decided)
- TypeScript + Vite, static output. No backend. Deployable to any static file host.
- Pure engine modules (no DOM) so they run in Node (tests, evals) and in the browser.
- UI: plain DOM/SVG (no framework) unless a framework is clearly needed; the prototype is vanilla JS and its behaviour must be preserved.
- Tests: Vitest for engine and fixtures; Playwright (system Chrome) for UI.
- In-browser model via an adapter interface (see docs/06). The app must work fully with NO model loaded.

## Hard rules
1. The UI/UX is already designed. `reference/poc/index.html` is the source of truth. Match it. No new buttons, toolbars, popups or instructional text beyond what docs/02 lists.
2. Code owns facts; the model owns wording. The model never decides correctness and never sees the hidden answer. The model may change the board only by proposing actions from the learner's own chat message, from a closed vocabulary (write bullets into a notes box, add a component, connect two, add a floating note). Code validates every action (src/engine/chatEdit.ts): the words must be the learner's own, filler is refused, unknown boxes are refused. Applied changes are coach events tagged `via: chat:<seq>` and undo as one step per message. The model never adds its own design ideas to the board.
3. Event sourcing: the append-only event log is the only source of truth. State is `reduce(events)`. Never mutate state outside events. Undo appends inverse events; it never deletes.
4. No regex or word-list intent parsing of chat. A model turns a chat message into proposed actions (never code reading the text); the only word list in the path is the filler list that makes code refuse answers like "idk".
5. Accessibility is a requirement, not polish: every interaction works by keyboard, announces through the live region, has visible focus, supports dark mode and `prefers-reduced-motion`.
6. Never leak the hidden answer to the learner or into model prompts (see docs/05 and docs/06).
7. Fixtures are written in our own words. Do not store transcripts or text from third-party videos.

## Commands (create these in Step 1)
- `npm run dev`: Vite dev server
- `npm run build`: static build into `dist/`
- `npm test`: Vitest (engine, reducer, fixtures)
- `npm run evals`: headless fixture runner, prints a pass/fail table and spoiler/ghost-component rates (fixtures are JSON in `evals/fixtures/`, written with `npx tsx evals/author.ts`)
- `npm run e2e`: Playwright against real Google Chrome (`channel: 'chrome'`, so it works on macOS and Linux); includes the regression "connecting must not move boxes; arrows must stay inside the canvas"

## Definition of done for any step
- `npm test`, `npm run evals`, `npm run build` pass.
- For any UI change: `npm run e2e` passes and you looked at screenshots in real Chrome (jsdom alone has missed real bugs: hover, focus, double-click, layout).
- Keyboard-only walkthrough of the changed flow works.
- A short note in `docs/CHANGELOG.md`.

## Style
- Small pure functions, explicit types, no hidden global state in engine modules.
- Prefer deleting code to adding options. Keep the UI calm.
- Comments explain why, not what.
