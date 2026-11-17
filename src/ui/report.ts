import { buildReport, renderHtml, renderLatex } from '../core/report'
import { $ } from './dom'
import { copyText } from './details'
import { refreshReplay } from './replay'
import { getLog, render, ui } from './store'

/** Mermaid is bundled but loaded only when a report is opened, so the board stays light. */
async function drawMermaid(el: HTMLElement | null, code: string): Promise<void> {
  if (!el) return
  try {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false, theme: 'default' })
    const { svg } = await mermaid.render(`mm${Math.random().toString(36).slice(2)}`, code)
    el.innerHTML = svg
  } catch {
    // The Mermaid source is printed under the diagram, so a failed render loses nothing.
  }
}

export function renderReport(): void {
  refreshReplay($('replayReport'))
  const r = buildReport(getLog())
  $('reportBody').innerHTML = renderHtml(r)
  $<HTMLTextAreaElement>('texSrc').value = renderLatex(r)
  void drawMermaid(document.getElementById('mmFinal'), r.finalMermaid)
  if (r.reference) void drawMermaid(document.getElementById('mmRef'), r.reference.mermaid)
}

export function openReport(): void {
  ui.reportOpen = true
  render()
  $('reportH').focus()
}

export function initReport(): void {
  $('backBtn').onclick = () => { ui.reportOpen = false; ui.pendingFocus = 'ADD'; render() }
  $('copyTex').onclick = function () { const t = $<HTMLTextAreaElement>('texSrc'); copyText(t.value, this as HTMLElement, t) }
}
