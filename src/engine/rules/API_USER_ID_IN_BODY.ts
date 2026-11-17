import { parseBlock } from '../contract'
import { has, shorten } from '../text'
import type { Rule } from '../types'

const IDENTITY = /\b(?:user|customer|account|member|owner)[_\s-]?id\b|\buid\b/i
const AUTH = ['header', 'token', 'jwt', 'bearer', 'session', 'cookie', 'auth*']

/** Identity that is only part of the path ("/users/{userId}/...") is a resource, not a claim about who is calling. */
const withoutPathParams = (line: string): string => line.replace(/\/[{:]\s*\w+\s*\}?/g, '/')

export const rule: Rule = {
  id: 'API_USER_ID_IN_BODY', title: 'Caller identity sent in the request body', stage: 3, severity: 'warn', move: 'challenge_assumption', minLevel: 'mid',
  applies: (s) => parseBlock(s.contract.api).inScope.length > 0,
  check(s) {
    const bad = parseBlock(s.contract.api).inScope.filter(
      (l) => !/^get\b/i.test(l) && IDENTITY.test(withoutPathParams(l)) && !has(l, AUTH),
    )
    if (!bad.length) return null
    return { evidence: bad.map((l) => shorten(l)), subjects: bad.slice(0, 2).map((l) => shorten(l, 40)),
      summary: 'A request carries the caller\'s identity in its body.' }
  },
  hints: {
    l1: 'If a caller can simply write down who they are, what stops them from claiming to be someone else?',
    l2: (v) => `Look at "${v.subjects[0] ?? 'that line'}". If the caller fills in that field, what stops them from filling in someone else's?`,
    l3: () => 'Take the identity out of the request body. The server should learn it from the login, such as a token in a header, and use that.',
  },
  spoilers: [],
  resolvedBy: 'Taking identity from the authenticated session instead of the request body.',
}
