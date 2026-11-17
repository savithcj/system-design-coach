import { nodeName } from '../../core/state'
import { byRole, chainConnected } from '../board'
import type { Rule } from '../types'

export const rule: Rule = {
  id: 'HLD_PREMATURE_OPTIMISATION', stage: 4, severity: 'info', move: 'challenge_assumption', minLevel: 'mid',
  applies: (s) => byRole(s, 'cache', 'queue').length > 0,
  check(s) {
    if (chainConnected(s, ['client', 'service', 'db'])) return null
    const extras = byRole(s, 'cache', 'queue')
    return { evidence: extras.map((n) => n.id), subjects: extras.slice(0, 2).map((n) => nodeName(s, n.id)),
      summary: 'Speed-ups are on the board before a basic route from client to storage exists.' }
  },
  hints: {
    l1: 'If you drew only the simplest version that works, what would it contain?',
    l2: (v) => `You've added ${v.subjects.join(' and ') || 'extras'} already. What problem does it solve that you can point to yet?`,
    l3: () => 'Finish the plain path first: client, server, storage. Note the speed-ups as deep dives and come back once that path works.',
  },
  spoilers: [],
  resolvedBy: 'Completing the basic client to server to database path first.',
}
