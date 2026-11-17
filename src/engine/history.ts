import type { EventLog, PayloadMap } from '../core/events'
import { stageBySeq } from '../core/stages'
import type { State } from '../core/state'

/** What the coach has already done, read from the log. The selector never keeps its own memory. */
export interface History {
  /** Rule the most recent coach message was about, if any. */
  lastRuleId: string | null
  /** Per rule: how many times the coach raised it, the stage of the latest time, and the highest level served. */
  spoken: Record<string, { count: number; lastStage: number; level: number }>
  /** Stages where the coach already affirmed and moved on. */
  affirmed: number[]
  /** Rules currently flagged, as recorded by RuleFired/RuleResolved. */
  active: Record<string, { seq: number; stage: number }>
}

export function historyOf(log: EventLog): History {
  const stageAt = stageBySeq(log)
  const h: History = { lastRuleId: null, spoken: {}, affirmed: [], active: {} }
  for (const e of log) {
    if (e.type === 'CoachResponded') {
      const p = e.payload as PayloadMap['CoachResponded']
      h.lastRuleId = p.ruleId ?? null
      // The stage a message is about can differ from the stage the learner is in (e.g. affirming the one just left).
      const about = p.stage ?? stageAt.get(e.seq) ?? 1
      if (p.ruleId) bump(h, p.ruleId, about, p.level ?? 1)
      if (p.move === 'affirm_and_advance') h.affirmed.push(about)
    } else if (e.type === 'HintRequested') {
      const p = e.payload as PayloadMap['HintRequested']
      if (p.ruleId) bump(h, p.ruleId, stageAt.get(e.seq) ?? 1, p.level, false)
    } else if (e.type === 'RuleFired') {
      const p = e.payload as PayloadMap['RuleFired']
      h.active[p.ruleId] = { seq: e.seq, stage: p.stage }
    } else if (e.type === 'RuleResolved') {
      delete h.active[(e.payload as PayloadMap['RuleResolved']).ruleId]
    }
  }
  return h
}

function bump(h: History, ruleId: string, stage: number, level: number, count = true): void {
  const cur = h.spoken[ruleId] ?? { count: 0, lastStage: stage, level: 0 }
  h.spoken[ruleId] = { count: cur.count + (count ? 1 : 0), lastStage: stage, level: Math.max(cur.level, level) }
}

/** Has the learner put anything into the stage they are in? Used so the coach does not affirm an empty stage. */
export function stageHasContent(s: State, stage = s.stage): boolean {
  switch (stage) {
    case 1: return s.contract.functional.trim() !== ''
    case 2: return s.contract.entities.trim() !== ''
    case 3: return s.contract.api.trim() !== ''
    default: return s.nodes.length >= 2 && s.edges.length >= 1
  }
}
