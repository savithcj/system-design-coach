import { parseBlock } from '../contract'
import { has, hasNumber, hasScope, shorten } from '../text'
import type { Rule } from '../types'

const VAGUE = ['low latency', 'fast', 'quick*', 'scalab*', 'highly available', 'high availability', 'performan*', 'reliab*', 'real time', 'responsive']

function vagueLines(text: string): string[] {
  return parseBlock(text).inScope.filter((l) => has(l, VAGUE) && !hasNumber(l) && !hasScope(l))
}

export const rule: Rule = {
  id: 'REQ_VAGUE_NFR', stage: 1, severity: 'warn', move: 'ask_clarifying', minLevel: 'mid',
  applies: (s) => parseBlock(s.contract.nonfunctional).inScope.length > 0,
  check(s) {
    const bad = vagueLines(s.contract.nonfunctional)
    if (!bad.length) return null
    return { evidence: bad.map((l) => shorten(l)), subjects: bad.slice(0, 2).map((l) => shorten(l, 40)),
      summary: 'A quality goal has no number and no path it applies to.' }
  },
  hints: {
    l1: 'How would you tell, in a test, whether this requirement is met?',
    l2: (v) => `"${v.subjects[0] ?? 'This line'}" could mean many things. Which request does it apply to, and what number would be good enough?`,
    l3: () => 'Rewrite it with a figure and a path, for example the time a particular request should take for most users, or the share of time something must be up.',
  },
  spoilers: [],
  resolvedBy: 'Stating a number and the path the requirement applies to.',
}
