import type { Problem } from './types'

export const rate: Problem = {
  id: 'rate', title: 'Design an API rate limiter', short: 'Rate limiter',
  prompt: 'Limit each client to a fixed number of requests per minute across a fleet of API servers. Rejected requests get a 429 response. Limits differ per customer tier. The limiter must add very little latency.',
  stageRubrics: {
    1: 'Limit by client per minute with a stated tier rule; what happens to a rejected call; latency budget as a number.',
    2: 'Names only: client, tier, limit rule.',
    3: 'The limited calls pass through unchanged; rejection returns 429 with when to retry.',
    4: 'A front door, the limiter before the backend, shared counters, and where tier rules are kept.',
    5: 'Counters shared across limiter nodes with atomic updates and expiry; what happens when the counter store is down.',
  },
  requiredPaths: [{ name: 'check a counter', from: 'client', to: 'cache', via: ['service'] }],
  challenges: [],
  stageSpoilers: { 5: ['token bucket', 'sliding window', 'leaky bucket', 'lua script', 'atomic increment'] },
  nudges: [
    { role: 'client', text: 'Who is being limited?' },
    { role: 'service', text: 'What is the front door for all traffic?' },
    { role: 'service', text: 'Where do you decide to allow or reject, before the backend does any work?' },
    { role: 'cache', text: 'The limiter runs on many nodes. Where do the counters live so every node sees the same numbers?' },
    { role: 'db', text: 'Limits differ per tier. Where are those rules stored?' },
    { role: 'service', text: 'What is the protected resource at the end?' },
  ],
  scaleNotes: { assumptions: ['Every request touches the limiter, so its latency is added to all traffic'] },
}
