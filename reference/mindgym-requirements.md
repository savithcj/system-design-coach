# System Design Coach ("Mind-Gym") — Build Requirements

## 0. Non-Negotiable Design Principle: Simple, Minimal UI · Full Accessibility · Powerful Engine
- **Keep the UI ultra-calm and uncluttered** (matching the existing `System Design Coach.html` POC). Never add floating toolbars, dense forms, badge spam, or instructional walls of text.
- **Hide complexity in the engine, not on the screen:** Deterministic physics/capacity checks, stage guardrails, Socratic anti-spoiler filtering, and 2-player state sync happen automatically behind the scenes or inside the single Coach chat pane.
- **Accessibility first:** Every interaction—including the new canvas notes, arrow labels, node notes, and 2-player spotlight—must work completely via keyboard with roving `tabindex`, `aria-live` (`say()`) announcements, visible focus rings, dark mode, and `prefers-reduced-motion`.
- **Progressive complexity:** Deliver **Phase 1 (Core Minimal Loop)** cleanly before adding Phase 2 features.

---

## 1. Core Philosophy & Workflow
- **Socratic Coach, Not Oracle (`hard thing ← tool`):** The AI never draws the main architecture for the user during training. It challenges weak choices, runs objective failure checks, and gives escalating hints (`Level 1 → 2 → 3`) when asked.
- **Code Owns Facts & Rules; AI Owns Judgment & Dialogue:** Code enforces structural invariants, capacity/physics math, pacing telemetry, and event sourcing (`reduce(events)`). The LLM handles semantic grading (accepting `Kafka` or `RabbitMQ`, `Postgres` or `DynamoDB`), Socratic probing, and trade-off questions.
- **5-Stage Delivery Framework:** Every problem follows:
  1. **Requirements** (~5m): Functional + *Out of scope* ("below the line"), Non-Functional + *Out of scope*
  2. **Core Entities** (~2m): Nouns only (no schemas or QPS math yet)
  3. **API / Data Flow** (~5m): Endpoints (or pipeline steps) mapped 1:1 to Functional Requirements
  4. **High-Level Design** (~12m): Simplest working end-to-end flow + DB schemas attached to DB nodes
  5. **Deep Dives** (~10m): Attack Non-Functional bottlenecks with targeted math and upgrades (e.g. Redis TTL locks, search indexes, queues, SSE)

---

## 2. Minimal Unified Canvas (Everything in One Place, Zero Form Bloat)
Preserve the existing 3-part layout (`Top Bar` · `Unified Canvas` · `Resizable Coach Pane`) and extend `#boardWrap` into one unified whiteboard:

- **Top Bar (Keep Minimal):**
  - Problem selector (`URL Shortener`, `Rate Limiter`, `News Feed`, `Ticketmaster`), subtle clickable **5-Step Stage Pill** (`1. Req · 2. Entities · 3. API · 4. HLD · 5. Deep Dives` with a quiet elapsed/stage timer), `Details` (includes Model Settings + 2-Player Room link), and `Finish`.
- **Left Side of Canvas — Plain-Text Contract Notes (Not Complex Forms):**
  - Four clean, collapsible/expandable inline text blocks directly on the dotted canvas: **Functional**, **Non-Functional**, **Core Entities**, and **API / Data Flow**.
  - Interaction stays dead simple: click or focus and type plain bullet lines (type `---` to separate *below the line / out of scope*). The engine parses lines quietly in code/LLM—do **not** build multi-input CRUD forms on the canvas.
  - Clicking a stage in the top pill softly highlights that zone while keeping the whole whiteboard visible (so users can still reference requirements or amend NFRs during Deep Dives).
- **Right Side of Canvas — Existing 7-Shape Diagram + 2 Quiet Upgrades:**
  - Keep the exact **7 shapes** (`Client`, `Server`, `Cache`, `Database`, `Storage`, `Queue`, `Other`), `+ Add component` popup, `Tidy up`, port-snapping, and keyboard shortcuts. Do **not** add more shapes or toolbar buttons.
  - **Upgrade 1 — Arrow Labels (`EdgeLabeled`):** Double-click an arrow (or press `Enter`/`F2` when selected) to type an inline label (e.g., `reserve(ticketId)`, `SSE`, `CDC`).
  - **Upgrade 2 — Attached Node Notes (`NodeNoteUpdated`):** Press `N` on a focused node (or click a subtle hover/focus note icon) to attach a compact monospace note beside it (for DB table schemas, Redis TTL specs like `ticketId: true, TTL 10m`, or pinned `Deep dive` reminders) that drags along with the node.
  - **Upgrade 3 — User Undo (`Ctrl/Cmd+Z`):** Append silent inverse events (`UserActionUndone`) just like `CoachEditUndone`.

---

## 3. Powerful Engine Under the Hood

### Architecture: Elixir (Phoenix LiveView + OTP) + Python Worker + Browser-Side BYOK LLMs
- **Elixir / Phoenix LiveView + PubSub + Presence:**
  - Hosts the existing JS board cleanly inside a LiveView `JS Hook` (`phx-hook="BoardCanvas"`).
  - Owns the canonical append-only **event log**, `reduce(events)` state, stage/pacing state machine, and 2-player rooms (`/room/:id`).
- **Python Worker (Erlang Port or local FastAPI service):**
  - Provides objective **"iron weights"**: deterministic capacity/QPS/storage/tail-latency math and lightweight discrete-event simulations (`SimPy`) or race-condition checks when triggered in Deep Dives.
- **Browser-Side Model Adapter (Shareable with Friends, Zero Server GPU Cost):**
  - All LLM `fetch()` calls run **from the browser** (inside the LiveView JS hook) using settings in `localStorage`.
  - Friends can plug in **local models** (`Ollama`, `LM Studio`, `MLX`, `llama.cpp` `/v1/chat/completions`) or **hosted keys** (`OpenAI`, `OpenRouter`, `Gemini`, `Anthropic` with `anthropic-dangerous-direct-browser-access: true`).
  - Include a **Test Connection** button inside Settings that catches `Ollama` CORS blocks on HTTPS origins and shows the exact `OLLAMA_ORIGINS` command.

### Stage-Aware Socratic Coach & Escalating Hints
- **Coach never builds the main board in Training Mode.** (Keep the draft-board ReAct loop only for pinning bottleneck/failure callouts or post-session review.)
- **Quiet Deterministic Guardrails + LLM Socratic Probing across all 5 stages:**
  - *Requirements:* Warn if >4 core features or missing out-of-scope; challenge vague NFRs (`"low latency"`, `"scalable"`) without a target path/metric or split CAP choice.
  - *Entities:* Nudge if user writes SQL columns or QPS math prematurely.
  - *API:* Check 1:1 coverage from Functional Reqs; challenge `userId` in request body (JWT belongs in header) or single-step booking lacking `reserve → confirm`.
  - *HLD:* Check end-to-end API paths + `edgeRule` invariants; interrupt premature optimization (*"Pin that bottleneck as a Deep Dive and finish HLD end-to-end first"*).
  - *Deep Dives:* Fire problem-specific **failure challenges** against what's on the board (e.g., abandoned checkout hold → `Cron` lag vs `Redis TTL Lock`; `LIKE "%term%"` → `Elasticsearch + CDC`; stale seat map + 1M surge → `SSE` + `Virtual Waiting Queue`).
- **3-Level Escalating Hints (`Stuck?` button or asking for help):**
  - **L1:** Stage heuristic (e.g., *"Imagine opening the app—what's on screen 1, and what happens right before Pay?"* / CAP + R/W + Surge checklist).
  - **L2:** Targeted gap/trade-off nudge on the user's current board.
  - **L3 (behind a second confirmation):** Names the pattern + rationale, while the user still places and wires it.
- Enforce a strict JSON turn contract + **Anti-Spoiler check** so weaker local models don't blurt out answers at L1/L2.

---

## 4. Challenge-Driven Problem Specs (No Single Rigid Answer Key)
Replace rigid `nodes + edges` targets with **stage rubrics + baseline HLD + `deep_dive_challenges`** so multiple valid architectures pass:
- Ship **4 problems** following the Hello Interview structure: **Ticketmaster** (benchmark), **URL Shortener**, **Rate Limiter**, **News Feed**.
- Add **10-minute Isolation Drills** using the exact same board UI (e.g., *Fix Abandoned Lock Race*, *Diagnose Hot Shard*, *Stop Retry Storm*).
- Knowledge retrieval uses **copyright-safe original trade-off cards** tagged by failure mode (plus optional user-dropped local Markdown notes), queried strictly by the user's current components/bottlenecks—never leaking hidden answers.

---

## 5. 2-Player Friend Mode & Study Guide
- **4-Phase Shared Room (Built for friends talking on Discord/voice—no built-in audio/video):**
  1. **Blind Build:** Shared timer; presence shows stage & node count only (server withholds peer board events until Reveal).
  2. **Side-by-Side Reveal & Stress-Test:** Both canvases appear side-by-side; code/Python checks run the same surge/failure tests against both.
  3. **Present & Cross-Examine:** Clicking/hovering a node highlights it on your partner's screen via PubSub; clicking a node on their board pins a question (`PeerQuestionPinned`); an AI **Difference Spotter** generates 2–3 sharp cross-exam questions comparing where they diverged.
  4. **Event-Sourced Study Guide:** `narrate(events) → reportHtml / reportLatex` outputs a clean PDF/LaTeX post-mortem organized by the 5 Delivery Framework stages, including **actual vs. target pacing telemetry**, cleaned-up Mermaid diagrams, and comparative Q&A.

---

## 6. Build Order (Keep Scope Tight)
1. **Milestone 1:** Upgrade the single-file canvas (`5-step pill`, `left plain-text Contract Notes`, `arrow labels`, `node notes`, `user undo`) + **BYOK/Local LLM adapter** + **Ticketmaster** challenge spec.
2. **Milestone 2:** Wrap the JS board in **Elixir Phoenix LiveView** for **2-player rooms** (blind build, PubSub spotlighting, Difference Spotter, comparative LaTeX export).
3. **Milestone 3:** Attach the **Python physics/SimPy simulator** worker + **10-minute Isolation Drills**.