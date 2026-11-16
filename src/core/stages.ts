import type { ContractBlock, EventLog, KnownEvent } from './events'

export interface StageInfo {
  n: number
  label: string
  /** Target minutes for the interview, shown against the time actually spent. */
  targetMin: number
  /** Contract blocks that belong to this stage; stages 4 and 5 live on the board. */
  blocks: readonly ContractBlock[]
}

export const STAGES: readonly StageInfo[] = [
  { n: 1, label: 'Requirements', targetMin: 5, blocks: ['functional', 'nonfunctional'] },
  { n: 2, label: 'Entities', targetMin: 2, blocks: ['entities'] },
  { n: 3, label: 'API', targetMin: 5, blocks: ['api'] },
  { n: 4, label: 'High-level design', targetMin: 12, blocks: [] },
  { n: 5, label: 'Deep dives', targetMin: 10, blocks: [] },
]

export const CONTRACT_TITLES: Readonly<Record<ContractBlock, string>> = {
  functional: 'Functional',
  nonfunctional: 'Non-functional',
  entities: 'Core entities',
  api: 'API / data flow',
}

export const CONTRACT_BLOCKS: readonly ContractBlock[] = ['functional', 'nonfunctional', 'entities', 'api']

/**
 * Milliseconds spent in each stage (index 0 = stage 1), cumulative if the learner returns to a stage.
 * Time runs from the first event to `endTs`; the caller passes Date.now() for a live clock, or the last event for a report.
 */
export function stageTimes(log: EventLog, endTs: number): number[] {
  const spent = [0, 0, 0, 0, 0]
  if (!log.length) return spent
  let stage = 1
  let since = log[0]!.ts
  for (const raw of log) {
    const e = raw as KnownEvent
    if (e.type !== 'StageChanged') continue
    const n = Math.round(e.payload.stage)
    if (n < 1 || n > 5) continue
    spent[stage - 1]! += Math.max(0, e.ts - since)
    stage = n
    since = e.ts
  }
  spent[stage - 1]! += Math.max(0, endTs - since)
  return spent
}

/** The stage each event happened in, by seq. Used to group the report. */
export function stageBySeq(log: EventLog): Map<number, number> {
  const out = new Map<number, number>()
  let stage = 1
  for (const raw of log) {
    const e = raw as KnownEvent
    if (e.type === 'StageChanged' && e.payload.stage >= 1 && e.payload.stage <= 5) stage = Math.round(e.payload.stage)
    out.set(e.seq, stage)
  }
  return out
}

/** m:ss */
export function formatClock(ms: number): string {
  const d = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`
}
