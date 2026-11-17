import { parseBlock } from '../contract'
import type { Rule } from '../types'

export const rule: Rule = {
  id: 'REQ_NO_OUT_OF_SCOPE', title: 'Nothing marked out of scope', stage: 1, severity: 'info', move: 'ask_clarifying', minLevel: 'mid',
  applies: (s) => parseBlock(s.contract.functional).inScope.length > 0,
  check(s) {
    const p = parseBlock(s.contract.functional)
    if (p.outOfScope.length > 0) return null
    return { evidence: [], subjects: [], summary: 'Nothing is listed as out of scope.' }
  },
  hints: {
    l1: 'Is there anything an interviewer might expect that you are deliberately not building, and how would they know?',
    l2: () => 'Saying what is out of scope is part of the answer. Where in your notes could you write that down?',
    l3: () => 'On its own line, type "---". Anything you list below it counts as out of scope, for example things that are real but not central.',
  },
  spoilers: [],
  resolvedBy: 'Adding a "---" line followed by what is deliberately left out.',
}
