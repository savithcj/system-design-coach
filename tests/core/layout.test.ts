import { describe, expect, it } from 'vitest'
import { connectIntent, copyLabel, defaultLabel } from '../../src/core/actions'
import { NH, PORTS, autoPorts, edgePath, noteSide, portPt, snapPort, SNAP, usedPorts, type Pt } from '../../src/core/geometry'
import { canvasHeight, freeSlot, gridParams, resolvePositions, tidyLayout, tidyPositions } from '../../src/core/layout'
import { reduce } from '../../src/core/reduce'
import { Session } from './helpers'

describe('naming', () => {
  it('numbers repeated categories and uses the category label otherwise', () => {
    const s = new Session()
    expect(defaultLabel(s.state, 'cache')).toBe('Cache')
    s.node('cache', 'Redis')
    expect(defaultLabel(s.state, 'cache')).toBe('Cache 2')
    expect(defaultLabel(s.state, 'service')).toBe('Server')
  })
  it('names pasted copies "x copy", "x copy 2", ... without nesting', () => {
    const s = new Session()
    s.node('db', 'Postgres')
    expect(copyLabel(s.state, 'Postgres')).toBe('Postgres copy')
    s.node('db', 'Postgres copy')
    expect(copyLabel(s.state, 'Postgres')).toBe('Postgres copy 2')
    s.node('db', 'Postgres copy 2')
    expect(copyLabel(s.state, 'Postgres copy 2')).toBe('Postgres copy 3')
  })
  it('connecting an existing pair removes the arrow, in that direction only', () => {
    const s = new Session()
    const a = s.node('client'), b = s.node('service')
    const e = s.edge(a, b)
    expect(connectIntent(s.state, a, b, 'x')).toEqual({ type: 'EdgeDeleted', payload: { id: e } })
    expect(connectIntent(s.state, b, a, 'x').type).toBe('EdgeAdded')
  })
})

describe('layout stability', () => {
  it('a new box never lands on an occupied slot, even when others were dragged onto grid cells', () => {
    const s = new Session(900)
    s.node('client')
    const b = s.node('service')
    s.add('NodeMoved', { id: b, fx: 0, y: 0 }) // the learner drags it over the first cell
    const c = s.node('db')
    const ps = resolvePositions(s.state.nodes, 900).pos
    const g = gridParams(900)
    for (const other of s.state.nodes.filter((n) => n.id !== c)) {
      const p = ps[other.id]!, q = ps[c]!
      expect(Math.abs(p.x - q.x) < g.nw * 0.7 && Math.abs(p.y - q.y) < NH * 0.9, `new box overlaps ${other.id}`).toBe(false)
    }
  })

  it('connecting never moves any box', () => {
    const s = new Session(1000)
    const ids = (['client', 'service', 'db', 'cache', 'queue'] as const).map((r) => s.node(r))
    const before = resolvePositions(s.state.nodes, 1000)
    for (const [i, j] of [[0, 1], [1, 2], [1, 3], [3, 4], [4, 2]] as const) s.edge(ids[i]!, ids[j]!)
    expect(resolvePositions(s.state.nodes, 1000)).toEqual(before)
  })

  it('unpinned boxes (old logs) fall back to the grid in insertion order', () => {
    const s = new Session(800)
    s.add('NodeAdded', { id: 'a', role: 'client', label: 'A' })
    s.add('NodeAdded', { id: 'b', role: 'db', label: 'B' })
    const { pos, nw } = resolvePositions(s.state.nodes, 800)
    expect(pos['a']!.y).toBe(0)
    expect(pos['b']!.x).toBeGreaterThan(pos['a']!.x + nw - 1)
  })

  it('Tidy up pins every box by arrow depth, sources above sinks', () => {
    const s = new Session(900)
    const c = s.node('client'), lb = s.node('service'), api = s.node('service'), db = s.node('db')
    s.edge(c, lb); s.edge(lb, api); s.edge(api, db)
    const L = tidyLayout(s.state.nodes, s.state.edges, 900)
    expect([c, lb, api, db].map((id) => L.pos[id]!.row)).toEqual([0, 1, 2, 3])
    s.add('LayoutReset', { pos: tidyPositions(s.state.nodes, s.state.edges, 900) })
    expect(s.state.nodes.every((n) => n.fx !== undefined && n.y !== undefined)).toBe(true)
  })

  it('tidy puts cycles and loose boxes last without losing any box', () => {
    const s = new Session(900)
    const a = s.node('service'), b = s.node('service'), z = s.node('other')
    s.edge(a, b); s.edge(b, a)
    const L = tidyLayout(s.state.nodes, s.state.edges, 900)
    expect(L.order.map((n) => n.id).sort()).toEqual([a, b, z].sort())
  })

  it('freeSlot returns the first grid cell when the board is empty', () => {
    expect(freeSlot([], 900).y).toBe(0)
  })
})

describe('geometry', () => {
  const nw = gridParams(1000).nw
  const bezier = (d: string): Pt[] => {
    const m = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
    const [x0, y0, x1, y1, x2, y2, x3, y3] = m as [number, number, number, number, number, number, number, number]
    const pts: Pt[] = []
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const u = 1 - t
      pts.push({
        x: u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        y: u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      })
    }
    return pts
  }

  it('ports sit on the box edges', () => {
    const p = { x: 10, y: 20 }
    expect(portPt(p, nw, 't')).toEqual({ x: 10 + nw / 2, y: 20 })
    expect(portPt(p, nw, 'r')).toEqual({ x: 10 + nw, y: 20 + NH / 2 })
    expect(portPt(p, nw, 'b').y).toBe(20 + NH)
    expect(portPt(p, nw, 'l').x).toBe(10)
  })

  it('auto ports face each other', () => {
    expect(autoPorts({ x: 0, y: 0 }, { x: 0, y: 200 }, nw)).toEqual(['b', 't'])
    expect(autoPorts({ x: 0, y: 0 }, { x: 400, y: 0 }, nw)).toEqual(['r', 'l'])
    expect(autoPorts({ x: 400, y: 0 }, { x: 0, y: 0 }, nw)).toEqual(['l', 'r'])
  })

  it('arrows between any two grid boxes stay inside the canvas', () => {
    const s = new Session(1000)
    for (let i = 0; i < 12; i++) s.node('service')
    const { pos, W } = resolvePositions(s.state.nodes, 1000)
    const H = canvasHeight(pos)
    const ids = Object.keys(pos)
    for (const a of ids) for (const b of ids) {
      if (a === b) continue
      for (const shift of [0, 6]) {
        const d = edgePath(pos[a]!, pos[b]!, nw, undefined, undefined, shift)
        if (!d) continue
        for (const p of bezier(d)) {
          expect(p.x, `${a}->${b} x`).toBeGreaterThanOrEqual(-2)
          expect(p.y, `${a}->${b} y`).toBeGreaterThanOrEqual(-2)
          expect(p.x, `${a}->${b} x max`).toBeLessThanOrEqual(W + 2)
          expect(p.y, `${a}->${b} y max`).toBeLessThanOrEqual(H)
        }
      }
    }
  })

  it('overlapping boxes produce no path rather than NaN', () => {
    expect(edgePath({ x: 0, y: 0 }, { x: 0, y: 0 }, nw, 't', 't')).toBe('')
  })

  it('snaps within the radius, to the facing dot when dropped on the body, nearest when beside', () => {
    const pos = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 } }
    const bl = portPt(pos.b, nw, 'l')
    expect(snapPort(pos, nw, 300 + nw / 2, NH / 2, 'a', bl.x - 50, bl.y)).toEqual({ id: 'b', port: 'l' })
    expect(snapPort(pos, nw, 300 + nw + 8, NH + 24, 'a', 0, 0)).toMatchObject({ id: 'b' })
    expect(snapPort(pos, nw, 300 - SNAP - 5, 0, 'a', 0, 0)).toBeNull()
    expect(snapPort(pos, nw, 5, 5, 'a', 0, 0)).toBeNull() // never snaps to its own box
    expect(PORTS).toHaveLength(4)
  })
})

describe('state from an arbitrary log', () => {
  it('is deterministic', () => {
    const s = new Session()
    s.node('client'); s.node('db')
    expect(reduce(s.log)).toEqual(reduce(s.log))
  })
})

describe('note placement', () => {
  const nw = gridParams(1000).nw
  it('lists the dots that have arrows, using auto ports when none were chosen', () => {
    const pos = { a: { x: 0, y: 0 }, b: { x: 0, y: 200 }, c: { x: 400, y: 0 } }
    const edges = [{ a: 'a', b: 'b' }, { a: 'a', b: 'c', pa: 'l' as const }]
    expect([...usedPorts('a', edges, pos, nw)].sort()).toEqual(['b', 'l'])
    expect([...usedPorts('b', edges, pos, nw)]).toEqual(['t'])
    expect([...usedPorts('zzz', edges, pos, nw)]).toEqual([])
  })
  it('puts the note below when that dot is free, otherwise above, right, left', () => {
    expect(noteSide(new Set(), 0)).toBe('b')
    expect(noteSide(new Set(['b']), 200)).toBe('t')
    expect(noteSide(new Set(['b']), 10)).toBe('r') // above would leave the canvas
    expect(noteSide(new Set(['b', 'r']), 10)).toBe('l')
    expect(noteSide(new Set(['b', 't', 'r', 'l']), 200)).toBe('b')
  })
})
