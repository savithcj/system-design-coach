import type { History } from './history'
import { ruleById } from './rules/registry'
import { LEVEL_RANK, type EngineProblem, type Level, type MoveKind, type Violation } from './types'

export interface CoachMove {
  kind: MoveKind
  /** The rule the move is about. Absent for stay_quiet, a plain affirmation or a general nudge. */
  ruleId?: string
  /** Hint level to serve: 1 a question, 2 narrower, 3 the approach. */
  level: 1 | 2 | 3
  /** Level 3 gives the approach away, so the UI asks before sending it. */
  needsConfirm: boolean
}

export interface SelectInput {
  violations: readonly Violation[]
  history: History
  level: Level
  stage: number
  problem: EngineProblem
  /** "Stuck?" was pressed. Without it the coach only speaks about something new or unresolved. */
  asked: boolean
  /** The learner has put something into the current stage. */
  hasContent: boolean
  /** Highest hint level this request may serve. Chat is capped at 2: only "Stuck?" can reach the approach. */
  maxLevel?: 1 | 2 | 3
}

const SEVERITY = { block: 0, warn: 1, info: 2 } as const

const move = (kind: MoveKind, ruleId: string | undefined, level: 1 | 2 | 3): CoachMove => ({ kind, ruleId, level, needsConfirm: level === 3 })

/**
 * Chooses exactly one move. Order of preference: earlier stage, then severity, then the problem's own challenge
 * order, then registry order. Deep-dive rules wait until their stage, which is the premature-optimisation guard.
 */
export function selectMove(i: SelectInput): CoachMove {
  const order = new Map(i.problem.challenges.map((c) => [c.ruleId, c.order]))
  const eligible = i.violations
    .filter((v) => v.stage <= i.stage)
    .filter((v) => LEVEL_RANK[ruleById(v.ruleId)?.minLevel ?? 'mid'] <= LEVEL_RANK[i.level])
    .sort((a, b) => a.stage - b.stage || SEVERITY[a.severity] - SEVERITY[b.severity] || (order.get(a.ruleId) ?? 0) - (order.get(b.ruleId) ?? 0))

  // Never twice in a row about the same rule unless the learner asked.
  const pick = i.asked ? eligible[0] : eligible.find((v) => v.ruleId !== i.history.lastRuleId)

  if (!pick) {
    if (i.asked) return move('ask_clarifying', undefined, 1)
    if (!eligible.length && i.hasContent && !i.history.affirmed.includes(i.stage)) return move('affirm_and_advance', undefined, 1)
    return move('stay_quiet', undefined, 1)
  }

  const seen = i.history.spoken[pick.ruleId]
  if (i.asked) return move('offer_hint', pick.ruleId, Math.min(i.maxLevel ?? 3, (seen?.level ?? 0) + 1) as 1 | 2 | 3)
  // Unprompted: a repeat from an earlier stage is raised one level narrower, otherwise start (or stay) where we were.
  const level = seen && seen.lastStage < i.stage ? Math.min(2, seen.level + 1) : Math.max(1, Math.min(2, seen?.level ?? 1))
  return move(ruleById(pick.ruleId)!.move, pick.ruleId, level as 1 | 2 | 3)
}
