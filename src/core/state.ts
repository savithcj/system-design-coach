import type { Port } from './events'
import type { Role } from './roles'

export interface NodeState {
  id: string
  role: Role
  label: string
  fx?: number
  y?: number
  /** Compact text note attached beside the box; moves with it. */
  note?: string
}

export interface EdgeState {
  id: string
  a: string
  b: string
  pa?: Port
  pb?: Port
  label?: string
}

export interface State {
  problemId: string | null
  nodes: NodeState[]
  edges: EdgeState[]
  finished: boolean
}

export const emptyState = (): State => ({ problemId: null, nodes: [], edges: [], finished: false })

export function nodeName(s: State, id: string): string {
  return s.nodes.find((n) => n.id === id)?.label ?? '?'
}
