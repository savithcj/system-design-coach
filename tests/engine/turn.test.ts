import { describe, expect, it } from 'vitest'
import { reduce } from '../../src/core/reduce'
import { planTurn, CONFIRM_TEXT, type Trigger } from '../../src/engine/turn'
import { problemById } from '../../src/problems'
import { board, type B } from './helpers'

const tm = problemById('ticketmaster')
const url = problemById('url')

/** Plan a turn and append what it plans, as the UI does. Returns the planned events. */
function turn(b: B, t: Trigger, problem = tm) {
  const p = planTurn(b.s.log, problem, t)
  for (const e of p) b.s.add(e.type, e.payload, e.actor)
  return p
}
const said = (p: ReturnType<typeof turn>) => p.filter((e) => e.type === 'CoachResponded').map((e) => (e.payload as { message: string }).message)

function tooMany(b: B, lines = ['a', 'b', 'c', 'd', 'e', 'f']) { b.text('functional', lines.join('\n') + '\n---\nx') }

describe('"Stuck?"', () => {
  it('serves level 1, then 2, then asks before level 3, then serves it on the second press', () => {
    const b = board(); tooMany(b)
    const l1 = turn(b, { kind: 'stuck' })
    expect(l1.map((e) => e.type)).toEqual(['HintRequested', 'CoachResponded'])
    expect(l1[0]!.payload).toMatchObject({ level: 1, ruleId: 'REQ_TOO_MANY_FEATURES' })
    expect(said(l1)[0]).toMatch(/drop first/)
    expect(turn(b, { kind: 'stuck' })[0]!.payload).toMatchObject({ level: 2 })
    const ask = turn(b, { kind: 'stuck' })
    expect(ask.map((e) => e.type)).toEqual(['CoachResponded']) // no HintRequested yet: nothing was given
    expect(said(ask)).toEqual([CONFIRM_TEXT])
    const l3 = turn(b, { kind: 'stuck' })
    expect(l3[0]!.payload).toMatchObject({ level: 3, ruleId: 'REQ_TOO_MANY_FEATURES' })
    expect(said(l3)[0]).toMatch(/"---"/)
  })

  it('an edit between the question and the second press cancels the confirmation', () => {
    const b = board(); tooMany(b)
    turn(b, { kind: 'stuck' }); turn(b, { kind: 'stuck' }); turn(b, { kind: 'stuck' }) // now waiting for confirmation
    b.node('client', 'Phone')
    expect(said(turn(b, { kind: 'stuck' }))).toEqual([CONFIRM_TEXT]) // asks again instead of serving level 3
  })

  it('with nothing flagged it gives the stage question, or the problem\'s question about a missing category from stage 4', () => {
    const b = board(); b.stage(2)
    expect(said(turn(b, { kind: 'stuck' }))[0]).toMatch(/Names alone/)
    const c = board(); c.stage(4)
    expect(said(turn(c, { kind: 'stuck' }, url))[0]).toBe('Every design starts with who uses the system.')
    const ph = c.node('client', 'Phone'), sv = c.node('service', 'Anything'), db = c.node('db', 'Store'); c.edge(ph, sv); c.edge(sv, db)
    expect(said(turn(c, { kind: 'stuck' }, url))[0]).toMatch(/create-link/) // a second server is what the problem asks about next
  })
})

describe('chat is "ask the coach"', () => {
  it('answers any message with the best move, never past level 2, and without a HintRequested', () => {
    const b = board(); tooMany(b)
    const types: string[] = []
    const levels: number[] = []
    for (let i = 0; i < 4; i++) {
      b.s.add('UserMessaged', { text: 'anything at all, it is not parsed' })
      const p = turn(b, { kind: 'chat' })
      types.push(...p.map((e) => e.type))
      levels.push((p[0]!.payload as { level: number }).level)
    }
    expect(types.every((t) => t === 'CoachResponded')).toBe(true)
    expect(levels).toEqual([1, 2, 2, 2])
    expect(b.s.log.some((e) => e.type === 'CoachResponded' && (e.payload as { move?: string }).move === 'confirm_hint')).toBe(false)
  })
})

describe('stage changes', () => {
  it('affirms the stage being left once it is clean', () => {
    const b = board(); b.text('functional', 'search events\nbook a ticket\n---\npayments'); b.text('nonfunctional', 'strong consistency for booking\nhigh availability for search')
    b.stage(2)
    const p = turn(b, { kind: 'stage', from: 1, to: 2 })
    expect(p[0]!.payload).toMatchObject({ kind: 'ack', move: 'affirm_and_advance' })
    b.stage(1); b.stage(2)
    expect(turn(b, { kind: 'stage', from: 1, to: 2 })).toEqual([]) // never twice
  })

  it('raises an unresolved problem when the learner moves on, and stays quiet when they go back to an empty stage', () => {
    const b = board(); tooMany(b)
    b.stage(2)
    expect(turn(b, { kind: 'stage', from: 1, to: 2 })[0]!.payload).toMatchObject({ ruleId: 'REQ_TOO_MANY_FEATURES', kind: 'reply' })
    const c = board(); c.stage(3); c.stage(2)
    expect(turn(c, { kind: 'stage', from: 3, to: 2 })).toEqual([])
  })

  it('does not hold back deep dives from a learner who is already in stage 5', () => {
    const b = board(); b.stage(5)
    const c = b.node('client', 'App'), v = b.node('service', 'API'), w = b.node('service', 'Booking'), d = b.node('db', 'Postgres'); b.edge(c, v); b.edge(v, w); b.edge(w, d)
    expect(said(turn(b, { kind: 'stuck' }))[0]).toMatch(/limits how many requests/)
  })
})

describe('the gate sits between the plan and the learner', () => {
  it('a rejected line is recorded, and the plain question is shown instead', () => {
    const b = board()
    b.stage(1)
    // The learner's own words, quoted back at level 2, contain a term this problem holds back until stage 5.
    tooMany(b, ['a', 'b', 'c', 'd', 'a waiting queue for fans', 'f'])
    turn(b, { kind: 'stuck' })
    const p = turn(b, { kind: 'stuck' })
    expect(p.map((e) => e.type)).toEqual(['CoachReplyRejected', 'HintRequested', 'CoachResponded'])
    expect(p[0]!.payload).toMatchObject({ reason: expect.stringContaining('spoiler:waiting queue') })
    expect(said(p)[0]).toMatch(/drop first/)
  })
})

describe('level', () => {
  it('LevelSet changes the level the engine coaches at, and a bad value is ignored', () => {
    const b = board()
    expect(b.state().level).toBe('mid')
    b.s.add('LevelSet', { level: 'senior' })
    expect(b.state().level).toBe('senior')
    b.s.add('LevelSet', { level: 'wizard' as never })
    expect(reduce(b.s.log).level).toBe('senior')
  })
  it('a senior is coached on what a mid-level learner is spared', () => {
    const b = board(); b.stage(5)
    const c = b.node('client', 'App'), v = b.node('service', 'API'), w = b.node('service', 'Booking'), d = b.node('db', 'Postgres'), r = b.node('cache', 'Redis', 'seat lock with TTL')
    b.edge(c, v); b.edge(v, w); b.edge(w, d); b.edge(w, r); b.node('queue', 'Line')
    b.text('api', 'POST /reserve')
    expect(said(turn(b, { kind: 'chat' }))[0]).not.toMatch(/goes down/)
    b.s.add('LevelSet', { level: 'senior' })
    expect(said(turn(b, { kind: 'stuck' }))[0]).toMatch(/goes down/)
  })
})

describe('asking again with nothing changed', () => {
  it('does not repeat the same clarifying line', () => {
    const b = board()
    const first = said(turn(b, { kind: 'chat' }, url))
    const second = said(turn(b, { kind: 'chat' }, url))
    expect(first).toHaveLength(1)
    expect(second[0]).not.toBe(first[0])
    // Still true when a model reworded the first line: the check reads the recorded move, not the shown text.
    const log = b.s.log.map((e) => (e.type === 'CoachResponded' ? { ...e, payload: { ...(e.payload as object), message: 'reworded' } } : e))
    const again = planTurn(log as never, url, { kind: 'chat' }).find((p) => p.type === 'CoachResponded')!.payload as { message: string }
    expect(again.message).toBe(second[0])
  })
})
