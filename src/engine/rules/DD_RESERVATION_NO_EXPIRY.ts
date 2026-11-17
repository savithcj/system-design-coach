import { allText } from '../board'
import { has } from '../text'
import type { Rule } from '../types'
import { ANY_EXPIRY, hasReservation, reservationSubjects } from './reservation'

export const rule: Rule = {
  id: 'DD_RESERVATION_NO_EXPIRY', title: 'Reservations with no expiry', stage: 5, severity: 'warn', move: 'probe_bottleneck', minLevel: 'mid', needsChallenge: true,
  applies: (s) => hasReservation(s),
  check(s) {
    if (has(allText(s), ANY_EXPIRY)) return null
    const who = reservationSubjects(s)
    return { evidence: who, subjects: who.slice(0, 2), summary: 'Reservations are held but nothing says how an abandoned one ends.' }
  },
  hints: {
    l1: 'What happens to a seat someone picked but never paid for?',
    l2: (v) => `Think about ${v.subjects[0] ?? 'a held seat'} after the buyer closes the tab. Who frees it, and when?`,
    l3: () => 'Give every reservation a deadline. When it passes, the seat goes back on sale without anyone having to notice. A key that expires on its own in a fast store does this well.',
  },
  spoilers: ['ttl', 'time to live', 'expire', 'expiry', 'expiration', 'timeout'],
  resolvedBy: 'A stated expiry for abandoned reservations.',
}
