import { problemById } from '../problems'
import { evaluate } from '../engine/evaluate'
import { syncRules } from '../engine/track'
import { planTurnFull, type Planned, type Trigger } from '../engine/turn'
import { currentModel, setThinking } from '../model/manager'
import { phraseWithModel, timeoutMs } from '../model/orchestrate'
import { buildRequest } from '../model/request'
import { renderDetails } from './details'
import { getLog, getState, record, render } from './store'

let busy = false

/**
 * Ask the engine what to say and append it. Everything the coach does is an event. The engine has already chosen
 * the move and its scripted wording; a local model, when one is ready, may only reword it, and anything it says
 * goes through the grounding gate first.
 */
export async function coachTurn(trigger: Trigger, learnerMessage?: string): Promise<void> {
  if (busy) return // one reply at a time; extra presses while the model is writing do nothing
  const state = getState()
  const problem = problemById(state.problemId)
  const log = getLog()
  const { events, job } = planTurnFull(log, problem, trigger)
  let out: Planned[] = events

  const model = currentModel()
  if (job && model.id !== 'scripted' && model.status() === 'ready') {
    busy = true
    setThinking(true)
    try {
      const req = buildRequest({ state, log, stage: job.stage, move: job.move, violation: job.violation, seed: job.seed, learnerMessage, problem: { title: problem.title, prompt: problem.prompt } })
      const r = await phraseWithModel(model, req, { state, problem, stage: job.stage, ruleSpoilers: job.ruleSpoilers, allowRuleSpoilers: job.allowRuleSpoilers, timeoutMs: timeoutMs() })
      out = events.flatMap((e, i): Planned[] => {
        if (i !== job.index) return [e]
        const rejected = r.rejections.map((reason): Planned => ({ type: 'CoachReplyRejected', payload: { reason, move: job.move.kind }, actor: 'system' }))
        const reply = { ...e, payload: { ...(e.payload as object), message: r.message, ...(r.by !== 'scripted' ? { by: r.by } : {}) } } as Planned
        return [...rejected, reply]
      })
    } finally {
      setThinking(false)
      busy = false
    }
  }
  for (const e of out) record(e.type, e.payload, e.actor)
  if (out.length) render()
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

