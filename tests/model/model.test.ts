import { describe, expect, it } from 'vitest'
import { evaluate } from '../../src/engine/evaluate'
import { historyOf } from '../../src/engine/history'
import { selectMove } from '../../src/engine/selector'
import { scriptedText } from '../../src/engine/script'
import { planTurnFull } from '../../src/engine/turn'
import { chooseModel } from '../../src/model/manager'
import { fakeModel, type FakeMode } from '../../src/model/fake'
import { phraseWithModel } from '../../src/model/orchestrate'
import { SYSTEM_PROMPT, parseReply, toMessages } from '../../src/model/prompt'
import { buildRequest } from '../../src/model/request'
import type { CoachModel, TurnReply } from '../../src/model/types'
import { BASELINES } from '../../src/problems/baselines'
import { problemById } from '../../src/problems'
import { board } from '../engine/helpers'

const tm = problemById('ticketmaster')

/** A coach line for a real situation: too many features in stage 1, level-1 hint. */
function scenario() {
  const b = board()
  b.text('functional', 'a\nb\nc\nd\ne\n---\nx')
  b.node('db', 'Postgres')
  const state = b.state()
  const violations = evaluate(state, tm)
  const move = selectMove({ violations, history: historyOf(b.s.log), level: 'mid', stage: 1, problem: tm, asked: true, hasContent: true })
  const violation = violations.find((v) => v.ruleId === move.ruleId)
  const seed = scriptedText(move, violation, 1)
  const req = buildRequest({ state, log: b.s.log, stage: 1, move, violation, seed, problem: { title: tm.title } })
  const ctx = { state, problem: tm, stage: 1, ruleSpoilers: undefined as string[] | undefined, allowRuleSpoilers: false }
  return { b, state, move, violation, seed, req, ctx }
}

const ready = async (m: CoachModel) => { await m.load(() => {}); return m }

describe('what a model is shown', () => {
  it('is the learner\'s own board and the scripted seed, and never the reference design or held-back terms', () => {
    const { req } = scenario()
    const json = JSON.stringify(req)
    expect(req.board.components).toEqual([{ name: 'Postgres', category: 'Database' }])
    expect(req.seed).toMatch(/drop first/)
    for (const n of BASELINES['ticketmaster']!.nodes) expect(json, n.label).not.toContain(n.why)
    expect(json).not.toContain('API Gateway') // a reference-design box the learner never drew
    for (const t of Object.values(tm.stageSpoilers).flat()) expect(json.toLowerCase(), t).not.toContain(t!)
  })

  it('keeps the system prompt short and fixed, and puts the request in as data', () => {
    expect(SYSTEM_PROMPT.length / 4).toBeLessThan(600) // about 4 characters a token
    const m = toMessages(scenario().req)
    expect(m.map((x) => x.role)).toEqual(['system', 'user'])
    expect(JSON.parse(m[1]!.content).seed).toMatch(/drop first/)
    expect(toMessages(scenario().req, true)[0]!.content).toContain('rejected')
  })

  it('a learner message goes in as data and is clipped', () => {
    const { b, state, move, violation, seed } = scenario()
    const req = buildRequest({ state, log: b.s.log, stage: 1, move, violation, seed, learnerMessage: 'x'.repeat(1000), problem: { title: tm.title } })
    expect(req.learnerMessage!.length).toBeLessThan(300)
  })

  it('parses a reply even when wrapped in prose or fences, and rejects the rest', () => {
    expect(parseReply('```json\n{"message":"Hi?","aboutRuleId":"R"}\n```')).toEqual({ message: 'Hi?', aboutRuleId: 'R' })
    expect(parseReply('{"message":"  ok  ","aboutRuleId":""}')).toEqual({ message: 'ok' })
    for (const bad of ['', 'no json', '{"message":42}', '{"message":""}', '{"message":']) expect(parseReply(bad), bad).toBeNull()
  })
})

describe('phrasing with a model, behind the gate', () => {
  it('uses the model\'s line when it passes', async () => {
    const s = scenario()
    const r = await phraseWithModel(await ready(fakeModel('good')), s.req, s.ctx)
    expect(r).toEqual({ message: s.seed, by: 'fake-good', rejections: [] })
  })

  it.each<[FakeMode, string]>([['ghost', 'ghost:kafka'], ['spoiler', 'spoiler:waiting queue'], ['garbage', 'model:invalid']])(
    '%s: two attempts are thrown away, then the scripted seed is shown', async (mode, reason) => {
      const s = scenario()
      const r = await phraseWithModel(await ready(fakeModel(mode)), s.req, s.ctx)
      expect(r.by).toBe('scripted')
      expect(r.message).toBe(s.seed)
      expect(r.rejections).toHaveLength(2)
      expect(r.rejections.every((x) => x.includes(reason))).toBe(true)
    })

  it('a stricter second attempt can still win', async () => {
    const s = scenario()
    const r = await phraseWithModel(await ready(fakeModel('strictfix')), s.req, s.ctx)
    expect(r.by).toBe('fake-strictfix')
    expect(r.rejections).toEqual(['ghost:kafka'])
  })

  it('a model that never answers costs one timeout, not two, and falls back', async () => {
    const s = scenario()
    const t0 = Date.now()
    const r = await phraseWithModel(await ready(fakeModel('hang')), s.req, { ...s.ctx, timeoutMs: 40 })
    expect(r).toMatchObject({ by: 'scripted', message: s.seed, rejections: ['model:timeout'] })
    expect(Date.now() - t0).toBeLessThan(400)
  })

  it('a model that throws is a rejection, not a crash', async () => {
    const s = scenario()
    const boom: CoachModel = { id: 'boom', status: () => 'ready', load: async () => {}, phrase: async () => { throw new Error('gpu lost') } }
    expect((await phraseWithModel(boom, s.req, s.ctx)).rejections).toEqual(['model:error', 'model:error'])
  })

  it('a model that is not ready is skipped without a rejection', async () => {
    const s = scenario()
    const r = await phraseWithModel(fakeModel('good'), s.req, s.ctx) // never loaded
    expect(r).toEqual({ message: s.seed, by: 'scripted', rejections: [] })
  })

  it('the rule\'s own solution terms pass only for a confirmed level 3', async () => {
    const s = scenario()
    const leaky: CoachModel = { id: 'leaky', status: () => 'ready', load: async () => {}, phrase: async (): Promise<TurnReply> => ({ message: 'Give each hold a deadline using a timeout.' }) }
    const l1 = await phraseWithModel(leaky, s.req, { ...s.ctx, ruleSpoilers: ['timeout'] })
    expect(l1.by).toBe('scripted')
    const l3 = await phraseWithModel(leaky, { ...s.req, level: 3 }, { ...s.ctx, ruleSpoilers: ['timeout'], allowRuleSpoilers: true })
    expect(l3.by).toBe('leaky')
  })
})

describe('which model is used', () => {
  it('the local model is the default where WebGPU exists, except with no GPU, under automation or when forced off', () => {
    expect(chooseModel('', false, true)).toMatchObject({ kind: 'local' })
    expect(chooseModel('', true, true)).toMatchObject({ kind: 'local' })
    expect(chooseModel('', false, false)).toEqual({ kind: 'scripted' })
    expect(chooseModel('', false, true, true)).toEqual({ kind: 'scripted' })
  })
  it('?coach=local opts in; ?coach=scripted always wins; fakes and a model override are dev-only', () => {
    expect(chooseModel('?coach=local', false, true)).toMatchObject({ kind: 'local' })
    expect(chooseModel('?coach=scripted', true, true)).toEqual({ kind: 'scripted' })
    expect(chooseModel('?coach=fake-ghost', true, true)).toEqual({ kind: 'fake', mode: 'ghost' })
    expect(chooseModel('?coach=fake-ghost', false, true)).toMatchObject({ kind: 'local' }) // fakes are ignored in production
    expect(chooseModel('?coach=local&model=X', true, true)).toEqual({ kind: 'local', modelId: 'X' })
    expect(chooseModel('?coach=local&model=X', false, true)).toMatchObject({ modelId: expect.not.stringMatching(/^X$/) })
  })
})

describe('the plan marks what a model may reword', () => {
  it('a normal hint is a job pointing at its CoachResponded; the confirmation and a gate fallback are not', () => {
    const b = board(); b.text('functional', 'a\nb\nc\nd\ne\n---\nx')
    const first = planTurnFull(b.s.log, tm, { kind: 'stuck' })
    expect(first.job).toBeDefined()
    expect(first.events[first.job!.index]!.type).toBe('CoachResponded')
    expect(first.job!.seed).toBe((first.events[first.job!.index]!.payload as { message: string }).message)
    for (const e of first.events) b.s.add(e.type, e.payload, e.actor)
    for (const e of planTurnFull(b.s.log, tm, { kind: 'stuck' }).events) b.s.add(e.type, e.payload, e.actor) // level 2
    expect(planTurnFull(b.s.log, tm, { kind: 'stuck' }).job).toBeUndefined() // the confirmation question
  })
})
