// Turns what a model proposed from the learner's chat message into events, or refuses. Pure.
// The model only proposes. Every action is checked here: it must stay inside a closed vocabulary and it must use the
// learner's own words, so the coach can never put its own design ideas on the learner's board.
import type { ContractBlock, PayloadMap } from '../core/events'
import { freeSlot, stickySlot } from '../core/layout'
import { ROLE_ORDER, ROLES, roleLabel, type Role } from '../core/roles'
import { CONTRACT_TITLES } from '../core/stages'
import type { State } from '../core/state'

/** What a model returns for one action. Everything is optional because a small model may omit or garble any field. */
export interface RawAction {
  kind?: string
  block?: string
  bullets?: string[]
  category?: string
  label?: string
  from?: string
  to?: string
  text?: string
}

export type ChatEvent =
  | { type: 'ContractNoteUpdated'; payload: PayloadMap['ContractNoteUpdated']; actor: 'coach' }
  | { type: 'NodeAdded'; payload: PayloadMap['NodeAdded']; actor: 'coach' }
  | { type: 'EdgeAdded'; payload: PayloadMap['EdgeAdded']; actor: 'coach' }
  | { type: 'StickyAdded'; payload: PayloadMap['StickyAdded']; actor: 'coach' }

export interface ChatEditPlan {
  events: ChatEvent[]
  /** One plain sentence per applied action, shown to the learner. */
  summary: string[]
  /** Why actions were refused (for the log and the evals; never shown). */
  rejected: string[]
}

export const BLOCKS: readonly ContractBlock[] = ['functional', 'outofscope', 'nonfunctional', 'entities', 'api']
const MAX_ACTIONS = 6, MAX_TEXT = 120

/** Words that carry no design content. A bullet made only of these ("yes", "idk", "added") is not an answer. */
const FILLER = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'it', 'its', 'is', 'are', 'be', 'for', 'with', 'please', 'add', 'put', 'write', 'yes', 'no', 'ok', 'okay', 'idk', 'added', 'done', 'hmm', 'um', 'tell', 'me', 'what', 'next', 'then', 'i', 'my', 'we', 'you', 'that', 'this', 'not', 'sure', 'so', 'just', 'now', 'maybe', 'think', 'dont', 'know'])

const words = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]+/g) ?? []
const content = (s: string): string[] => words(s).filter((w) => !FILLER.has(w))
/** Lets "urls" match "url" and "shorten" match "shortened": drop a plural s, then compare the first five letters. */
const stem = (w: string): string => { const t = w.length > 3 ? w.replace(/s$/, '') : w; return t.length >= 5 ? t.slice(0, 5) : t }

/** True when (nearly) every content word of `text` is a word the learner actually typed. */
export function fromLearner(text: string, message: string): boolean {
  const need = content(text)
  if (!need.length) return false
  const have = new Set(words(message))
  const stems = new Set([...have].map(stem))
  const hit = need.filter((w) => have.has(w) || stems.has(stem(w))).length
  return hit / need.length >= 0.8
}

const norm = (s: string): string => words(s).join(' ')
const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/^[\s•\-*\d.)]+/, '').replace(/\s+/g, ' ').trim() : '')
const isRole = (c: unknown): c is Role => typeof c === 'string' && (ROLE_ORDER as readonly string[]).includes(c)

/** Maps a model's loose category word ("database", "server") to a category, or null. */
function roleOf(c: unknown): Role | null {
  if (isRole(c)) return c
  const w = typeof c === 'string' ? c.toLowerCase().trim() : ''
  return ROLE_ORDER.find((r) => ROLES[r].label.toLowerCase() === w) ?? null
}

export function planChatEdits(raw: readonly RawAction[], message: string, state: State, via: string, boardW: number): ChatEditPlan {
  const plan: ChatEditPlan = { events: [], summary: [], rejected: [] }
  const text = { ...state.contract } as Record<ContractBlock, string>
  const nodes = state.nodes.map((n) => ({ ...n }))
  const stickies = state.stickies.map((s) => ({ ...s }))
  const edges = state.edges.map((e) => ({ ...e }))
  let n = 0
  const id = (k: string): string => `c${via.slice(5)}${k}${n++}`
  const refuse = (why: string): void => { plan.rejected.push(why) }
  const find = (label: unknown): string | null => {
    const want = norm(typeof label === 'string' ? label : '')
    return want ? nodes.find((x) => norm(x.label) === want)?.id ?? null : null
  }

  for (const a of (Array.isArray(raw) ? raw : []).slice(0, MAX_ACTIONS)) {
    if (!a || typeof a !== 'object') { refuse('shape'); continue }
    if (a.kind === 'write') {
      const block = BLOCKS.find((b) => b === a.block)
      if (!block) { refuse('unknown-block'); continue }
      const lines: string[] = (Array.isArray(a.bullets) ? a.bullets : []).map(clean).filter(Boolean)
      const have = new Set(text[block].split('\n').map(norm))
      const add = lines.filter((l) => l.length <= MAX_TEXT && fromLearner(l, message) && !have.has(norm(l)))
      if (add.length < lines.length) refuse('bullet-not-from-learner-or-duplicate')
      if (!add.length) continue
      const base = text[block].replace(/\s+$/, '')
      text[block] = `${base}${base ? '\n' : ''}${add.map((l) => `• ${l}`).join('\n')}`
      plan.events.push({ type: 'ContractNoteUpdated', payload: { block, text: text[block], via }, actor: 'coach' })
      for (const l of add) plan.summary.push(`Added “${l}” under ${CONTRACT_TITLES[block]}.`)
    } else if (a.kind === 'add_component') {
      const role = roleOf(a.category)
      if (!role) { refuse('unknown-category'); continue }
      const asked = clean(a.label).slice(0, 40)
      // The category must be what the learner named, or the label must be their own word.
      const categoryNamed = words(message).includes(ROLES[role].label.toLowerCase()) || (role === 'db' && words(message).includes('db'))
      const label = asked && fromLearner(asked, message) ? asked : categoryNamed ? roleLabel(role) : ''
      if (!label) { refuse('component-not-from-learner'); continue }
      if (nodes.some((x) => norm(x.label) === norm(label))) { refuse('component-exists'); continue }
      const slot = freeSlot(nodes, boardW)
      const nid = id('n')
      nodes.push({ id: nid, role, label, fx: slot.fx, y: slot.y })
      plan.events.push({ type: 'NodeAdded', payload: { id: nid, role, label, fx: slot.fx, y: slot.y, via }, actor: 'coach' })
      plan.summary.push(`Added ${label} (${roleLabel(role)}).`)
    } else if (a.kind === 'connect') {
      const from = find(a.from), to = find(a.to)
      if (!from || !to || from === to) { refuse('connect-unknown-box'); continue }
      const named = [a.from, a.to].some((l) => fromLearner(String(l ?? ''), message))
      if (!named) { refuse('connect-not-from-learner'); continue }
      if (edges.some((e) => e.a === from && e.b === to)) { refuse('connect-exists'); continue }
      const eid = id('e')
      edges.push({ id: eid, a: from, b: to })
      plan.events.push({ type: 'EdgeAdded', payload: { id: eid, a: from, b: to, via }, actor: 'coach' })
      plan.summary.push(`Connected ${nodes.find((x) => x.id === from)!.label} to ${nodes.find((x) => x.id === to)!.label}.`)
    } else if (a.kind === 'sticky') {
      const t = clean(a.text)
      if (!t || t.length > 200 || !fromLearner(t, message)) { refuse('note-not-from-learner'); continue }
      const slot = stickySlot(nodes, stickies, boardW)
      const sid = id('s')
      stickies.push({ id: sid, fx: slot.fx, y: slot.y, text: t })
      plan.events.push({ type: 'StickyAdded', payload: { id: sid, fx: slot.fx, y: slot.y, text: t, via }, actor: 'coach' })
      plan.summary.push(`Added a note: “${t}”.`)
    } else refuse('unknown-kind')
  }
  return plan
}
