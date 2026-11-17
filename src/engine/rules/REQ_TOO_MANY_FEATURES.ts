import { parseBlock } from '../contract'
import { shorten } from '../text'
import type { Rule } from '../types'

const MAX = 4

export const rule: Rule = {
  id: 'REQ_TOO_MANY_FEATURES', title: 'Too many features for a first pass', stage: 1, severity: 'warn', move: 'challenge_assumption', minLevel: 'mid',
  applies: (s) => parseBlock(s.contract.functional).inScope.length > 0,
  check(s) {
    const items = parseBlock(s.contract.functional).inScope
    if (items.length <= MAX) return null
    return { evidence: items.slice(MAX).map((l) => shorten(l)), subjects: items.slice(MAX, MAX + 2).map((l) => shorten(l, 40)),
      summary: `${items.length} features are in scope; a first pass usually fits about ${MAX}.` }
  },
  hints: {
    l1: 'If you only had time to build the core of this, which of these features would you drop first, and why?',
    l2: (v) => `Look at the later items on your list, such as "${v.subjects[0] ?? 'the last one'}". Does the design still make sense without them?`,
    l3: () => `Pick the few features the whole design depends on and move the rest to the Out of scope box. You can bring them back if there's time.`,
  },
  spoilers: [],
  resolvedBy: 'Trimming the in-scope list to the core features and moving the rest below the line.',
}
