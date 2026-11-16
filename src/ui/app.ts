import { PROBLEMS, problemById } from '../problems'
import { $, syncRove } from './dom'
import { initBoard, renderBoard } from './board'
import { initChat, renderChat } from './chat'
import { initDetails, renderDetails } from './details'
import { initReport, renderReport } from './report'
import { initResizer } from './resizer'
import { getState, loadProblem, setRenderer, ui } from './store'
import { initTopbar, syncSeg } from './topbar'

function render(): void {
  const s = getState()
  $('designView').hidden = ui.reportOpen
  $('reportView').hidden = !ui.reportOpen
  $('finishBtn').hidden = ui.reportOpen
  $('prompt').textContent = problemById(s.problemId).prompt
  syncSeg(s.problemId)
  $('tidyBtn').hidden = s.nodes.length < 2 || !s.edges.length
  syncRove($('toolbar'), '.btn')
  if (ui.reportOpen) { renderReport(); return }
  renderBoard(s); renderChat(); renderDetails(s)
  if (ui.pendingFocus) {
    const f = ui.pendingFocus === 'ADD' ? $('addBtn') : ui.pendingFocus === 'NAME' ? document.getElementById('nameInp') : document.querySelector<HTMLElement>(`[data-node="${ui.pendingFocus}"]`)
    if (f) { f.focus(); if (ui.pendingFocus === 'NAME') (f as HTMLInputElement).select() }
    ui.pendingFocus = null
  }
}

export function startApp(): void {
  setRenderer(render)
  initTopbar(); initBoard(); initChat(); initDetails(); initReport(); initResizer()
  loadProblem(PROBLEMS[0]!.id)
}
