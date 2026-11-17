import type { Role } from '../core/roles'
import type { State, NodeState } from '../core/state'
import { parseBlock } from './contract'

/** Everything the learner wrote about a box: its name and its note. */
export const nodeText = (n: NodeState): string => (n.note ? `${n.label} ${n.note}` : n.label)

export const byRole = (s: State, ...roles: Role[]): NodeState[] => s.nodes.filter((n) => roles.includes(n.role))

export function lines(s: State, block: keyof State['contract']): string[] {
  const p = parseBlock(s.contract[block])
  return [...p.inScope, ...p.outOfScope]
}

/** All of the learner's words: contract blocks, box names and notes, arrow labels. */
export function allText(s: State): string {
  return [
    ...Object.values(s.contract),
    ...s.nodes.map(nodeText),
    ...s.edges.map((e) => e.label ?? ''),
  ].join('\n')
}

/** Names of boxes (and arrow labels) whose text matches, for use as subjects in wording. */
export const matchingNodes = (s: State, test: (text: string, n: NodeState) => boolean): NodeState[] =>
  s.nodes.filter((n) => test(nodeText(n), n))

function components(s: State): Map<string, number> {
  const parent = new Map<string, string>(s.nodes.map((n) => [n.id, n.id]))
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(x, r)
    return r
  }
  for (const e of s.edges) if (parent.has(e.a) && parent.has(e.b)) parent.set(find(e.a), find(e.b))
  const ids = new Map<string, number>()
  const out = new Map<string, number>()
  for (const n of s.nodes) {
    const r = find(n.id)
    if (!ids.has(r)) ids.set(r, ids.size)
    out.set(n.id, ids.get(r)!)
  }
  return out
}

/**
 * True when one connected group of boxes holds every category in the chain (as many boxes as the chain asks for).
 * Direction is ignored on purpose: a reversed arrow is a different lesson from a missing route.
 */
export function chainConnected(s: State, chain: readonly Role[]): boolean {
  const comp = components(s)
  const groups = new Map<number, NodeState[]>()
  for (const n of s.nodes) {
    const c = comp.get(n.id)!
    groups.set(c, [...(groups.get(c) ?? []), n])
  }
  const need = new Map<Role, number>()
  for (const r of chain) need.set(r, (need.get(r) ?? 0) + 1)
  return [...groups.values()].some((g) => [...need].every(([r, k]) => g.filter((n) => n.role === r).length >= k))
}

export const neighborsOf = (s: State, id: string): string[] =>
  s.edges.flatMap((e) => (e.a === id ? [e.b] : e.b === id ? [e.a] : []))
