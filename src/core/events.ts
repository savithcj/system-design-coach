import type { Role } from './roles'

export type Actor = 'user' | 'coach' | 'system'
export type Port = 't' | 'r' | 'b' | 'l'
export type ContractBlock = 'functional' | 'nonfunctional' | 'entities' | 'api'

/** Payloads of the events this build knows. Milestone-1 events are added to this map as their steps land. */
export interface PayloadMap {
  ProblemLoaded: { problemId: string }
  // fx is the 0..1 horizontal fraction of the free width, y is pixels; both are pinned at creation.
  NodeAdded: { id: string; role: Role; label: string; fx?: number; y?: number }
  NodeMoved: { id: string; fx: number; y: number }
  NodeRenamed: { id: string; label: string }
  NodeDeleted: { id: string }
  EdgeAdded: { id: string; a: string; b: string; pa?: Port; pb?: Port }
  EdgeDeleted: { id: string }
  LayoutReset: { pos: Record<string, { fx: number; y: number }> }
  /** The stage the learner (or, later, the coach) is working in: 1 Requirements .. 5 Deep dives. */
  StageChanged: { stage: number }
  /** Full text of one contract block after an edit (debounced while typing, flushed on blur). Not board-undoable. */
  ContractNoteUpdated: { block: ContractBlock; text: string }
  EdgeLabeled: { id: string; label: string }
  NodeNoteUpdated: { id: string; text: string }
  /** targetSeq is the first seq of the undone action group (see undo.ts). */
  UserActionUndone: { targetSeq: number }
  UserActionRedone: { targetSeq: number }
  UserMessaged: { text: string }
  CoachResponded: { kind: 'opening' | 'reply' | 'hint' | 'ack'; message: string; level?: number; ruleId?: string; move?: string }
  /** "Stuck?" was pressed; level is the hint level served (1..3). ruleId is absent when nothing was flagged. */
  HintRequested: { level: number; ruleId?: string }
  /** System: a rule's check started failing. Emitted only when the set of failing rules changes. */
  RuleFired: { ruleId: string; stage: number; evidence: string[] }
  RuleResolved: { ruleId: string }
  /** System: a phrased reply failed the grounding gate (used by evals and the report, never shown to the learner). */
  CoachReplyRejected: { reason: string; move: string }
  SessionFinished: Record<string, never>
}

export type KnownType = keyof PayloadMap

interface Base {
  seq: number
  ts: number
  actor: Actor
}

export type KnownEvent = { [K in KnownType]: Base & { type: K; payload: PayloadMap[K] } }[KnownType]

/** What a log may hold: known events plus anything an older or newer build wrote (the reducer ignores those). */
export type LogEvent = KnownEvent | (Base & { type: string; payload: Record<string, unknown> })

export type EventLog = readonly LogEvent[]

/** NodeMoved bursts (a drag, or held arrow keys) collapse into one event within this window. */
export const COALESCE_MS = 1500

export function nextSeq(log: EventLog): number {
  return log.length + 1
}

/**
 * Returns a new log with the event appended. Pure: the caller supplies the clock.
 * Coalescing a NodeMoved burst replaces the last event (same seq) instead of growing the log.
 */
export function append<K extends KnownType>(
  log: EventLog,
  type: K,
  payload: PayloadMap[K],
  actor: Actor,
  ts: number,
): LogEvent[] {
  const last = log[log.length - 1]
  if (type === 'NodeMoved' && last && last.type === 'NodeMoved') {
    const lp = last.payload as PayloadMap['NodeMoved']
    if (lp.id === (payload as PayloadMap['NodeMoved']).id && ts - last.ts < COALESCE_MS) {
      const merged = { seq: last.seq, ts, type, actor, payload } as KnownEvent
      return [...log.slice(0, -1), merged]
    }
  }
  return [...log, { seq: nextSeq(log), ts, type, actor, payload } as KnownEvent]
}

/** The log as the learner exports it ("Copy events"). Stable key order so round-trips are byte-identical. */
export function serializeLog(log: EventLog): string {
  return JSON.stringify(
    log.map((e) => ({ seq: e.seq, ts: e.ts, actor: e.actor, type: e.type, payload: e.payload })),
    null,
    1,
  )
}

export function parseLog(json: string): LogEvent[] {
  const raw: unknown = JSON.parse(json)
  if (!Array.isArray(raw)) throw new Error('Event log must be an array')
  return raw.map((r, i): LogEvent => {
    const e = r as Partial<LogEvent>
    if (typeof e.type !== 'string' || typeof e.seq !== 'number') throw new Error(`Bad event at index ${i}`)
    return { seq: e.seq, ts: e.ts ?? 0, actor: e.actor ?? 'user', type: e.type, payload: e.payload ?? {} } as LogEvent
  })
}
