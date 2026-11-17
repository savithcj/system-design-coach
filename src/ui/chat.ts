import { chatFeed } from '../core/report'
import { escapeHtml as esc } from '../core/text'
import { $ } from './dom'
import { coachTurn } from './coach'
import { dispatch, getLog, sessionToken } from './store'

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
  $('chatForm').addEventListener('submit', (e) => {
    e.preventDefault()
    const inp = $<HTMLInputElement>('chatInp')
    const text = inp.value.trim()
    // Chat is "ask the coach" only: the text is never parsed for intent; the coach answers with its best move.
    if (text) { dispatch('UserMessaged', { text }); inp.value = ''; coachTurn({ kind: 'chat' }) }
    inp.focus()
  })
  $('stuckBtn').addEventListener('click', () => coachTurn({ kind: 'stuck' }))
}
