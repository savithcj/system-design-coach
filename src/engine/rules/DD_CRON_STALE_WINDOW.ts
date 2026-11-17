import { allText } from '../board'
import { has, shorten } from '../text'
import type { Rule } from '../types'
import { PERIODIC, STRONG_EXPIRY, hasReservation } from './reservation'

export const rule: Rule = {
  id: 'DD_CRON_STALE_WINDOW', title: 'Expiry only by a periodic cleanup', stage: 5, severity: 'warn', move: 'probe_bottleneck', minLevel: 'mid', needsChallenge: true,
  applies: (s) => hasReservation(s),
  check(s) {
    const text = allText(s)
    if (!has(text, PERIODIC) || has(text, STRONG_EXPIRY)) return null
    const hits = text.split('\n').map((l) => l.trim()).filter((l) => has(l, PERIODIC))
    return { evidence: hits.map((l) => shorten(l)), subjects: hits.slice(0, 2).map((l) => shorten(l, 40)),
      summary: 'Abandoned reservations are only cleared on a schedule, so each can stay stuck until the next run.' }
  },
  hints: {
    l1: 'Your cleanup runs on a schedule. How long could a seat stay blocked after its buyer has really gone?',
    l2: (v) => `Look at "${v.subjects[0] ?? 'the cleanup'}". If the run has just finished when someone abandons a seat, how long until it frees up, and is that fine for a popular event?`,
    l3: () => 'Make each reservation end itself at its own deadline instead of waiting for a sweep. A key with a time-to-live in a fast store does that, and a periodic job can stay as a safety net.',
  },
  spoilers: ['ttl', 'time to live', 'key expiry'],
  resolvedBy: 'Each reservation expiring on its own timer, not only a periodic cleanup.',
}
