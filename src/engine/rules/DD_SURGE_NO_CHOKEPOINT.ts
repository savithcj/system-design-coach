import { nodeName } from '../../core/state'
import { allText, byRole, chainConnected } from '../board'
import { has } from '../text'
import type { Rule } from '../types'

const ADMISSION = ['admission', 'waiting room', 'waiting queue', 'virtual queue', 'rate limit*', 'throttl*', 'token bucket', 'queue*']

export const rule: Rule = {
  id: 'DD_SURGE_NO_CHOKEPOINT', stage: 5, severity: 'warn', move: 'probe_bottleneck', minLevel: 'mid', needsChallenge: true,
  applies: (s) => chainConnected(s, ['client', 'service', 'db']),
  check(s) {
    if (byRole(s, 'queue').length || has(allText(s), ADMISSION)) return null
    const stores = byRole(s, 'db')
    return { evidence: stores.map((n) => n.id), subjects: stores.slice(0, 2).map((n) => nodeName(s, n.id)),
      summary: 'Every client request can reach the booking store at once, with nothing limiting the rate.' }
  },
  hints: {
    l1: 'A hugely popular event opens for sale. What limits how many requests reach your booking store at once?',
    l2: (v) => `Imagine a million people pressing the button together. How many of those reach ${v.subjects[0] ?? 'the database'} at the same moment?`,
    l3: () => 'Put a gate in front of booking that lets people through at a pace the store can handle, for example a waiting queue that admits them in order.',
  },
  spoilers: ['waiting queue', 'waiting room', 'virtual queue', 'admission', 'token bucket', 'rate limit', 'throttle'],
  resolvedBy: 'Admission control in front of the booking store.',
}
