import { describe, expect, it } from 'vitest'
import { append } from '../../src/core/events'
import { checkReply, MAX_CHARS_L3 } from '../../src/engine/grounding'
import { historyOf, stageHasContent } from '../../src/engine/history'
import { evaluate } from '../../src/engine/evaluate'
import { RULES } from '../../src/engine/rules/registry'
import { scriptedText } from '../../src/engine/script'
import { selectMove, type SelectInput } from '../../src/engine/selector'
import { syncRules } from '../../src/engine/track'
import type { Violation } from '../../src/engine/types'
import { PROBLEM, board } from './helpers'


function input(b: ReturnType<typeof board>, over: Partial<SelectInput> = {}): SelectInput {
  const state = b.state()
  return { violations: evaluate(state, PROBLEM), history: historyOf(b.s.log), level: 'mid', stage: state.stage,
    problem: PROBLEM, asked: false, hasContent: stageHasContent(state), ...over }
}

describe('selector', () => {
  it('raises the earliest-stage problem first and leaves later stages alone', () => {
    const b = board()
    b.stage(1)
    b.text('functional', 'a\nb\nc\nd\ne')           // too many, and no out of scope
    b.node('db', 'Postgres', 'search events with LIKE') // a deep-dive problem
    const m = selectMove(input(b))
    expect(m.ruleId).toBe('REQ_TOO_MANY_FEATURES')
    expect(m.kind).toBe('challenge_assumption')
  })

  it('defers deep dives while the learner is in the high-level design stage', () => {
    const b = board()
    b.stage(4)
    const c = b.node('client', 'App'), v = b.node('service', 'API'), d = b.node('db', 'Postgres', 'search with LIKE')
    b.edge(c, v); b.edge(v, d)
    const flagged = evaluate(b.state(), PROBLEM).map((x) => x.ruleId)
    expect(flagged).toContain('DD_SEARCH_FULL_SCAN')
    expect(selectMove(input(b))).toMatchObject({ kind: 'affirm_and_advance', ruleId: undefined })
  })

  it('affirms a stage once when nothing in it or before it is flagged', () => {
    const b = board()
    b.stage(2)
    b.text('entities', 'Event\nTicket')
    const first = selectMove(input(b))
    expect(first.kind).toBe('affirm_and_advance')
    b.s.add('CoachResponded', { kind: 'ack', message: 'ok', move: 'affirm_and_advance' }, 'coach')
    expect(selectMove(input(b)).kind).toBe('stay_quiet')
  })

  it('stays quiet in an empty stage', () => {
    const b = board()
    b.stage(3)
    expect(selectMove(input(b)).kind).toBe('stay_quiet')
  })

  it('never speaks about the same rule twice in a row unless asked', () => {
    const b = board()
    b.text('functional', 'a\nb\nc\nd\ne')
    const first = selectMove(input(b))
    b.s.add('CoachResponded', { kind: 'reply', message: 'x', ruleId: first.ruleId, level: first.level, move: first.kind }, 'coach')
    const second = selectMove(input(b))
    expect(second.ruleId).not.toBe(first.ruleId) // moves on to REQ_NO_OUT_OF_SCOPE
    b.s.add('CoachResponded', { kind: 'reply', message: 'y', ruleId: second.ruleId, level: 1 }, 'coach')
    b.s.add('CoachResponded', { kind: 'reply', message: 'z', ruleId: 'REQ_NO_OUT_OF_SCOPE', level: 1 }, 'coach')
    expect(selectMove(input(b)).ruleId).toBe('REQ_TOO_MANY_FEATURES')
    expect(selectMove(input(b, { asked: true })).ruleId).toBe('REQ_TOO_MANY_FEATURES')
  })

  it('escalates the hint level only when asked, up to 3 with confirmation', () => {
    const b = board()
    b.text('functional', 'a\nb\nc\nd\ne\n---\nx')
    const levels: number[] = []
    for (let k = 0; k < 4; k++) {
      const m = selectMove(input(b, { asked: true }))
      expect(m.kind).toBe('offer_hint')
      levels.push(m.level)
      expect(m.needsConfirm).toBe(m.level === 3)
      b.s.add('HintRequested', { level: m.level, ruleId: m.ruleId })
    }
    expect(levels).toEqual([1, 2, 3, 3])
  })

  it('asked with nothing flagged gives a general nudge for the stage', () => {
    const b = board()
    b.stage(2)
    const m = selectMove(input(b, { asked: true }))
    expect(m).toMatchObject({ kind: 'ask_clarifying', ruleId: undefined })
    expect(scriptedText(m, undefined, 2)).not.toBe('')
  })

  it('raises an unresolved rule one level narrower in a later stage', () => {
    const b = board()
    b.text('functional', 'a\nb\nc\nd\ne\n---\nx')
    b.s.add('CoachResponded', { kind: 'reply', message: 'x', ruleId: 'REQ_TOO_MANY_FEATURES', level: 1 }, 'coach')
    b.s.add('CoachResponded', { kind: 'reply', message: 'x', ruleId: 'OTHER', level: 1 }, 'coach')
    b.stage(2)
    expect(selectMove(input(b))).toMatchObject({ ruleId: 'REQ_TOO_MANY_FEATURES', level: 2 })
  })

  describe('level calibration', () => {
    const lockBoard = () => {
      const b = board()
      b.stage(5)
      const c = b.node('client', 'App'), v = b.node('service', 'API'), d = b.node('db', 'Postgres'), r = b.node('cache', 'Redis', 'seat lock with TTL')
      b.edge(c, v); b.edge(v, d); b.edge(v, r)
      b.node('queue', 'Line') // keeps the surge rule quiet
      return b
    }
    it('a mid-level learner is not given the lock-failure curveball, but it is still flagged', () => {
      const b = lockBoard()
      expect(evaluate(b.state(), PROBLEM).map((v) => v.ruleId)).toContain('DD_LOCK_STORE_OUTAGE')
      expect(selectMove(input(b)).ruleId).not.toBe('DD_LOCK_STORE_OUTAGE')
    })
    it('a senior learner gets it', () => {
      expect(selectMove(input(lockBoard(), { level: 'senior' }))).toMatchObject({ ruleId: 'DD_LOCK_STORE_OUTAGE', kind: 'scale_curveball' })
    })
  })
})

describe('tracking rule changes in the log', () => {
  it('emits RuleFired once, and RuleResolved when it clears', () => {
    const b = board()
    b.text('functional', 'a\nb')
    let log = b.s.log
    const apply = (): void => {
      for (const ev of syncRules(log, evaluate(b.state(), PROBLEM))) {
        log = append(log, ev.type, ev.payload as never, 'system', 1)
        b.s.log = log
      }
    }
    apply()
    expect(log.filter((e) => e.type === 'RuleFired').map((e) => (e.payload as { ruleId: string }).ruleId)).toEqual(['REQ_NO_OUT_OF_SCOPE'])
    const n = log.length
    apply()
    expect(log.length).toBe(n) // nothing changed, nothing emitted
    b.text('functional', 'a\nb\n---\nc')
    apply()
    expect(log[log.length - 1]).toMatchObject({ type: 'RuleResolved', payload: { ruleId: 'REQ_NO_OUT_OF_SCOPE' } })
    expect(historyOf(log).active).toEqual({})
  })

  it('these events do not change the board', () => {
    const b = board()
    const before = b.state()
    b.s.add('RuleFired', { ruleId: 'X', stage: 1, evidence: [] }, 'system')
    b.s.add('HintRequested', { level: 1 })
    expect(b.state()).toEqual(before)
  })
})

describe('scripted hints', () => {
  const sample = (ruleId: string): Violation => ({ ruleId, stage: 1, severity: 'warn', evidence: ['e'], subjects: ['Thing One', 'Thing Two'], summary: 's' })

  it.each(RULES.map((r) => [r.id]))('%s: levels 1 and 2 never contain its spoilers, and level 3 is longer than level 1', (id) => {
    const r = RULES.find((x) => x.id === id)!
    const v = sample(id)
    for (const level of [1, 2] as const) {
      const text = scriptedText({ kind: 'offer_hint', ruleId: id, level, needsConfirm: false }, v, 1)
      const gate = checkReply({ message: text, state: board().state(), problem: { ...PROBLEM, stageSpoilers: {} }, stage: 5, ruleSpoilers: r.spoilers })
      expect(gate.reasons.filter((x) => x.startsWith('spoiler')), `${id} L${level}: ${text}`).toEqual([])
    }
    const l3 = scriptedText({ kind: 'offer_hint', ruleId: id, level: 3, needsConfirm: true }, v, 1)
    expect(l3.length).toBeGreaterThan(20)
    expect(l3.length).toBeLessThanOrEqual(MAX_CHARS_L3)
  })

  it('level 1 and 2 hints ask at most one question', () => {
    for (const r of RULES) {
      const v = sample(r.id)
      expect((r.hints.l1.match(/\?/g) ?? []).length, r.id).toBeLessThanOrEqual(1)
      expect((r.hints.l2(v).match(/\?/g) ?? []).length, r.id).toBeLessThanOrEqual(1)
    }
  })

  it('every scripted line passes the whole gate on an empty board when it names nothing it was not given', () => {
    for (const r of RULES) {
      for (const level of [1, 2] as const) {
        const text = scriptedText({ kind: 'offer_hint', ruleId: r.id, level, needsConfirm: false }, sample(r.id), 1)
        const g = checkReply({ message: text, state: board().state(), problem: PROBLEM, stage: 5, ruleSpoilers: r.spoilers })
        expect(g.reasons, `${r.id} L${level}: ${text}`).toEqual([])
      }
    }
  })
})

describe('grounding gate', () => {
  const state = (() => {
    const b = board()
    b.node('db', 'Postgres')
    b.node('cache', 'Redis', 'seat holds')
    return b.state()
  })()
  const gate = (message: string, over: Partial<Parameters<typeof checkReply>[0]> = {}) =>
    checkReply({ message, state, problem: PROBLEM, stage: 4, ...over })

  it('allows components the learner has on the board, under any of their names', () => {
    expect(gate('Is Redis fast enough here?').ok).toBe(true)
    expect(gate('What does PostgreSQL do when it is full?').ok).toBe(true)
  })
  it('rejects a technology that is not on the board (ghost component)', () => {
    expect(gate('Would Kafka help here?').reasons).toEqual(['ghost:kafka'])
    expect(gate('Have you thought about Memcached?').reasons).toEqual(['ghost:memcached'])
  })
  it('allows generic words', () => {
    expect(gate('What happens to the cache when a queue backs up?').ok).toBe(true)
  })
  it('rejects terms the problem keeps for later stages, but not once that stage is reached', () => {
    expect(gate('What about a load balancer?', { stage: 3 }).reasons).toContain('spoiler:load balancer')
    expect(gate('What about a load balancer?', { stage: 4 }).ok).toBe(true) // key 4 means "not before stage 4"
  })
  it('rejects the active rule\'s spoilers unless a confirmed level-3 hint', () => {
    expect(gate('Could the seat be released after a timeout?', { ruleSpoilers: ['timeout'] }).reasons).toEqual(['spoiler:timeout'])
    expect(gate('Could the seat be released after a timeout?', { ruleSpoilers: ['timeout'], allowRuleSpoilers: true }).ok).toBe(true)
  })
  it('enforces shape: one question, length, no fences, no lists, no giving the answer', () => {
    expect(gate('Why? And how?').reasons).toEqual(['shape:many-questions'])
    expect(gate('x'.repeat(400)).reasons).toEqual(['shape:too-long'])
    expect(gate('Try ```code``` here').reasons).toEqual(['shape:code-fence'])
    expect(gate('First:\n1. one\n2. two').reasons).toEqual(['shape:numbered-list'])
    expect(gate('The answer is a queue.').reasons).toEqual(['shape:gives-answer'])
    expect(gate('   ').reasons).toContain('shape:empty')
  })
})
