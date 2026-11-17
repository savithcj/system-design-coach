import { chatFeed } from '../core/report'
import { escapeHtml as esc } from '../core/text'
import { onStatus } from '../model/manager'
import { $, say } from './dom'
import { coachTurn } from './coach'
import { dispatch, getLog, sessionToken } from './store'

/** Covers and disables the whole app while the model first loads. The live region says it once, not per percent. */
let veilShown = false
function setVeil(v: { blocking?: boolean; text: string }): void {
  const on = v.blocking === true
  $('veilText').textContent = v.text
  if (on === veilShown) return
  veilShown = on
  $('veil').hidden = !on
  $('appRoot').toggleAttribute('inert', on)
  if (on) $('veil').setAttribute('aria-label', 'Loading coach')
}

let rendered = 0
let renderedFor = -1

/** Appends only new messages, so the log region keeps its scroll position and screen readers read just the new ones. */
export function renderChat(): void {
  const el = $('coach')
  const items = chatFeed(getLog())
  if (renderedFor !== sessionToken() || items.length < rendered) { el.innerHTML = ''; rendered = 0; renderedFor = sessionToken() }
  for (const i of items.slice(rendered)) {
    const d = document.createElement('div')
    d.className = `msg ${i.who}`
    d.innerHTML = `<span class="sr">${i.who === 'coach' ? 'Coach: ' : 'You: '}</span>${esc(i.text)}`
    el.appendChild(d)
  }
  rendered = items.length
  el.scrollTop = el.scrollHeight
}

export function initChat(): void {
  let first = true
  onStatus((v) => {
    setVeil(v)
    $('coachStatus').dataset['dot'] = v.dot
    $('coachStatusText').textContent = v.text
    // Percent updates stay silent; the outcome is announced once.
    if (!first && v.dot !== 'loading') say(v.text)
    first = false
  })
  $('chatForm').addEventListener('submit', (e) => {
    e.preventDefault()
    const inp = $<HTMLInputElement>('chatInp')
    const text = inp.value.trim()
    // Chat is "ask the coach" only: the text is never parsed for intent; the coach answers with its best move.
    if (text) { dispatch('UserMessaged', { text }); inp.value = ''; void coachTurn({ kind: 'chat' }, text) }
    inp.focus()
  })
  $('stuckBtn').addEventListener('click', () => void coachTurn({ kind: 'stuck' }))
}
