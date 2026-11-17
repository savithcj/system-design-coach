import type { EventLog, PayloadMap } from '../core/events'
import { historyOf } from './history'
import type { Violation } from './types'

export type RuleEvent =
  | { type: 'RuleFired'; payload: PayloadMap['RuleFired'] }
  | { type: 'RuleResolved'; payload: PayloadMap['RuleResolved'] }

/**
 * The events to append so the log's record of failing rules matches what evaluate says now.
 * Only changes are emitted, so the report can show when each issue appeared and when it cleared.
 */
export function syncRules(log: EventLog, violations: readonly Violation[]): RuleEvent[] {
  const active = historyOf(log).active
  const now = new Set(violations.map((v) => v.ruleId))
  const out: RuleEvent[] = []
  for (const v of violations) {
    if (!active[v.ruleId]) out.push({ type: 'RuleFired', payload: { ruleId: v.ruleId, stage: v.stage, evidence: v.evidence } })
  }
  for (const id of Object.keys(active)) if (!now.has(id)) out.push({ type: 'RuleResolved', payload: { ruleId: id } })
  return out
}
