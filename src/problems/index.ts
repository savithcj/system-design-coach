// Prompts are the prototype's. Step 6 turns this into the full problem format of docs/07 (rubrics, challenges,
// spoilers). The hidden reference design is deliberately NOT ported yet.
export interface ProblemInfo { id: string; title: string; short: string; prompt: string }

export const PROBLEMS: readonly ProblemInfo[] = [
  {
    id: 'url', title: 'Design a URL shortener', short: 'URL shortener',
    prompt: 'Users submit long URLs and receive short links. Visiting a short link must redirect fast. Assume 100M new URLs per month and 100 reads per write. Click analytics are wanted but must never slow down a redirect.',
  },
  {
    id: 'rate', title: 'Design an API rate limiter', short: 'Rate limiter',
    prompt: 'Limit each client to a fixed number of requests per minute across a fleet of API servers. Rejected requests get a 429 response. Limits differ per customer tier. The limiter must add very little latency.',
  },
  {
    id: 'feed', title: 'Design a news feed', short: 'News feed',
    prompt: 'Users post text and images and follow others. Each user sees a feed of recent posts from the people they follow. Reads are far more frequent than writes. Some accounts have millions of followers.',
  },
]

export function problemById(id: string | null): ProblemInfo {
  return PROBLEMS.find((p) => p.id === id) ?? PROBLEMS[0]!
}
