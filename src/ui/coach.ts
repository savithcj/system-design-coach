import { problemById } from '../problems'
import { evaluate } from '../engine/evaluate'
import { syncRules } from '../engine/track'
import { planTurn, type Trigger } from '../engine/turn'
import { renderDetails } from './details'
import { getLog, getState, record, render } from './store'

/** Ask the engine what to say and append it. Everything the coach does is an event. */
export function coachTurn(trigger: Trigger): void {
  const state = getState()
  const plan = planTurn(getLog(), problemById(state.problemId), trigger)
  for (const e of plan) record(e.type, e.payload, e.actor)
  if (plan.length) render()
}

/**
 * Record when rules start and stop failing. Done once the board has been still for a moment, so it never lands
 * between the events of one gesture (a drag, or a box and its name).
 */
let timer: ReturnType<typeof setTimeout> | undefined
export function scheduleRuleSync(): void {
  clearTimeout(timer)
  timer = setTimeout(syncRulesNow, 700)
}

export function syncRulesNow(): void {
  clearTimeout(timer)
  const state = getState()
  if (!state.problemId) return
  const changes = syncRules(getLog(), evaluate(state, problemById(state.problemId)))
  for (const c of changes) record(c.type, c.payload, 'system')
  if (changes.length) renderDetails(getState())
}
