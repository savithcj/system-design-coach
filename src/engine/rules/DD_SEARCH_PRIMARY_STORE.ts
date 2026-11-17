import { nodeName } from '../../core/state'
import { byRole, nodeText } from '../board'
import type { Rule } from '../types'
import { isIndexNode } from './search'

export const rule: Rule = {
  id: 'DD_SEARCH_PRIMARY_STORE', title: 'Search structure is the only copy of the data', stage: 5, severity: 'warn', move: 'challenge_assumption', minLevel: 'senior', needsChallenge: true,
  applies: (s) => s.nodes.some((n) => isIndexNode(nodeText(n))),
  check(s) {
    const index = s.nodes.filter((n) => isIndexNode(nodeText(n)))
    const others = byRole(s, 'db', 'blob').filter((n) => !isIndexNode(nodeText(n)))
    if (others.length) return null
    return { evidence: index.map((n) => n.id), subjects: index.slice(0, 2).map((n) => nodeName(s, n.id)),
      summary: 'The search structure is the only place the data lives.' }
  },
  hints: {
    l1: 'If the search box lost all its data tonight, where would you rebuild it from?',
    l2: (v) => `If ${v.subjects[0] ?? 'it'} is the only copy of the events, what happens when it is wrong or empty?`,
    l3: () => 'Keep the main database as the source of truth and treat the search structure as a copy that can be rebuilt. Stream changes from the database into it.',
  },
  spoilers: ['change data capture', 'cdc', 'dual write', 'source of truth'],
  resolvedBy: 'A main database as the source of truth, with the search structure as a rebuildable copy.',
}
