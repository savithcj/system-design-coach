import { PROBLEMS } from '../problems'
import { $, rove, syncRove } from './dom'
import { openReport } from './report'
import { currentProblemId, dispatch, getLog, loadProblem } from './store'

export function syncSeg(id: string | null): void {
  document.querySelectorAll<HTMLElement>('#seg [role=radio]').forEach((b) => {
    const on = b.dataset['id'] === id
    b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1
  })
}

export function initTopbar(): void {
  const seg = $('seg')
  for (const p of PROBLEMS) {
    const b = document.createElement('button')
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset['id'] = p.id; b.textContent = p.short
    seg.appendChild(b)
  }
  seg.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[role=radio]')
    if (b && b.dataset['id'] !== currentProblemId()) loadProblem(b.dataset['id']!)
  })
  rove(seg, '[role=radio]', true)
  rove($('toolbar'), '.btn', false)
  $('finishBtn').onclick = () => {
    if (getLog()[getLog().length - 1]?.type !== 'SessionFinished') dispatch('SessionFinished', {})
    openReport()
  }
}

export { syncRove }
