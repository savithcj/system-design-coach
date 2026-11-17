import type { Problem } from './types'

export const url: Problem = {
  id: 'url', title: 'Design a URL shortener', short: 'URL shortener',
  prompt: 'Users submit long URLs and receive short links. Visiting a short link must redirect fast. Assume 100M new URLs per month and 100 reads per write. Click analytics are wanted but must never slow down a redirect.',
  stageRubrics: {
    1: 'Create a short link and follow one, with a stated redirect speed. Analytics and custom aliases are named as in or out.',
    2: 'Names only: link, user, click.',
    3: 'One call to create, one to redirect; the user comes from login, not the body.',
    4: 'Client, server(s), a store for code to address lookups, and click events kept off the redirect path.',
    5: 'Unique short codes without a lookup per write, caching for a 100 to 1 read ratio, and how analytics stay asynchronous.',
  },
  requiredPaths: [{ name: 'follow a short link', from: 'client', to: 'db', via: ['service'] }],
  challenges: [],
  stageSpoilers: { 5: ['base62', 'counter range', 'snowflake', 'bloom filter', 'consistent hashing'] },
  nudges: [
    { role: 'client', text: 'Every design starts with who uses the system.' },
    { role: 'service', text: 'What sits in front of your servers so no single server is the bottleneck or a single point of failure?' },
    { role: 'service', text: 'Where does the create-link and redirect logic live?' },
    { role: 'cache', text: 'Reads outnumber writes 100 to 1. What would you do about that?' },
    { role: 'db', text: 'Where do the mappings live durably?' },
    { role: 'queue', text: 'Analytics must not slow down redirects. How can you decouple them from the request path?' },
  ],
  scaleNotes: { assumptions: ['100M new links a month is about 40 writes a second', '100 reads per write is about 4000 redirects a second'] },
}
