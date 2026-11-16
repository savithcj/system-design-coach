# System Design Coach: build pack for Claude Code

Everything needed to build the next version of the System Design Coach ("Mind-Gym") with Claude Code.

## Start here
1. Read `CLAUDE.md` (rules for the build) and `docs/01-product-and-decisions.md`.
2. The UI and UX are already defined and prototyped: `reference/poc/index.html` is the visual and behavioural source of truth. `docs/02-ux-spec.md` describes it in words. Do not redesign it.
3. Follow `docs/08-milestone-1-plan.md` step by step.

## Contents
| File | What it is |
|---|---|
| `CLAUDE.md` | Working rules, commands, definition of done |
| `docs/01-product-and-decisions.md` | Goals, constraints, decisions already made, what is out of scope |
| `docs/02-ux-spec.md` | Complete UX/interaction spec, including new Milestone 1 features |
| `docs/03-architecture.md` | Module layout (TypeScript + Vite, static), data flow, seams |
| `docs/04-event-model.md` | Event-sourcing contract: all event types, reducer rules, projections |
| `docs/05-engine-rules-evals.md` | Boundary engine, rule registry, selector, grounding gate, fixtures, headless eval runner |
| `docs/06-model-integration.md` | In-browser model adapter, JSON turn contract, anti-spoiler, fallback |
| `docs/07-problems.md` | Problem spec format; the four problems (URL shortener, rate limiter, news feed, Ticketmaster) |
| `docs/08-milestone-1-plan.md` | Ordered build steps with acceptance checks |
| `docs/09-open-questions.md` | Things deliberately left open |
| `reference/poc/index.html` | Working single-file prototype (UI reference, ~1300 lines, no AI) |
| `reference/tests/` | The prototype's tests: `t2.js`, `t4.js` (jsdom) and `chrome_check.py` (real Chrome regression) |
| `reference/mindgym-requirements.md` | The longer requirements draft written with another agent (superset; see decisions for what changed) |
| `reference/gemini-lessons.md` | Excerpts of the outside experiment that motivated the engine/eval design |

## Suggested first prompt for Claude Code
> Read README.md, CLAUDE.md and everything in docs/. Then do Step 1 of docs/08-milestone-1-plan.md. Port the prototype's behaviour exactly; reference/poc/index.html is the spec for anything not written down.
