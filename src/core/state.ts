import type { ContractBlock, Port } from './events'
import type { Level } from './level'
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

export type Contract = Record<ContractBlock, string>

export interface State {
  problemId: string | null
  /** 1..5, see stages.ts */
  stage: number
  level: Level
  contract: Contract
  nodes: NodeState[]
  edges: EdgeState[]
  finished: boolean
}

export const emptyContract = (): Contract => ({ functional: '', nonfunctional: '', entities: '', api: '' })

export const emptyState = (): State => ({ problemId: null, stage: 1, level: 'mid', contract: emptyContract(), nodes: [], edges: [], finished: false })

export function nodeName(s: State, id: string): string {
  return s.nodes.find((n) => n.id === id)?.label ?? '?'
}
