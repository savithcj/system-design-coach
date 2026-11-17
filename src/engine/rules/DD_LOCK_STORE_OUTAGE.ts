import { nodeName } from '../../core/state'
import { allText, matchingNodes } from '../board'
import { has } from '../text'
import type { Rule } from '../types'
import { RESERVATION, STRONG_EXPIRY } from './reservation'

const HOLDS = [...RESERVATION, 'lock*', ...STRONG_EXPIRY]
const FALLBACK = ['fallback', 'fall back', 'failover', 'fail over', 'replica*', 'standby', 'sentinel', 'cluster*', 'persist*', 'durable',
  'backup', 'degrad*', 'fail open', 'fail closed', 'unique constraint', 'constraint', 'optimistic', 'version check', 'conditional update', 'reconcil*']

export const rule: Rule = {
  id: 'DD_LOCK_STORE_OUTAGE', title: 'No plan for the hold store failing', stage: 5, severity: 'warn', move: 'scale_curveball', minLevel: 'senior', needsChallenge: true,
  applies: (s) => matchingNodes(s, (t, n) => n.role === 'cache' && has(t, HOLDS)).length > 0,
  check(s) {
    if (has(allText(s), FALLBACK)) return null
    const stores = matchingNodes(s, (t, n) => n.role === 'cache' && has(t, HOLDS))
    return { evidence: stores.map((n) => n.id), subjects: stores.slice(0, 2).map((n) => nodeName(s, n.id)),
      summary: 'Seat holds live in a store with no stated plan for when that store fails.' }
  },
  hints: {
    l1: 'What does a buyer see if the store that holds those seats goes down mid-sale?',
    l2: (v) => `If ${v.subjects[0] ?? 'that store'} lost its data right now, which seats would be wrongly free or wrongly stuck?`,
    l3: () => 'Decide what happens when it fails: either the booking store itself refuses a double sale as a last check, or the holds survive a restart. Say which one you choose.',
  },
  spoilers: ['fallback', 'failover', 'replica', 'sentinel', 'fail open', 'fail closed', 'constraint'],
  resolvedBy: 'A stated fallback, such as the booking store enforcing no double sale, for when the hold store fails.',
}
