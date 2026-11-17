import { parseBlock } from '../contract'
import { nouns, shorten } from '../text'
import type { Rule } from '../types'

export const rule: Rule = {
  id: 'API_NO_COVERAGE', stage: 3, severity: 'warn', move: 'ask_clarifying', minLevel: 'mid',
  applies: (s) => parseBlock(s.contract.api).inScope.length > 0 && parseBlock(s.contract.functional).inScope.length > 0,
  check(s) {
    const api = new Set(parseBlock(s.contract.api).inScope.flatMap((l) => [...nouns(l)]))
    const missing = parseBlock(s.contract.functional).inScope.filter((l) => {
      const n = nouns(l)
      return n.size > 0 && ![...n].some((w) => api.has(w))
    })
    if (!missing.length) return null
    return { evidence: missing.map((l) => shorten(l)), subjects: missing.slice(0, 2).map((l) => shorten(l, 40)),
      summary: 'A functional requirement has no matching API line.' }
  },
  hints: {
    l1: 'Take your requirements one at a time. Which call would the client make for each?',
    l2: (v) => `Which API line would let a user do "${v.subjects[0] ?? 'this one'}"?`,
    l3: (v) => `Add a line to your API for "${v.subjects[0] ?? 'the uncovered requirement'}", with the action, the path and what it sends back.`,
  },
  spoilers: [],
  resolvedBy: 'Giving every in-scope requirement at least one API line.',
}
