import { serializeLog } from '../core/events'
import { boardMermaid } from '../core/mermaid'
import type { State } from '../core/state'
import { $, say } from './dom'
import { getLog, loadProblem, currentProblemId } from './store'

export function renderDetails(s: State): void {
  $('mmSrc').textContent = s.nodes.length ? boardMermaid(s) : '(empty board)'
  $('evLog').textContent = getLog().map((e) => JSON.stringify({ seq: e.seq, actor: e.actor, type: e.type, payload: e.payload })).join('\n')
}

/** Copy to the clipboard; if that is blocked, fall back to selecting the visible textarea. */
export function copyText(text: string, btn: HTMLElement, fallback: HTMLTextAreaElement | null): void {
  const old = btn.textContent
  const done = (label: string, ms: number) => { btn.textContent = label; setTimeout(() => { btn.textContent = old }, ms) }
  const p = navigator.clipboard?.writeText ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'))
  p.then(() => { done('Copied', 1500); say('Copied.') }).catch(() => {
    if (fallback) { ($('texDetails') as HTMLDetailsElement).open = true; fallback.focus(); fallback.select() }
    done('Select and copy', 2000)
  })
}

export function initDetails(): void {
  const dlg = $<HTMLDialogElement>('detailsDlg')
  const close = () => { if (dlg.close) dlg.close(); else dlg.removeAttribute('open') }
  $('detailsBtn').onclick = () => { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '') }
  $('detClose').onclick = close
  $('copyEv').onclick = function () { copyText(serializeLog(getLog()), this as HTMLElement, null) }
  $('restart').onclick = () => { close(); const id = currentProblemId(); if (id) loadProblem(id, true) }
}
