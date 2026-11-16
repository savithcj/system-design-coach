import type { PayloadMap, Port } from './events'
import { roleLabel, type Role } from './roles'
import type { State } from './state'

/** Default name for a new box: the category label, numbered if the category is already on the board. */
export function defaultLabel(s: State, role: Role): string {
  const base = roleLabel(role)
  const same = s.nodes.filter((n) => n.role === role).length
  return same ? `${base} ${same + 1}` : base
}

/** Name for a pasted copy: "<name> copy", then "<name> copy 2", ... never colliding with an existing name. */
export function copyLabel(s: State, source: string): string {
  const names = new Set(s.nodes.map((n) => n.label))
  const base = source.replace(/ copy( \d+)?$/, '')
  let label = `${base} copy`
  for (let k = 2; names.has(label); k++) label = `${base} copy ${k}`
  return label
}

export type ConnectIntent =
  | { type: 'EdgeAdded'; payload: PayloadMap['EdgeAdded'] }
  | { type: 'EdgeDeleted'; payload: PayloadMap['EdgeDeleted'] }

/** Connecting a pair that is already connected (same direction) removes the arrow; otherwise it adds one. */
export function connectIntent(s: State, a: string, b: string, edgeId: string, pa?: Port, pb?: Port): ConnectIntent {
  const have = s.edges.find((e) => e.a === a && e.b === b)
  if (have) return { type: 'EdgeDeleted', payload: { id: have.id } }
  return { type: 'EdgeAdded', payload: { id: edgeId, a, b, pa, pb } }
}
