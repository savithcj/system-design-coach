import { describe, expect, it } from 'vitest'
import { reduce } from '../../src/core/reduce'
import { undoView } from '../../src/core/undo'
import { fromLearner, planChatEdits, roleFor, type RawAction } from '../../src/engine/chatEdit'
import { Session } from '../core/helpers'

const run = (s: Session, message: string, raw: RawAction[], via = 'chat:9') => planChatEdits(raw, message, s.state, via, 900)
const apply = (s: Session, p: ReturnType<typeof run>) => { for (const e of p.events) s.add(e.type, e.payload as never, 'coach') }

describe('what the learner said is the only source of content', () => {
  it('accepts their own words and rejects anything the model made up', () => {
    const msg = 'users input a url and get back a shortened version'
    expect(fromLearner('input a url', msg)).toBe(true)
    expect(fromLearner('shorten urls', msg)).toBe(true) // inflection: shorten / shortened
    expect(fromLearner('track click analytics', msg)).toBe(false)
    expect(fromLearner('idk', 'idk')).toBe(false) // filler is not an answer
    expect(fromLearner('yes', 'yes')).toBe(false)
  })
})

describe('writing into notes boxes', () => {
  it('appends bullets under the right box, once', () => {
    const s = new Session()
    const p = run(s, 'it should shorten a url and redirect', [{ kind: 'write', block: 'functional', bullets: ['shorten a url', 'redirect'] }])
    expect(p.events).toHaveLength(1)
    apply(s, p)
    expect(s.state.contract.functional).toBe('• shorten a url\n• redirect')
    const again = run(s, 'it should shorten a url and redirect', [{ kind: 'write', block: 'functional', bullets: ['shorten a url'] }])
    expect(again.events).toHaveLength(0) // already there
    expect(p.summary).toEqual(['Added “shorten a url” under Functional.', 'Added “redirect” under Functional.'])
  })
  it('refuses invented content, filler, unknown boxes and malformed actions', () => {
    const s = new Session()
    const p = run(s, 'idk', [
      { kind: 'write', block: 'functional', bullets: ['idk'] },
      { kind: 'write', block: 'functional', bullets: ['click analytics'] },
      { kind: 'write', block: 'secrets', bullets: ['idk'] },
      { kind: 'explode' },
      null as never,
      { kind: 'write', block: 'functional', bullets: 'nope' as never },
    ])
    expect(p.events).toEqual([])
    expect(p.rejected.length).toBeGreaterThanOrEqual(5)
  })
  it('keeps what the learner already wrote', () => {
    const s = new Session()
    s.add('ContractNoteUpdated', { block: 'entities', text: '• event' })
    const p = run(s, 'also tickets', [{ kind: 'write', block: 'entities', bullets: ['tickets'] }])
    apply(s, p)
    expect(s.state.contract.entities).toBe('• event\n• tickets')
  })
})

describe('the name settles the category', () => {
  it('corrects a wrong category when the name clearly says otherwise', () => {
    expect(roleFor('API server', 'db')).toBe('service')
    expect(roleFor('Redis', 'service')).toBe('cache')
    expect(roleFor('Web app', 'service')).toBe('client')
    expect(roleFor('Orders', 'db')).toBe('db') // says nothing: keep the model's choice
    expect(roleFor('Postgres', 'db')).toBe('db')
  })
})

describe('components and arrows', () => {
  it('adds a component the learner named, and connects boxes that exist', () => {
    const s = new Session()
    const p = run(s, 'add a cache called Redis and connect the web app to Redis', [
      { kind: 'add_component', category: 'cache', label: 'Redis' },
      { kind: 'add_component', category: 'client', label: 'Web app' },
      { kind: 'connect', from: 'Web app', to: 'Redis' },
    ])
    apply(s, p)
    const st = s.state
    expect(st.nodes.map((n) => [n.label, n.role])).toEqual([['Redis', 'cache'], ['Web app', 'client']])
    expect(st.edges).toHaveLength(1)
    expect(st.nodes.every((n) => n.fx !== undefined)).toBe(true)
  })
  it('does not add a component the learner never mentioned, or one that already exists', () => {
    const s = new Session()
    s.node('db', 'Postgres')
    const p = run(s, 'we store events', [
      { kind: 'add_component', category: 'cache', label: 'Redis' },
      { kind: 'add_component', category: 'db', label: 'Postgres' },
      { kind: 'add_component', category: 'unicorn', label: 'x' },
      { kind: 'connect', from: 'Nope', to: 'Postgres' },
    ])
    expect(p.events).toEqual([])
  })
  it('a floating note must be the learner\'s words too', () => {
    const s = new Session()
    expect(run(s, 'note: ask about retries later', [{ kind: 'sticky', text: 'ask about retries later' }]).events).toHaveLength(1)
    expect(run(s, 'note: ask about retries later', [{ kind: 'sticky', text: 'use consistent hashing' }]).events).toHaveLength(0)
  })
  it('never does more than six things for one message', () => {
    const s = new Session()
    const many = Array.from({ length: 12 }, (_, i) => ({ kind: 'sticky', text: `item${i}` }))
    expect(run(s, 'item0 item1 item2 item3 item4 item5 item6 item7 item8 item9 item10 item11', many).events).toHaveLength(6)
  })
})

describe('undo covers the whole chat turn in one step', () => {
  it('one undo removes everything one message changed; redo brings it back', () => {
    const s = new Session()
    s.add('UserMessaged', { text: 'add a cache and note retries' })
    const p = run(s, 'add a cache and note retries', [{ kind: 'add_component', category: 'cache' }, { kind: 'sticky', text: 'retries' }], 'chat:2')
    apply(s, p)
    expect(s.state.nodes).toHaveLength(1); expect(s.state.stickies).toHaveLength(1)
    const v = undoView(s.log)
    s.add('UserActionUndone', { targetSeq: v.undoTarget! })
    expect(reduce(s.log).nodes).toHaveLength(0); expect(reduce(s.log).stickies).toHaveLength(0)
    s.add('UserActionRedone', { targetSeq: undoView(s.log).redoTarget! })
    expect(reduce(s.log).nodes).toHaveLength(1)
  })
})
