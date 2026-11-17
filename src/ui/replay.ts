import { edgeLabelPoint, edgePath, NH } from '../core/geometry'
import { STICKY_H, STICKY_W, canvasHeight, resolvePositions, stickiesBottom } from '../core/layout'
import { reduceUpTo } from '../core/reduce'
import { narrate, type Step } from '../core/report'
import { STAGES } from '../core/stages'
import type { State } from '../core/state'
import { escapeHtml as esc } from '../core/text'
import { getLog, sessionToken } from './store'
import { shapeSvg } from './shapes'

const W = 640

/** A read-only picture of a board: boxes, arrows, arrow labels. Boxes are as the learner placed them. */
export function replaySvg(s: State): string {
  const { pos, nw } = resolvePositions(s.nodes, W)
  const H = Math.max(canvasHeight(pos), NH + 8, stickiesBottom(s.stickies)) + 8
  const mk = (id: string) => `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M0.5,1 L10,5 L0.5,9 z" fill="var(--edge)"/></marker>`
  let edges = '', labels = ''
  for (const e of s.edges) {
    const a = pos[e.a], b = pos[e.b]
    if (!a || !b) continue
    const shift = s.edges.some((o) => o.a === e.b && o.b === e.a) ? 6 : 0
    const d = edgePath(a, b, nw, e.pa, e.pb, shift)
    if (!d) continue
    edges += `<path d="${d}" fill="none" stroke="var(--edge)" stroke-width="1.5" marker-end="url(#rpAh)"/>`
    const m = e.label ? edgeLabelPoint(a, b, nw, e.pa, e.pb, shift) : null
    if (m) labels += `<text class="elabel" x="${m.x}" y="${m.y}" text-anchor="middle" dominant-baseline="central">${esc(e.label!)}</text>`
  }
  const boxes = s.nodes.map((n) => {
    const p = pos[n.id]!
    return `<g transform="translate(${p.x} ${p.y})" style="color:var(--muted)">${shapeSvg(n.role, nw, NH)}` +
      `<text x="${nw / 2}" y="${NH / 2}" text-anchor="middle" dominant-baseline="central" style="fill:var(--ink);font-size:13px;font-weight:500">${esc(n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label)}</text></g>`
  }).join('')
  const stickies = s.stickies.map((x) => {
    const px = Math.min(1, Math.max(0, x.fx)) * Math.max(0, W - STICKY_W)
    const t = x.text.replace(/\s+/g, ' ')
    return `<g transform="translate(${px} ${x.y})"><rect width="${STICKY_W}" height="${STICKY_H}" rx="6" style="fill:var(--soft);stroke:var(--line2)"/><text x="8" y="18" style="fill:var(--ink);font-size:11px">${esc(t.length > 80 ? t.slice(0, 79) + '…' : t)}</text></g>`
  }).join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-height:340px" role="img" aria-label="Board with ${s.nodes.length} components, ${s.edges.length} connections and ${s.stickies.length} notes"><defs>${mk('rpAh')}</defs>${edges}${boxes}${labels}${stickies}</svg>`
}

interface View { root: HTMLElement; steps: Step[]; range: HTMLInputElement; cap: HTMLElement; board: HTMLElement; logRef: unknown; session: number }
const views = new WeakMap<HTMLElement, View>()
let uid = 0

function frame(v: View): void {
  const i = Number(v.range.value)
  const step = i > 0 ? v.steps[i - 1] : undefined
  const state = reduceUpTo(getLog(), step ? step.seq : 0)
  const text = step ? `Step ${i} of ${v.steps.length}: ${step.text}` : `Start, before the first step (${v.steps.length} steps)`
  v.cap.textContent = `${text}${step ? ` Stage ${state.stage}, ${STAGES[state.stage - 1]!.label}.` : ''}`
  v.range.setAttribute('aria-valuetext', text)
  v.board.innerHTML = replaySvg(state)
}

/**
 * Builds (once) and refreshes a replay scrubber inside `root`. A slider over the learner's steps: arrow keys step,
 * Home and End jump. It only ever shows; it appends nothing to the log.
 */
export function refreshReplay(root: HTMLElement): void {
  let v = views.get(root)
  const steps = narrate(getLog())
  if (!v) {
    const id = `rp${++uid}`
    root.innerHTML = `<div class="rrow"><label for="${id}">Replay</label><input id="${id}" type="range" min="0" max="0" step="1" value="0"></div>` +
      `<div class="rcap"></div><div class="rboard"></div>`
    v = { root, steps, range: root.querySelector('input')!, cap: root.querySelector('.rcap')!, board: root.querySelector('.rboard')!, logRef: getLog(), session: sessionToken() }
    v.range.addEventListener('input', () => frame(v!))
    views.set(root, v)
    v.range.max = String(steps.length); v.range.value = String(steps.length)
    v.steps = steps
    frame(v)
    return
  }
  if (v.logRef === getLog()) return
  const atEnd = Number(v.range.value) >= v.steps.length || v.session !== sessionToken()
  v.session = sessionToken()
  v.steps = steps
  v.range.max = String(steps.length)
  if (atEnd) v.range.value = String(steps.length)
  frame(v)
  v.logRef = getLog()
}

/** Forget the position, e.g. when a different session is shown. */
export function resetReplay(root: HTMLElement): void { views.delete(root); root.innerHTML = '' }
