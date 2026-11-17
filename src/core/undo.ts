import type { EventLog, KnownEvent } from './events'

/**
 * Board edits by the learner. Only these can be undone; chat, hints, rule events and the coach's events cannot.
 */
const UNDOABLE: ReadonlySet<string> = new Set([
  'NodeAdded', 'NodeMoved', 'NodeRenamed', 'NodeDeleted', 'EdgeAdded', 'EdgeDeleted', 'LayoutReset', 'EdgeLabeled', 'NodeNoteUpdated',
  'StickyAdded', 'StickyEdited', 'StickyMoved', 'StickyDeleted',
])

/** What the coach may change from a chat message, and what undo then covers (the learner's own typing in a note box is not undoable). */
const CHAT_UNDOABLE: ReadonlySet<string> = new Set(['NodeAdded', 'EdgeAdded', 'ContractNoteUpdated', 'StickyAdded'])

export const chatVia = (e: { payload: unknown }): string | null => {
  const v = (e.payload as { via?: unknown } | null)?.via
  return typeof v === 'string' && v.startsWith('chat:') ? v : null
}

export const isUndoable = (e: { type: string; actor: string; payload?: unknown }): boolean =>
  (e.actor === 'user' && UNDOABLE.has(e.type)) || (e.actor === 'coach' && CHAT_UNDOABLE.has(e.type) && chatVia({ payload: e.payload }) !== null)

/** One step of undo: usually one event; a box's creation and its immediate naming are a single step. */
export interface ActionGroup { id: number; seqs: number[] }

export function actionGroups(log: EventLog): ActionGroup[] {
  const groups: ActionGroup[] = []
  let justAdded: { nodeId: string; group: ActionGroup } | null = null
  let chatGroup: { via: string; group: ActionGroup } | null = null
  for (const raw of log) {
    const e = raw as KnownEvent
    if (e.type === 'UserActionUndone' || e.type === 'UserActionRedone') { justAdded = null; continue }
    if (!isUndoable(e)) continue
    // Everything the coach changed from one chat message is one undo step.
    const via = chatVia(e)
    if (via) {
      if (chatGroup && chatGroup.via === via) { chatGroup.group.seqs.push(e.seq); continue }
      const group = { id: e.seq, seqs: [e.seq] }
      groups.push(group); chatGroup = { via, group }; justAdded = null
      continue
    }
    if (e.type === 'NodeRenamed' && justAdded && justAdded.nodeId === e.payload.id) {
      justAdded.group.seqs.push(e.seq)
      justAdded = null
      continue
    }
    const group = { id: e.seq, seqs: [e.seq] }
    groups.push(group)
    justAdded = e.type === 'NodeAdded' ? { nodeId: e.payload.id, group } : null
  }
  return groups
}

export interface UndoView {
  /** Event seqs whose effect the reducer must skip. */
  ignored: Set<number>
  /** The group an undo would act on now, or null. */
  undoTarget: number | null
  /** The group a redo would restore now, or null. A new learner edit clears it. */
  redoTarget: number | null
  /** Groups in log order, for narration. */
  groups: ActionGroup[]
}

/**
 * Undo is an event, not a deletion: replaying the log with the same ignore set always gives the same state.
 * Undo walks back through non-undone groups; redo re-enables the most recently undone group while no newer edit exists.
 */
export function undoView(log: EventLog): UndoView {
  const groups = actionGroups(log)
  const byId = new Map(groups.map((g) => [g.id, g]))
  const undoneIds = new Set<number>()
  let redo: number[] = []
  for (const raw of log) {
    const e = raw as KnownEvent
    if (e.type === 'UserActionUndone') {
      const g = byId.get(e.payload.targetSeq)
      if (g && g.id < e.seq && !undoneIds.has(g.id)) { undoneIds.add(g.id); redo.push(g.id) }
    } else if (e.type === 'UserActionRedone') {
      if (redo[redo.length - 1] === e.payload.targetSeq) { undoneIds.delete(e.payload.targetSeq); redo.pop() }
    } else if (isUndoable(e)) {
      redo = []
    }
  }
  const ignored = new Set<number>()
  for (const g of groups) if (undoneIds.has(g.id)) for (const q of g.seqs) ignored.add(q)
  const live = groups.filter((g) => !undoneIds.has(g.id))
  return { ignored, undoTarget: live.length ? live[live.length - 1]!.id : null, redoTarget: redo.length ? redo[redo.length - 1]! : null, groups }
}
