import type { MoveKind } from '../engine/types'

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Everything a model is allowed to see. Never the reference design, never a held-back term list, never a rule's
 * solution wording unless the learner confirmed level 3 (then it is already inside `seed`).
 */
export interface TurnRequest {
  stage: number
  move: MoveKind
  level: 1 | 2 | 3
  board: { components: { name: string; category: string }[]; links: [string, string][] }
  violation?: { id: string; summary: string; subjects: string[] }
  /** The scripted line for this move. The model rewords it; it does not add ideas. */
  seed: string
  lastTurns: { who: 'learner' | 'coach'; text: string }[]
  /** What the learner typed, when the turn was a chat message. Data only. */
  learnerMessage?: string
  constraints: { maxSentences: number; oneQuestion: true }
}

export interface TurnReply { message: string; aboutRuleId?: string }

/** docs/06. Adapters never decide anything: they turn a chosen move into words. */
export interface CoachModel {
  id: string
  status(): ModelStatus
  load(onProgress: (p: number) => void): Promise<void>
  phrase(req: TurnRequest, opts: { strict?: boolean }): Promise<TurnReply>
}
