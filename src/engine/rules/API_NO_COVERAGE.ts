import { parseBlock } from '../contract'
import { nouns, shorten } from '../text'
import type { Rule } from '../types'

export const rule: Rule = {
  id: 'API_NO_COVERAGE', title: 'A requirement with no API call', stage: 3, severity: 'warn', move: 'ask_clarifying', minLevel: 'mid',
  applies: (s) => parseBlock(s.contract.api).inScope.length > 0 && parseBlock(s.contract.functional).inScope.length > 0,
  check(s) {
    const api = new Set(parseBlock(s.contract.api).inScope.flatMap((l) => [...nouns(l)]))
    const reqs = parseBlock(s.contract.functional).inScope
    // A noun shared by several requirements ("events") cannot show that one of them is covered, so lean on the
    // nouns only this requirement uses; with none of those, any noun will do.
    const counts = new Map<string, number>()
    for (const l of reqs) for (const w of nouns(l)) counts.set(w, (counts.get(w) ?? 0) + 1)
    const missing = reqs.filter((l) => {
      const all = [...nouns(l)]
      const own = all.filter((w) => counts.get(w) === 1)
      const key = own.length ? own : all
      return key.length > 0 && !key.some((w) => api.has(w))
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
