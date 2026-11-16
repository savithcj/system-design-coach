# 01. Product and decisions

## What it is
A calm, minimal system design practice tool. Left: a whiteboard. Right: an AI coach chat. The learner works through the five stages of a system design interview. The coach asks questions and gives escalating hints. It never draws the main architecture for the learner and never reveals the answer. At the end the learner gets a study guide narrating how the design evolved.

## Goals
- Teach by questioning (Socratic), not by telling.
- Accept any valid design (Kafka or RabbitMQ; Postgres or DynamoDB). No single answer key.
- Be reliable with a SMALL model: code does the checking, the model only phrases a pre-chosen coaching move.
- Be fully event sourced, which also yields replay and the study guide for free.
- Be accessible and visually quiet.

## Decisions already made (do not reopen without asking)
| Topic | Decision |
|---|---|
| Hosting | Static web server only. Model runs in the learner's browser. |
| Codebase | TypeScript + Vite. Engine modules are DOM-free and run in Node. |
| UI/UX | Fixed by the prototype. Seven shapes, on-box rename, four-port connecting, etc. |
| Model | In-browser model from day one, behind an adapter. Scripted coach is the fallback and the dev default. |
| Coach role | Never builds the main board during training. The prototype's draft-board ReAct loop is NOT carried into training mode. |
| Scope of Milestone 1 | Everything in docs/08: engine, rules, fixtures, evals, canvas upgrades, stage pill, contract notes, model adapter, Ticketmaster. |
| Not in Milestone 1 | Two-player rooms, Elixir/Phoenix, Python simulator, fine-tuning itself (the data pipeline is designed for it). |
| Training | Fine-tuning of the small coach model happens later on the owner's own machines (RTX 5080, M1 Max, M5 Pro). The app is designed so a fine-tuned model can replace the base model with no app change. |

## Changes versus the longer requirements draft (`reference/mindgym-requirements.md`)
- Elixir LiveView and Python worker: deferred. Two-player would later use a small relay, not necessarily Elixir.
- Bring-your-own-key and Ollama: replaced by an in-browser model (an optional remote endpoint may be added behind the same adapter).
- Capacity math runs in TypeScript, not a Python service.
- Everything else (5 stages, contract notes, arrow labels, node notes, user undo, challenge-driven problems, three-level hints, study guide) is kept.

## Lessons that shaped the design (from an outside experiment, see reference/gemini-lessons.md)
- Tuning prompts against one screenshot at a time never converges. Build the eval fixtures first.
- A single small model cannot be router, retriever, judge and speaker at once. Split the jobs; keep verification in code.
- Do not infer intent with regex or word lists. Separate "ask" from "edit" at the UI level.
- In-browser pitfalls: model download/cache quota failures, thinking-token output colliding with JSON mode, GPU memory limits. Use a non-thinking instruct model, constrained JSON output, and a status indicator.
