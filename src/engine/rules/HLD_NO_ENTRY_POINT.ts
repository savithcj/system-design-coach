import { nodeName } from '../../core/state'
import { nodeText, byRole } from '../board'
import { has } from '../text'
import type { Rule } from '../types'

const GATEWAY = ['gateway', 'load balancer', 'balancer', 'lb', 'proxy', 'nginx', 'haproxy', 'envoy', 'ingress', 'router', 'cdn', 'edge']

export const rule: Rule = {
  id: 'HLD_NO_ENTRY_POINT', stage: 4, severity: 'info', move: 'ask_clarifying', minLevel: 'mid',
  applies: (s) => byRole(s, 'service').length > 1 && byRole(s, 'client').length > 0,
  check(s) {
    const servers = new Map(byRole(s, 'service').map((n) => [n.id, n]))
    const reached = new Set<string>()
    for (const e of s.edges) {
      const a = s.nodes.find((n) => n.id === e.a), b = s.nodes.find((n) => n.id === e.b)
      if (a?.role === 'client' && servers.has(e.b)) reached.add(e.b)
      if (b?.role === 'client' && servers.has(e.a)) reached.add(e.a)
    }
    const direct = [...reached].map((id) => servers.get(id)!)
    if (direct.length < 2 || direct.some((n) => has(nodeText(n), GATEWAY))) return null
    return { evidence: direct.map((n) => n.id), subjects: direct.slice(0, 2).map((n) => nodeName(s, n.id)),
      summary: 'Clients reach several servers directly, with nothing in front of them.' }
  },
  hints: {
    l1: 'When a client sends a request, how does it know which of your servers should get it?',
    l2: (v) => `Clients talk to ${v.subjects.join(' and ') || 'several servers'} directly. What happens when you add or remove one of them?`,
    l3: () => 'Add one front door that every client talks to, and let it pass requests on to the right server.',
  },
  spoilers: ['load balancer', 'gateway'],
  resolvedBy: 'Putting a single entry point in front of the servers.',
}
