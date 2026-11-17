import type { Role } from '../core/roles'
import type { State } from '../core/state'
import type { Problem } from '../problems/types'

/**
 * The first question the problem has for a category the board is still missing, or null.
 * Matching is by category and count only, so any technology the learner picked satisfies it.
 */
export function nextNudge(problem: Pick<Problem, 'nudges'>, state: State): string | null {
  const need = new Map<Role, number>()
  for (const n of problem.nudges) {
    const k = (need.get(n.role) ?? 0) + 1
    need.set(n.role, k)
    if (state.nodes.filter((b) => b.role === n.role).length < k) return n.text
  }
  return null
}
