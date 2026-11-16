# 07. Problems

## Format
Problems are data, not code. No fixed answer graph. Instead: a stage rubric, a baseline high-level design (used only for the post-session comparison and report, never for pass/fail), and deep-dive challenges that fire against what is on the board.
```ts
Problem {
  id, title, prompt,
  stageRubrics: { 1: {...}, 2: {...}, 3: {...}, 4: {...}, 5: {...} },
  requiredPaths: [ {name, from:'Client', to:'Database', via?: ['Server']} ],  // for HLD_UNFINISHED_PATH, by CATEGORY not name
  baseline: { nodes, edges },        // for the report's "one reasonable design"
  challenges: [ {ruleId, stage:5, trigger, order, whyItMatters} ],
  stageSpoilers: { 1:[...], 2:[...], 3:[...], 4:[...] },   // terms not to utter before that stage
  scaleNotes: { assumptions },       // for capacity checks
  lenses?: { startup_mvp:{}, global_scale:{} }
}
```
Matching is by category and path shape, plus optional name hints. Valid alternatives must pass: any Queue-category box satisfies "decouple with a queue"; any Database satisfies durable storage.

## The three existing problems (data lives in the prototype's `PROBLEMS`)
`reference/poc/index.html` contains the prompts, target nodes, nudges and rationales for URL shortener, API rate limiter and news feed. Port them into the new format: keep the prompts and the per-component nudges as L1/L2 wording sources; convert target edges into `requiredPaths` and `baseline`.

## Ticketmaster (new benchmark problem)
Prompt (ours, paraphrased): design an online ticket booking system for popular events. Users search events, view a seat map and book a seat. Popular releases cause huge simultaneous demand.

Stage expectations (paraphrased, our own words):
1. Requirements: functional (search events, view event, book tickets); below the line (payments, admin, refunds, dynamic pricing). Non-functional: strong consistency for booking (no double booking) and high availability for search and browsing, scoped to different paths; read-heavy; scalable to surge traffic.
2. Entities: Event, Venue, Performer, Ticket, Booking (names only).
3. API: search, view event, reserve ticket, confirm booking, each mapped to a functional requirement. Identity comes from auth, not the body. Booking is two steps (reserve then confirm).
4. HLD: client, gateway/load balancer, event service, search path, booking service, relational store holding events and tickets with reservation status; a payment provider outside the system.
5. Deep dives (challenges, in order of typical difficulty):
   - Abandoned reservations must expire: expiry mechanism and its stale window (`DD_RESERVATION_NO_EXPIRY`, `DD_CRON_STALE_WINDOW`); a TTL-based lock in a fast store is the usual improvement; failure of that store needs a safe fallback (`DD_LOCK_STORE_OUTAGE`).
   - Search over a large catalogue (`DD_SEARCH_FULL_SCAN`), a search index fed by change data capture, and why it must not be the only store (`DD_SEARCH_PRIMARY_STORE`).
   - Caching search results at the edge and what personalisation does to hit rate.
   - Live seat availability for many viewers: server-sent events versus polling or two-way sockets.
   - Surge on a hot event: admission control with a waiting queue (`DD_SURGE_NO_CHOKEPOINT`).
Spoiler lists per stage must include the solution terms of later stages (for example the names of the TTL lock, search index, change data capture, server-sent events and waiting queue patterns are not to be uttered before stage 5, and only after the learner reaches the related bottleneck).

Level calibration: a mid-level learner who reaches a periodic cleanup or a basic TTL lock is validated and gently probed on staleness or search speed; senior/staff learners get the failure-of-the-lock, edge-cache and live-update curveballs.

## Isolation drills (later milestone)
Ten-minute drills on the same board UI: fix an abandoned lock race, diagnose a hot shard, stop a retry storm. Each is a Problem with a pre-loaded board and one challenge.
