import type { RawAction } from '../engine/chatEdit'
import type { CoachModel, ModelStatus, TurnReply, TurnRequest } from './types'

export type FakeMode =
  | 'good'      // rewords nothing: returns the seed
  | 'ghost'     // names a technology that is not on the board
  | 'spoiler'   // names a term held back until a later stage
  | 'garbage'   // not the JSON shape
  | 'hang'      // never answers
  | 'strictfix' // fails the first attempt, behaves when asked strictly
  | 'act'       // rewords nothing; interprets `ACT <base64 json actions> free text` (tests only)

/** A stand-in model for tests and the dev-only ?coach=fake-<mode> switch. It exercises the same path as a real one. */
export function fakeModel(mode: FakeMode, loadMs = 0): CoachModel {
  let st: ModelStatus = 'idle'
  return {
    id: `fake-${mode}`,
    status: () => st,
    async load(onProgress) {
      st = 'loading'
      onProgress(0.5)
      await new Promise((r) => setTimeout(r, loadMs))
      onProgress(1)
      st = 'ready'
    },
    async interpret(req) {
      if (mode !== 'act') return []
      // The actions travel base64-encoded so they are not part of the words the learner "said".
      const m = /^ACT ([A-Za-z0-9+/=]+)/.exec(req.learnerMessage)
      try { return m ? (JSON.parse(atob(m[1]!)) as RawAction[]) : [] } catch { return [] }
    },
    async phrase(req: TurnRequest, opts): Promise<TurnReply> {
      switch (mode) {
        case 'act':
        case 'good': return { message: req.seed, aboutRuleId: req.violation?.id }
        case 'ghost': return { message: 'Would Kafka help here?', aboutRuleId: req.violation?.id }
        case 'spoiler': return { message: 'Have you thought about a waiting queue and server-sent events?', aboutRuleId: req.violation?.id }
        case 'garbage': return { message: 42 as unknown as string }
        case 'hang': return new Promise<TurnReply>(() => {})
        case 'strictfix': return opts.strict ? { message: req.seed, aboutRuleId: req.violation?.id } : { message: 'Would Kafka help here?' }
      }
    },
  }
}
