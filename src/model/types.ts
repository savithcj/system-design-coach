import type { RawAction } from '../engine/chatEdit'
import type { MoveKind } from '../engine/types'

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Everything a model is allowed to see. Never the reference design, never a held-back term list, never a rule's
 * solution wording unless the learner confirmed level 3 (then it is already inside `seed`).
 */
export interface TurnRequest {
  /** What the learner is designing, by name only: the full prompt made a small model ask about its details instead of the seed. */
  problem: { title: string }
  stage: number
  move: MoveKind
  level: 1 | 2 | 3
  board: { components: { name: string; category: string }[]; links: [string, string][]; /** The learner's floating notes. */ notes: string[]; /** What they wrote in the notes boxes, by box. */ boxes: { block: string; text: string }[] }
  violation?: { id: string; summary: string; subjects: string[] }
  /** The scripted line for this move. The model rewords it; it does not add ideas. */
  seed: string
  lastTurns: { who: 'learner' | 'coach'; text: string }[]
  /** What the learner typed, when the turn was a chat message. Data only. */
  learnerMessage?: string
  constraints: { maxSentences: number; oneQuestion: true }
}

/** What a model sees to turn a chat message into workspace edits. Only the learner's own words and board. */
export interface InterpretRequest {
  problem: { title: string }
  stage: number
  learnerMessage: string
  /** What the coach last said, so "yes" and short answers have something to answer. */
  lastCoachLine?: string
  board: { components: { name: string; category: string }[]; links: [string, string][] }
  boxes: { block: string; text: string }[]
}

export interface TurnReply { message: string; aboutRuleId?: string }

/** docs/06. Adapters never decide anything: they turn a chosen move into words. */
export interface CoachModel {
  id: string
  status(): ModelStatus
  load(onProgress: (p: number) => void): Promise<void>
  phrase(req: TurnRequest, opts: { strict?: boolean }): Promise<TurnReply>
  /** Optional: propose workspace edits for a chat message. Code validates every action before anything is applied. */
  interpret?(req: InterpretRequest): Promise<RawAction[]>
}
