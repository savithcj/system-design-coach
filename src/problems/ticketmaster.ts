import type { Problem } from './types'

export const ticketmaster: Problem = {
  id: 'ticketmaster', title: 'Design a ticket booking system', short: 'Tickets',
  prompt: 'Design an online ticket booking system for popular events. Users search for events, view a seat map and book a seat. Popular releases cause huge simultaneous demand.',
  stageRubrics: {
    1: 'Search events, view an event, book a ticket in scope; payments, admin and refunds below the line. No double booking for booking; high availability for search and browsing; read-heavy; surge traffic.',
    2: 'Names only: event, venue, performer, ticket, booking.',
    3: 'Search, view event, reserve a ticket, confirm a booking, each tied to a requirement. Identity from login, not the body.',
    4: 'Client, an entry point, event service, search path, booking service, a relational store holding events and tickets with reservation status. Payment provider outside the system.',
    5: 'Abandoned reservations expire on their own; search over a large catalogue; surge on a hot event; what happens when the fast store fails.',
  },
  requiredPaths: [
    { name: 'view an event', from: 'client', to: 'db', via: ['service'] },
    { name: 'book a ticket', from: 'client', to: 'db', via: ['service', 'service'] },
  ],
  challenges: [
    { ruleId: 'API_SINGLE_STEP_BOOKING', stage: 3, order: 0, trigger: 'booking is one call', whyItMatters: 'Two buyers can pick the same seat between choosing and paying unless the seat is held first.' },
    { ruleId: 'DD_RESERVATION_NO_EXPIRY', stage: 5, order: 1, trigger: 'a seat is held with no end', whyItMatters: 'Abandoned holds would remove seats from sale forever.' },
    { ruleId: 'DD_CRON_STALE_WINDOW', stage: 5, order: 2, trigger: 'holds end only by a periodic cleanup', whyItMatters: 'A seat can stay blocked for the whole interval after its buyer left, which hurts most on a hot event.' },
    { ruleId: 'DD_LOCK_STORE_OUTAGE', stage: 5, order: 3, trigger: 'holds live in a fast store with no stated fallback', whyItMatters: 'Losing that store must not allow double sales or strand seats.' },
    { ruleId: 'DD_SEARCH_FULL_SCAN', stage: 5, order: 4, trigger: 'search answered by the main database', whyItMatters: 'Substring search over millions of rows slows every other query.' },
    { ruleId: 'DD_SEARCH_PRIMARY_STORE', stage: 5, order: 5, trigger: 'the search structure is the only copy', whyItMatters: 'A search structure can be wrong or lost; it must be rebuildable from a source of truth.' },
    { ruleId: 'DD_SURGE_NO_CHOKEPOINT', stage: 5, order: 6, trigger: 'every client can reach the booking store at once', whyItMatters: 'A hot release can overwhelm the booking store unless entry is paced.' },
  ],
  stageSpoilers: {
    3: ['reserve then confirm', 'two-step booking'],
    5: ['ttl', 'time to live', 'waiting queue', 'waiting room', 'virtual queue', 'server-sent events', 'change data capture', 'cdc', 'elasticsearch', 'opensearch', 'search index', 'distributed lock'],
  },
  nudges: [
    { role: 'client', text: 'Who uses this, and from where?' },
    { role: 'service', text: 'What is the single front door that clients talk to?' },
    { role: 'service', text: 'Where do searching and viewing events happen, and where does booking happen?' },
    { role: 'db', text: 'Where do events and seats live durably, and what records that a seat is taken?' },
    { role: 'other', text: 'Money changes hands somewhere. Is that part of your system or someone else\'s?' },
  ],
  scaleNotes: { assumptions: ['Reads (search and view) far outnumber bookings', 'A hot release sends a huge share of a day\'s traffic in minutes to a single event'] },
}
