import { feed } from './feed'
import { rate } from './rate'
import { ticketmaster } from './ticketmaster'
import type { Problem } from './types'
import { url } from './url'

export type { Problem } from './types'

// The order is the order of the problem tabs.
export const PROBLEMS: readonly Problem[] = [url, rate, feed, ticketmaster]

export function problemById(id: string | null): Problem {
  return PROBLEMS.find((p) => p.id === id) ?? PROBLEMS[0]!
}
