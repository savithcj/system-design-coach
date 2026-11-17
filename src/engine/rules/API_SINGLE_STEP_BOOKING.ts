import { parseBlock } from '../contract'
import { has, shorten } from '../text'
import type { Rule } from '../types'

const BOOKING = ['book*', 'purchas*', 'buy*', 'checkout', 'order*']
const RESERVE = ['reserv*', 'hold*', 'lock*', 'claim*']
const FINAL = ['confirm*', 'finaliz*', 'complet*', 'pay*', 'commit*']

export const rule: Rule = {
  id: 'API_SINGLE_STEP_BOOKING', stage: 3, severity: 'warn', move: 'probe_bottleneck', minLevel: 'mid', needsChallenge: true,
  applies: (s) => parseBlock(s.contract.api).inScope.length > 0,
  check(s) {
    const ls = parseBlock(s.contract.api).inScope
    const booking = ls.filter((l) => has(l, BOOKING))
    if (!booking.length) return null
    const reserveIdx = ls.flatMap((l, i) => (has(l, RESERVE) ? [i] : []))
    const finalIdx = ls.flatMap((l, i) => (has(l, [...BOOKING, ...FINAL]) ? [i] : []))
    const twoLines = reserveIdx.some((i) => finalIdx.some((j) => j !== i))
    const oneLine = reserveIdx.some((i) => has(ls[i]!, FINAL))
    if (twoLines || oneLine) return null
    return { evidence: booking.map((l) => shorten(l)), subjects: booking.slice(0, 1).map((l) => shorten(l, 40)),
      summary: 'Buying happens in a single call with nothing holding the item first.' }
  },
  hints: {
    l1: 'Between the moment someone picks a seat and the moment they finish paying, what keeps another person from picking it?',
    l2: (v) => `Walk through "${v.subjects[0] ?? 'your booking call'}" with two people clicking at once. Who wins, and what does the other one see?`,
    l3: () => 'Split it into two calls: one that reserves the seat for a short time, and one that confirms the purchase of that reservation.',
  },
  spoilers: ['reserve', 'reservation', 'hold', 'two steps', 'two-step', 'confirm'],
  resolvedBy: 'A reserve call followed by a separate confirm call.',
}
