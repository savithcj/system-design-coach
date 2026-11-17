import { nodeName } from '../../core/state'
import { matchingNodes } from '../board'
import { has } from '../text'
import type { Rule } from '../types'
import { hasSearchIndex } from './search'

const SEARCH = ['search*']

export const rule: Rule = {
  id: 'DD_SEARCH_FULL_SCAN', title: 'Search answered by scanning the main database', stage: 5, severity: 'warn', move: 'probe_bottleneck', minLevel: 'mid', needsChallenge: true,
  applies: (s) => s.nodes.some((n) => n.role === 'db') && !hasSearchIndex(s),
  check(s) {
    const dbs = matchingNodes(s, (t, n) => n.role === 'db' && has(t, SEARCH))
    const edges = s.edges.filter((e) => e.label && has(e.label, SEARCH) && s.nodes.find((n) => n.id === e.b)?.role === 'db')
    const ids = [...new Set([...dbs.map((n) => n.id), ...edges.map((e) => e.b)])]
    if (!ids.length) return null
    const names = ids.map((id) => nodeName(s, id))
    return { evidence: ids, subjects: names.slice(0, 2),
      summary: 'Searches seem to be answered by the main database, which gets slower as the data grows.' }
  },
  hints: {
    l1: 'When there are millions of events, how much work does one search do in your database?',
    l2: (v) => `Follow one search through ${v.subjects[0] ?? 'your database'}. Does the work grow with the number of rows?`,
    l3: () => 'Keep a separate copy of the searchable fields in something built for text search, and feed it from the main database. Searches then hit the copy, not the main store.',
  },
  spoilers: ['elasticsearch', 'opensearch', 'solr', 'lucene', 'inverted index', 'search index', 'change data capture', 'cdc'],
  resolvedBy: 'A separate search structure serving queries instead of scanning the main database.',
}
