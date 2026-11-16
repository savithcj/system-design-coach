import { connectIntent, copyLabel, defaultLabel } from '../core/actions'
import { NH, NORM, curveTo, edgeLabelPoint, edgePath, noteSide, portPt, snapPort, usedPorts, type Pt, type Snap } from '../core/geometry'
import type { Port } from '../core/events'
import { canvasHeight, freeSlot, resolvePositions, tidyPositions } from '../core/layout'
import { ROLES, roleLabel, type Role } from '../core/roles'
import { emptyState, nodeName, type EdgeState, type NodeState, type State } from '../core/state'
import { narrate } from '../core/report'
import { undoView } from '../core/undo'
import { escapeHtml as esc } from '../core/text'
import { $, say } from './dom'
import { dispatch, getLog, getState, record, render, resetSelection, seqNext, ui } from './store'
import { shapeSvg } from './shapes'
import { renderChat } from './chat'
import { renderDetails } from './details'

interface Cur { s: State; pos: Record<string, Pt>; nw: number; W: number; H: number }
let cur: Cur = { s: emptyState(), pos: {}, nw: 0, W: 0, H: 0 }

export function boardWidth(): number {
  return Math.max(260, $('boardWrap').clientWidth - 34)
}

/* ---------- actions (each one appends events, then the UI re-renders) ---------- */

export function addNode(role: Role, label?: string): void {
  const s = getState()
  const name = (label ?? defaultLabel(s, role)).trim()
  if (!name) return
  const id = `n${seqNext()}`
  ui.pendingFocus = 'NAME'; ui.sel = id; ui.selEdge = null; ui.editing = true; ui.connectFrom = null
  const slot = freeSlot(s.nodes, boardWidth())
  dispatch('NodeAdded', { id, role, label: name, fx: slot.fx, y: slot.y })
  say(`Added ${name} (${roleLabel(role)}).`)
  closePicker()
}

let clip: { role: Role; label: string } | null = null
function copyNode(): boolean {
  const n = ui.sel ? getState().nodes.find((x) => x.id === ui.sel) : undefined
  if (!n) return false
  clip = { role: n.role, label: n.label }
  say(`Copied ${n.label}.`)
  return true
}
function pasteNode(): boolean {
  if (!clip) return false
  const s = getState()
  const label = copyLabel(s, clip.label)
  const id = `n${seqNext()}`
  const slot = freeSlot(s.nodes, boardWidth())
  ui.sel = id; ui.selEdge = null; ui.editing = false; ui.connectFrom = null; ui.pendingFocus = id
  dispatch('NodeAdded', { id, role: clip.role, label, fx: slot.fx, y: slot.y })
  say(`Pasted ${label}.`)
  return true
}

function connect(a: string, b: string, pa?: Port, pb?: Port): void {
  const s = getState()
  const intent = connectIntent(s, a, b, `e${seqNext()}`, pa, pb)
  ui.sel = a
  if (intent.type === 'EdgeDeleted') { removeEdge(intent.payload.id); return }
  ui.pendingFocus = a
  dispatch('EdgeAdded', intent.payload)
  say(`Connected ${nodeName(s, a)} to ${nodeName(s, b)}.`)
}

function removeNode(id: string): void {
  const name = nodeName(getState(), id)
  resetSelection(); ui.pendingFocus = 'ADD'
  dispatch('NodeDeleted', { id })
  say(`Removed ${name}.`)
}

function removeEdge(id: string): void {
  const s = getState()
  const e = s.edges.find((x) => x.id === id)
  if (!e) return
  ui.selEdge = null; ui.pendingFocus = e.a
  dispatch('EdgeDeleted', { id })
  say(`Removed connection from ${nodeName(s, e.a)} to ${nodeName(s, e.b)}.`)
}

function moveNode(id: string, x: number, y: number): void {
  const fx = Math.max(0, Math.min(1, x / Math.max(1, cur.W - cur.nw)))
  record('NodeMoved', { id, fx, y: Math.max(0, Math.round(y)) })
  ui.pendingFocus = id
  render()
}

export function tidy(): void {
  const st = getState()
  dispatch('LayoutReset', { pos: tidyPositions(st.nodes, st.edges, boardWidth()) })
  say('Layout tidied.')
}

function beginEdgeLabel(id: string): void {
  ui.selEdge = id; ui.sel = null; ui.editing = false; ui.editingNote = null; ui.connectFrom = null; ui.editingEdge = id
  ui.pendingFocus = 'EDGENAME'
  render()
}

function beginNote(id: string): void {
  ui.sel = id; ui.selEdge = null; ui.editing = false; ui.editingEdge = null; ui.connectFrom = null; ui.editingNote = id
  ui.pendingFocus = 'NOTE'
  render()
}

/** Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z. Undo is an event; the log only grows. */
function undoRedo(kind: 'undo' | 'redo'): void {
  const v = undoView(getLog())
  const target = kind === 'undo' ? v.undoTarget : v.redoTarget
  if (target === null) { say(kind === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.'); return }
  record(kind === 'undo' ? 'UserActionUndone' : 'UserActionRedone', { targetSeq: target })
  const s = getState()
  // Undo can remove the selected box or arrow; never leave the UI pointing at something that is gone.
  if ((ui.sel && !s.nodes.some((n) => n.id === ui.sel)) || (ui.selEdge && !s.edges.some((e) => e.id === ui.selEdge))) resetSelection()
  ui.editing = false; ui.editingEdge = null; ui.editingNote = null; ui.connectFrom = null
  ui.pendingFocus = ui.sel ?? 'ADD'
  render()
  const last = narrate(getLog()).at(-1)
  say(last?.text ?? (kind === 'undo' ? 'Undid a change.' : 'Redid a change.'))
}

/* ---------- rendering ---------- */

function edgeGeom(e: EdgeState): { d: string; mid: Pt } | null {
  const a = cur.pos[e.a], b = cur.pos[e.b]
  if (!a || !b) return null
  const shift = cur.s.edges.some((o) => o.a === e.b && o.b === e.a) ? 6 : 0
  const d = edgePath(a, b, cur.nw, e.pa, e.pb, shift)
  const mid = edgeLabelPoint(a, b, cur.nw, e.pa, e.pb, shift)
  return d && mid ? { d, mid } : null
}

function edgeAria(s: State, e: EdgeState): string {
  const ends = `Connection from ${nodeName(s, e.a)} to ${nodeName(s, e.b)}`
  return e.label ? `${ends}, labelled ${e.label}. Enter edits the label, Delete removes it.` : `${ends}. Enter adds a label, Delete removes it.`
}

function edgesMarkup(): string {
  return cur.s.edges.map((e) => {
    const g = edgeGeom(e)
    if (!g) return ''
    const on = ui.selEdge === e.id
    return `<path d="${g.d}" fill="none" stroke="${on ? 'var(--accent)' : 'var(--edge)'}" stroke-width="${on ? 2 : 1.5}" marker-end="url(#${on ? 'ahSel' : 'ah'})" aria-hidden="true"/>` +
      `<path d="${g.d}" fill="none" stroke="transparent" stroke-width="16" data-edge="${e.id}" role="button" tabindex="-1" aria-label="${esc(edgeAria(cur.s, e))}" aria-keyshortcuts="Enter F2 Delete" style="pointer-events:stroke;cursor:pointer"/>`
  }).join('')
}

/** Labels live in their own layer above the boxes: the grid gap is narrower than a label, and a label must stay readable. */
function labelsMarkup(): string {
  return cur.s.edges.map((e) => {
    const g = e.label && ui.editingEdge !== e.id ? edgeGeom(e) : null
    return g ? `<text class="elabel" x="${g.mid.x}" y="${g.mid.y}" text-anchor="middle" dominant-baseline="central" data-edge="${e.id}" aria-hidden="true">${esc(e.label!)}</text>` : ''
  }).join('')
}

function refreshEdges(): void {
  const g = document.getElementById('edgeLayer'); if (g) g.innerHTML = edgesMarkup()
  const l = document.getElementById('labelLayer'); if (l) l.innerHTML = labelsMarkup()
}

/** A note is as wide as its box and sits on a side whose dot has no arrow, so it never hides a connection. */
function noteStyle(id: string): string {
  const p = cur.pos[id]!
  let side = noteSide(usedPorts(id, cur.s.edges, cur.pos, cur.nw), p.y)
  if (side === 'r' && p.x + cur.nw * 2 + 8 > cur.W) side = 'l'
  if (side === 'l' && p.x - cur.nw - 8 < 0) side = 'b'
  const w = `width:${cur.nw}px`
  return side === 'b' ? `left:${p.x}px;top:${p.y + NH + 6}px;${w}`
    : side === 't' ? `left:${p.x}px;bottom:${cur.H - p.y + 6}px;${w}`
    : side === 'r' ? `left:${p.x + cur.nw + 8}px;top:${p.y}px;${w}`
    : `right:${cur.W - p.x + 8}px;top:${p.y}px;${w}`
}

function notesMarkup(): string {
  return cur.s.nodes.map((n) => {
    const p = cur.pos[n.id]
    if (!p) return ''
    if (ui.editingNote === n.id) {
      return `<textarea id="noteInp" class="noteEdit" data-for="${n.id}" aria-label="Note for ${esc(n.label)}" rows="3" style="${noteStyle(n.id)}">${esc(n.note ?? '')}</textarea>`
    }
    return n.note ? `<button class="note" data-note="${n.id}" aria-label="${esc(`Note on ${n.label}: ${n.note}. Press to edit.`)}" style="${noteStyle(n.id)}">${esc(n.note)}</button>` : ''
  }).join('')
}

function nodeDesc(s: State, n: NodeState): string {
  const outs = s.edges.filter((e) => e.a === n.id).map((e) => nodeName(s, e.b))
  const ins = s.edges.filter((e) => e.b === n.id).map((e) => nodeName(s, e.a))
  let desc = `${n.label}, ${roleLabel(n.role)}. ${outs.length ? `Sends to ${outs.join(', ')}. ` : ''}${ins.length ? `Receives from ${ins.join(', ')}. ` : ''}${!outs.length && !ins.length ? 'Not connected. ' : ''}${n.note ? 'Has a note. ' : ''}`
  if (ui.connectFrom && ui.connectFrom !== n.id) desc += `Press to draw an arrow from ${nodeName(s, ui.connectFrom)} to this.`
  else if (ui.connectFrom === n.id) desc += 'Connecting from here. Press to cancel.'
  return desc
}

function handleHtml(n: NodeState, p: Pt, nw: number): string {
  const id = n.id
  const on = ui.connectFrom === id
  const dots = (['t', 'r', 'b', 'l'] as const).map((k) => {
    const q = portPt(p, nw, k)
    return `<span class="handle" data-act="connect" data-for="${id}" data-port="${k}" style="left:${q.x - 6}px;top:${q.y - 6}px"></span>`
  }).join('')
  // Decorative duplicate of the N key for pointer users, so it stays out of the tab order and the accessibility tree.
  const noteBtn = `<button type="button" class="noteBtn" data-act="note" data-for="${id}" tabindex="-1" aria-label="Note for ${esc(n.label)}" style="left:${p.x + nw - 9}px;top:${p.y - 9}px"${n.note ? ' hidden' : ''}><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M1.5 3h7M1.5 5h7M1.5 7h4"/></svg></button>`
  return `<span class="hs${on ? ' on' : ''}${ui.sel === id ? ' sel' : ''}" data-hs="${id}" aria-hidden="true">${dots}${noteBtn}</span>`
}

function placeHandles(id: string, p: Pt): void {
  document.querySelectorAll<HTMLElement>(`.handle[data-for="${id}"]`).forEach((h) => {
    const q = portPt(p, cur.nw, h.dataset['port'] as Port)
    h.style.left = `${q.x - 6}px`; h.style.top = `${q.y - 6}px`
  })
  const nb = document.querySelector<HTMLElement>(`.noteBtn[data-for="${id}"]`)
  if (nb) { nb.style.left = `${p.x + cur.nw - 9}px`; nb.style.top = `${p.y - 9}px` }
}

export function renderBoard(s: State): void {
  const el = $('board')
  const W = boardWidth()
  cur = { s, pos: {}, nw: 0, W: 0, H: 0 }
  if (!s.nodes.length) { el.style.width = 'auto'; el.style.height = 'auto'; el.innerHTML = ''; return }
  const L = resolvePositions(s.nodes, W)
  const H = canvasHeight(L.pos)
  cur = { s, pos: L.pos, nw: L.nw, W: L.W, H }
  const marker = (id: string, fill: string) => `<marker id="${id}" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto"><path d="M0.5,1 L10,5 L0.5,9 z" fill="${fill}"/></marker>`
  const svg = `<svg id="edgeSvg" width="${L.W}" height="${H}" style="position:absolute;left:0;top:0;pointer-events:none" role="group" aria-label="Connections" focusable="false"><defs>${marker('ah', 'var(--edge)')}${marker('ahSel', 'var(--accent)')}</defs><g id="edgeLayer">${edgesMarkup()}</g></svg>`
  let btns = ''
  for (const n of s.nodes) {
    const p = L.pos[n.id]!
    const cls = `node${ui.connectFrom && ui.connectFrom !== n.id ? ' target' : ''}${ui.editing && ui.sel === n.id ? ' editing' : ''}`
    let ov = handleHtml(n, p, L.nw)
    if (ui.sel === n.id && ui.editing) {
      const ny = p.y + (n.role === 'db' ? 29 : 25)
      ov += `<input id="nameInp" class="nodeName" type="text" aria-label="Name" data-for="${n.id}" value="${esc(n.label)}" style="left:${p.x + 20}px;top:${ny}px;width:${Math.max(40, L.nw - 40)}px">`
    }
    btns += `<button class="${cls}" data-node="${n.id}" aria-pressed="${ui.sel === n.id}" aria-describedby="moveHelp" aria-keyshortcuts="Enter F2 Delete C N E Control+C Control+V Control+Z" aria-label="${esc(nodeDesc(s, n))}" data-role="${n.role}" style="left:${p.x}px;top:${p.y}px;width:${L.nw}px;height:${NH}px">${shapeSvg(n.role, L.nw, NH)}<small>${esc(roleLabel(n.role))}</small><span>${esc(n.label)}</span></button>${ov}`
  }
  let edgeInput = ''
  const editedEdge = ui.editingEdge ? s.edges.find((x) => x.id === ui.editingEdge) : undefined
  const eg = editedEdge && edgeGeom(editedEdge)
  if (editedEdge && eg) {
    edgeInput = `<input id="edgeInp" class="edgeName" type="text" aria-label="Label for the connection from ${esc(nodeName(s, editedEdge.a))} to ${esc(nodeName(s, editedEdge.b))}" data-for="${editedEdge.id}" value="${esc(editedEdge.label ?? '')}" style="left:${eg.mid.x}px;top:${eg.mid.y}px">`
  }
  el.style.width = `${L.W}px`; el.style.height = `${H}px`
  const labelSvg = `<svg id="labelSvg" width="${L.W}" height="${H}" style="position:absolute;left:0;top:0;pointer-events:none" aria-hidden="true" focusable="false"><g id="labelLayer">${labelsMarkup()}</g></svg>`
  el.innerHTML = svg + btns + labelSvg + `<div id="notes">${notesMarkup()}</div>` + edgeInput
}

/* ---------- component picker: type to filter, arrows to move, Enter to choose, Escape to close ---------- */

let pickActive = 0
let pickItems: { id: Role; label: string; hint: string }[] = []

function pickerOptions(q: string) {
  const ql = q.trim().toLowerCase()
  return (Object.keys(ROLES) as Role[])
    .map((k) => ({ id: k, label: ROLES[k].label, hint: ROLES[k].hint }))
    .filter((o) => !ql || o.label.toLowerCase().includes(ql) || o.hint.toLowerCase().includes(ql))
}

function renderPicker(): void {
  const inp = $<HTMLInputElement>('pickInp'), list = $('pickList')
  pickItems = pickerOptions(inp.value)
  pickActive = Math.max(0, Math.min(pickActive, pickItems.length - 1))
  list.innerHTML = pickItems.map((o, i) =>
    `<li role="option" id="po${i}" data-i="${i}" aria-selected="${i === pickActive}">${shapeSvg(o.id, 26, 18, true)}<span>${esc(o.label)}</span><small>${esc(o.hint)}</small></li>`).join('')
  inp.setAttribute('aria-activedescendant', pickItems.length ? `po${pickActive}` : '')
  document.getElementById(`po${pickActive}`)?.scrollIntoView?.({ block: 'nearest' })
}

function openPicker(): void {
  const inp = $<HTMLInputElement>('pickInp')
  $('picker').hidden = false
  $('addBtn').setAttribute('aria-expanded', 'true')
  inp.value = ''; pickActive = 0; renderPicker(); inp.focus()
}

export function closePicker(): void {
  $('picker').hidden = true
  $('addBtn').setAttribute('aria-expanded', 'false')
}

function initPicker(): void {
  const picker = $('picker'), inp = $<HTMLInputElement>('pickInp'), list = $('pickList')
  const choose = (i: number) => { const o = pickItems[i]; if (o) addNode(o.id) }
  $('addBtn').onclick = () => { if (picker.hidden) openPicker(); else closePicker() }
  inp.addEventListener('input', () => { pickActive = 0; renderPicker() })
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); pickActive = Math.min(pickItems.length - 1, pickActive + 1); renderPicker() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pickActive = Math.max(0, pickActive - 1); renderPicker() }
    else if (e.key === 'Home') { e.preventDefault(); pickActive = 0; renderPicker() }
    else if (e.key === 'End') { e.preventDefault(); pickActive = Math.max(0, pickItems.length - 1); renderPicker() }
    else if (e.key === 'Enter') { e.preventDefault(); choose(pickActive) }
  })
  list.addEventListener('mousedown', (e) => e.preventDefault())
  list.addEventListener('click', (e) => { const li = (e.target as Element).closest<HTMLElement>('[data-i]'); if (li) choose(Number(li.dataset['i'])) })
  document.addEventListener('click', (e) => {
    const t = e.target as Element
    if (!picker.hidden && !picker.contains(t) && !t.closest('#addBtn')) closePicker()
  })
}

/* ---------- pointer, keyboard and focus wiring ---------- */

export function initBoard(): void {
  initPicker()
  $('tidyBtn').onclick = tidy

  const bd = $('board')
  let drag: { id: string; el: HTMLElement; sx: number; sy: number; ox: number; oy: number; moved: boolean; x?: number; y?: number } | null = null
  let link: { from: string; port: Port; sx: number; sy: number; moved: boolean; x0: number; y0: number; snap: Snap | null } | null = null
  let justDragged = false
  const suppressClick = () => { justDragged = true; setTimeout(() => { justDragged = false }, 60) }

  bd.addEventListener('pointerdown', (e) => {
    const t = e.target as Element
    const hnd = t.closest<HTMLElement>('[data-act=connect]')
    if (hnd && !(e.button > 0)) {
      const fid = hnd.dataset['for']!, port = hnd.dataset['port'] as Port, p0 = cur.pos[fid]
      if (!p0) return
      e.preventDefault()
      const q0 = portPt(p0, cur.nw, port)
      link = { from: fid, port, sx: e.clientX, sy: e.clientY, moved: false, x0: q0.x, y0: q0.y, snap: null }
      try { hnd.setPointerCapture(e.pointerId) } catch { /* synthetic events have no active pointer */ }
      return
    }
    const b = t.closest<HTMLElement>('[data-node]')
    if (!b || e.button > 0) return
    const p = cur.pos[b.dataset['node']!]
    if (!p) return
    drag = { id: b.dataset['node']!, el: b, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false }
    try { b.setPointerCapture(e.pointerId) } catch { /* see above */ }
  })

  bd.addEventListener('pointermove', (e) => {
    if (link) {
      if (!link.moved && Math.abs(e.clientX - link.sx) + Math.abs(e.clientY - link.sy) < 6) return
      link.moved = true; bd.classList.add('linking')
      const sv = document.getElementById('edgeSvg'), r = bd.getBoundingClientRect()
      const px = e.clientX - r.left, py = e.clientY - r.top
      link.snap = snapPort(cur.pos, cur.nw, px, py, link.from, link.x0, link.y0)
      bd.querySelectorAll('.snap').forEach((x) => x.classList.remove('snap'))
      const p1 = { x: link.x0, y: link.y0 }, n1 = NORM[link.port]
      let p2: Pt = { x: px, y: py }, n2: readonly [number, number] | null = null
      if (link.snap) {
        bd.querySelector(`[data-node="${link.snap.id}"]`)?.classList.add('snap')
        bd.querySelector(`.handle[data-for="${link.snap.id}"][data-port="${link.snap.port}"]`)?.classList.add('snap')
        const q = portPt(cur.pos[link.snap.id]!, cur.nw, link.snap.port)
        n2 = NORM[link.snap.port]
        p2 = { x: q.x + n2[0] * 1.5, y: q.y + n2[1] * 1.5 }
      }
      let rb: Element | null = document.getElementById('rubber')
      if (!rb && sv) {
        rb = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        rb.setAttribute('id', 'rubber'); rb.setAttribute('class', 'rubber'); rb.setAttribute('fill', 'none')
        rb.setAttribute('stroke', 'var(--accent)'); rb.setAttribute('stroke-width', '2'); rb.setAttribute('marker-end', 'url(#ahSel)')
        sv.appendChild(rb)
      }
      rb?.setAttribute('d', curveTo(p1, n1, p2, n2))
      return
    }
    if (!drag) return
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 8) return
    drag.moved = true
    drag.x = Math.max(0, Math.min(cur.W - cur.nw, drag.ox + dx)); drag.y = Math.max(0, drag.oy + dy)
    drag.el.style.left = `${drag.x}px`; drag.el.style.top = `${drag.y}px`
    placeHandles(drag.id, { x: drag.x, y: drag.y })
    cur.pos[drag.id] = { x: drag.x, y: drag.y }
    const noteEl = document.querySelector<HTMLElement>(`[data-note="${drag.id}"]`)
    if (noteEl) noteEl.style.cssText = noteStyle(drag.id)
    refreshEdges()
    const H = canvasHeight(cur.pos); cur.H = H; bd.style.height = `${H}px`
    document.getElementById('edgeSvg')?.setAttribute('height', String(H))
    document.getElementById('labelSvg')?.setAttribute('height', String(H))
  })

  bd.addEventListener('pointerup', () => {
    if (link) {
      const l = link; link = null
      document.getElementById('rubber')?.remove()
      bd.classList.remove('linking')
      bd.querySelectorAll('.snap').forEach((x) => x.classList.remove('snap'))
      if (l.moved) {
        suppressClick()
        if (l.snap && l.snap.id !== l.from) connect(l.from, l.snap.id, l.port, l.snap.port)
      }
      return
    }
    if (!drag) return
    const d = drag; drag = null
    if (d.moved && d.x !== undefined && d.y !== undefined) { suppressClick(); moveNode(d.id, d.x, d.y) }
  })
  bd.addEventListener('pointercancel', () => { drag = null; link = null; render() })

  /* keyboard on a focused arrow: Enter/F2 labels it, arrows cycle through arrows, Escape returns to the box */
  let edgeOrigin: string | null = null
  function edgeKey(e: KeyboardEvent, id: string): void {
    const edges = getState().edges
    const i = edges.findIndex((x) => x.id === id)
    if (i < 0) return
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); beginEdgeLabel(id); return }
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (step) {
      e.preventDefault()
      const nx = edges[(i + step + edges.length) % edges.length]!
      ui.selEdge = nx.id; ui.pendingFocus = `edge:${nx.id}`; render()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      const back = edgeOrigin && getState().nodes.some((n) => n.id === edgeOrigin) ? edgeOrigin : edges[i]!.a
      ui.selEdge = null; ui.sel = back; ui.pendingFocus = back; render()
    }
  }

  /* keyboard on a focused box */
  bd.addEventListener('keydown', (e) => {
    const t = e.target as Element
    const eh = t.closest<SVGElement>('path[data-edge]')
    if (eh) { edgeKey(e, eh.dataset['edge']!); return }
    const b = t.closest<HTMLElement>('[data-node]')
    if (!b || t.id === 'nameInp') return
    const nid = b.dataset['node']!
    if ((e.key === 'n' || e.key === 'N') && !(e.ctrlKey || e.metaKey || e.altKey)) { e.preventDefault(); beginNote(nid); return }
    if ((e.key === 'e' || e.key === 'E') && !(e.ctrlKey || e.metaKey || e.altKey)) {
      e.preventDefault()
      const s0 = getState()
      const first = s0.edges.find((x) => x.a === nid) ?? s0.edges.find((x) => x.b === nid)
      if (!first) { say(`${nodeName(s0, nid)} has no arrows.`); return }
      edgeOrigin = nid; ui.sel = null; ui.selEdge = first.id; ui.pendingFocus = `edge:${first.id}`; render(); return
    }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); ui.sel = nid; ui.selEdge = null; ui.connectFrom = null; ui.editing = true; ui.pendingFocus = 'NAME'; render(); return }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeNode(nid); return }
    if (e.key === 'c' || e.key === 'C') {
      if (e.ctrlKey || e.metaKey) return
      e.preventDefault(); ui.sel = nid; ui.selEdge = null; ui.editing = false; ui.connectFrom = nid; ui.pendingFocus = nid; render()
      say(`Choose the box that ${nodeName(getState(), nid)} sends data to.`); return
    }
    const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key]
    if (!dir) return
    e.preventDefault()
    const p = cur.pos[nid]!, st = e.shiftKey ? 48 : 16
    moveNode(nid, Math.max(0, Math.min(cur.W - cur.nw, p.x + dir[0] * st)), Math.max(0, p.y + dir[1] * st))
  })

  /* clicks: connect mode, select arrow, select box, tap-timing double-tap to rename */
  let lastTap: { id: string | null; t: number } = { id: null, t: 0 }
  bd.addEventListener('click', (e) => {
    if (justDragged) return
    const t = e.target as Element
    const h = t.closest<HTMLElement>('[data-act=connect]')
    if (h) {
      const hid = h.dataset['for']!
      if (ui.connectFrom) { ui.pendingFocus = ui.connectFrom; ui.connectFrom = null; render(); say('Connection cancelled.') }
      else { ui.sel = hid; ui.selEdge = null; ui.editing = false; ui.connectFrom = hid; ui.connectPort = h.dataset['port'] ?? null; ui.pendingFocus = hid; render(); say(`Choose the box that ${nodeName(getState(), hid)} sends data to.`) }
      return
    }
    const nbtn = t.closest<HTMLElement>('[data-act=note]')
    if (nbtn) { beginNote(nbtn.dataset['for']!); return }
    const noteEl = t.closest<HTMLElement>('[data-note]')
    if (noteEl) { beginNote(noteEl.dataset['note']!); return }
    const ed = t.closest<Element>('[data-edge]')
    if (ed) {
      const eid = (ed as HTMLElement | SVGElement).dataset['edge']!
      const now = Date.now()
      // Same tap-timing rule as boxes: the first click re-renders, so native dblclick is unreliable.
      if (lastTap.id === `edge:${eid}` && ui.selEdge === eid && now - lastTap.t < 450) { lastTap = { id: null, t: 0 }; beginEdgeLabel(eid); return }
      lastTap = { id: `edge:${eid}`, t: now }
      ui.selEdge = eid; ui.sel = null; ui.editing = false; ui.connectFrom = null
      // Focus the arrow so Enter/F2 (label) and Delete work right after a click, like on a selected box.
      ui.pendingFocus = `edge:${eid}`; render(); return
    }
    const b = t.closest<HTMLElement>('[data-node]')
    if (!b) {
      if (t.closest('#board') && (ui.sel || ui.selEdge)) { resetSelection(); render() }
      return
    }
    const id = b.dataset['node']!
    if (ui.connectFrom) {
      if (ui.connectFrom === id) { ui.connectFrom = null; ui.pendingFocus = id; render(); say('Connection cancelled.') }
      else { const a = ui.connectFrom, ap = ui.connectPort as Port | null; ui.connectFrom = null; ui.connectPort = null; connect(a, id, ap ?? undefined, undefined) }
      return
    }
    const now = Date.now()
    if (lastTap.id === id && now - lastTap.t < 450) { lastTap = { id: null, t: 0 }; ui.sel = id; ui.selEdge = null; ui.editing = true; ui.pendingFocus = 'NAME'; render(); return }
    lastTap = { id, t: now }
    ui.selEdge = null; ui.editing = false; ui.sel = ui.sel === id ? null : id; ui.pendingFocus = id; render()
  })
  bd.addEventListener('dblclick', (e) => {
    const eid = (e.target as Element).closest<Element>('[data-edge]')
    if (eid) { beginEdgeLabel((eid as HTMLElement | SVGElement).dataset['edge']!); return }
    const b = (e.target as Element).closest<HTMLElement>('[data-node]')
    if (!b || ui.connectFrom) return
    ui.sel = b.dataset['node']!; ui.selEdge = null; ui.editing = true; ui.pendingFocus = 'NAME'; render()
  })

  /* rename: the input carries the id of the box it edits (an old bug saved to the wrong box) */
  function endEdit(inp: HTMLInputElement, save: boolean): void {
    const id = inp.dataset['for']!
    const n = getState().nodes.find((x) => x.id === id)
    if (ui.sel === id) ui.editing = false
    const btn = n ? document.querySelector<HTMLElement>(`[data-node="${id}"]`) : null
    const v = inp.value.trim()
    inp.dataset['done'] = '1'
    if (n && save && v && v !== n.label) {
      record('NodeRenamed', { id, label: v })
      const sp = btn?.querySelector('span')
      if (btn && sp) { sp.textContent = v; btn.setAttribute('aria-label', v + (btn.getAttribute('aria-label') ?? '').slice(n.label.length)) }
      renderChat(); renderDetails(getState()); say(`Renamed to ${v}.`)
    }
    btn?.classList.remove('editing')
    inp.remove()
  }
  /* arrow label: Enter or blur saves, Escape reverts. Patches only the arrow layer so a click elsewhere is not lost. */
  function endEdgeEdit(inp: HTMLInputElement, save: boolean): void {
    const id = inp.dataset['for']!
    const edge = getState().edges.find((x) => x.id === id)
    inp.dataset['done'] = '1'
    ui.editingEdge = null
    const v = inp.value.trim()
    if (edge && save && v !== (edge.label ?? '')) {
      record('EdgeLabeled', { id, label: v })
      renderDetails(getState())
      say(v ? `Labelled ${nodeName(getState(), edge.a)} to ${nodeName(getState(), edge.b)} ${v}.` : 'Label removed.')
    }
    inp.remove()
    cur = { ...cur, s: getState() }
    refreshEdges()
  }

  /* node note: Enter or blur saves, Shift+Enter adds a line, Escape reverts. */
  function endNoteEdit(ta: HTMLTextAreaElement, save: boolean): void {
    const id = ta.dataset['for']!
    const n = getState().nodes.find((x) => x.id === id)
    ta.dataset['done'] = '1'
    ui.editingNote = null
    const text = ta.value.replace(/\s+$/, '')
    const was = n?.note ?? ''
    if (n && save && (text.trim() ? text : '') !== was) {
      record('NodeNoteUpdated', { id, text })
      renderDetails(getState())
      say(text.trim() ? `Note saved on ${n.label}.` : `Note removed from ${n.label}.`)
    }
    ta.remove()
    cur = { ...cur, s: getState() }
    const layer = document.getElementById('notes'); if (layer) layer.innerHTML = notesMarkup()
    const now = getState().nodes.find((x) => x.id === id)
    const btn = document.querySelector<HTMLElement>(`[data-node="${id}"]`)
    if (now && btn) btn.setAttribute('aria-label', nodeDesc(getState(), now))
    const nb = document.querySelector<HTMLElement>(`.noteBtn[data-for="${id}"]`)
    if (nb) nb.hidden = !!now?.note
  }

  bd.addEventListener('focusout', (e) => {
    const t = e.target as HTMLInputElement
    if (t.dataset['done']) return
    if (t.id === 'nameInp') endEdit(t, true)
    else if (t.id === 'edgeInp') endEdgeEdit(t, true)
    else if (t.id === 'noteInp') endNoteEdit(t as unknown as HTMLTextAreaElement, true)
  })
  bd.addEventListener('keydown', (e) => {
    const t = e.target as HTMLInputElement
    if (t.id === 'edgeInp') {
      const eid = t.dataset['for']!
      const back = () => document.querySelector<SVGElement>(`path[data-edge="${eid}"]`)?.focus()
      if (e.key === 'Enter') { e.preventDefault(); endEdgeEdit(t, true); back() }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endEdgeEdit(t, false); back() }
      return
    }
    if (t.id === 'noteInp') {
      const nid = t.dataset['for']!
      const back = () => document.querySelector<HTMLElement>(`[data-node="${nid}"]`)?.focus()
      const ta = t as unknown as HTMLTextAreaElement
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); endNoteEdit(ta, true); back() }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endNoteEdit(ta, false); back() }
      return
    }
    if (t.id !== 'nameInp') return
    const nid = t.dataset['for']!
    const back = () => document.querySelector<HTMLElement>(`[data-node="${nid}"]`)?.focus()
    if (e.key === 'Enter') { e.preventDefault(); endEdit(t, true); back() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endEdit(t, false); back() }
  })

  /* global keys */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (!$('picker').hidden) { closePicker(); $('addBtn').focus() }
    else if (ui.connectFrom) { ui.pendingFocus = ui.connectFrom; ui.connectFrom = null; render() }
  })
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || ui.reportOpen) return
    const k = (e.key || '').toLowerCase(), t = e.target as HTMLElement
    if (k !== 'c' && k !== 'v') return
    if (/INPUT|TEXTAREA|SELECT/.test(t.tagName || '') || t.isContentEditable) return
    if (document.querySelector('dialog[open]') || !$('picker').hidden) return
    if (k === 'c') { if (window.getSelection && String(window.getSelection())) return; if (copyNode()) e.preventDefault() }
    else if (pasteNode()) e.preventDefault()
  })
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || ui.reportOpen || (e.key || '').toLowerCase() !== 'z') return
    const t = e.target as HTMLElement
    // Inside a text field the browser's own undo of typing wins.
    if (/INPUT|TEXTAREA|SELECT/.test(t.tagName || '') || t.isContentEditable) return
    if (document.querySelector('dialog[open]') || !$('picker').hidden) return
    e.preventDefault()
    undoRedo(e.shiftKey ? 'redo' : 'undo')
  })
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement
    if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selEdge && !/INPUT|TEXTAREA/.test(t.tagName || '')) {
      e.preventDefault(); const id = ui.selEdge; ui.selEdge = null; removeEdge(id)
    }
  })
}
