import { describe, expect, it } from 'vitest'
import { STICKY_H, STICKY_W, stickySlot } from '../../src/core/layout'
import { buildReport, renderHtml, renderLatex } from '../../src/core/report'
import { allText } from '../../src/engine/board'
import { buildRequest } from '../../src/model/request'
import { Session, undo, redo } from './helpers'

const add = (s: Session, id: string, text: string, fx = 0.5, y = 10) => s.add('StickyAdded', { id, fx, y, text })

describe('floating notes', () => {
  it('are added, edited, moved and deleted by events', () => {
    const s = new Session()
    add(s, 's1', 'cache hot keys?')
    expect(s.state.stickies).toEqual([{ id: 's1', fx: 0.5, y: 10, text: 'cache hot keys?' }])
    s.add('StickyEdited', { id: 's1', text: 'cache hot keys? ask' })
    s.add('StickyMoved', { id: 's1', fx: 0.2, y: 99 })
    expect(s.state.stickies[0]).toMatchObject({ text: 'cache hot keys? ask', fx: 0.2, y: 99 })
    s.add('StickyDeleted', { id: 's1' })
    expect(s.state.stickies).toEqual([])
  })
  it('ignores blank notes, duplicate ids and a blank edit', () => {
    const s = new Session()
    add(s, 's1', '   '); add(s, 's2', 'a'); add(s, 's2', 'b')
    s.add('StickyEdited', { id: 's2', text: '  ' })
    expect(s.state.stickies.map((x) => x.text)).toEqual(['a'])
  })
  it('each change is one undo step, and redo brings it back', () => {
    const s = new Session()
    add(s, 's1', 'one')
    s.add('StickyEdited', { id: 's1', text: 'two' })
    expect(undo(s)).toBe(true)
    expect(s.state.stickies[0]!.text).toBe('one')
    expect(undo(s)).toBe(true)
    expect(s.state.stickies).toEqual([])
    expect(redo(s)).toBe(true)
    expect(s.state.stickies[0]!.text).toBe('one')
  })
  it('a drag is one event, not one per pointer move', () => {
    const s = new Session()
    add(s, 's1', 'one')
    const n = s.log.length
    s.add('StickyMoved', { id: 's1', fx: 0.1, y: 5 }, 'user', 50); s.add('StickyMoved', { id: 's1', fx: 0.3, y: 9 }, 'user', 50)
    expect(s.log.length).toBe(n + 1)
  })
  it('the coach reads them: they are board text for rules and go to the model as notes', () => {
    const s = new Session()
    add(s, 's1', 'redis for hot keys')
    expect(allText(s.state)).toContain('redis for hot keys')
    const req = buildRequest({ state: s.state, log: s.log, stage: 4, move: { kind: 'ask_clarifying', level: 1 } as never, violation: undefined, seed: 'x', problem: { title: 'T' } })
    expect(req.board.notes).toEqual(['redis for hot keys'])
  })
  it('a new note lands in a free spot, clear of boxes and other notes', () => {
    const s = new Session(900)
    s.node('client'); s.node('service')
    const a = stickySlot(s.state.nodes, [], 900)
    const b = stickySlot(s.state.nodes, [a], 900)
    const px = (p: { fx: number }) => p.fx * (900 - STICKY_W)
    expect(Math.abs(px(a) - px(b)) >= STICKY_W || Math.abs(a.y - b.y) >= STICKY_H).toBe(true)
  })
  it('appear in the study guide, HTML and LaTeX, and in the narration', () => {
    const s = new Session()
    add(s, 's1', 'ask about “idempotency” & 50% retries')
    const r = buildReport(s.log)
    expect(r.notes).toHaveLength(1)
    expect(r.steps.some((x) => x.text.startsWith('Added a floating note'))).toBe(true)
    expect(renderHtml(r)).toContain('Floating notes')
    const tex = renderLatex(r)
    expect(tex).toContain('Floating notes')
    // eslint-disable-next-line no-control-regex
    expect(/[^\x00-\x7F]/.test(tex)).toBe(false)
  })
})
