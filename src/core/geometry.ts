import type { Port } from './events'

export interface Pt { x: number; y: number }

/** Box height is fixed; width (nw) is shared by every box and comes from the layout. */
export const NH = 56
/** A dropped arrow snaps to any box within this many px. */
export const SNAP = 28

/** Outward direction of each port. */
export const NORM: Readonly<Record<Port, readonly [number, number]>> = { t: [0, -1], r: [1, 0], b: [0, 1], l: [-1, 0] }
export const PORTS: readonly Port[] = ['t', 'r', 'b', 'l']

export function portPt(p: Pt, nw: number, port: Port): Pt {
  return port === 't' ? { x: p.x + nw / 2, y: p.y }
    : port === 'b' ? { x: p.x + nw / 2, y: p.y + NH }
    : port === 'l' ? { x: p.x, y: p.y + NH / 2 }
    : { x: p.x + nw, y: p.y + NH / 2 }
}

/** Ports used when the learner did not pick any, chosen from the relative position. */
export function autoPorts(a: Pt, b: Pt, nw: number): [Port, Port] {
  const dx = b.x + nw / 2 - (a.x + nw / 2)
  const dy = b.y + NH / 2 - (a.y + NH / 2)
  if (Math.abs(dy) >= Math.abs(dx) * 0.6) return dy >= 0 ? ['b', 't'] : ['t', 'b']
  return dx >= 0 ? ['r', 'l'] : ['l', 'r']
}

interface Curve { p1: Pt; c1: Pt; c2: Pt; p2: Pt }

/** Cubic Bézier leaving p1 along n1 and entering p2 along n2 (n2 null while a link is being dragged). */
function curve(p1: Pt, n1: readonly [number, number], p2: Pt, n2: readonly [number, number] | null): Curve {
  const d = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const k = Math.max(28, Math.min(110, d * 0.42))
  return {
    p1,
    c1: { x: p1.x + n1[0] * k, y: p1.y + n1[1] * k },
    c2: n2 ? { x: p2.x + n2[0] * k, y: p2.y + n2[1] * k } : p2,
    p2,
  }
}

const toPath = (c: Curve) => `M${c.p1.x} ${c.p1.y} C${c.c1.x} ${c.c1.y} ${c.c2.x} ${c.c2.y} ${c.p2.x} ${c.p2.y}`

export function curveTo(p1: Pt, n1: readonly [number, number], p2: Pt, n2: readonly [number, number] | null): string {
  return toPath(curve(p1, n1, p2, n2))
}

/** Curve of an arrow. `shift` offsets one of two opposite arrows between the same pair (6 px). Null if the boxes overlap. */
function edgeCurve(a: Pt, b: Pt, nw: number, pa?: Port, pb?: Port, shift = 0): Curve | null {
  const auto = autoPorts(a, b, nw)
  const fa = pa ?? auto[0]
  const fb = pb ?? auto[1]
  let p1 = portPt(a, nw, fa)
  let p2 = portPt(b, nw, fb)
  const n1 = NORM[fa]
  const n2 = NORM[fb]
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  if (len < 2) return null
  if (shift) {
    const ux = (p2.x - p1.x) / len
    const uy = (p2.y - p1.y) / len
    p1 = { x: p1.x - uy * shift, y: p1.y + ux * shift }
    p2 = { x: p2.x - uy * shift, y: p2.y + ux * shift }
  }
  // Stop 1.5 px short of the port so the arrowhead tip touches the box edge instead of overlapping it.
  p2 = { x: p2.x + n2[0] * 1.5, y: p2.y + n2[1] * 1.5 }
  return curve(p1, n1, p2, n2)
}

/** SVG path for an arrow ('' if the boxes overlap). */
export function edgePath(a: Pt, b: Pt, nw: number, pa?: Port, pb?: Port, shift = 0): string {
  const c = edgeCurve(a, b, nw, pa, pb, shift)
  return c ? toPath(c) : ''
}

/** Where an arrow's label sits: the middle of its curve. */
export function edgeLabelPoint(a: Pt, b: Pt, nw: number, pa?: Port, pb?: Port, shift = 0): Pt | null {
  const c = edgeCurve(a, b, nw, pa, pb, shift)
  if (!c) return null
  return { x: (c.p1.x + 3 * c.c1.x + 3 * c.c2.x + c.p2.x) / 8, y: (c.p1.y + 3 * c.c1.y + 3 * c.c2.y + c.p2.y) / 8 }
}

export interface Snap { id: string; port: Port }

/**
 * Which box and dot a dragged arrow would snap to at (px,py). Dropped on a box body, it picks the dot facing
 * where the arrow came from (sx,sy); dropped beside a box, the nearest dot.
 */
export function snapPort(pos: Readonly<Record<string, Pt>>, nw: number, px: number, py: number, from: string, sx: number, sy: number): Snap | null {
  let best: string | null = null
  let bestD = Infinity
  for (const id of Object.keys(pos)) {
    if (id === from) continue
    const p = pos[id]!
    const dx = Math.max(p.x - px, 0, px - (p.x + nw))
    const dy = Math.max(p.y - py, 0, py - (p.y + NH))
    const d = Math.hypot(dx, dy)
    if (d <= SNAP && d < bestD) { bestD = d; best = id }
  }
  if (!best) return null
  const P = pos[best]!
  const inside = px >= P.x && px <= P.x + nw && py >= P.y && py <= P.y + NH
  const rx = inside ? sx : px
  const ry = inside ? sy : py
  let port: Port = 't'
  let bd = Infinity
  for (const k of PORTS) {
    const q = portPt(P, nw, k)
    const dd = Math.hypot(q.x - rx, q.y - ry)
    if (dd < bd) { bd = dd; port = k }
  }
  return { id: best, port }
}
