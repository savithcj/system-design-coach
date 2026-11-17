import { startModel } from '../model/manager'
import { PROBLEMS, problemById } from '../problems'
import { $, syncRove } from './dom'
import { scheduleRuleSync } from './coach'
import { initBoard, renderBoard } from './board'
import { fitSticky } from './stickies'
import { initContract, syncContract } from './contract'
import { initStages, syncStages } from './stages'
import { initChat, renderChat } from './chat'
import { initDetails, renderDetails } from './details'
import { initReport, renderReport } from './report'
import { initResizer } from './resizer'
import { getState, loadProblem, setRenderer, setUserEventHook, ui } from './store'
import { initTopbar, syncSeg } from './topbar'

function render(): void {
  const s = getState()
  $('designView').hidden = ui.reportOpen
  $('reportView').hidden = !ui.reportOpen
  $('finishBtn').hidden = ui.reportOpen
  $('prompt').textContent = problemById(s.problemId).prompt
  syncSeg(s.problemId)
  syncStages(); syncContract(s)
  $('tidyBtn').hidden = s.nodes.length < 2 || !s.edges.length
  syncRove($('toolbar'), '.btn')
  if (ui.reportOpen) { renderReport(); return }
  renderBoard(s); renderChat(); renderDetails(s)
  if (ui.pendingFocus) {
    const pf = ui.pendingFocus
    const f: HTMLElement | SVGElement | null =
      pf === 'ADD' ? $('addBtn')
      : pf === 'NAME' ? document.getElementById('nameInp')
      : pf === 'EDGENAME' ? document.getElementById('edgeInp')
      : pf === 'NOTE' ? document.getElementById('noteInp')
      : pf === 'STICKYINP' ? document.getElementById('stickyInp')
      : pf === 'NOTEBTN' ? $('noteBtn')
      : pf.startsWith('sticky:') ? document.querySelector<HTMLElement>(`[data-sticky="${pf.slice(7)}"]`)
      : pf.startsWith('edge:') ? document.querySelector<SVGElement>(`path[data-edge="${pf.slice(5)}"]`)
      : document.querySelector<HTMLElement>(`[data-node="${pf}"]`)
    if (f) {
      f.focus()
      if (pf === 'NAME' || pf === 'EDGENAME') (f as HTMLInputElement).select()
      else if (pf === 'STICKYINP') { fitSticky(f as HTMLTextAreaElement); (f as HTMLTextAreaElement).setSelectionRange((f as HTMLTextAreaElement).value.length, (f as HTMLTextAreaElement).value.length) }
      else if (pf === 'NOTE') { const ta = f as HTMLTextAreaElement; ta.setSelectionRange(ta.value.length, ta.value.length) }
    }
    ui.pendingFocus = null
  }
}

export function startApp(): void {
  setRenderer(render)
  setUserEventHook(scheduleRuleSync)
  initTopbar(); initStages(); initContract(); initBoard(); initChat(); initDetails(); initReport(); initResizer()
  startModel()
  loadProblem(PROBLEMS[0]!.id)
}
