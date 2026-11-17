// Small, explicit term matching for rules. Terms live in the rule files; this only matches them.
// "word*" matches a prefix ("reserv*" -> reserve, reserved, reservation); spaces match spaces or hyphens.
const cache = new Map<string, RegExp>()

function termRe(term: string): RegExp {
  let re = cache.get(term)
  if (re) return re
  const prefix = term.endsWith('*')
  const raw = prefix ? term.slice(0, -1) : term
  const body = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ +/g, '[\\s-]+')
  const lead = /^\w/.test(raw) ? '(?<![a-z0-9])' : ''
  const tail = prefix ? '[a-z0-9]*' : /\w$/.test(raw) ? '(?![a-z0-9])' : ''
  re = new RegExp(lead + body + tail, 'i')
  cache.set(term, re)
  return re
}

export const has = (text: string, terms: readonly string[]): boolean => terms.some((t) => termRe(t).test(text))

export function hitLines(lines: readonly string[], terms: readonly string[]): string[] {
  return lines.filter((l) => has(l, terms))
}

/** Words that scope a claim to a path or situation ("... for booking", "... on reads"). A colon also scopes. */
const SCOPE_WORDS = ['for', 'on', 'when', 'during', 'while', 'within', 'per', 'under', 'across', 'in']
export const hasScope = (line: string): boolean => line.includes(':') || has(line, SCOPE_WORDS)

export const hasNumber = (line: string): boolean => /\d/.test(line)

const STOP = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'their', 'them', 'they', 'user', 'able', 'should', 'must', 'can',
  'want', 'wants', 'allow', 'get', 'post', 'put', 'patch', 'delete', 'api', 'view', 'see', 'make', 'let', 'have', 'use',
  'each', 'any', 'all', 'new', 'based', 'system', 'service', 'when', 'where', 'what', 'who', 'its', 'via', 'into',
])

/** Lower-cased nouns-ish tokens with a plural "s" removed, used to match requirement lines to API lines. */
export function nouns(line: string): Set<string> {
  const out = new Set<string>()
  for (const w of line.toLowerCase().match(/[a-z]{3,}/g) ?? []) {
    const stem = w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w
    if (!STOP.has(w) && !STOP.has(stem)) out.add(stem)
  }
  return out
}

export const shorten = (s: string, n = 60): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
