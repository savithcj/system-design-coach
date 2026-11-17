import { parseBlock } from '../contract'
import { hitLines, shorten } from '../text'
import type { Rule } from '../types'

const DETAIL = ['varchar', 'bigint', 'int', 'integer', 'uuid', 'timestamp', 'datetime', 'boolean', 'primary key', 'foreign key',
  'not null', 'create table', 'char(', 'qps', 'rps', 'req/s', 'requests per second']

export const rule: Rule = {
  id: 'ENT_PREMATURE_DETAIL', stage: 2, severity: 'info', move: 'challenge_assumption', minLevel: 'mid',
  applies: (s) => parseBlock(s.contract.entities).inScope.length > 0,
  check(s) {
    const ls = parseBlock(s.contract.entities).inScope
    const bad = hitLines(ls, DETAIL)
    if (!bad.length) return null
    return { evidence: bad.map((l) => shorten(l)), subjects: bad.slice(0, 2).map((l) => shorten(l, 40)),
      summary: 'The entity list already has column types or traffic numbers.' }
  },
  hints: {
    l1: 'At this point, what do you need to know about each entity, and what can wait until you see the design?',
    l2: (v) => `"${v.subjects[0] ?? 'This line'}" goes deeper than names. Will the next stage change your mind about it?`,
    l3: () => 'Keep just the entity names (and maybe one line on how they relate) for now. Types, indexes and traffic numbers fit better once there is a design to hang them on.',
  },
  spoilers: [],
  resolvedBy: 'Listing entity names only and saving the detail for the design.',
}
