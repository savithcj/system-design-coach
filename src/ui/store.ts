import { append, nextSeq, type Actor, type KnownType, type LogEvent, type PayloadMap, type EventLog } from '../core/events'
import { reduce } from '../core/reduce'
import type { State } from '../core/state'
import { problemById } from '../problems'
import type { ContractBlock } from '../core/events'
import { CONTRACT_BLOCKS, STAGES } from '../core/stages'

/** UI-only state. Selection, editing and connect mode are never events. */
export const ui = {
  sel: null as string | null,
  selEdge: null as string | null,
  editing: false,
  /** Edge whose label field is open, or box whose note field is open. */
  editingEdge: null as string | null,
  editingNote: null as string | null,
  connectFrom: null as string | null,
  connectPort: null as string | null,
  reportOpen: false,
  /** Which contract blocks are expanded. UI state, per session view; never an event. */
  open: { functional: true, nonfunctional: true, entities: false, api: false } as Record<ContractBlock, boolean>,
  /** Element to focus after the next render: a node id, 'NAME' (the rename field) or 'ADD'. */
  pendingFocus: null as string | null,
}

const sessions: Record<string, LogEvent[]> = {}
let currentId: string | null = null
let log: LogEvent[] = []
let cache: { log: EventLog; state: State } | null = null
let token = 0
let renderer: () => void = () => {}

export const setRenderer = (f: () => void): void => { renderer = f }
export const render = (): void => renderer()

export const getLog = (): EventLog => log
export const currentProblemId = (): string | null => currentId
/** Changes whenever a different session is shown, so views can reset incremental DOM. */
export const sessionToken = (): number => token

export function getState(): State {
  if (!cache || cache.log !== log) cache = { log, state: reduce(log) }
  return cache.state
}

export const seqNext = (): number => nextSeq(log)

/** Append without re-rendering (the caller patches the DOM itself). */
export function record<K extends KnownType>(type: K, payload: PayloadMap[K], actor: Actor = 'user'): void {
  log = append(log, type, payload, actor, Date.now())
}

export function dispatch<K extends KnownType>(type: K, payload: PayloadMap[K], actor: Actor = 'user'): void {
  record(type, payload, actor)
  render()
}

export function resetSelection(): void {
  ui.sel = null; ui.selEdge = null; ui.editing = false; ui.editingEdge = null; ui.editingNote = null; ui.connectFrom = null; ui.connectPort = null
}

/** Expand the blocks of a stage (others stay as the learner left them). */
export function openStageBlocks(stage: number): void {
  for (const b of STAGES[stage - 1]?.blocks ?? []) ui.open[b] = true
}

export function loadProblem(id: string, fresh = false): void {
  if (currentId) sessions[currentId] = log
  currentId = id
  log = !fresh && sessions[id] ? sessions[id]! : []
  if (!log.length) {
    const now = Date.now()
    log = [
      { seq: 1, ts: now, actor: 'user', type: 'ProblemLoaded', payload: { problemId: id } },
      { seq: 2, ts: now, actor: 'coach', type: 'CoachResponded', payload: { kind: 'opening', message: `Let's work through "${problemById(id).title}".` } },
    ]
  }
  resetSelection()
  ui.reportOpen = false
  // Collapsed by default except the current stage's blocks.
  for (const b of CONTRACT_BLOCKS) ui.open[b] = false
  openStageBlocks(getState().stage)
  token++
  render()
}
