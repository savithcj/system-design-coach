import { allText } from './board'
import { TECH_GROUPS } from './lexicon'
import { has } from './text'
import type { State } from '../core/state'
import type { EngineProblem } from './types'

export interface GateInput {
  message: string
  state: State
  problem: EngineProblem
  stage: number
  /** The rule being talked about; its own spoilers are barred unless `allowRuleSpoilers`. */
  ruleSpoilers?: readonly string[]
  /** True only for a level-3 hint the learner confirmed: it may name the rule's own solution terms. */
  allowRuleSpoilers?: boolean
  maxChars?: number
}

export interface GateResult { ok: boolean; reasons: string[] }

export const MAX_CHARS = 320
export const MAX_CHARS_L3 = 520

/** Terms the problem keeps back until a later stage than `stage`. */
export function laterSpoilers(problem: EngineProblem, stage: number): string[] {
  return Object.entries(problem.stageSpoilers).flatMap(([k, terms]) => (Number(k) > stage ? [...(terms ?? [])] : []))
}

/**
 * Checks a phrased reply (scripted or model) before the learner sees it. Failure reasons are short codes for
 * CoachReplyRejected and the evals; none of them is shown to the learner.
 */
export function checkReply(i: GateInput): GateResult {
  const reasons: string[] = []
  const m = i.message
  const board = allText(i.state)

  // 1. No ghost components: a known technology the learner has not written anywhere.
  for (const group of TECH_GROUPS) {
    if (has(m, group) && !has(board, group)) reasons.push(`ghost:${group[0]}`)
  }

  // 2. No spoilers.
  for (const t of laterSpoilers(i.problem, i.stage)) if (has(m, [t])) reasons.push(`spoiler:${t}`)
  if (!i.allowRuleSpoilers) for (const t of i.ruleSpoilers ?? []) if (has(m, [t])) reasons.push(`spoiler:${t}`)

  // 3. Shape: one question, short, plain prose.
  if ((m.match(/\?/g) ?? []).length > 1) reasons.push('shape:many-questions')
  if (m.length > (i.maxChars ?? MAX_CHARS)) reasons.push('shape:too-long')
  if (m.includes('```')) reasons.push('shape:code-fence')
  if (/^\s*\d+[.)]\s/m.test(m)) reasons.push('shape:numbered-list')
  if (/\bthe answer is\b/i.test(m)) reasons.push('shape:gives-answer')
  if (!m.trim()) reasons.push('shape:empty')

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] }
}
