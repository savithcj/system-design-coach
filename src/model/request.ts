import type { EventLog } from '../core/events'
import { roleLabel } from '../core/roles'
import type { State } from '../core/state'
import { nodeName } from '../core/state'
import type { CoachMove } from '../engine/selector'
import type { Violation } from '../engine/types'
import type { TurnRequest } from './types'

const MAX_COMPONENTS = 14, MAX_LINKS = 20, MAX_TURN_CHARS = 240

const clip = (s: string): string => (s.length > MAX_TURN_CHARS ? s.slice(0, MAX_TURN_CHARS - 1) + '…' : s)

export interface RequestInput {
  state: State
  log: EventLog
  stage: number
  move: CoachMove
  violation: Violation | undefined
  seed: string
  learnerMessage?: string
  problem: { title: string }
}

/** Builds the trimmed, spoiler-free view a model gets. Names are the learner's own. */
export function buildRequest(i: RequestInput): TurnRequest {
  const { state } = i
  const turns = i.log
    .filter((e) => e.type === 'UserMessaged' || e.type === 'CoachResponded')
    .slice(-4)
    .map((e) => ({
      who: e.type === 'UserMessaged' ? ('learner' as const) : ('coach' as const),
      text: clip(String((e.payload as { text?: string; message?: string }).text ?? (e.payload as { message?: string }).message ?? '')),
    }))
  return {
    problem: i.problem,
    stage: i.stage,
    move: i.move.kind,
    level: i.move.level,
    board: {
      components: state.nodes.slice(0, MAX_COMPONENTS).map((n) => ({ name: n.label, category: roleLabel(n.role) })),
      links: state.edges.slice(0, MAX_LINKS).map((e): [string, string] => [nodeName(state, e.a), nodeName(state, e.b)]),
      notes: state.stickies.slice(0, 6).map((x) => clip(x.text)),
    },
    violation: i.violation ? { id: i.violation.ruleId, summary: i.violation.summary, subjects: i.violation.subjects } : undefined,
    seed: i.seed,
    lastTurns: turns,
    ...(i.learnerMessage ? { learnerMessage: clip(i.learnerMessage) } : {}),
    constraints: { maxSentences: i.move.level === 3 ? 3 : 2, oneQuestion: true },
  }
}
