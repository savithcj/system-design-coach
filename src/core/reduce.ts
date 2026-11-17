import type { EventLog, KnownEvent } from './events'
import { isLevel } from './level'
import { emptyState, type State } from './state'
import { undoView } from './undo'

/**
 * State is a pure function of the log. Unknown event types are ignored so older and newer logs still load.
 * Selection, editing and connect mode are UI state, never events.
 */
export function reduce(log: EventLog): State {
  const s = emptyState()
  const { ignored } = undoView(log)
  for (const raw of log) {
    if (ignored.has(raw.seq)) continue
    const e = raw as KnownEvent
    switch (e.type) {
      case 'ProblemLoaded':
        s.problemId = e.payload.problemId
        break
      case 'NodeAdded': {
        const p = e.payload
        const label = p.label.trim()
        if (!label || s.nodes.some((n) => n.id === p.id)) break
        s.nodes.push({ id: p.id, role: p.role, label, fx: p.fx, y: p.y })
        break
      }
      case 'NodeMoved':
        for (const n of s.nodes) if (n.id === e.payload.id) { n.fx = e.payload.fx; n.y = e.payload.y }
        break
      case 'LayoutReset':
        for (const n of s.nodes) {
          const q = e.payload.pos?.[n.id]
          if (q) { n.fx = q.fx; n.y = q.y } else { delete n.fx; delete n.y }
        }
        break
      case 'NodeRenamed': {
        // Older logs wrote the new name as `to`.
        const p = e.payload as { id: string; label?: string; to?: string }
        const label = (p.label ?? p.to ?? '').trim()
        if (!label) break
        for (const n of s.nodes) if (n.id === p.id) n.label = label
        break
      }
      case 'NodeDeleted':
        s.nodes = s.nodes.filter((n) => n.id !== e.payload.id)
        s.edges = s.edges.filter((x) => x.a !== e.payload.id && x.b !== e.payload.id)
        break
      case 'EdgeAdded': {
        const p = e.payload
        const known = (id: string) => s.nodes.some((n) => n.id === id)
        // At most one edge per ordered pair; the reverse pair is allowed.
        if (p.a === p.b || !known(p.a) || !known(p.b) || s.edges.some((x) => x.a === p.a && x.b === p.b)) break
        s.edges.push({ id: p.id, a: p.a, b: p.b, pa: p.pa, pb: p.pb })
        break
      }
      case 'EdgeDeleted':
        s.edges = s.edges.filter((x) => x.id !== e.payload.id)
        break
      case 'LevelSet':
        if (isLevel(e.payload.level)) s.level = e.payload.level
        break
      case 'StageChanged': {
        const n = Math.round(e.payload.stage)
        if (n >= 1 && n <= 5) s.stage = n
        break
      }
      case 'ContractNoteUpdated':
        if (e.payload.block in s.contract && typeof e.payload.text === 'string') s.contract[e.payload.block] = e.payload.text
        break
      case 'EdgeLabeled': {
        const label = e.payload.label.trim()
        for (const x of s.edges) if (x.id === e.payload.id) { if (label) x.label = label; else delete x.label }
        break
      }
      case 'NodeNoteUpdated': {
        // Notes are free text; only a fully blank note counts as "no note".
        const text = e.payload.text.replace(/\s+$/, '')
        for (const n of s.nodes) if (n.id === e.payload.id) { if (text.trim()) n.note = text; else delete n.note }
        break
      }
      case 'StickyAdded': {
        const p = e.payload
        const text = (p.text ?? '').replace(/\s+$/, '')
        if (!text.trim() || s.stickies.some((x) => x.id === p.id)) break
        s.stickies.push({ id: p.id, fx: Math.min(1, Math.max(0, p.fx)), y: Math.max(0, p.y), text })
        break
      }
      case 'StickyEdited': {
        const text = e.payload.text.replace(/\s+$/, '')
        for (const x of s.stickies) if (x.id === e.payload.id && text.trim()) x.text = text
        break
      }
      case 'StickyMoved':
        for (const x of s.stickies) if (x.id === e.payload.id) { x.fx = Math.min(1, Math.max(0, e.payload.fx)); x.y = Math.max(0, e.payload.y) }
        break
      case 'StickyDeleted':
        s.stickies = s.stickies.filter((x) => x.id !== e.payload.id)
        break
      case 'SessionFinished':
        s.finished = true
        break
      default:
        break
    }
  }
  return s
}

/** Replay: the state as it was after the event with this seq. */
export function reduceUpTo(log: EventLog, seq: number): State {
  return reduce(log.filter((e) => e.seq <= seq))
}
