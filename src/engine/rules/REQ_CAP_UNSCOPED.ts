import { parseBlock } from '../contract'
import { has, hasScope, shorten } from '../text'
import type { Rule } from '../types'

const CONSISTENCY = ['consisten*']
const AVAILABILITY = ['availab*']

export const rule: Rule = {
  id: 'REQ_CAP_UNSCOPED', stage: 1, severity: 'warn', move: 'challenge_assumption', minLevel: 'mid',
  applies: (s) => parseBlock(s.contract.nonfunctional).inScope.length > 0,
  check(s) {
    const ls = parseBlock(s.contract.nonfunctional).inScope
    const c = ls.filter((l) => has(l, CONSISTENCY)), a = ls.filter((l) => has(l, AVAILABILITY))
    if (!c.length || !a.length) return null
    // One line promising both is unscoped by construction; separate lines each need a "for ..."-style scope.
    const both = ls.filter((l) => has(l, CONSISTENCY) && has(l, AVAILABILITY))
    const bare = [...c, ...a].filter((l) => !hasScope(l))
    const bad = [...new Set([...both, ...bare])]
    if (!bad.length) return null
    return { evidence: bad.map((l) => shorten(l)), subjects: bad.slice(0, 2).map((l) => shorten(l, 40)),
      summary: 'Both consistency and availability are promised without saying where each one applies.' }
  },
  hints: {
    l1: 'If the network between your machines broke for a minute, what would you want to keep working, and what could wait?',
    l2: (v) => `You mention both qualities ("${v.subjects[0] ?? 'above'}"). Do they need to hold for the same requests?`,
    l3: () => 'Name the path for each: which requests must never show wrong data, and which must stay up even if the data is slightly old.',
  },
  spoilers: [],
  resolvedBy: 'Saying which paths need correctness and which need uptime.',
}
