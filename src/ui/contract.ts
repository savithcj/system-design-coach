import type { ContractBlock } from '../core/events'
import { CONTRACT_BLOCKS, CONTRACT_TITLES, STAGES } from '../core/stages'
import type { State } from '../core/state'
import { $ } from './dom'
import { renderDetails } from './details'
import { getState, record, ui } from './store'

const LABELS: Readonly<Record<ContractBlock, string>> = {
  functional: 'Functional requirements',
  outofscope: 'Out of scope',
  nonfunctional: 'Non-functional requirements',
  entities: 'Core entities',
  api: 'API and data flow',
}

/** Typing is saved this long after the last keystroke, and immediately on blur. */
const DEBOUNCE_MS = 400

const BULLET = '•'

/** Inserts through the editing pipeline so the browser's own undo still works. */
function insert(ta: HTMLTextAreaElement, text: string): void {
  if (!document.execCommand('insertText', false, text)) { ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })) }
}

/** Every line of a notes box is a bullet: focus starts one, Enter adds one, Enter or Backspace on an empty one ends it. */
function wireBullets(ta: HTMLTextAreaElement): void {
  ta.addEventListener('focus', () => {
    if (ta.value.trim() === '') { ta.value = `${BULLET} `; ta.setSelectionRange(ta.value.length, ta.value.length) }
  })
  ta.addEventListener('keydown', (e) => {
    if (e.isComposing || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || ta.selectionStart !== ta.selectionEnd) return
    const at = ta.selectionStart
    const lineStart = ta.value.lastIndexOf('\n', at - 1) + 1
    const before = ta.value.slice(lineStart, at)
    if (e.key === 'Enter') {
      e.preventDefault()
      if (before.trim() === BULLET) { ta.setSelectionRange(lineStart, at); insert(ta, '') } // Enter on an empty bullet ends the list
      else insert(ta, `\n${BULLET} `)
    } else if (e.key === 'Backspace' && before === `${BULLET} `) {
      e.preventDefault()
      ta.setSelectionRange(Math.max(0, lineStart - 1), at) // the bullet and the line break before it
      insert(ta, '')
    }
  })
}

const area = (b: ContractBlock) => $<HTMLTextAreaElement>(`cnote-${b}`)

/**
 * Typing never re-renders the board or touches focus: the panel is built once, input only schedules an event, and
 * syncContract() below only toggles attributes (and refreshes a field that is not being typed in).
 */
export function initContract(): void {
  const host = $('contract')
  for (const b of CONTRACT_BLOCKS) {
    const wrap = document.createElement('div')
    wrap.className = 'cblock'; wrap.dataset['block'] = b
    wrap.innerHTML = `<h3 class="sr-h"><button type="button" class="chead" id="chead-${b}" aria-expanded="false" aria-controls="cbody-${b}">${CONTRACT_TITLES[b]}</button></h3>` +
      `<div id="cbody-${b}" hidden><textarea id="cnote-${b}" class="cnote" aria-label="${LABELS[b]}" rows="5" spellcheck="true"></textarea></div>`
    host.appendChild(wrap)

    let timer: ReturnType<typeof setTimeout> | undefined
    const commit = () => {
      clearTimeout(timer); timer = undefined
      // A bullet with nothing after it is not content (an untouched box is just "• ").
      const text = area(b).value.split('\n').filter((l) => l.trim() !== BULLET).join('\n')
      if (text === getState().contract[b]) return
      record('ContractNoteUpdated', { block: b, text })
      renderDetails(getState())
    }
    const ta = area(b)
    ta.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(commit, DEBOUNCE_MS) })
    ta.addEventListener('blur', commit)
    wireBullets(ta)
    $(`chead-${b}`).addEventListener('click', () => { ui.open[b] = !ui.open[b]; syncContract(getState()) })
  }
}

export function syncContract(s: State): void {
  const stageBlocks = STAGES[s.stage - 1]?.blocks ?? []
  for (const b of CONTRACT_BLOCKS) {
    const open = ui.open[b]
    $(`chead-${b}`).setAttribute('aria-expanded', String(open))
    $(`cbody-${b}`).hidden = !open
    document.querySelector(`.cblock[data-block="${b}"]`)!.classList.toggle('zone', stageBlocks.includes(b))
    const ta = area(b)
    // Never overwrite a field the learner is typing in; other changes (switching problems, Start over) do land.
    if (document.activeElement !== ta && ta.value !== s.contract[b]) ta.value = s.contract[b]
  }
  // Stages 4 and 5 live on the board, so that is the zone to tint.
  $('boardCol').classList.toggle('zone', stageBlocks.length === 0)
}
