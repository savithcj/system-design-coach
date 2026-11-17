import { STICKY_W, stickySlot } from '../core/layout'
import { escapeHtml as esc } from '../core/text'
import type { State } from '../core/state'
import { $, say } from './dom'
import { getState, record, render, seqNext, ui } from './store'

/** Floating notes: free text anywhere on the canvas. Each change is an event, so undo and replay cover them. */

const px = (fx: number, W: number) => Math.min(1, Math.max(0, fx)) * Math.max(0, W - STICKY_W)

function boardW(): number { return Math.max(260, $('boardCol').clientWidth) }

export function stickiesMarkup(s: State, W: number): string {
  const one = (x: { id: string; fx: number; y: number; text: string }) => {
    const style = `left:${px(x.fx, W)}px;top:${x.y}px;width:${STICKY_W}px`
    if (ui.editingSticky === x.id) return `<textarea id="stickyInp" class="stickyEdit" data-for="${x.id}" aria-label="Floating note" style="${style}">${esc(x.text)}</textarea>`
    return `<button type="button" class="sticky" data-sticky="${x.id}" aria-keyshortcuts="Enter F2 Delete" aria-label="${esc(`Floating note: ${x.text}. Press Enter to edit, arrow keys to move, Delete to remove.`)}" style="${style}">${esc(x.text)}</button>`
  }
  const d = ui.draftSticky
  const draft = d ? `<textarea id="stickyInp" class="stickyEdit" data-for="${d.id}" data-draft="1" aria-label="New floating note" style="left:${px(d.fx, W)}px;top:${d.y}px;width:${STICKY_W}px;height:28px"></textarea>` : ''
  return `<div id="stickies">${s.stickies.map(one).join('')}${draft}</div>`
}

/** The edit box grows with its text, like free text in a drawing tool. */
export function fitSticky(ta: HTMLTextAreaElement): void { ta.style.height = 'auto'; ta.style.height = `${Math.max(28, ta.scrollHeight)}px` }

export function startSticky(): void {
  const s = getState()
  const slot = stickySlot(s.nodes, s.stickies, boardW())
  ui.draftSticky = { id: `s${seqNext()}`, ...slot }; ui.editingSticky = null
  ui.pendingFocus = 'STICKYINP'
  render()
}

/** `refocus` is true for Enter and Escape only: a blur means focus is already going somewhere the learner chose. */
function finish(ta: HTMLTextAreaElement, save: boolean, refocus: boolean): void {
  if (ta.dataset['done']) return
  ta.dataset['done'] = '1'
  const id = ta.dataset['for']!
  const text = ta.value.replace(/\s+$/, '')
  const had = getState().stickies.find((x) => x.id === id)
  const draft = ui.draftSticky?.id === id ? ui.draftSticky : null
  ui.draftSticky = null; ui.editingSticky = null
  if (save && draft && text.trim()) { record('StickyAdded', { id, fx: draft.fx, y: draft.y, text }); say('Added a floating note.') }
  else if (save && had && !text.trim()) { record('StickyDeleted', { id }); say('Removed the floating note.') }
  else if (save && had && text !== had.text) { record('StickyEdited', { id, text }); say('Floating note saved.') }
  if (refocus) ui.pendingFocus = had || (draft && text.trim()) ? `sticky:${id}` : 'NOTEBTN'
  render()
}

function move(id: string, x: number, y: number): void {
  const fx = Math.max(0, Math.min(1, x / Math.max(1, boardW() - STICKY_W)))
  record('StickyMoved', { id, fx, y: Math.max(0, Math.round(y)) })
  ui.pendingFocus = `sticky:${id}`
  render()
}

export function initStickies(): void {
  $('noteBtn').addEventListener('click', startSticky)
  const bd = $('board')
  let drag: { id: string; el: HTMLElement; sx: number; sy: number; ox: number; oy: number; moved: boolean; x?: number; y?: number } | null = null
  let just = false

  bd.addEventListener('pointerdown', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-sticky]')
    if (!b || e.button > 0) return
    const st = getState().stickies.find((x) => x.id === b.dataset['sticky'])
    if (!st) return
    drag = { id: st.id, el: b, sx: e.clientX, sy: e.clientY, ox: px(st.fx, boardW()), oy: st.y, moved: false }
    try { b.setPointerCapture(e.pointerId) } catch { /* synthetic events have no active pointer */ }
  })
  bd.addEventListener('pointermove', (e) => {
    if (!drag) return
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 8) return
    drag.moved = true
    drag.x = Math.max(0, Math.min(boardW() - STICKY_W, drag.ox + dx)); drag.y = Math.max(0, drag.oy + dy)
    drag.el.style.left = `${drag.x}px`; drag.el.style.top = `${drag.y}px`
  })
  bd.addEventListener('pointerup', () => {
    if (!drag) return
    const d = drag; drag = null
    if (d.moved && d.x !== undefined && d.y !== undefined) { just = true; setTimeout(() => { just = false }, 60); move(d.id, d.x, d.y) }
  })
  bd.addEventListener('pointercancel', () => { drag = null })

  // Registered before the board's own click handler; a click on a note must not also clear the box selection.
  bd.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-sticky]')
    if (!b) return
    e.stopImmediatePropagation()
    if (just) return
    ui.editingSticky = b.dataset['sticky']!; ui.draftSticky = null; ui.pendingFocus = 'STICKYINP'
    render()
  })

  bd.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement
    if (t.id === 'stickyInp') {
      const ta = t as HTMLTextAreaElement
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(ta, true, true) }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(ta, false, true) }
      return
    }
    const b = t.closest<HTMLElement>('[data-sticky]')
    if (!b) return
    const id = b.dataset['sticky']!
    const st = getState().stickies.find((x) => x.id === id)
    if (!st) return
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); ui.editingSticky = id; ui.pendingFocus = 'STICKYINP'; render(); return }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      record('StickyDeleted', { id }); say('Removed the floating note.'); ui.pendingFocus = 'NOTEBTN'; render(); return
    }
    const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key]
    if (!dir) return
    e.preventDefault()
    const step = e.shiftKey ? 48 : 16
    move(id, Math.max(0, Math.min(boardW() - STICKY_W, px(st.fx, boardW()) + dir[0] * step)), Math.max(0, st.y + dir[1] * step))
  })
  bd.addEventListener('input', (e) => { const t = e.target as HTMLTextAreaElement; if (t.id === 'stickyInp') fitSticky(t) })
  bd.addEventListener('focusout', (e) => {
    const t = e.target as HTMLTextAreaElement
    if (t.id === 'stickyInp') finish(t, true, false)
  })
}
