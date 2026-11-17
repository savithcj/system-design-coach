// One coach turn, planned as plain events. Pure: the UI appends what this returns and re-renders.
// Code chose the move and its wording is scripted; a model (Step 8) may only rephrase what is chosen here.
import type { EventLog, KnownType, PayloadMap } from '../core/events'
import { reduce } from '../core/reduce'
import type { Problem } from '../problems/types'
import type { Violation } from './types'
import { evaluate } from './evaluate'
import { checkReply, MAX_CHARS_L3 } from './grounding'
import { historyOf, stageHasContent } from './history'
import { nextNudge } from './nudge'
import { ruleById } from './rules/registry'
import { pointToNotes, scriptedText } from './script'
import { selectMove, type CoachMove } from './selector'

export type Trigger =
  | { kind: 'stuck' }
  | { kind: 'chat' }
  /** The learner moved between stages. */
  | { kind: 'stage'; from: number; to: number }

export interface Planned<K extends KnownType = KnownType> { type: K; payload: PayloadMap[K]; actor: 'coach' | 'system' }
const planned = <K extends KnownType>(type: K, payload: PayloadMap[K], actor: 'coach' | 'system'): Planned => ({ type, payload, actor } as Planned)

const STRONGER = 'That is as far as I can take it in chat. Press Stuck? if you want a stronger hint on this one.'
export const CONFIRM_TEXT = 'The next step names the approach outright. Press Stuck? again if you want it.'

/** "Stuck?" twice: the second press confirms, if the confirmation question is the last thing in the log. */
function pendingConfirm(log: EventLog): string | null {
  const last = log[log.length - 1]
  if (last?.type !== 'CoachResponded') return null
  const p = last.payload as PayloadMap['CoachResponded']
  return p.move === 'confirm_hint' && p.ruleId ? p.ruleId : null
}

/**
 * True when the coach's last move was a plain clarifying question and nothing but chat has happened since. Read from the
 * move recorded in the log, not from the text shown, because a model may have reworded that text.
 */
function repeatsClarifying(log: EventLog): boolean {
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!
    if (e.type === 'UserMessaged' || e.type === 'RuleFired' || e.type === 'RuleResolved' || e.type === 'CoachReplyRejected') continue
    if (e.type !== 'CoachResponded') return false
    const p = e.payload as PayloadMap['CoachResponded']
    return p.move === 'ask_clarifying' && !p.ruleId
  }
  return false
}

/** A coach line a model may reword. The scripted `seed` is already in the planned event and stays if the model fails. */
export interface PhraseJob {
  /** Index in `events` of the CoachResponded to reword. */
  index: number
  move: CoachMove
  violation: Violation | undefined
  stage: number
  seed: string
  ruleSpoilers: readonly string[] | undefined
  /** True only for a confirmed level-3 hint. */
  allowRuleSpoilers: boolean
}

export interface Plan { events: Planned[]; job?: PhraseJob }

export const planTurn = (log: EventLog, problem: Problem, trigger: Trigger): Planned[] => planTurnFull(log, problem, trigger).events

export function planTurnFull(log: EventLog, problem: Problem, trigger: Trigger): Plan {
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
  if (move.kind === 'stay_quiet') return { events: [] }

  const out: Planned[] = []
  let job: PhraseJob | undefined
  const rule = move.ruleId ? ruleById(move.ruleId) : undefined
  const violation = violations.find((v) => v.ruleId === move.ruleId)

  // Level 3 gives the approach away, so ask first. The question is itself the "pending" marker in the log.
  if (move.needsConfirm && !pending) {
    return { events: [planned('CoachResponded', { kind: 'ack', message: CONFIRM_TEXT, ruleId: move.ruleId, level: 2, move: 'confirm_hint', stage }, 'coach')] }
  }

  const nudge = !rule && move.kind === 'ask_clarifying' && stage >= 4 ? nextNudge(problem, state) : null
  let message = scriptedText(move, violation, stage, nudge)
  // In chat the hint ladder stops at level 2. Once that has been said, say how to go further instead of repeating it.
  if (rule && trigger.kind === 'chat' && (history.spoken[move.ruleId!]?.level ?? 0) >= 2) message = STRONGER
  // Asking again without changing the board must not get the same line back.
  if (!rule && move.kind === 'ask_clarifying' && trigger.kind !== 'stage' && repeatsClarifying(log)) message = pointToNotes(stage)
  const gate = checkReply({ message, state, problem, stage, ruleSpoilers: rule?.spoilers, allowRuleSpoilers: move.level === 3, maxChars: MAX_CHARS_L3 })
  // Level 3 is the answer itself: shown exactly as scripted, because rewording it is where it goes vague.
  if (gate.ok) { if (move.level !== 3) job = { index: -1, move, violation, stage, seed: message, ruleSpoilers: rule?.spoilers, allowRuleSpoilers: false } }
  else {
    // Never show a line the gate rejects (a learner's own wording can trip it); fall back to the rule's plain question.
    out.push(planned('CoachReplyRejected', { reason: gate.reasons.join(','), move: move.kind }, 'system'))
    message = rule ? rule.hints.l1 : scriptedText({ ...move, kind: 'ask_clarifying', ruleId: undefined }, undefined, stage)
  }

  if (trigger.kind === 'stuck') out.push(planned('HintRequested', { level: move.level, ruleId: move.ruleId }, 'coach'))
  const kind = trigger.kind === 'stuck' ? 'hint' : move.kind === 'affirm_and_advance' ? 'ack' : 'reply'
  out.push(planned('CoachResponded', { kind, message, level: move.level, ruleId: move.ruleId, move: move.kind, stage }, 'coach'))
  if (job) job.index = out.length - 1
  return { events: out, job }
}
