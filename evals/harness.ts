// Runs fixtures through the engine. Shared by `npm run evals` (prints a table) and the Vitest fixture test.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

export function loadFixtures(dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')): Fixture[] {
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as Fixture)
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
