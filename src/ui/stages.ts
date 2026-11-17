import { STAGES, formatClock, stageTimes } from '../core/stages'
import { coachTurn } from './coach'
import { $, rove, say } from './dom'
import { dispatch, getLog, getState, openStageBlocks, render } from './store'

/** Quiet clock on the current stage only. Cumulative, so returning to a stage keeps counting from where it left off. */
function tick(): void {
  const stage = getState().stage
  const el = document.querySelector<HTMLElement>(`#stages [data-stage="${stage}"] .stagetime`)
  if (el) el.textContent = formatClock(stageTimes(getLog(), Date.now())[stage - 1]!)
}

export function syncStages(): void {
  const stage = getState().stage
  document.querySelectorAll<HTMLElement>('#stages [role=radio]').forEach((b) => {
    const on = Number(b.dataset['stage']) === stage
    b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1
    b.querySelector<HTMLElement>('.stagetime')!.hidden = !on
  })
  tick()
}

export function initStages(): void {
  const pill = $('stages')
  for (const g of STAGES) {
    const b = document.createElement('button')
    b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset['stage'] = String(g.n)
    // The clock is decorative for screen readers: a ticking name would be re-announced on every focus.
    b.innerHTML = `<span class="sn">${g.n}</span>${g.label}<span class="stagetime" aria-hidden="true" hidden></span>`
    pill.appendChild(b)
  }
  pill.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[role=radio]')
    if (!b) return
    const n = Number(b.dataset['stage'])
    openStageBlocks(n)
    if (n === getState().stage) render()
    else {
      const from = getState().stage
      dispatch('StageChanged', { stage: n })
      coachTurn({ kind: 'stage', from, to: n })
    }
    say(`Stage ${n}, ${STAGES[n - 1]!.label}.`)
  })
  // Arrow keys only move focus; Enter or Space chooses. Choosing is an event, so it should be deliberate.
  rove(pill, '[role=radio]', false)
  setInterval(tick, 1000)
}
