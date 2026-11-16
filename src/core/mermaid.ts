import { tidyLayout } from './layout'
import type { EdgeState, NodeState, State } from './state'

export function mermaidFrom(nodes: readonly Pick<NodeState, 'id' | 'role' | 'label'>[], edges: readonly Pick<EdgeState, 'a' | 'b'>[]): string {
  const ids: Record<string, string> = {}
  nodes.forEach((n, i) => { ids[n.id] = `N${i + 1}` })
  const lines = ['flowchart TD']
  for (const n of nodes) {
    const l = String(n.label).replace(/"/g, "'")
    lines.push(`  ${ids[n.id]}${n.role === 'db' ? `[("${l}")]` : n.role === 'queue' ? `[["${l}"]]` : `["${l}"]`}`)
  }
  for (const e of edges) if (ids[e.a] && ids[e.b]) lines.push(`  ${ids[e.a]} --> ${ids[e.b]}`)
  return lines.join('\n')
}

/** Mermaid for the board; nodes are listed in tidy order so the source reads top to bottom. */
export function boardMermaid(s: State): string {
  return mermaidFrom(tidyLayout(s.nodes, s.edges, 600).order, s.edges)
}
