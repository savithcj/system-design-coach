/**
 * Deterministic reading of a contract block. The block is plain text the learner typed; this only splits it into
 * lines and honours the "---" divider (everything after the first one is below the line, i.e. out of scope).
 * Fuzzy questions (is this NFR measurable?) belong to rules and, later, the model; nothing here guesses intent.
 */
export interface ParsedBlock {
  /** Lines above the divider, bullets and numbering stripped. */
  inScope: string[]
  /** Lines below the divider. */
  outOfScope: string[]
  hasDivider: boolean
}

const DIVIDER = /^-{3,}$/
const BULLET = /^(?:[-*•]|\d+[.)])(?:\s+|$)/

export function parseBlock(text: string): ParsedBlock {
  const inScope: string[] = []
  const outOfScope: string[] = []
  let below = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const clean = line.replace(BULLET, '').trim()
    // The notes box adds "• " to each line, so the divider is recognised after the bullet is stripped.
    if (DIVIDER.test(clean)) { below = true; continue }
    if (clean) (below ? outOfScope : inScope).push(clean)
  }
  return { inScope, outOfScope, hasDivider: below }
}
