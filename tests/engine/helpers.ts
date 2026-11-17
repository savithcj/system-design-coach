import type { ContractBlock } from '../../src/core/events'
import type { Role } from '../../src/core/roles'
import type { State } from '../../src/core/state'
import type { EngineProblem } from '../../src/engine/types'
import { Session } from '../core/helpers'

export const TM_RULES = ['API_SINGLE_STEP_BOOKING', 'DD_RESERVATION_NO_EXPIRY', 'DD_CRON_STALE_WINDOW', 'DD_SEARCH_FULL_SCAN',
  'DD_SEARCH_PRIMARY_STORE', 'DD_SURGE_NO_CHOKEPOINT', 'DD_LOCK_STORE_OUTAGE']

/** A problem with the generic client-server-database route and every problem-specific rule switched on. */
export const PROBLEM: EngineProblem = {
  id: 'test',
  requiredPaths: [{ name: 'read an event', from: 'client', to: 'db', via: ['service'] }],
  challenges: TM_RULES.map((ruleId, order) => ({ ruleId, order })),
  stageSpoilers: { 4: ['load balancer'], 5: ['waiting queue', 'server-sent events'] },
}
export const PLAIN: EngineProblem = { ...PROBLEM, id: 'plain', challenges: [] }

export interface B {
  s: Session
  node(role: Role, label: string, note?: string): string
  edge(a: string, b: string, label?: string): string
  text(block: ContractBlock, text: string): void
  stage(n: number): void
  state(): State
}

export function board(): B {
  const s = new Session(1000)
  return {
    s,
    node(role, label, note) {
      const id = s.node(role, label)
      if (note) s.add('NodeNoteUpdated', { id, text: note })
      return id
    },
    edge(a, b, label) {
      const id = s.edge(a, b)
      if (label) s.add('EdgeLabeled', { id, label })
      return id
    },
    text: (block, text) => s.add('ContractNoteUpdated', { block, text }),
    stage: (n) => s.add('StageChanged', { stage: n }),
    state: () => s.state,
  }
}
