import { chainConnected } from '../board'
import { roleLabel } from '../../core/roles'
import type { Rule } from '../types'

export const rule: Rule = {
  id: 'HLD_UNFINISHED_PATH', stage: 4, severity: 'warn', move: 'ask_clarifying', minLevel: 'mid',
  applies: (s, p) => p.requiredPaths.length > 0 && s.nodes.length > 0,
  check(s, p) {
    const open = p.requiredPaths.filter((r) => !chainConnected(s, [r.from, ...(r.via ?? []), r.to]))
    if (!open.length) return null
    return { evidence: open.map((r) => r.name), subjects: open.slice(0, 2).map((r) => r.name),
      summary: `No route yet from ${roleLabel(open[0]!.from)} to ${roleLabel(open[0]!.to)} for: ${open.map((r) => r.name).join(', ')}.` }
  },
  hints: {
    l1: 'Pick one request and follow it from the client to where its data lives. Where does the trail stop?',
    l2: (v) => `Follow "${v.subjects[0] ?? 'a request'}" arrow by arrow. Which box has no arrow onward?`,
    l3: (v) => `Connect the boxes so that "${v.subjects[0] ?? 'the request'}" can travel from the client all the way to storage and back.`,
  },
  spoilers: [],
  resolvedBy: 'Connecting each key request from the client through to storage.',
}
