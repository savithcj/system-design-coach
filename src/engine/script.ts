// The scripted coach: wording that needs no model. A model, when present, only rephrases what this says.
import { STAGES } from '../core/stages'
import type { CoachMove } from './selector'
import { ruleById } from './rules/registry'
import type { State } from '../core/state'
import type { Violation } from './types'

const NUDGE: Record<number, string> = {
  1: 'What is the one thing a user must be able to do? Add it as a bullet under Functional requirements, and list what you are leaving out under Out of scope.',
  2: 'Which things does the system keep track of? Add them as bullets under Core entities; names alone are enough for now.',
  3: 'Which calls would a client make? Add one bullet per call under API and data flow.',
  4: 'Pick one request and draw its route from the client to where its data lives.',
  5: 'Choose the part of your design you trust least. What would break first as traffic grows?',
}

const AFFIRM: Record<number, string> = {
  1: 'That is a clear scope. Ready to look at what the system stores?',
  2: 'Those entities read well. Ready to sketch the calls clients will make?',
  3: 'Your calls cover what you set out to do. Ready to draw the design?',
  4: 'There is a working route on the board. Which part would you stress first?',
  5: 'Nothing obvious stands out here. How would you check that it holds up?',
}

/** Said instead of the nudge when the learner asks again and nothing on the board has answered it. */
const POINT: Record<number, string> = {
  1: 'I read your notes, not this chat. Could you add that as a bullet under Functional requirements on the left?',
  2: 'I read your notes, not this chat. Could you add those as bullets under Core entities on the left?',
  3: 'I read your notes, not this chat. Could you add those as bullets under API and data flow on the left?',
}
export const pointToNotes = (stage: number): string => POINT[stage] ?? 'I read the board, not this chat. Which part of it could show that?'

/** True when everything the learner is asked for in stages 1-3 is written down. Stages 4 and 5 live on the board. */
export function stageDone(s: State, stage: number): boolean {
  const has = (t: string) => t.trim() !== ''
  switch (stage) {
    case 1: return has(s.contract.functional) && has(s.contract.nonfunctional)
    case 2: return has(s.contract.entities)
    case 3: return has(s.contract.api)
    default: return false
  }
}

/**
 * What the coach says when a stage is written down and the learner keeps chatting. Moving on is the learner's click on the
 * stage pill (chat is never read for intent), so each line says how, and they differ so the coach does not loop.
 */
export function doneLines(stage: number): string[] {
  const next = STAGES[stage]?.label ?? 'the next stage'
  const what = stage === 1 ? 'Your requirements' : stage === 2 ? 'Your entities' : 'Your calls'
  return [
    `${what} look filled in. Choose ${next} at the top when you are ready to move on.`,
    `Nothing more is needed here. Choose ${next} at the top to carry on, or tell me which part you are unsure about.`,
    `Take your time. ${next} is one click away at the top whenever you want it.`,
  ]
}

/** What to say when asked and no rule is flagged: the first thing still missing in this stage, or that the stage looks covered. */
export function stageNudge(s: State, stage: number): string | null {
  const has = (t: string) => t.trim() !== ''
  switch (stage) {
    case 1:
      if (!has(s.contract.functional)) return NUDGE[1]!
      if (!has(s.contract.nonfunctional)) return 'Your features are down. Next, add the qualities the system must have under Non-functional requirements. What matters most here?'
      return doneLines(1)[0]!
    case 2: return has(s.contract.entities) ? doneLines(2)[0]! : NUDGE[2]!
    case 3: return has(s.contract.api) ? doneLines(3)[0]! : NUDGE[3]!
    default: return null
  }
}

/** Said instead of repeating when the learner asks again and nothing has changed. */
export function pointOrAdvance(s: State, stage: number): string {
  // Name the box that is actually still empty, not just the first one of the stage.
  if (stage === 1 && s.contract.functional.trim() !== '') return 'I read your notes, not this chat. Could you add those as bullets under Non-functional requirements on the left?'
  return pointToNotes(stage)
}

/** The text a learner reads for a move. `violation` is the one the move is about, if any. */
export function scriptedText(move: CoachMove, violation: Violation | undefined, stage: number, nudge?: string | null): string {
  const rule = move.ruleId ? ruleById(move.ruleId) : undefined
  if (rule && violation) {
    if (move.level === 1) return rule.hints.l1
    return move.level === 2 ? rule.hints.l2(violation) : rule.hints.l3(violation)
  }
  if (move.kind === 'affirm_and_advance') return AFFIRM[stage] ?? AFFIRM[5]!
  if (move.kind === 'stay_quiet') return ''
  return nudge ?? NUDGE[stage] ?? `You are in ${STAGES[stage - 1]?.label ?? 'this stage'}. What would you do next?`
}
