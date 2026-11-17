import type { Problem } from './types'

export const feed: Problem = {
  id: 'feed', title: 'Design a news feed', short: 'News feed',
  prompt: 'Users post text and images and follow others. Each user sees a feed of recent posts from the people they follow. Reads are far more frequent than writes. Some accounts have millions of followers.',
  stageRubrics: {
    1: 'Post, follow, read a feed; how fresh the feed must be; images in or out of scope.',
    2: 'Names only: user, post, follow, media.',
    3: 'Post, follow, read feed with paging; identity from login.',
    4: 'Client, front door, servers, a store for posts and follows, somewhere for image bytes.',
    5: 'Work done at write time versus read time for accounts with millions of followers; precomputed feeds; images near users.',
  },
  requiredPaths: [
    { name: 'read a feed', from: 'client', to: 'db', via: ['service'] },
    { name: 'store an image', from: 'client', to: 'blob', via: ['service'] },
  ],
  challenges: [],
  stageSpoilers: { 5: ['fan-out on write', 'fan-out on read', 'push model', 'pull model', 'materialized'] },
  nudges: [
    { role: 'client', text: 'Who posts and who reads?' },
    { role: 'service', text: 'What fronts the application servers?' },
    { role: 'service', text: 'Where do posting and feed-reading requests land?' },
    { role: 'db', text: 'Where do posts and the follow graph live durably?' },
    { role: 'blob', text: 'Where do the image bytes live?' },
    { role: 'queue', text: 'Pushing a post to millions of followers inside the request would be slow. What do you do instead?' },
    { role: 'cache', text: 'Reading a feed should not require joining posts across many accounts on every request. What do you precompute?' },
  ],
  scaleNotes: { assumptions: ['Reads far outnumber writes', 'A few accounts have millions of followers, so one post can mean millions of feed updates'] },
}
