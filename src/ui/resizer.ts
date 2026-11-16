import { $ } from './dom'
import { getState, ui } from './store'
import { renderBoard } from './board'

/** Resizable coach panel: drag the handle, or focus it and use the arrow keys. */
export function initResizer(): void {
  const split = $('designView'), sp = $('splitter')
  let cw = 360
  let start: { x: number; w: number } | null = null
  function setW(w: number): void {
    cw = Math.max(300, Math.min(640, w))
    split.style.setProperty('--chat-w', `${cw}px`)
    sp.setAttribute('aria-valuemin', '300'); sp.setAttribute('aria-valuemax', '640'); sp.setAttribute('aria-valuenow', String(cw))
    if (!ui.reportOpen) renderBoard(getState())
  }
  sp.addEventListener('pointerdown', (e) => { start = { x: e.clientX, w: cw }; try { sp.setPointerCapture(e.pointerId) } catch { /* synthetic */ } })
  sp.addEventListener('pointermove', (e) => { if (start) setW(start.w + (start.x - e.clientX)) })
  sp.addEventListener('pointerup', () => { start = null })
  sp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setW(cw + 24) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setW(cw - 24) }
  })
  setW(360)
  let t: ReturnType<typeof setTimeout>
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (!ui.reportOpen) renderBoard(getState()) }, 120) })
}
