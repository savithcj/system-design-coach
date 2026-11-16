# 06. In-browser model integration

## Role of the model
Only this: given a pre-chosen coaching move and a trimmed board summary, write one short Socratic message. Optionally (later) extract structure from contract notes (is this NFR measurable?). The model never decides correctness, never edits the board, never sees the hidden rubric.

## Adapter interface
```ts
interface CoachModel {
  id: string
  status(): 'idle'|'loading'|'ready'|'error'
  load(onProgress:(p:number)=>void): Promise<void>
  phrase(req: TurnRequest, opts:{strict?:boolean}): Promise<TurnReply>
}
```
Adapters: `scripted` (always available, default in dev and tests), `webllm` (lazy-loaded in browser). A later adapter may be a fine-tuned model of the same shape. Keep a remote OpenAI-compatible endpoint adapter optional and off by default.

## Turn contract (strict JSON)
Request (what the model sees):
```json
{ "stage": 4, "move": "probe_bottleneck", "level": 1,
  "board": {"components":[{"name":"Postgres","category":"Database"}], "links":[["API Server","Postgres"]]},
  "violation": {"id":"DD_SEARCH_FULL_SCAN","summary":"search appears to scan the main database"},
  "lastTurns": [...2 turns...],
  "constraints": {"maxSentences":2, "oneQuestion":true} }
```
Reply (constrained by a JSON schema via constrained decoding):
```json
{ "message": "string", "aboutRuleId": "string" }
```
Rules: do not name technologies absent from `board`; do not give the solution at level 1 or 2; one question. Validate with the grounding gate.

## Choosing the model (verify at build time)
In-browser stack candidates from the outside experiment (UNVERIFIED, check current releases): WebLLM with a roughly 3B non-thinking instruct model quantised to 4 bit (about 2 GB GPU memory). Constraints learned the hard way: avoid reasoning/"thinking" models with JSON mode (thinking tokens collide with the schema); avoid models near the GPU memory limit (cache write failures, out-of-memory); load in a Web Worker; show progress; fall back silently to scripted on any failure. Larger models (about 4B+) failed to cache in some browsers in that experiment.
Pin library versions. Test on Chrome with WebGPU on Apple Silicon and on the RTX machine.

## Prompting
System prompt is short and fixed. It states the role, the one-question rule, and the "no unseen components, no solutions" rule. The move and violation are given as data. No few-shot dumps that contain spoilers. Keep the prompt under about 600 tokens so a small model stays on track.

## Fine-tuning path (later, owner's machines)
Training data is generated, not scraped: for each fixture and each move and level, produce `(TurnRequest -> TurnReply)` pairs using the scripted wording, human-edited variants, and teacher-model paraphrases that pass the grounding gate. Export JSONL. Fine-tune a 2B to 4B instruct model with LoRA/QLoRA (Unsloth on the RTX 5080, or MLX on Apple Silicon), quantise, host as static files, point the `webllm` adapter at it. Gate release on the eval layer C numbers.

## Failure handling
Timeouts (about 8 s), invalid JSON, gate failure, or load error: one stricter retry, then scripted text. Never block the learner; the board and rules work without the model.

## Privacy
Everything runs locally in the tab. No analytics. The event log is exported only by the learner (Copy events).
