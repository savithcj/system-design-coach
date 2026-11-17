// The reference designs. Read ONLY by the report after SessionFinished; never by the engine, the coach or any prompt.
// tests/problems.test.ts checks that nothing else imports this file.
import type { Baseline } from './types'

export const BASELINES: Readonly<Record<string, Baseline>> = {
  url: {
    nodes: [
      { id: 'c', role: 'client', label: 'Client', why: 'Browsers and apps create links and follow redirects.' },
      { id: 'lb', role: 'service', label: 'Load Balancer', why: 'Spreads traffic over stateless API servers and removes a single point of failure.' },
      { id: 'api', role: 'service', label: 'API Server', why: 'Stateless service handling create and redirect, scaled horizontally.' },
      { id: 'id', role: 'service', label: 'ID Generator', why: 'Produces unique short codes without collisions, for example by handing out counter ranges.', ddia: 'partitioning and unique ID generation' },
      { id: 'cache', role: 'cache', label: 'Cache', why: 'Hot code-to-URL mappings are served from memory so most redirects never touch the database.', ddia: 'caching and read-heavy workloads' },
      { id: 'db', role: 'db', label: 'Database', why: 'Durable key-value store for code to URL mappings; the access pattern is point lookups.', ddia: 'storage engines, replication, partitioning' },
      { id: 'q', role: 'queue', label: 'Message Queue', why: 'Click events are published asynchronously so the redirect path stays fast.', ddia: 'stream processing and messaging' },
      { id: 'w', role: 'service', label: 'Worker', why: 'Consumes click events and aggregates them in batches.' },
    ],
    edges: [['c', 'lb'], ['lb', 'api'], ['api', 'id'], ['api', 'cache'], ['api', 'db'], ['api', 'q'], ['q', 'w'], ['w', 'db']],
  },
  rate: {
    nodes: [
      { id: 'c', role: 'client', label: 'Client', why: 'The callers whose request rate we want to bound.' },
      { id: 'lb', role: 'service', label: 'Load Balancer', why: 'Entry point that distributes requests and forwards them through the limiter.' },
      { id: 'rl', role: 'service', label: 'Rate Limiter', why: 'Rejects excess requests early with 429 so the backend is protected.', ddia: 'consistency and atomic counters' },
      { id: 'cache', role: 'cache', label: 'Counter Store', why: 'Shared in-memory counters with expiry, updated with atomic increments.', ddia: 'caching, consistency' },
      { id: 'db', role: 'db', label: 'Rules Database', why: 'Per-customer limits are configuration, read rarely and cached locally by the limiter.' },
      { id: 'api', role: 'service', label: 'API Servers', why: 'The backend that only sees traffic the limiter has allowed.' },
    ],
    edges: [['c', 'lb'], ['lb', 'rl'], ['rl', 'cache'], ['rl', 'db'], ['rl', 'api']],
  },
  feed: {
    nodes: [
      { id: 'c', role: 'client', label: 'Client', why: 'Apps that publish posts and read feeds.' },
      { id: 'cdn', role: 'service', label: 'CDN', why: 'Serves media from edge locations, offloading the origin.' },
      { id: 'blob', role: 'blob', label: 'Object Storage', why: 'Cheap durable storage for media; the database only keeps references.' },
      { id: 'lb', role: 'service', label: 'Load Balancer', why: 'Distributes requests over stateless API servers.' },
      { id: 'api', role: 'service', label: 'API Server', why: 'Handles publish and read-feed requests.' },
      { id: 'db', role: 'db', label: 'Posts and Graph DB', why: 'Source of truth for posts and follow relationships.', ddia: 'data models, partitioning, replication' },
      { id: 'q', role: 'queue', label: 'Fan-out Queue', why: 'Decouples publishing from feed delivery so posting returns immediately.', ddia: 'describing load, fan-out, stream processing' },
      { id: 'w', role: 'service', label: 'Fan-out Worker', why: 'Looks up followers and writes the post into their feeds.' },
      { id: 'cache', role: 'cache', label: 'Feed Cache', why: 'Precomputed per-user feeds make reads a single cache lookup.', ddia: 'materialized views and caching' },
    ],
    edges: [['c', 'cdn'], ['cdn', 'blob'], ['c', 'lb'], ['lb', 'api'], ['api', 'db'], ['api', 'blob'], ['api', 'q'], ['q', 'w'], ['w', 'db'], ['w', 'cache'], ['api', 'cache']],
  },
  ticketmaster: {
    nodes: [
      { id: 'c', role: 'client', label: 'Client', why: 'Browsers and apps used to search, view and book.' },
      { id: 'gw', role: 'service', label: 'API Gateway', why: 'Single entry point: authentication, routing and basic limits.' },
      { id: 'ev', role: 'service', label: 'Event Service', why: 'Serves event and seat-map reads; read-heavy and easy to scale out.' },
      { id: 'se', role: 'service', label: 'Search Service', why: 'Answers searches without touching the booking path.' },
      { id: 'bk', role: 'service', label: 'Booking Service', why: 'Reserves seats, confirms bookings and talks to the payment provider.' },
      { id: 'db', role: 'db', label: 'Relational Database', why: 'Holds events and tickets with a reservation status; transactions prevent double booking.', ddia: 'transactions and isolation' },
      { id: 'pay', role: 'other', label: 'Payment Provider', why: 'Outside the system: card details never touch our servers.' },
    ],
    edges: [['c', 'gw'], ['gw', 'ev'], ['gw', 'se'], ['gw', 'bk'], ['ev', 'db'], ['se', 'db'], ['bk', 'db'], ['bk', 'pay']],
  },
}
