// The practice round: seven steps that teach the tool by doing each part. Pure. Progress is read from the log, never
// from the chat text, and every line is fixed wording (no model).
import type { EventLog } from '../core/events'
import type { State } from '../core/state'

export interface TutorialOpts {
  /** True when the local model is ready, so chat can write to the board. */
  chatEdits: boolean
}

/** `done` reads what the learner has done, not what is on the board now, so the undo step can never take an earlier step back. */
interface Step { text: (o: TutorialOpts) => string; done: (s: State, log: EventLog) => boolean }

const has = (log: EventLog, type: string): boolean => log.some((e) => e.type === type)

export const STEPS: readonly Step[] = [
  {
    text: () => 'Welcome. This is a practice round, so nothing is graded. Start with the notes on the left: click Functional and type something a bookmark saver must do, like “save a link”. Press Enter for the next bullet.',
    done: (_s, log) => log.some((e) => e.type === 'ContractNoteUpdated' && (e.payload as { block?: string; text?: string }).block === 'functional' && ((e.payload as { text?: string }).text ?? '').trim() !== ''),
  },
  {
    text: (o) => o.chatEdits
      ? 'Now try the chat. Type “it should also let people delete a link” and press Enter. The coach writes it into your notes for you, and you can undo it.'
      : 'Now try the chat. Type anything, like “what should I add next?”, and press Enter. The coach answers in words.',
    done: (_s, log) => has(log, 'UserMessaged'),
  },
  {
    text: (o) => `Boards hold components. Press + Add component, choose Client, and name it “Phone”.${o.chatEdits ? ' Or tell the chat: “add a phone client”.' : ''}`,
    done: (_s, log) => has(log, 'NodeAdded'),
  },
  {
    text: () => 'Add one more, such as a Server called “API”, then connect them: drag from a dot on the edge of one box onto the other. With the keyboard, select a box, press C, then pick the target.',
    done: (_s, log) => has(log, 'EdgeAdded'),
  },
  {
    text: () => 'Press Note to put a loose thought anywhere on the canvas. Type anything and press Enter, then drag it where you like.',
    done: (_s, log) => has(log, 'StickyAdded'),
  },
  {
    text: () => 'Made a mistake? Click an empty spot on the board and press Ctrl+Z (Cmd+Z on a Mac). Everything can be undone, including what the coach adds from chat.',
    done: (_s, log) => has(log, 'UserActionUndone'),
  },
  {
    text: () => 'If you are ever stuck, press Stuck? for a hint. Press it again for a stronger one. Try it now.',
    done: (_s, log) => has(log, 'HintRequested'),
  },
]

export const FINISH_LINE = 'That is the whole tool. Stuck? gets more direct each time you press it. Press Finish to see your study guide, then pick a real problem at the top.'
const ID = 'tutorial:'

/** How many steps, in order, are already done. A step finished out of order waits for the ones before it. */
export function tutorialProgress(s: State, log: EventLog): number {
  let n = 0
  while (n < STEPS.length && STEPS[n]!.done(s, log)) n++
  return n
}

/** The highest step the coach has already announced in this session, or -1. Read from the log, so it survives undo. */
export function announcedStep(log: EventLog): number {
  let top = -1
  for (const e of log) {
    const id = e.type === 'CoachResponded' ? (e.payload as { ruleId?: string }).ruleId : undefined
    if (id?.startsWith(ID)) top = Math.max(top, Number(id.slice(ID.length)))
  }
  return top
}

export interface TutorialLine { step: number; message: string; ruleId: string }
const line = (step: number, message: string): TutorialLine => ({ step, message, ruleId: `${ID}${step}` })
const prefix = (n: number): string => `Step ${n + 1} of ${STEPS.length}. `

/** The next line to say when the learner has moved on, or null when there is nothing new. */
export function tutorialAnnounce(s: State, log: EventLog, o: TutorialOpts): TutorialLine | null {
  const p = tutorialProgress(s, log)
  if (p <= announcedStep(log)) return null
  return p >= STEPS.length ? line(STEPS.length, FINISH_LINE) : line(p, `${prefix(p)}${STEPS[p]!.text(o)}`)
}

/** Said when the learner chats or presses Stuck? and nothing has moved on: the current step again, without repeating it word for word. */
export function tutorialRemind(s: State, log: EventLog, o: TutorialOpts): TutorialLine {
  const p = tutorialProgress(s, log)
  if (p >= STEPS.length) return line(STEPS.length, FINISH_LINE)
  return line(Math.max(p, announcedStep(log)), `Still on step ${p + 1} of ${STEPS.length}. ${STEPS[p]!.text(o).replace(/^Welcome\. This is a practice round, so nothing is graded\. /, '')}`)
}
