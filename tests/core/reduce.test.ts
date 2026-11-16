import { describe, expect, it } from 'vitest'
import { append, parseLog, serializeLog, COALESCE_MS, type LogEvent } from '../../src/core/events'
import { reduce, reduceUpTo } from '../../src/core/reduce'
import { Session } from './helpers'

describe('reducer', () => {
  it('adds boxes with their pinned slot and ignores empty names', () => {
    const s = new Session()
    s.node('client', 'Web app')
    s.add('NodeAdded', { id: 'x', role: 'cache', label: '   ' })
    expect(s.state.nodes.map((n) => n.label)).toEqual(['Web app'])
    expect(s.state.nodes[0]!.fx).toBeDefined()
  })

  it('renames with trim, ignores empty rename, and reads the legacy `to` field', () => {
    const s = new Session()
    const id = s.node('service', 'API')
    s.add('NodeRenamed', { id, label: '  Nginx  ' })
    expect(s.state.nodes[0]!.label).toBe('Nginx')
    s.add('NodeRenamed', { id, label: '   ' })
    expect(s.state.nodes[0]!.label).toBe('Nginx')
    s.log = [...s.log, { seq: s.log.length + 1, ts: 1, actor: 'user', type: 'NodeRenamed', payload: { id, to: 'Envoy' } }]
    expect(s.state.nodes[0]!.label).toBe('Envoy')
  })

  it('deleting a box removes the arrows touching it', () => {
    const s = new Session()
    const a = s.node('client'), b = s.node('service'), c = s.node('db')
    s.edge(a, b); s.edge(b, c)
    s.add('NodeDeleted', { id: b })
    expect(s.state.nodes.map((n) => n.id)).toEqual([a, c])
    expect(s.state.edges).toEqual([])
  })

  it('allows one arrow per ordered pair and the reverse pair, never self or dangling', () => {
    const s = new Session()
    const a = s.node('client'), b = s.node('service')
    s.edge(a, b); s.edge(a, b); s.edge(b, a); s.edge(a, a); s.edge(a, 'ghost')
    expect(s.state.edges.map((e) => [e.a, e.b])).toEqual([[a, b], [b, a]])
  })

  it('keeps ports on edges and removes edges by id', () => {
    const s = new Session()
    const a = s.node('client'), b = s.node('service')
    s.add('EdgeAdded', { id: 'e9', a, b, pa: 'r', pb: 'l' })
    expect(s.state.edges[0]).toMatchObject({ pa: 'r', pb: 'l' })
    s.add('EdgeDeleted', { id: 'e9' })
    expect(s.state.edges).toEqual([])
  })

  it('NodeMoved updates a box; LayoutReset pins listed boxes and unpins the rest', () => {
    const s = new Session()
    const a = s.node('client'), b = s.node('service')
    s.add('NodeMoved', { id: a, fx: 0.5, y: 120 })
    expect(s.state.nodes[0]).toMatchObject({ fx: 0.5, y: 120 })
    s.add('LayoutReset', { pos: { [b]: { fx: 0.1, y: 7 } } })
    expect(s.state.nodes[0]!.fx).toBeUndefined()
    expect(s.state.nodes[1]).toMatchObject({ fx: 0.1, y: 7 })
  })

  it('ignores unknown event types and finishes a session', () => {
    const s = new Session()
    s.log = [...s.log, { seq: 99, ts: 1, actor: 'coach', type: 'CoachStep', payload: { thought: 'old log' } }]
    s.add('SessionFinished', {})
    expect(s.state.finished).toBe(true)
  })
})

describe('append', () => {
  it('coalesces NodeMoved bursts on one box within the window, not across boxes or time', () => {
    const s = new Session()
    const a = s.node('client'), b = s.node('service')
    const n = s.log.length
    s.add('NodeMoved', { id: a, fx: 0.1, y: 10 })
    s.add('NodeMoved', { id: a, fx: 0.2, y: 20 })
    s.add('NodeMoved', { id: a, fx: 0.3, y: 30 })
    expect(s.log.length).toBe(n + 1)
    expect(s.log[s.log.length - 1]!.payload).toMatchObject({ fx: 0.3, y: 30 })
    s.add('NodeMoved', { id: b, fx: 0.9, y: 5 })
    expect(s.log.length).toBe(n + 2)
    s.add('NodeMoved', { id: b, fx: 0.8, y: 5 }, 'user', COALESCE_MS + 1)
    expect(s.log.length).toBe(n + 3)
  })

  it('never mutates the log it was given and keeps seq unique and increasing', () => {
    const s = new Session()
    s.node('client'); s.node('db')
    const before = s.log
    const copy = JSON.stringify(before)
    append(before, 'UserMessaged', { text: 'hi' }, 'user', 5)
    expect(JSON.stringify(before)).toBe(copy)
    const seqs = s.log.map((e) => e.seq)
    expect(seqs).toEqual([...seqs].sort((x, y) => x - y))
    expect(new Set(seqs).size).toBe(seqs.length)
  })
})

describe('log round-trip and replay', () => {
  function busy() {
    const s = new Session()
    const a = s.node('client', 'Web app'), b = s.node('service', 'Nginx'), c = s.node('db', 'Postgres')
    s.edge(a, b); const e = s.edge(b, c)
    s.add('NodeMoved', { id: c, fx: 0.4, y: 200 })
    s.add('NodeRenamed', { id: b, label: 'Envoy' })
    s.add('EdgeDeleted', { id: e })
    s.add('UserMessaged', { text: 'is this ok?' })
    s.add('CoachResponded', { kind: 'reply', message: 'What happens if Postgres fails?' }, 'coach')
    return s
  }

  it('copy events, reload, same state', () => {
    const s = busy()
    const back: LogEvent[] = parseLog(serializeLog(s.log))
    expect(reduce(back)).toEqual(s.state)
    expect(serializeLog(back)).toBe(serializeLog(s.log))
  })

  it('replay of a prefix equals the live state at that seq', () => {
    const s = busy()
    for (let k = 1; k <= s.log.length; k++) {
      const live = reduce(s.log.slice(0, k))
      expect(reduceUpTo(s.log, s.log[k - 1]!.seq)).toEqual(live)
    }
  })

  it('rejects a malformed log', () => {
    expect(() => parseLog('{}')).toThrow()
    expect(() => parseLog('[{"foo":1}]')).toThrow()
  })
})
