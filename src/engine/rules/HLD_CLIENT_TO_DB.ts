import { nodeName } from '../../core/state'
import type { Rule } from '../types'

export const rule: Rule = {
  id: 'HLD_CLIENT_TO_DB', title: 'Client connected straight to a database', stage: 4, severity: 'warn', move: 'challenge_assumption', minLevel: 'mid',
  applies: (s) => s.edges.length > 0,
  check(s) {
    const role = (id: string) => s.nodes.find((n) => n.id === id)?.role
    const bad = s.edges.filter((e) => (role(e.a) === 'client' && role(e.b) === 'db') || (role(e.a) === 'db' && role(e.b) === 'client'))
    if (!bad.length) return null
    return { evidence: bad.map((e) => e.id), subjects: bad.slice(0, 2).map((e) => `${nodeName(s, e.a)} and ${nodeName(s, e.b)}`),
      summary: 'A client is connected straight to a database.' }
  },
  hints: {
    l1: 'Who would you trust to decide what a client may read or write?',
    l2: (v) => `Look at the arrow between ${v.subjects[0] ?? 'the client and the database'}. What sits in between to check and shape those requests?`,
    l3: () => 'Put a server between them. The client talks to the server, and only the server talks to the database.',
  },
  spoilers: [],
  resolvedBy: 'Routing the client through a server instead of straight to the database.',
}
