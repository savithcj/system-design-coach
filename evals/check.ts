// The checks behind `npm run evals`, the Vitest fixture test and the in-browser eval page. No Node-only imports here.
import type { LogEvent } from '../src/core/events'
import { reduce } from '../src/core/reduce'
import { evaluate } from '../src/engine/evaluate'
import { checkReply } from '../src/engine/grounding'
import { historyOf, stageHasContent } from '../src/engine/history'
import { ruleById } from '../src/engine/rules/registry'
import { scriptedText } from '../src/engine/script'
import { selectMove, type CoachMove } from '../src/engine/selector'
import { has } from '../src/engine/text'
import type { Lens, Level, MoveKind, Violation } from '../src/engine/types'
import { problemById } from '../src/problems'
import { MODEL_TIMEOUT_MS, attempt, phraseWithModel } from '../src/model/orchestrate'
import { buildRequest } from '../src/model/request'
import type { CoachModel } from '../src/model/types'

export interface Fixture {
  id: string
  problem: string
  stage: number
  level?: Level
  lens?: Lens
  events: LogEvent[]
  expect: {
    /** Every rule that must be flagged, and no others. */
    flags: string[]
    notFlags?: string[]
    move?: MoveKind
    moveNot?: MoveKind[]
    /** The move's rule must be one of these. */
    moveAbout?: string[]
    forbiddenInReply?: string[]
  }
}

/** Turns a chosen move into words. The scripted coach is the default; Step 8 plugs a model in here. */
export type Phraser = (move: CoachMove, violation: Violation | undefined, stage: number) => string

export interface Result {
  id: string
  a: string[] // layer A failures
  b: string[] // layer B failures
  c: string[] // layer C failures
  /** Layer C tallies over every phrasing tried for this fixture. */
  phrasings: number
  spoilerLeaks: number
  ghosts: number
}

export function runFixture(fx: Fixture, phrase: Phraser = scriptedText): Result {
  const r: Result = { id: fx.id, a: [], b: [], c: [], phrasings: 0, spoilerLeaks: 0, ghosts: 0 }
  const problem = problemById(fx.problem)
  const state = reduce(fx.events)
  const level = fx.level ?? 'mid'
  if (state.stage !== fx.stage) r.a.push(`log ends in stage ${state.stage}, fixture says ${fx.stage}`)

  // Layer A: flags are facts about the board.
  const violations = evaluate(state, problem, fx.lens ?? 'default')
  const got = violations.map((v) => v.ruleId).sort()
  const want = [...fx.expect.flags].sort()
  if (got.join() !== want.join()) r.a.push(`flags ${JSON.stringify(got)} expected ${JSON.stringify(want)}`)
  for (const id of fx.expect.notFlags ?? []) if (got.includes(id)) r.a.push(`${id} must not be flagged`)

  // Layer B: the one move the coach would make.
  const move = selectMove({ violations, history: historyOf(fx.events), level, stage: state.stage, problem, asked: false, hasContent: stageHasContent(state) })
  const e = fx.expect
  if (e.move && move.kind !== e.move) r.b.push(`move ${move.kind}, expected ${e.move}`)
  if (e.moveNot?.includes(move.kind)) r.b.push(`move ${move.kind} is not allowed here`)
  if (e.moveAbout && !(move.ruleId && e.moveAbout.includes(move.ruleId))) r.b.push(`move is about ${move.ruleId ?? 'nothing'}, expected one of ${e.moveAbout.join(', ')}`)

  // Layer C: wording. The move itself, then level 1 and 2 for every flagged rule, all through the gate.
  const tries: { move: CoachMove; v: Violation | undefined; forbidden: boolean }[] = []
  if (move.kind !== 'stay_quiet') tries.push({ move, v: violations.find((x) => x.ruleId === move.ruleId), forbidden: true })
  for (const v of violations) for (const level of [1, 2] as const) tries.push({ move: { kind: 'offer_hint', ruleId: v.ruleId, level, needsConfirm: false }, v, forbidden: false })
  for (const t of tries) {
    const text = phrase(t.move, t.v, state.stage)
    r.phrasings++
    const gate = checkReply({ message: text, state, problem, stage: state.stage, ruleSpoilers: t.move.ruleId ? ruleById(t.move.ruleId)?.spoilers : undefined, allowRuleSpoilers: t.move.level === 3 })
    const leaks = gate.reasons.filter((x) => x.startsWith('spoiler:'))
    const ghosts = gate.reasons.filter((x) => x.startsWith('ghost:'))
    if (leaks.length) r.spoilerLeaks++
    if (ghosts.length) r.ghosts++
    if (!gate.ok) r.c.push(`"${text}" -> ${gate.reasons.join(', ')}`)
    if (t.forbidden) for (const term of e.forbiddenInReply ?? []) if (has(text, [term])) r.c.push(`reply contains forbidden "${term}"`)
  }
  return r
}

// ---- Layer C with a model ----

export interface ModelResult {
  id: string
  phrasings: number
  /** What the model said on its first try, judged by the gate. These measure the model, not the product. */
  rawSpoilerLeaks: number
  rawGhosts: number
  rawOther: number
  rawErrors: number
  /** What a learner would have seen after retry and fallback. Must be 0: it proves the gate holds. */
  shownBad: number
  fellBack: number
}

/**
 * Phrase every move and level-1/2 hint of a fixture through the real orchestration, and also judge the model's raw
 * first reply. Release gate (docs/08): raw spoiler-leak and ghost rates of 0% before a model is on by default.
 */
export async function runFixtureWithModel(fx: Fixture, model: CoachModel, timeoutMs = MODEL_TIMEOUT_MS): Promise<ModelResult> {
  const r: ModelResult = { id: fx.id, phrasings: 0, rawSpoilerLeaks: 0, rawGhosts: 0, rawOther: 0, rawErrors: 0, shownBad: 0, fellBack: 0 }
  const problem = problemById(fx.problem)
  const state = reduce(fx.events)
  const violations = evaluate(state, problem, fx.lens ?? 'default')
  const history = historyOf(fx.events)
  const move = selectMove({ violations, history, level: fx.level ?? 'mid', stage: state.stage, problem, asked: false, hasContent: stageHasContent(state) })
  const tries: CoachMove[] = []
  if (move.kind !== 'stay_quiet') tries.push(move)
  for (const v of violations) for (const level of [1, 2] as const) tries.push({ kind: 'offer_hint', ruleId: v.ruleId, level, needsConfirm: false })

  for (const m of tries) {
    const violation = violations.find((x) => x.ruleId === m.ruleId)
    const seed = scriptedText(m, violation, state.stage)
    const rule = m.ruleId ? ruleById(m.ruleId) : undefined
    const req = buildRequest({ state, log: fx.events, stage: state.stage, move: m, violation, seed, problem: { title: problem.title } })
    const ctx = { state, problem, stage: state.stage, ruleSpoilers: rule?.spoilers, allowRuleSpoilers: m.level === 3, timeoutMs }
    r.phrasings++
    const raw = await attempt(model, req, false, timeoutMs)
    if (raw.message === undefined) r.rawErrors++
    else {
      const g = checkReply({ message: raw.message, state, problem, stage: state.stage, ruleSpoilers: ctx.ruleSpoilers, allowRuleSpoilers: ctx.allowRuleSpoilers })
      if (g.reasons.some((x) => x.startsWith('spoiler:'))) r.rawSpoilerLeaks++
      if (g.reasons.some((x) => x.startsWith('ghost:'))) r.rawGhosts++
      if (g.reasons.some((x) => x.startsWith('shape:'))) r.rawOther++
    }
    const shown = await phraseWithModel(model, req, ctx)
    if (shown.by === 'scripted') r.fellBack++
    const g2 = checkReply({ message: shown.message, state, problem, stage: state.stage, ruleSpoilers: ctx.ruleSpoilers, allowRuleSpoilers: ctx.allowRuleSpoilers, maxChars: m.level === 3 ? 520 : 320 })
    if (!g2.ok) r.shownBad++
  }
  return r
}

export function summarizeModel(rs: ModelResult[]) {
  const n = rs.reduce((s, r) => s + r.phrasings, 0)
  const sum = (k: keyof ModelResult) => rs.reduce((s, r) => s + (r[k] as number), 0)
  const pct = (k: number) => (n ? (100 * k) / n : 0)
  return { phrasings: n, rawSpoilerRate: pct(sum('rawSpoilerLeaks')), rawGhostRate: pct(sum('rawGhosts')), rawOtherRate: pct(sum('rawOther')), rawErrorRate: pct(sum('rawErrors')),
    fallbackRate: pct(sum('fellBack')), shownBadRate: pct(sum('shownBad')) }
}
