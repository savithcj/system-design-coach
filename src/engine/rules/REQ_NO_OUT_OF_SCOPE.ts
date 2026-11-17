import { parseBlock, scopeOf } from '../contract'
import type { Rule } from '../types'

export const rule: Rule = {
  id: 'REQ_NO_OUT_OF_SCOPE', title: 'Nothing marked out of scope', stage: 1, severity: 'info', move: 'ask_clarifying', minLevel: 'mid',
  applies: (s) => parseBlock(s.contract.functional).inScope.length > 0,
  check(s) {
    const p = scopeOf(s.contract)
    if (p.outOfScope.length > 0) return null
    return { evidence: [], subjects: [], summary: 'Nothing is listed as out of scope.' }
  },
  hints: {
    l1: 'Is there anything an interviewer might expect that you are deliberately not building? Add it under Out of scope.',
    l2: () => 'Saying what is out of scope is part of the answer. Which of the things you can think of would you leave out? Add them under Out of scope.',
    l3: () => 'Add what you are deliberately leaving out as bullets under Out of scope, for example features that are real but not central.',
  },
  spoilers: [],
  resolvedBy: 'Listing what is deliberately left out under Out of scope.',
}
