// Turns a model's reply into a line the learner may see, or falls back to the scripted seed.
import type { State } from '../core/state'
import { checkReply, MAX_CHARS, MAX_CHARS_L3 } from '../engine/grounding'
import type { EngineProblem } from '../engine/types'
import { REPLY_SCHEMA, parseReply } from './prompt'
import type { CoachModel, TurnRequest } from './types'

/** A 3B model on an integrated GPU takes tens of seconds for a reply; 8 s timed out two calls in three in the first real run. */
export const MODEL_TIMEOUT_MS = 30000

/** Dev only: ?coachTimeout=600 shortens the wait so a hung model can be tested quickly. */
export const timeoutMs = (): number => (import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('coachTimeout')) || MODEL_TIMEOUT_MS : MODEL_TIMEOUT_MS)

export interface PhraseContext {
  state: State
  problem: EngineProblem
  stage: number
  ruleSpoilers?: readonly string[]
  /** True only for a confirmed level-3 hint. */
  allowRuleSpoilers: boolean
  timeoutMs?: number
}

export interface Phrased {
  message: string
  /** Model id, or 'scripted' when the seed was used. */
  by: string
  /** Why attempts were thrown away, in order. For CoachReplyRejected and the evals. */
  rejections: string[]
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const bigWords = (s: string): Set<string> => new Set(norm(s).split(' ').filter((w) => w.length >= 5))

/**
 * Two cheap checks the model cannot talk its way past: it must not say a line the coach already said, and it must stay on
 * the seed's subject (share at least one longer word with it). A small model that copies an earlier turn fails the first.
 */
export function offTrack(message: string, req: TurnRequest): 'repeat' | 'drift' | null {
  const n = norm(message)
  if (req.lastTurns.some((t) => t.who === 'coach' && norm(t.text) === n)) return 'repeat'
  const seed = bigWords(req.seed)
  if (seed.size) { const m = bigWords(message); if (![...seed].some((w) => m.has(w))) return 'drift' }
  return null
}

export class ModelTimeout extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>
  return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new ModelTimeout('timeout')), ms) })]).finally(() => clearTimeout(t))
}

/** One raw attempt: what the model said, parsed. Never throws. */
export async function attempt(model: CoachModel, req: TurnRequest, strict: boolean, ms: number): Promise<{ message?: string; reason?: string }> {
  try {
    const reply = await withTimeout(model.phrase(req, { strict }), ms)
    // Adapters return parsed replies, but a misbehaving one may not; re-validate the shape here.
    const ok = parseReply(JSON.stringify(reply))
    return ok ? { message: ok.message } : { reason: 'model:invalid' }
  } catch (e) {
    return { reason: e instanceof ModelTimeout ? 'model:timeout' : 'model:error' }
  }
}

/**
 * Ask the model; vet the reply with the grounding gate; on any failure retry once, strictly; then use the seed.
 * Never throws and never blocks longer than two timeouts.
 */
export async function phraseWithModel(model: CoachModel, req: TurnRequest, ctx: PhraseContext): Promise<Phrased> {
  const rejections: string[] = []
  if (model.status() !== 'ready' || model.id === 'scripted') return { message: req.seed, by: 'scripted', rejections }
  const ms = ctx.timeoutMs ?? MODEL_TIMEOUT_MS
  for (const strict of [false, true]) {
    const r = await attempt(model, req, strict, ms)
    if (r.message !== undefined) {
      // Safety first (spoilers, invented components, shape), then the two usefulness checks.
      const gate = checkReply({
        message: r.message, state: ctx.state, problem: ctx.problem, stage: ctx.stage,
        ruleSpoilers: ctx.ruleSpoilers, allowRuleSpoilers: ctx.allowRuleSpoilers,
        maxChars: req.level === 3 ? MAX_CHARS_L3 : MAX_CHARS,
      })
      const off = gate.ok ? offTrack(r.message, req) : null
      if (gate.ok && !off) return { message: r.message, by: model.id, rejections }
      rejections.push(gate.ok ? off! : gate.reasons.join(','))
    } else rejections.push(r.reason!)
    // A hang or crash will not improve on retry: do not make the learner wait twice.
    if (r.reason === 'model:timeout') break
  }
  return { message: req.seed, by: 'scripted', rejections }
}

export { REPLY_SCHEMA }
