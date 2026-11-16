# 02. UX spec

The prototype `reference/poc/index.html` implements everything in "Existing behaviour". Port it faithfully. "New in Milestone 1" is the only new UI, and it must stay as quiet as the rest.

## Principles
Minimal UI, few controls, no instructional walls of text, accessibility first, abstract categories not product names, naming and connecting happen on the box itself.

## Layout (existing)
Top bar, board pane, coach chat pane. The split between board and chat is resizable (`role=separator`, keyboard and pointer). Dark mode follows the system. Inter font. `prefers-reduced-motion` respected.

## Existing behaviour

### Top bar
- Problem selector: segmented control (`role=radiogroup`, roving arrow keys).
- `Details`: native `<dialog>` with Mermaid of the board, the event log, "Copy events", "Start over".
- `Finish`: opens the report view (Back, Copy LaTeX).

### Categories and shapes (seven, fixed)
Client (pill), Server (rounded rectangle), Cache (parallelogram), Database (cylinder), Storage (bucket/trapezoid), Queue (arrow-ended pipe), Other (hexagon). Do not add categories. The learner's chosen NAME carries the technology (Redis, Kafka, Nginx).

### Adding components
`+ Add component` opens a popup with search and a listbox (arrow keys, Enter, Escape closes). Choosing a category adds a box immediately at the next free grid slot with a default name (category label, numbered if repeated) and opens the name field with the text selected so typing replaces it.

### Renaming
Double-click the box, or Enter or F2 on a focused box, or automatically after adding. Enter saves, Escape reverts, blur saves. The input overlay carries the id of the box it edits (a past bug saved to the wrong box). Implement double-click with a tap-timing check; native dblclick fails when the first click re-renders.

### Connecting (Excalidraw-style)
- Every box has four dots (top, right, bottom, left). Dots are visible only on hover, while dragging a link, and (touch devices only, `hover:none`) on the selected box. Never show dots merely because a box is selected on desktop.
- Drag from a dot. A live curved preview follows the pointer. A snap radius (28 px) snaps to the nearest target dot and highlights it. Dropping on a box body picks the dot facing the source; dropping beside it picks the nearest dot.
- Click a dot to start connect mode, click a target box to connect. Connecting an existing pair again removes the arrow.
- Arrows are cubic Béziers leaving and entering along each dot's outward direction. Arrowheads use `markerUnits=userSpaceOnUse`, size 12, dark enough to read. Opposite arrows between the same pair are offset 6 px. Edges store the source and target port.
- Connecting NEVER moves any box. Arrows must stay inside the canvas.

### Moving, selecting, deleting
- Drag a box to move it (positions persist). Arrow keys move a focused box; Shift for larger steps.
- Click an arrow to select it, Delete removes it. Click empty canvas to deselect. Delete or Backspace removes a focused box. `C` starts connecting from a focused box.
- Copy and paste: Ctrl/Cmd+C copies the selected box (category and name); Ctrl/Cmd+V pastes a copy named "<name> copy", "<name> copy 2", ... at the next free slot. Arrows are not copied. Inactive while typing in a field, with a dialog or the picker open, or on the report screen.
- Connector dots follow the box while dragging.

### Layout stability
Each new box is pinned to a free grid slot at creation (`COLGAP=64`, grid computed from board width). Arrows never affect placement. `Tidy up` (visible only with at least 2 boxes and 1 arrow) lays boxes out by their arrows and pins the result as a `LayoutReset` event.

### Coach pane (existing)
Chat messages and coach hints, each coach message attributable and, for board edits, undoable. In training mode the coach does not edit the board (see below), so the undo affordance applies only to Milestone-1 callout/pin features if any.

### Keyboard and screen reader
All shortcuts are announced through a hidden help element (`aria-describedby`) and `aria-keyshortcuts`. All state changes call `say()` (aria-live polite).

## New in Milestone 1

### 5-step stage pill (top bar, subtle)
`1 Requirements · 2 Entities · 3 API · 4 High-level design · 5 Deep dives`, with a quiet elapsed time for the current stage. Clicking a stage softly highlights that zone of the whiteboard and sets the stage the coach uses. It does not hide anything: the learner can still edit requirements during deep dives. Keyboard operable (roving arrows, Enter).

### Contract notes (left side of the canvas)
Four collapsible plain-text blocks directly on the dotted canvas: Functional, Non-functional, Core entities, API / data flow. Click or focus and type plain bullet lines. A line `---` separates "below the line / out of scope". No forms, no per-line widgets. They are parsed quietly by code (rules) and, where fuzzy, by the model (see docs/05). Collapsed by default except the current stage's block. Each edit is a `ContractNoteUpdated` event (debounced).

### Arrow labels
Double-click a selected arrow, or Enter/F2 when it is selected, to type an inline label (for example `reserve(ticketId)`, `SSE`, `CDC`). `EdgeLabeled` event. The label renders on the curve with a background so it stays readable.

### Node notes
Press `N` on a focused box (or use a subtle note icon on hover/focus) to attach a compact monospace note beside the box (table schemas, TTL specs, a pinned reminder). The note moves with its box. `NodeNoteUpdated` event. Notes are text only.

### User undo
Ctrl/Cmd+Z undoes the learner's last action by appending silent inverse events (`UserActionUndone`). Ctrl/Cmd+Shift+Z redoes (re-appends). Never deletes events.

### Hints ("Stuck?")
One quiet control in the chat input area. Level 1 gives a stage heuristic question. Level 2 gives a nudge about a specific gap on the board. Level 3 sits behind a second confirmation and names the pattern and why; the learner still places and wires it.

### Replay scrubber (report view and Details)
A timeline slider over the event log that re-renders the board at any point. Read-only. Keyboard operable (arrow keys step events).

### Model status
A tiny status dot with text in the chat header: "Coach ready (scripted)", "Loading coach 42%", "Coach ready (local model)". No pickers, no Load buttons. If the model fails to load, silently stay on the scripted coach and say so once in the status text.

## Report (existing, extended)
Step-by-step narrative with attribution, notes on coach changes the learner undid, final Mermaid, Copy LaTeX. Extended to be organised by the 5 stages, to include time spent per stage against the targets (Requirements ~5m, Entities ~2m, API ~5m, HLD ~12m, Deep dives ~10m), and to list which rule flags fired and when they were resolved.
