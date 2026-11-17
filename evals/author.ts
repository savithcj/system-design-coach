// How fixtures are written: describe a session in a few lines, run `npx tsx evals/author.ts`, and the event logs are
// written to evals/fixtures/*.json. The JSON is what gets reviewed and run. A bug found by hand becomes a fixture here
// first (or paste a log from "Copy events" into a JSON file by hand).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultLabel } from '../src/core/actions'
import { append, type Actor, type EventLog, type KnownType, type PayloadMap } from '../src/core/events'
import { freeSlot } from '../src/core/layout'
import { reduce } from '../src/core/reduce'
import type { Role } from '../src/core/roles'
import type { Fixture } from './harness'

class Sess {
  log: EventLog = []
  now = 1_700_000_000_000
  constructor(problem: string) { this.add('ProblemLoaded', { problemId: problem }, 'system') }
  add<K extends KnownType>(type: K, payload: PayloadMap[K], actor: Actor = 'user') {
    this.now += 4000
    this.log = append(this.log, type, payload, actor, this.now)
  }
  node(role: Role, label: string, note?: string): string {
    const id = `n${this.log.length + 1}`
    this.add('NodeAdded', { id, role, label: label || defaultLabel(reduce(this.log), role), ...freeSlot(reduce(this.log).nodes, 1000) })
    if (note) this.add('NodeNoteUpdated', { id, text: note })
    return id
  }
  edge(a: string, b: string, label?: string) {
    const id = `e${this.log.length + 1}`
    this.add('EdgeAdded', { id, a, b })
    if (label) this.add('EdgeLabeled', { id, label })
  }
  text(block: 'functional' | 'outofscope' | 'nonfunctional' | 'entities' | 'api', ...lines: string[]) { this.add('ContractNoteUpdated', { block, text: lines.join('\n') }) }
  stage(n: number) { this.add('StageChanged', { stage: n }) }
}

type Make = (s: Sess) => void
const defs: { id: string; problem: string; stage: number; level?: Fixture['level']; make: Make; expect: Fixture['expect'] }[] = []
const fx = (id: string, problem: string, stage: number, make: Make, expect: Fixture['expect'], level?: Fixture['level']) =>
  defs.push({ id, problem, stage, level, make, expect })

// ---- Ticketmaster building blocks (our own wording) ----
const TM_FUNC = ['search events', 'view an event and its seat map', 'book a ticket', '---', 'payments', 'admin tools', 'refunds', 'dynamic pricing']
const TM_NFR = ['strong consistency for booking, no double sales', 'high availability for search and browsing', 'read-heavy: about 100 reads per booking', 'handles a surge: up to 10x in minutes']
const TM_ENT = ['Event', 'Venue', 'Performer', 'Ticket', 'Booking']
const TM_API = ['GET /events?term= (search events)', 'GET /events/{id} (view an event and its seat map)', 'POST /events/{id}/tickets/reserve', 'POST /bookings/confirm']
const contract = (s: Sess, api = TM_API) => { s.text('functional', ...TM_FUNC); s.text('nonfunctional', ...TM_NFR); s.text('entities', ...TM_ENT); s.text('api', ...api) }

/** Client, gateway, three services, a relational store, a payment provider outside. Returns ids. */
function tmBoard(s: Sess, o: { dbNote?: string; bookingNote?: string } = {}) {
  const c = s.node('client', 'Web app'), gw = s.node('service', 'API gateway'), ev = s.node('service', 'Event service')
  const se = s.node('service', 'Search service'), bk = s.node('service', 'Booking service', o.bookingNote)
  const db = s.node('db', 'Postgres', o.dbNote), pay = s.node('other', 'Payment provider')
  s.edge(c, gw); s.edge(gw, ev); s.edge(gw, se); s.edge(gw, bk); s.edge(ev, db); s.edge(se, db); s.edge(bk, db); s.edge(bk, pay)
  return { c, gw, ev, se, bk, db, pay }
}
const withHold = (s: Sess, b: ReturnType<typeof tmBoard>, note = 'seat reservation with TTL 10m') => { const r = s.node('cache', 'Redis', note); s.edge(b.bk, r) }
const withLine = (s: Sess, b: ReturnType<typeof tmBoard>) => { const q = s.node('queue', 'Waiting line'); s.edge(b.gw, q); s.edge(q, b.bk) }

// ---- Ticketmaster ----
fx('tm_clean_hld', 'ticketmaster', 4, (s) => { contract(s); s.stage(4); tmBoard(s) },
  { flags: ['DD_RESERVATION_NO_EXPIRY', 'DD_SURGE_NO_CHOKEPOINT'], notFlags: ['HLD_CLIENT_TO_DB', 'HLD_NO_ENTRY_POINT', 'HLD_UNFINISHED_PATH', 'REQ_NO_OUT_OF_SCOPE', 'API_SINGLE_STEP_BOOKING'],
    move: 'affirm_and_advance' })

fx('tm_user_id_cron_and_like', 'ticketmaster', 4, (s) => {
  contract(s, ['GET /events?term= (search events)', 'GET /events/{id} (view an event and its seat map)', 'POST /events/{id}/tickets/reserve { userId, seatId }', 'POST /bookings/confirm'])
  s.stage(4); tmBoard(s, { dbNote: 'search events with LIKE', bookingNote: 'cron every 5 min releases abandoned reservations' })
}, { flags: ['API_USER_ID_IN_BODY', 'DD_SEARCH_FULL_SCAN', 'DD_CRON_STALE_WINDOW', 'DD_SURGE_NO_CHOKEPOINT'], notFlags: ['HLD_CLIENT_TO_DB', 'DD_RESERVATION_NO_EXPIRY'],
  move: 'challenge_assumption', moveAbout: ['API_USER_ID_IN_BODY'], forbiddenInReply: ['waiting queue', 'server-sent events'] })

fx('tm_no_repeat_after_asking', 'ticketmaster', 4, (s) => {
  contract(s, ['GET /events?term= (search events)', 'GET /events/{id} (view an event and its seat map)', 'POST /events/{id}/tickets/reserve { userId, seatId }', 'POST /bookings/confirm'])
  s.stage(4); tmBoard(s)
  s.add('CoachResponded', { kind: 'reply', message: 'Who gets to say which user is calling?', ruleId: 'API_USER_ID_IN_BODY', level: 1, move: 'challenge_assumption' }, 'coach')
}, { flags: ['API_USER_ID_IN_BODY', 'DD_RESERVATION_NO_EXPIRY', 'DD_SURGE_NO_CHOKEPOINT'], move: 'stay_quiet' })

fx('tm_client_to_db', 'ticketmaster', 4, (s) => {
  s.stage(4)
  const c = s.node('client', 'Web app'); s.node('service', 'Booking service'); const db = s.node('db', 'Postgres'); s.edge(c, db)
}, { flags: ['HLD_CLIENT_TO_DB', 'HLD_UNFINISHED_PATH'], move: 'challenge_assumption', moveAbout: ['HLD_CLIENT_TO_DB'] })

fx('tm_single_step_booking', 'ticketmaster', 3, (s) => {
  s.text('functional', ...TM_FUNC); s.text('nonfunctional', ...TM_NFR); s.text('entities', ...TM_ENT)
  s.text('api', 'GET /events?term= (search events)', 'GET /events/{id} (view an event and its seat map)', 'POST /bookings (book a ticket)'); s.stage(3)
}, { flags: ['API_SINGLE_STEP_BOOKING'], move: 'probe_bottleneck', moveAbout: ['API_SINGLE_STEP_BOOKING'], forbiddenInReply: ['reserve', 'confirm', 'hold'] })

fx('tm_api_missing_coverage', 'ticketmaster', 3, (s) => {
  s.text('functional', ...TM_FUNC); s.text('nonfunctional', ...TM_NFR); s.text('entities', ...TM_ENT)
  s.text('api', 'GET /events?term= (search events)', 'POST /events/{id}/tickets/reserve', 'POST /bookings/confirm'); s.stage(3)
}, { flags: ['API_NO_COVERAGE', 'DD_RESERVATION_NO_EXPIRY'], move: 'ask_clarifying', moveAbout: ['API_NO_COVERAGE'] })

fx('tm_reservation_cron_only', 'ticketmaster', 5, (s) => {
  contract(s); s.stage(5); const b = tmBoard(s, { bookingNote: 'cron every 5 min releases abandoned reservations' }); withLine(s, b)
}, { flags: ['DD_CRON_STALE_WINDOW'], notFlags: ['DD_RESERVATION_NO_EXPIRY'], move: 'probe_bottleneck', moveAbout: ['DD_CRON_STALE_WINDOW'], forbiddenInReply: ['ttl', 'time-to-live'] })

fx('tm_ttl_hold_valid_alternative', 'ticketmaster', 5, (s) => {
  contract(s); s.stage(5); const b = tmBoard(s, { dbNote: 'unique constraint on seat as the last check' }); withHold(s, b); withLine(s, b)
}, { flags: [], notFlags: ['DD_CRON_STALE_WINDOW', 'DD_RESERVATION_NO_EXPIRY', 'DD_LOCK_STORE_OUTAGE'], move: 'affirm_and_advance' })

const lockOutage = (s: Sess) => { contract(s); s.stage(5); const b = tmBoard(s); withHold(s, b); withLine(s, b) }
fx('tm_lock_outage_mid', 'ticketmaster', 5, lockOutage, { flags: ['DD_LOCK_STORE_OUTAGE'], move: 'affirm_and_advance', moveNot: ['scale_curveball'] }, 'mid')
fx('tm_lock_outage_senior', 'ticketmaster', 5, lockOutage, { flags: ['DD_LOCK_STORE_OUTAGE'], move: 'scale_curveball', moveAbout: ['DD_LOCK_STORE_OUTAGE'] }, 'senior')

fx('tm_search_full_scan', 'ticketmaster', 5, (s) => {
  contract(s); s.stage(5); const b = tmBoard(s, { dbNote: 'search events with LIKE; unique constraint on seat' }); withHold(s, b); withLine(s, b)
}, { flags: ['DD_SEARCH_FULL_SCAN'], move: 'probe_bottleneck', moveAbout: ['DD_SEARCH_FULL_SCAN'], forbiddenInReply: ['elasticsearch', 'search index'] })

fx('tm_search_index_valid_alternative', 'ticketmaster', 5, (s) => {
  contract(s); s.stage(5); const b = tmBoard(s, { dbNote: 'events and tickets; unique constraint on seat' }); withHold(s, b); withLine(s, b)
  const ix = s.node('db', 'OpenSearch', 'search index fed by change data capture'); s.edge(b.se, ix, 'search'); s.edge(b.db, ix, 'changes')
}, { flags: [], notFlags: ['DD_SEARCH_FULL_SCAN', 'DD_SEARCH_PRIMARY_STORE'], move: 'affirm_and_advance' })

fx('tm_search_index_only_store', 'ticketmaster', 5, (s) => {
  contract(s, [...TM_API.slice(0, 2), 'POST /events/{id}/tickets/reserve (hold ends by TTL 10m)', TM_API[3]!]); s.stage(5)
  const c = s.node('client', 'Web app'), gw = s.node('service', 'API gateway'), se = s.node('service', 'Search service'), bk = s.node('service', 'Booking service')
  const ix = s.node('db', 'Elasticsearch'), q = s.node('queue', 'Waiting line')
  s.edge(c, gw); s.edge(gw, se); s.edge(gw, q); s.edge(q, bk); s.edge(se, ix); s.edge(bk, ix)
}, { flags: ['DD_SEARCH_PRIMARY_STORE'], move: 'challenge_assumption', moveAbout: ['DD_SEARCH_PRIMARY_STORE'], forbiddenInReply: ['change data capture', 'cdc'] }, 'senior')

fx('tm_surge_no_chokepoint', 'ticketmaster', 5, (s) => {
  contract(s); s.stage(5); const b = tmBoard(s, { dbNote: 'unique constraint on seat as the last check' }); withHold(s, b)
}, { flags: ['DD_SURGE_NO_CHOKEPOINT'], move: 'probe_bottleneck', moveAbout: ['DD_SURGE_NO_CHOKEPOINT'], forbiddenInReply: ['waiting queue', 'waiting room', 'rate limit'] })

fx('tm_cap_unscoped', 'ticketmaster', 1, (s) => {
  s.text('functional', ...TM_FUNC); s.text('nonfunctional', 'consistent and highly available', 'read-heavy: about 100 reads per booking'); s.stage(1)
}, { flags: ['REQ_VAGUE_NFR', 'REQ_CAP_UNSCOPED'], move: 'ask_clarifying', moveAbout: ['REQ_VAGUE_NFR', 'REQ_CAP_UNSCOPED'] })

fx('tm_requirements_valid_alternative', 'ticketmaster', 1, (s) => { s.text('functional', ...TM_FUNC); s.text('nonfunctional', ...TM_NFR); s.stage(1) },
  { flags: [], notFlags: ['REQ_CAP_UNSCOPED', 'REQ_VAGUE_NFR', 'REQ_TOO_MANY_FEATURES'], move: 'affirm_and_advance' })

// ---- Ported problems ----
fx('url_too_many_features', 'url', 1, (s) => {
  s.text('functional', 'shorten a link', 'follow a link', 'custom aliases', 'link expiry', 'click analytics', 'user accounts')
  s.stage(1)
}, { flags: ['REQ_TOO_MANY_FEATURES', 'REQ_NO_OUT_OF_SCOPE'], move: 'challenge_assumption', moveAbout: ['REQ_TOO_MANY_FEATURES'] })

fx('url_entity_detail', 'url', 2, (s) => {
  s.text('functional', 'shorten a link', 'follow a link', '---', 'accounts'); s.text('nonfunctional', 'redirect under 100 ms for most requests')
  s.text('entities', 'Link: code varchar(8), target text, created timestamp', 'Click'); s.stage(2)
}, { flags: ['ENT_PREMATURE_DETAIL'], move: 'challenge_assumption', moveAbout: ['ENT_PREMATURE_DETAIL'] })

fx('url_cache_before_route', 'url', 4, (s) => { s.stage(4); const c = s.node('client', 'Phone'), r = s.node('cache', 'Redis'); s.edge(c, r) },
  { flags: ['HLD_PREMATURE_OPTIMISATION', 'HLD_UNFINISHED_PATH'], move: 'challenge_assumption', moveAbout: ['HLD_PREMATURE_OPTIMISATION'] })

fx('feed_no_entry_point', 'feed', 4, (s) => {
  s.stage(4)
  const c = s.node('client', 'App'), a = s.node('service', 'Posting server'), b = s.node('service', 'Reading server')
  const db = s.node('db', 'Posts store'), blob = s.node('blob', 'Image store')
  s.edge(c, a); s.edge(c, b); s.edge(a, db); s.edge(b, db); s.edge(a, blob)
}, { flags: ['HLD_NO_ENTRY_POINT'], move: 'ask_clarifying', moveAbout: ['HLD_NO_ENTRY_POINT'], forbiddenInReply: ['load balancer', 'gateway'] })

fx('rate_valid_alternative_names', 'rate', 4, (s) => {
  s.stage(4)
  const c = s.node('client', 'Partner app'), e = s.node('service', 'Envoy edge proxy'), l = s.node('service', 'Limiter')
  const r = s.node('cache', 'Redis counters'), d = s.node('db', 'Tier rules'), api = s.node('service', 'API fleet')
  s.edge(c, e); s.edge(e, l); s.edge(l, r); s.edge(l, d); s.edge(l, api)
}, { flags: [], notFlags: ['HLD_NO_ENTRY_POINT', 'HLD_UNFINISHED_PATH', 'HLD_PREMATURE_OPTIMISATION', 'HLD_CLIENT_TO_DB'], move: 'affirm_and_advance' })

// ---- write ----
const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir)
for (const d of defs) {
  const s = new Sess(d.problem); d.make(s)
  const out: Fixture = { id: d.id, problem: d.problem, stage: d.stage, ...(d.level ? { level: d.level } : {}), events: [...s.log], expect: d.expect }
  writeFileSync(join(dir, `${d.id}.json`), JSON.stringify(out, null, 1) + '\n')
}
console.log(`wrote ${defs.length} fixtures`)
