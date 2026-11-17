import { describe, expect, it } from 'vitest'
import { evaluate } from '../../src/engine/evaluate'
import { RULES } from '../../src/engine/rules/registry'
import { PLAIN, PROBLEM, board, type B } from './helpers'

const flags = (b: B, problem = PROBLEM) => evaluate(b.state(), problem).map((v) => v.ruleId)
const lines = (...l: string[]) => l.join('\n')

type Case = { rule: string; name: string; fires: boolean; setup: (b: B) => void }
const cases: Case[] = [
  // Stage 1
  { rule: 'REQ_TOO_MANY_FEATURES', name: 'six features', fires: true, setup: (b) => b.text('functional', lines('a one', 'b two', 'c three', 'd four', 'e five', 'f six')) },
  { rule: 'REQ_TOO_MANY_FEATURES', name: 'four features is fine', fires: false, setup: (b) => b.text('functional', lines('- shorten', '- redirect', '- stats', '- expire')) },
  { rule: 'REQ_TOO_MANY_FEATURES', name: 'lines below the line do not count', fires: false, setup: (b) => b.text('functional', lines('a', 'b', '---', 'c', 'd', 'e', 'f', 'g')) },
  { rule: 'REQ_NO_OUT_OF_SCOPE', name: 'no divider', fires: true, setup: (b) => b.text('functional', lines('shorten urls', 'redirect')) },
  { rule: 'REQ_NO_OUT_OF_SCOPE', name: 'divider with items', fires: false, setup: (b) => b.text('functional', lines('shorten urls', '---', 'billing')) },
  { rule: 'REQ_NO_OUT_OF_SCOPE', name: 'divider with nothing under it', fires: true, setup: (b) => b.text('functional', lines('shorten urls', '---')) },
  { rule: 'REQ_NO_OUT_OF_SCOPE', name: 'empty block says nothing', fires: false, setup: () => {} },
  { rule: 'REQ_VAGUE_NFR', name: 'bare "low latency"', fires: true, setup: (b) => b.text('nonfunctional', lines('low latency', 'scalable')) },
  { rule: 'REQ_VAGUE_NFR', name: 'a number settles it', fires: false, setup: (b) => b.text('nonfunctional', 'p99 redirect under 100 ms') },
  { rule: 'REQ_VAGUE_NFR', name: 'a scoped claim is not vague', fires: false, setup: (b) => b.text('nonfunctional', 'high availability for browsing') },
  { rule: 'REQ_CAP_UNSCOPED', name: 'both promised in one line', fires: true, setup: (b) => b.text('nonfunctional', 'consistent and highly available') },
  { rule: 'REQ_CAP_UNSCOPED', name: 'both bare on separate lines', fires: true, setup: (b) => b.text('nonfunctional', lines('strong consistency', 'high availability')) },
  { rule: 'REQ_CAP_UNSCOPED', name: 'each scoped to a path', fires: false, setup: (b) => b.text('nonfunctional', lines('strong consistency for booking', 'availability for search')) },
  { rule: 'REQ_CAP_UNSCOPED', name: 'only one claimed', fires: false, setup: (b) => b.text('nonfunctional', 'strong consistency') },
  // Stage 2
  { rule: 'ENT_PREMATURE_DETAIL', name: 'column types', fires: true, setup: (b) => b.text('entities', lines('Event', 'Ticket: id uuid, price bigint')) },
  { rule: 'ENT_PREMATURE_DETAIL', name: 'traffic numbers', fires: true, setup: (b) => b.text('entities', lines('Event', 'Booking 5000 QPS')) },
  { rule: 'ENT_PREMATURE_DETAIL', name: 'names only', fires: false, setup: (b) => b.text('entities', lines('Event', 'Venue', 'Ticket', 'Booking')) },
  { rule: 'ENT_PREMATURE_DETAIL', name: '"print" does not look like "int"', fires: false, setup: (b) => b.text('entities', 'Printout') },
  // Stage 3
  { rule: 'API_NO_COVERAGE', name: 'a requirement with no call', fires: true, setup: (b) => { b.text('functional', lines('search events', 'view a seat map')); b.text('api', 'GET /events?term=') } },
  { rule: 'API_NO_COVERAGE', name: 'every requirement has a call', fires: false, setup: (b) => { b.text('functional', lines('search events', 'view a seat map')); b.text('api', lines('GET /events?term=', 'GET /events/{id}/seats')) } },
  { rule: 'API_NO_COVERAGE', name: 'plural vs singular still matches', fires: false, setup: (b) => { b.text('functional', 'users shorten URLs'); b.text('api', 'POST /url') } },
  { rule: 'API_USER_ID_IN_BODY', name: 'userId in the body', fires: true, setup: (b) => b.text('api', 'POST /bookings { userId, ticketId }') },
  { rule: 'API_USER_ID_IN_BODY', name: 'identity from a header', fires: false, setup: (b) => b.text('api', 'POST /bookings { ticketId } (user from auth header)') },
  { rule: 'API_USER_ID_IN_BODY', name: 'a user id in the path is a resource, not a claim', fires: false, setup: (b) => b.text('api', 'GET /users/{userId}/bookings') },
  { rule: 'API_USER_ID_IN_BODY', name: 'path parameter on a write is still fine', fires: false, setup: (b) => b.text('api', 'PUT /users/{userId}/settings { theme }') },
  { rule: 'API_SINGLE_STEP_BOOKING', name: 'one booking call', fires: true, setup: (b) => b.text('api', 'POST /bookings { ticketId }') },
  { rule: 'API_SINGLE_STEP_BOOKING', name: 'reserve then confirm', fires: false, setup: (b) => b.text('api', lines('POST /tickets/{id}/reserve', 'POST /bookings/confirm')) },
  { rule: 'API_SINGLE_STEP_BOOKING', name: 'a hold then a purchase call', fires: false, setup: (b) => b.text('api', lines('POST /seats/{id}/hold', 'POST /purchase')) },
  { rule: 'API_SINGLE_STEP_BOOKING', name: 'no booking at all', fires: false, setup: (b) => b.text('api', 'GET /events') },
  // Stage 4
  { rule: 'HLD_CLIENT_TO_DB', name: 'client straight to db', fires: true, setup: (b) => { const c = b.node('client', 'App'), d = b.node('db', 'Store'); b.edge(c, d) } },
  { rule: 'HLD_CLIENT_TO_DB', name: 'arrow drawn the other way too', fires: true, setup: (b) => { const c = b.node('client', 'App'), d = b.node('db', 'Store'); b.edge(d, c) } },
  { rule: 'HLD_CLIENT_TO_DB', name: 'a server in between', fires: false, setup: (b) => { const c = b.node('client', 'App'), v = b.node('service', 'API'), d = b.node('db', 'Store'); b.edge(c, v); b.edge(v, d) } },
  { rule: 'HLD_NO_ENTRY_POINT', name: 'client reaches two servers', fires: true, setup: (b) => { const c = b.node('client', 'App'), x = b.node('service', 'Search'), y = b.node('service', 'Booking'); b.edge(c, x); b.edge(c, y) } },
  { rule: 'HLD_NO_ENTRY_POINT', name: 'a gateway in front', fires: false, setup: (b) => { const c = b.node('client', 'App'), g = b.node('service', 'API gateway'), x = b.node('service', 'Search'); b.edge(c, g); b.edge(g, x) } },
  { rule: 'HLD_NO_ENTRY_POINT', name: 'a balancer named in a note counts', fires: false, setup: (b) => { const c = b.node('client', 'App'), g = b.node('service', 'Front', 'acts as load balancer'), x = b.node('service', 'Search'); b.edge(c, g); b.edge(g, x) } },
  { rule: 'HLD_NO_ENTRY_POINT', name: 'one server the client uses, one worker behind', fires: false, setup: (b) => { const c = b.node('client', 'App'), x = b.node('service', 'API'), w = b.node('service', 'Worker'); b.edge(c, x); b.edge(x, w) } },
  { rule: 'HLD_UNFINISHED_PATH', name: 'server not yet connected to storage', fires: true, setup: (b) => { const c = b.node('client', 'App'), v = b.node('service', 'API'); b.node('db', 'Store'); b.edge(c, v) } },
  { rule: 'HLD_UNFINISHED_PATH', name: 'complete route', fires: false, setup: (b) => { const c = b.node('client', 'App'), v = b.node('service', 'API'), d = b.node('db', 'Store'); b.edge(c, v); b.edge(v, d) } },
  { rule: 'HLD_UNFINISHED_PATH', name: 'any technology in the categories passes', fires: false, setup: (b) => { const c = b.node('client', 'Phone'), v = b.node('service', 'Lambda'), d = b.node('db', 'DynamoDB'); b.edge(c, v); b.edge(v, d) } },
  { rule: 'HLD_PREMATURE_OPTIMISATION', name: 'cache before any route', fires: true, setup: (b) => { b.node('client', 'App'); b.node('cache', 'Redis') } },
  { rule: 'HLD_PREMATURE_OPTIMISATION', name: 'a queue before any route', fires: true, setup: (b) => { b.node('service', 'API'); b.node('queue', 'Jobs') } },
  { rule: 'HLD_PREMATURE_OPTIMISATION', name: 'cache after the basic route', fires: false, setup: (b) => { const c = b.node('client', 'App'), v = b.node('service', 'API'), d = b.node('db', 'Store'); b.edge(c, v); b.edge(v, d); b.node('cache', 'Redis') } },
  // Stage 5
  { rule: 'DD_RESERVATION_NO_EXPIRY', name: 'reservation with no end', fires: true, setup: (b) => b.text('api', 'POST /tickets/{id}/reserve') },
  { rule: 'DD_RESERVATION_NO_EXPIRY', name: 'a stated timeout', fires: false, setup: (b) => b.text('api', 'POST /tickets/{id}/reserve (timeout after 10 minutes)') },
  { rule: 'DD_RESERVATION_NO_EXPIRY', name: 'no reservation, nothing to expire', fires: false, setup: (b) => b.text('api', 'GET /events') },
  { rule: 'DD_CRON_STALE_WINDOW', name: 'a periodic cleanup is all there is', fires: true, setup: (b) => { b.text('api', 'POST /reserve'); b.node('service', 'Cleanup', 'cron every 5 min frees expired reservations') } },
  { rule: 'DD_CRON_STALE_WINDOW', name: 'TTL on the hold with a sweep as backup', fires: false, setup: (b) => { b.text('api', 'POST /reserve'); b.node('cache', 'Holds', 'reservation with TTL 10m'); b.node('service', 'Cleanup', 'sweep as safety net') } },
  { rule: 'DD_CRON_STALE_WINDOW', name: 'a different timer wording', fires: false, setup: (b) => { b.text('api', 'POST /reserve'); b.node('cache', 'Holds', 'reservation, time-to-live 10 min') } },
  { rule: 'DD_SEARCH_FULL_SCAN', name: 'search note on the main database', fires: true, setup: (b) => b.node('db', 'Postgres', 'search events with LIKE') },
  { rule: 'DD_SEARCH_FULL_SCAN', name: 'an arrow labelled search into the database', fires: true, setup: (b) => { const v = b.node('service', 'API'), d = b.node('db', 'Postgres'); b.edge(v, d, 'search events') } },
  { rule: 'DD_SEARCH_FULL_SCAN', name: 'a search index on the board', fires: false, setup: (b) => { const v = b.node('service', 'API'), d = b.node('db', 'Postgres', 'events'), i = b.node('db', 'OpenSearch', 'search index'); b.edge(v, i, 'search'); b.edge(v, d) } },
  { rule: 'DD_SEARCH_FULL_SCAN', name: 'a different index technology still passes', fires: false, setup: (b) => { const v = b.node('service', 'API'), d = b.node('db', 'Postgres'), i = b.node('other', 'Typesense'); b.edge(v, i, 'search'); b.edge(v, d) } },
  { rule: 'DD_SEARCH_PRIMARY_STORE', name: 'index is the only store', fires: true, setup: (b) => { const v = b.node('service', 'API'), i = b.node('db', 'Elasticsearch'); b.edge(v, i) } },
  { rule: 'DD_SEARCH_PRIMARY_STORE', name: 'database plus index', fires: false, setup: (b) => { const v = b.node('service', 'API'), d = b.node('db', 'Postgres'), i = b.node('db', 'Elasticsearch'); b.edge(v, d); b.edge(v, i) } },
  { rule: 'DD_SURGE_NO_CHOKEPOINT', name: 'client to server to store, nothing limiting', fires: true, setup: (b) => { const c = b.node('client', 'App'), v = b.node('service', 'API'), d = b.node('db', 'Store'); b.edge(c, v); b.edge(v, d) } },
  { rule: 'DD_SURGE_NO_CHOKEPOINT', name: 'a queue box in front', fires: false, setup: (b) => { const c = b.node('client', 'App'), v = b.node('service', 'API'), q = b.node('queue', 'Line'), d = b.node('db', 'Store'); b.edge(c, v); b.edge(v, q); b.edge(q, d) } },
  { rule: 'DD_SURGE_NO_CHOKEPOINT', name: 'a stated throttle', fires: false, setup: (b) => { const c = b.node('client', 'App'), v = b.node('service', 'API', 'throttles bookings per event'), d = b.node('db', 'Store'); b.edge(c, v); b.edge(v, d) } },
  { rule: 'DD_LOCK_STORE_OUTAGE', name: 'seat holds in a cache with no plan', fires: true, setup: (b) => { b.node('cache', 'Redis', 'seat lock with TTL') } },
  { rule: 'DD_LOCK_STORE_OUTAGE', name: 'a fallback is written down', fires: false, setup: (b) => { b.node('cache', 'Redis', 'seat lock with TTL'); b.node('db', 'Postgres', 'unique constraint on seat as last check') } },
  { rule: 'DD_LOCK_STORE_OUTAGE', name: 'the category wins: a hold in a database box is not a cache', fires: false, setup: (b) => { b.node('db', 'Redis', 'seat lock with TTL') } },
]

describe('rules: positive, negative and valid-alternative cases', () => {
  it.each(cases)('$rule: $name', ({ rule, fires, setup }) => {
    const b = board()
    setup(b)
    expect(flags(b).includes(rule)).toBe(fires)
  })

  it('every rule has at least one firing and one silent case', () => {
    for (const r of RULES) {
      const mine = cases.filter((c) => c.rule === r.id)
      expect(mine.some((c) => c.fires), `${r.id} positive`).toBe(true)
      expect(mine.some((c) => !c.fires), `${r.id} negative`).toBe(true)
    }
  })

  it('problem-specific rules stay silent unless the problem switches them on', () => {
    const b = board()
    b.text('api', 'POST /bookings { ticketId }')
    b.node('db', 'Postgres', 'search events with LIKE')
    expect(flags(b, PLAIN).filter((id) => id.startsWith('DD_') || id === 'API_SINGLE_STEP_BOOKING')).toEqual([])
    expect(flags(b)).toContain('API_SINGLE_STEP_BOOKING')
  })

  it('violations carry the rule, its stage, and only the learner\'s own words as subjects', () => {
    const b = board()
    const c = b.node('client', 'Phone app'), d = b.node('db', 'Ledger')
    b.edge(c, d)
    const v = evaluate(b.state(), PROBLEM).find((x) => x.ruleId === 'HLD_CLIENT_TO_DB')!
    expect(v).toMatchObject({ stage: 4, severity: 'warn', evidence: [expect.any(String)] })
    expect(v.subjects).toEqual(['Phone app and Ledger'])
  })

  it('evaluating twice gives identical results (pure)', () => {
    const b = board()
    b.text('functional', 'a\nb\nc\nd\ne')
    expect(evaluate(b.state(), PROBLEM)).toEqual(evaluate(b.state(), PROBLEM))
  })

  it('rule ids are unique', () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length)
  })
})
