import { describe, expect, it } from 'vitest'
import { reduce, reduceUpTo } from '../../src/core/reduce'
import { narrate } from '../../src/core/report'
import { actionGroups, undoView } from '../../src/core/undo'
import { Session, redo, undo } from './helpers'

describe('labels and notes in the reducer', () => {
  it('labels an arrow, trims, and an empty label clears it', () => {
    const s = new Session()
    const a = s.node('client'), b = s.node('service'), e = s.edge(a, b)
    s.add('EdgeLabeled', { id: e, label: '  reserve(ticketId) ' })
    expect(s.state.edges[0]!.label).toBe('reserve(ticketId)')
    s.add('EdgeLabeled', { id: e, label: '  ' })
    expect(s.state.edges[0]!.label).toBeUndefined()
  })
  it('notes keep their lines, drop trailing blanks, and a blank note removes it', () => {
    const s = new Session()
    const a = s.node('db')
    s.add('NodeNoteUpdated', { id: a, text: 'events(id, name)\nbookings(id, seat)\n\n' })
    expect(s.state.nodes[0]!.note).toBe('events(id, name)\nbookings(id, seat)')
    s.add('NodeNoteUpdated', { id: a, text: '\n ' })
    expect(s.state.nodes[0]!.note).toBeUndefined()
  })
  it('deleting a box deletes its note, and labels and notes on unknown ids are ignored', () => {
    const s = new Session()
    const a = s.node('db'), b = s.node('cache')
    s.add('NodeNoteUpdated', { id: a, text: 'TTL 10m' })
    s.add('NodeNoteUpdated', { id: 'ghost', text: 'x' })
    s.add('EdgeLabeled', { id: 'ghost', label: 'x' })
    s.add('NodeDeleted', { id: a })
    expect(s.state.nodes.map((n) => n.id)).toEqual([b])
  })
})

describe('undo', () => {
  it('undoes a box creation together with its immediate naming, as one step', () => {
    const s = new Session()
    const id = s.node('cache')
    s.add('NodeRenamed', { id, label: 'Redis' })
    expect(actionGroups(s.log)).toHaveLength(1)
    undo(s)
    expect(s.state.nodes).toEqual([])
    expect(redo(s)).toBe(true)
    expect(s.state.nodes.map((n) => n.label)).toEqual(['Redis'])
  })

  it('a rename later on is its own step', () => {
    const s = new Session()
    const id = s.node('cache')
    s.node('db')
    s.add('NodeRenamed', { id, label: 'Redis' })
    expect(actionGroups(s.log)).toHaveLength(3)
    undo(s)
    expect(s.state.nodes[0]!.label).toBe('Cache')
  })

  it('undoes renames, moves, edges, labels, notes and tidy', () => {
    const s = new Session()
    const a = s.node('client', 'A'), b = s.node('service', 'B')
    const e = s.edge(a, b)
    const base = s.state
    s.add('NodeRenamed', { id: a, label: 'Z' }); undo(s); expect(s.state).toEqual(base)
    s.add('NodeMoved', { id: a, fx: 0.7, y: 99 }); undo(s); expect(s.state).toEqual(base)
    s.add('EdgeLabeled', { id: e, label: 'SSE' }); undo(s); expect(s.state).toEqual(base)
    s.add('NodeNoteUpdated', { id: b, text: 'n' }); undo(s); expect(s.state).toEqual(base)
    s.add('LayoutReset', { pos: { [a]: { fx: 0, y: 0 } } }); undo(s); expect(s.state).toEqual(base)
    s.add('EdgeDeleted', { id: e }); undo(s); expect(s.state).toEqual(base)
  })

  it('undoing a delete brings back the box, its note and its arrows', () => {
    const s = new Session()
    const a = s.node('client', 'A'), b = s.node('service', 'B'), c = s.node('db', 'C')
    const e1 = s.edge(a, b); s.edge(b, c)
    s.add('EdgeLabeled', { id: e1, label: 'x' })
    s.add('NodeNoteUpdated', { id: b, text: 'keep me' })
    const before = s.state
    s.add('NodeDeleted', { id: b })
    expect(s.state.edges).toHaveLength(0)
    undo(s)
    expect(s.state).toEqual(before)
  })

  it('walks back through steps in order and says when there is nothing left', () => {
    const s = new Session()
    s.node('client'); s.node('db')
    expect(undo(s)).toBe(true)
    expect(s.state.nodes).toHaveLength(1)
    expect(undo(s)).toBe(true)
    expect(s.state.nodes).toHaveLength(0)
    expect(undo(s)).toBe(false)
  })

  it('never deletes events, and never undoes chat, coach messages or the opening', () => {
    const s = new Session()
    s.add('CoachResponded', { kind: 'opening', message: 'hi' }, 'coach')
    s.node('client')
    s.add('UserMessaged', { text: 'hello' })
    const n = s.log.length
    undo(s)
    expect(s.log).toHaveLength(n + 1)
    expect(s.log.filter((e) => e.type === 'UserMessaged')).toHaveLength(1)
    expect(undo(s)).toBe(false)
    expect(s.state.problemId).toBe('url')
  })

  it('does not undo events the coach wrote', () => {
    const s = new Session()
    s.add('NodeAdded', { id: 'k', role: 'cache', label: 'Redis' }, 'coach')
    expect(undo(s)).toBe(false)
    expect(s.state.nodes).toHaveLength(1)
  })
})

describe('redo', () => {
  it('re-applies the most recently undone step, repeatedly', () => {
    const s = new Session()
    s.node('client'); s.node('db'); s.node('cache')
    undo(s); undo(s)
    expect(s.state.nodes).toHaveLength(1)
    redo(s); expect(s.state.nodes).toHaveLength(2)
    redo(s); expect(s.state.nodes).toHaveLength(3)
    expect(redo(s)).toBe(false)
  })

  it('is cleared by any newer edit, but not by chat', () => {
    const s = new Session()
    const a = s.node('client'), b = s.node('db')
    undo(s)
    s.add('UserMessaged', { text: 'still can redo' })
    expect(undoView(s.log).redoTarget).not.toBeNull()
    s.add('NodeRenamed', { id: a, label: 'New' })
    expect(undoView(s.log).redoTarget).toBeNull()
    expect(redo(s)).toBe(false)
    expect(s.state.nodes.map((n) => n.id)).toEqual([a])
    expect(b).toBeTruthy()
  })

  it('ignores a redo that does not match the top of the redo stack', () => {
    const s = new Session()
    s.node('client'); s.node('db')
    undo(s); undo(s)
    const second = undoView(s.log).groups[1]!.id // undone first, so it is NOT the most recent undo
    s.add('UserActionRedone', { targetSeq: second })
    expect(s.state.nodes).toHaveLength(0)
    expect(undoView(s.log).redoTarget).toBe(undoView(s.log).groups[0]!.id)
  })

  it('ignores an undo that points at nothing, or at a step already undone', () => {
    const s = new Session()
    s.node('client')
    s.add('UserActionUndone', { targetSeq: 9999 })
    expect(s.state.nodes).toHaveLength(1)
    const t = undoView(s.log).undoTarget!
    s.add('UserActionUndone', { targetSeq: t }); s.add('UserActionUndone', { targetSeq: t })
    expect(s.state.nodes).toHaveLength(0)
    expect(redo(s)).toBe(true)
    expect(s.state.nodes).toHaveLength(1)
    expect(redo(s)).toBe(false)
  })
})

describe('undo, replay and the report', () => {
  it('replay of any prefix equals the live state at that point, with undo in the log', () => {
    const s = new Session()
    const a = s.node('client', 'A'); const b = s.node('db', 'B')
    s.edge(a, b); undo(s); s.add('NodeRenamed', { id: a, label: 'Q' }); undo(s); redo(s)
    for (let k = 1; k <= s.log.length; k++) expect(reduceUpTo(s.log, s.log[k - 1]!.seq)).toEqual(reduce(s.log.slice(0, k)))
  })

  it('the report keeps what happened and notes the undo', () => {
    const s = new Session()
    const id = s.node('cache'); s.add('NodeRenamed', { id, label: 'Redis' })
    undo(s); redo(s)
    const t = narrate(s.log).map((x) => x.text)
    expect(t).toContain('Added "Cache" (Cache).')
    expect(t).toContain('Undid: Added "Cache" (Cache).')
    expect(t).toContain('Redid: Added "Cache" (Cache).')
  })

  it('narrates labels and notes', () => {
    const s = new Session()
    const a = s.node('client', 'A'), b = s.node('db', 'B'), e = s.edge(a, b)
    s.add('EdgeLabeled', { id: e, label: 'CDC' }); s.add('NodeNoteUpdated', { id: b, text: 'x' }); s.add('NodeNoteUpdated', { id: b, text: 'y' })
    const t = narrate(s.log).map((x) => x.text)
    expect(t).toContain('Labelled the connection "A" → "B" "CDC".')
    expect(t).toContain('Added a note to "B".')
    expect(t).toContain('Edited the note on "B".')
  })
})

/* A model-based check: after any sequence of learner edits, k undos land exactly on the state after n-k edits,
   and m redos on n-k+m. Seeded so a failure is reproducible. */
function rng(seed: number) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 2 ** 32 } }

describe('undo/redo property', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`random edits then undo/redo walk the history (seed ${seed})`, () => {
      const r = rng(seed)
      const s = new Session(900)
      const states = [s.state] // states[i] = after i learner steps
      const steps = 6 + Math.floor(r() * 10)
      for (let i = 0; i < steps; i++) {
        const st = s.state, ids = st.nodes.map((n) => n.id), pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!
        const roll = r()
        if (roll < 0.3 || ids.length < 2) s.node(pick(['client', 'service', 'db', 'cache', 'queue', 'blob', 'other'] as const))
        else if (roll < 0.45) s.add('NodeRenamed', { id: pick(ids), label: `n${i}` })
        else if (roll < 0.6) s.edge(pick(ids), pick(ids))
        else if (roll < 0.7 && st.edges.length) s.add('EdgeLabeled', { id: pick(st.edges).id, label: `l${i}` })
        else if (roll < 0.8) s.add('NodeNoteUpdated', { id: pick(ids), text: `note ${i}` })
        else if (roll < 0.9) s.add('NodeMoved', { id: pick(ids), fx: r(), y: Math.round(r() * 300) }, 'user', 5000)
        else s.add('NodeDeleted', { id: pick(ids) })
        const g = actionGroups(s.log)
        if (g.length > states.length - 1) states.push(s.state) // a no-op roll adds no group; a rename that merges into an add does not either
        else states[states.length - 1] = s.state
      }
      const n = actionGroups(s.log).length
      expect(states).toHaveLength(n + 1)
      const k = Math.floor(r() * (n + 1))
      for (let i = 0; i < k; i++) expect(undo(s)).toBe(true)
      expect(s.state).toEqual(states[n - k])
      const m = Math.floor(r() * (k + 1))
      for (let i = 0; i < m; i++) expect(redo(s)).toBe(true)
      expect(s.state).toEqual(states[n - k + m])
    })
  }
})
