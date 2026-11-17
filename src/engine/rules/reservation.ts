// Shared reading of "is there a reservation, and how does it end" for the Ticketmaster-style deep dives.
import type { State } from '../../core/state'
import { allText, matchingNodes } from '../board'
import { has } from '../text'

export const RESERVATION = ['reserv*', 'seat hold', 'temporary hold', 'pending booking', 'held']
/** A timer attached to the reservation itself (the usual improvement over a sweep). */
export const STRONG_EXPIRY = ['ttl', 'time to live', 'auto expir*', 'key expiry', 'native expiry', 'expires automatically']
/** A cleanup that runs on a schedule. The stale window is up to its interval. */
export const PERIODIC = ['cron', 'periodic*', 'sweep*', 'reaper', 'scheduled job', 'scheduled task', 'scheduled cleanup', 'cleanup job', 'clean up job', 'batch job']
/** Anything that ends a reservation after a while. */
export const ANY_EXPIRY = [...STRONG_EXPIRY, ...PERIODIC, 'expir*', 'timeout', 'time out', 'release*', 'cleanup', 'clean up']

export const hasReservation = (s: State): boolean => has(allText(s), RESERVATION)

/** The learner's own names for where reservations show up: boxes first, else API lines. */
export function reservationSubjects(s: State): string[] {
  const nodes = matchingNodes(s, (t) => has(t, RESERVATION)).map((n) => n.label)
  if (nodes.length) return nodes
  return s.contract.api.split('\n').map((l) => l.trim()).filter((l) => has(l, RESERVATION)).map((l) => l.slice(0, 40))
}
