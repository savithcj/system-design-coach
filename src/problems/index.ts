import { feed } from './feed'
import { rate } from './rate'
import { ticketmaster } from './ticketmaster'
import { TUTORIAL } from './tutorial'
import type { Problem } from './types'
import { url } from './url'

export type { Problem } from './types'

// The order is the order of the problem tabs.
export const PROBLEMS: readonly Problem[] = [url, rate, feed, ticketmaster]

/** The tabs: the practice round first, then the real problems. */
export const TABS: readonly Problem[] = [TUTORIAL, ...PROBLEMS]

export function problemById(id: string | null): Problem {
  return TABS.find((p) => p.id === id) ?? PROBLEMS[0]!
}
