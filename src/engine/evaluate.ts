import type { State } from '../core/state'
import { RULES } from './rules/registry'
import type { EngineProblem, Lens, Rule, Violation } from './types'

const active = (r: Rule, p: EngineProblem): boolean => !r.needsChallenge || p.challenges.some((c) => c.ruleId === r.id)

/**
 * Every rule that applies to the board as it is, whatever the current stage: flags are facts about the board.
 * Deciding what to say (and what to hold back until its stage) is the selector's job.
 */
export function evaluate(state: State, problem: EngineProblem, lens: Lens = 'default'): Violation[] {
  const out: Violation[] = []
  for (const r of RULES) {
    if (!active(r, problem) || !r.applies(state, problem, lens)) continue
    const f = r.check(state, problem, lens)
    if (f) out.push({ ...f, ruleId: r.id, stage: r.stage, severity: r.severity })
  }
  return out
}
