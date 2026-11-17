// One coach turn, planned as plain events. Pure: the UI appends what this returns and re-renders.
// Code chose the move and its wording is scripted; a model (Step 8) may only rephrase what is chosen here.
import type { EventLog, KnownType, PayloadMap } from '../core/events'
import { reduce } from '../core/reduce'
import type { Problem } from '../problems/types'
import { evaluate } from './evaluate'
import { checkReply, MAX_CHARS_L3 } from './grounding'
import { historyOf, stageHasContent } from './history'
import { nextNudge } from './nudge'
import { ruleById } from './rules/registry'
import { scriptedText } from './script'
import { selectMove, type CoachMove } from './selector'

export type Trigger =
  | { kind: 'stuck' }
  | { kind: 'chat' }
  /** The learner moved between stages. */
  | { kind: 'stage'; from: number; to: number }

export interface Planned<K extends KnownType = KnownType> { type: K; payload: PayloadMap[K]; actor: 'coach' | 'system' }
const planned = <K extends KnownType>(type: K, payload: PayloadMap[K], actor: 'coach' | 'system'): Planned => ({ type, payload, actor } as Planned)

export const CONFIRM_TEXT = 'The next step names the approach outright. Press Stuck? again if you want it.'

/** "Stuck?" twice: the second press confirms, if the confirmation question is the last thing in the log. */
function pendingConfirm(log: EventLog): string | null {
  const last = log[log.length - 1]
  if (last?.type !== 'CoachResponded') return null
  const p = last.payload as PayloadMap['CoachResponded']
  return p.move === 'confirm_hint' && p.ruleId ? p.ruleId : null
}

export function planTurn(log: EventLog, problem: Problem, trigger: Trigger): Planned[] {
  const state = reduce(log)
  const violations = evaluate(state, problem)
  const history = historyOf(log)
  const base = { violations, history, level: state.level, problem }

  let stage = state.stage
  let move: CoachMove
  const pending = trigger.kind === 'stuck' ? pendingConfirm(log) : null
  if (pending) {
    move = { kind: 'offer_hint', ruleId: pending, level: 3, needsConfirm: false }
  } else if (trigger.kind === 'stage') {
    // Leaving a stage: say one thing about the stage being left. Going back: about where they are now.
    stage = trigger.to > trigger.from ? trigger.from : trigger.to
    move = selectMove({ ...base, stage, asked: false, hasContent: stageHasContent(state, stage) })
  } else {
    move = selectMove({ ...base, stage, asked: true, hasContent: stageHasContent(state, stage), maxLevel: trigger.kind === 'chat' ? 2 : 3 })
  }
  if (move.kind === 'stay_quiet') return []

  const out: Planned[] = []
  const rule = move.ruleId ? ruleById(move.ruleId) : undefined
  const violation = violations.find((v) => v.ruleId === move.ruleId)

  // Level 3 gives the approach away, so ask first. The question is itself the "pending" marker in the log.
  if (move.needsConfirm && !pending) {
    return [planned('CoachResponded', { kind: 'ack', message: CONFIRM_TEXT, ruleId: move.ruleId, level: 2, move: 'confirm_hint', stage }, 'coach')]
  }

  const nudge = !rule && move.kind === 'ask_clarifying' && stage >= 4 ? nextNudge(problem, state) : null
  let message = scriptedText(move, violation, stage, nudge)
  const gate = checkReply({ message, state, problem, stage, ruleSpoilers: rule?.spoilers, allowRuleSpoilers: move.level === 3, maxChars: MAX_CHARS_L3 })
  if (!gate.ok) {
    // Never show a line the gate rejects (a learner's own wording can trip it); fall back to the rule's plain question.
    out.push(planned('CoachReplyRejected', { reason: gate.reasons.join(','), move: move.kind }, 'system'))
    message = rule ? rule.hints.l1 : scriptedText({ ...move, kind: 'ask_clarifying', ruleId: undefined }, undefined, stage)
  }

  if (trigger.kind === 'stuck') out.push(planned('HintRequested', { level: move.level, ruleId: move.ruleId }, 'coach'))
  const kind = trigger.kind === 'stuck' ? 'hint' : move.kind === 'affirm_and_advance' ? 'ack' : 'reply'
  out.push(planned('CoachResponded', { kind, message, level: move.level, ruleId: move.ruleId, move: move.kind, stage }, 'coach'))
  return out
}
