// The scripted coach: wording that needs no model. A model, when present, only rephrases what this says.
import { STAGES } from '../core/stages'
import type { CoachMove } from './selector'
import { ruleById } from './rules/registry'
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
