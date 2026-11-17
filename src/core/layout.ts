import { NH, type Pt } from './geometry'
import type { EdgeState, NodeState } from './state'

export const GAP = 10
export const ROWGAP = 52
/** Gap between grid columns. */
export const COLGAP = 64

export interface GridParams { nw: number; cols: number; x0: number }

export function gridParams(W: number): GridParams {
  const nw = Math.max(92, Math.min(160, W))
  const cols = Math.max(1, Math.floor((W + COLGAP) / (nw + COLGAP)))
  return { nw, cols, x0: Math.max(0, (W - (cols * nw + (cols - 1) * COLGAP)) / 2) }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export interface Placement { pos: Record<string, Pt>; nw: number; W: number }

/**
 * Where every box sits. Boxes with a pinned position (fx,y) win; the rest fall back to a grid in insertion order.
 * It never looks at arrows, so connecting two boxes can never rearrange the board.
 */
export function resolvePositions(nodes: readonly NodeState[], W: number): Placement {
  const g = gridParams(W)
  const Wc = Math.max(W, g.nw)
  const pos: Record<string, Pt> = {}
  nodes.forEach((n, i) => {
    pos[n.id] = n.fx !== undefined && n.y !== undefined
      ? { x: clamp01(n.fx) * Math.max(0, Wc - g.nw), y: n.y }
      : { x: g.x0 + (i % g.cols) * (g.nw + COLGAP), y: Math.floor(i / g.cols) * (NH + ROWGAP) }
  })
  return { pos, nw: g.nw, W: Wc }
}

/** The first grid slot not already taken by a pinned box. New boxes are pinned here at creation. */
export function freeSlot(nodes: readonly NodeState[], W: number): { fx: number; y: number } {
  const g = gridParams(W)
  const occ: Pt[] = []
  for (const n of nodes) {
    if (n.fx === undefined || n.y === undefined) continue
    occ.push({ x: clamp01(n.fx) * Math.max(0, W - g.nw), y: n.y })
  }
  for (let k = 0; k < 500; k++) {
    const x = g.x0 + (k % g.cols) * (g.nw + COLGAP)
    const y = Math.floor(k / g.cols) * (NH + ROWGAP)
    if (!occ.some((o) => Math.abs(o.x - x) < g.nw * 0.7 && Math.abs(o.y - y) < NH * 0.9)) {
      return { fx: clamp01(x / Math.max(1, W - g.nw)), y }
    }
  }
  return { fx: 0, y: 0 }
}

export interface TidyLayout { pos: Record<string, Pt & { row: number }>; nw: number; W: number; H: number; order: NodeState[] }

/** "Tidy up": layers boxes top to bottom by their arrows (longest path), cycles and loose boxes last. */
export function tidyLayout(nodes: readonly NodeState[], edges: readonly EdgeState[], W: number): TidyLayout {
  const ids = nodes.map((n) => n.id)
  const out: Record<string, string[]> = {}
  const par: Record<string, string[]> = {}
  const deg: Record<string, number> = {}
  const depth: Record<string, number> = {}
  const touched: Record<string, boolean> = {}
  for (const id of ids) { out[id] = []; par[id] = []; deg[id] = 0 }
  for (const e of edges) {
    if (out[e.a] && deg[e.b] !== undefined) {
      out[e.a]!.push(e.b); par[e.b]!.push(e.a); deg[e.b]!++; touched[e.a] = touched[e.b] = true
    }
  }
  const q = ids.filter((id) => deg[id] === 0 && touched[id])
  for (const id of q) depth[id] = 0
  while (q.length) {
    const u = q.shift()!
    for (const v of out[u]!) {
      depth[v] = Math.max(depth[v] ?? 0, depth[u]! + 1)
      if (--deg[v]! === 0) q.push(v)
    }
  }
  let maxD = -1
  for (const id of ids) if (depth[id] !== undefined) maxD = Math.max(maxD, depth[id]!)
  for (const id of ids) if (depth[id] === undefined) depth[id] = maxD + 1

  const rows: string[][] = []
  for (const id of ids) (rows[depth[id]!] ??= []).push(id)
  const dense = rows.filter(Boolean)
  const idx: Record<string, number> = {}
  const order: NodeState[] = []
  dense.forEach((r, ri) => {
    if (ri > 0) {
      // Barycentre ordering keeps arrows from crossing needlessly.
      const bc = (x: string) => {
        const ps = par[x]!.filter((p) => idx[p] !== undefined)
        return ps.length ? ps.reduce((t, p) => t + idx[p]!, 0) / ps.length : 99
      }
      r.sort((a, b) => bc(a) - bc(b))
    }
    r.forEach((id, i) => { idx[id] = i; order.push(nodes.find((n) => n.id === id)!) })
  })
  const perRow = Math.max(1, ...dense.map((r) => r.length))
  const nw = Math.max(92, Math.min(170, Math.floor((W - GAP * (perRow - 1)) / perRow)))
  const Wc = Math.max(W, perRow * nw + GAP * (perRow - 1))
  const pos: TidyLayout['pos'] = {}
  dense.forEach((r, ri) => {
    const rw = r.length * nw + (r.length - 1) * GAP
    const x0 = (Wc - rw) / 2
    r.forEach((id, i) => { pos[id] = { x: x0 + i * (nw + GAP), y: ri * (NH + ROWGAP), row: ri } })
  })
  return { pos, nw, W: Wc, H: dense.length ? dense.length * NH + (dense.length - 1) * ROWGAP : 0, order }
}

/** Payload for the LayoutReset event produced by "Tidy up". */
export function tidyPositions(nodes: readonly NodeState[], edges: readonly EdgeState[], W: number): Record<string, { fx: number; y: number }> {
  const L = tidyLayout(nodes, edges, W)
  const pos: Record<string, { fx: number; y: number }> = {}
  for (const n of nodes) {
    const q = L.pos[n.id]!
    pos[n.id] = { fx: clamp01(q.x / Math.max(1, L.W - L.nw)), y: Math.round(q.y) }
  }
  return pos
}

/** Height the canvas needs so every box and arrow stays inside it. */
export function canvasHeight(pos: Readonly<Record<string, Pt>>): number {
  let m = 0
  for (const id of Object.keys(pos)) m = Math.max(m, pos[id]!.y + NH)
  return Math.max(300, m + 60)
}

/** Width of a floating note, and the room one is assumed to need when finding it a spot. */
export const STICKY_W = 170
export const STICKY_H = 84

/** Position (fraction of the free width, and pixels down) for a new floating note: the first spot clear of boxes and other notes. */
export function stickySlot(nodes: readonly NodeState[], stickies: readonly { fx: number; y: number }[], W: number): { fx: number; y: number } {
  const { pos, nw } = resolvePositions(nodes, W)
  const free = Math.max(1, W - STICKY_W)
  const taken = [
    ...Object.values(pos).map((p) => ({ x: p.x, y: p.y, w: nw, h: NH })),
    ...stickies.map((s) => ({ x: clamp01(s.fx) * free, y: s.y, w: STICKY_W, h: STICKY_H })),
  ]
  const cols = Math.max(1, Math.floor(W / (STICKY_W + 16)))
  for (let row = 0; row < 200; row++) {
    for (let c = cols - 1; c >= 0; c--) { // right-hand side first: boxes fill from the left
      const x = Math.min(free, c * (STICKY_W + 16)), y = row * (STICKY_H + 16)
      if (!taken.some((t) => x < t.x + t.w + 8 && x + STICKY_W + 8 > t.x && y < t.y + t.h + 8 && y + STICKY_H + 8 > t.y)) return { fx: clamp01(x / free), y }
    }
  }
  return { fx: 0, y: 0 }
}

/** Lowest edge of any floating note, so the canvas is tall enough to hold them. */
export const stickiesBottom = (stickies: readonly { y: number }[]): number => stickies.reduce((m, s) => Math.max(m, s.y + STICKY_H), 0)
