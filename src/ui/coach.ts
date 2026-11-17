import { planChatEdits } from '../engine/chatEdit'
import { tutorialAnnounce, tutorialProgress, tutorialRemind, STEPS, type TutorialLine, type TutorialOpts } from '../engine/tutorial'
import { problemById } from '../problems'
import { evaluate } from '../engine/evaluate'
import { syncRules } from '../engine/track'
import { planTurnFull, type Planned, type Trigger } from '../engine/turn'
import { currentModel, setThinking } from '../model/manager'
import { interpretChat, phraseWithModel, timeoutMs } from '../model/orchestrate'
import { buildInterpretRequest, buildRequest } from '../model/request'
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
  const model = currentModel()
  const problem = problemById(getState().problemId)
  let edited = false
  const turnStart = getLog().length

  // The learner's chat message may ask for board changes. The model proposes, code validates every action against the
  // learner's own words, and the result is one undoable step of coach events tagged with the message they came from.
  if (trigger.kind === 'chat' && learnerMessage && model.id !== 'scripted' && model.status() === 'ready' && model.interpret) {
    busy = true
    setThinking(true)
    try {
      const before = getState()
      const raw = await interpretChat(model, buildInterpretRequest(before, getLog(), learnerMessage, problem.title, !problem.tutorial), timeoutMs())
      const via = `chat:${getLog()[getLog().length - 1]!.seq}`
      const plan = planChatEdits(raw, learnerMessage, before, via, Math.max(260, document.getElementById('boardCol')?.clientWidth ?? 800))
      // Rejections go in the log (never shown) so evals and the dev console can see what the model proposed and why it was refused.
      if (plan.rejected.length) record('CoachReplyRejected', { reason: `chat-edit:${[...new Set(plan.rejected)].join(',')}`, move: 'chat_edit' }, 'system')
      if (import.meta.env.DEV) (window as unknown as { __chatEdit?: unknown }).__chatEdit = { message: learnerMessage, raw, rejected: plan.rejected, applied: plan.summary }
      if (plan.events.length) {
        for (const e of plan.events) record(e.type, e.payload, 'coach')
        const first = !getLog().some((e) => e.type === 'CoachResponded' && (e.payload as { move?: string }).move === 'chat_edit')
        record('CoachResponded', { kind: 'ack', message: `${plan.summary.join(' ')}${first ? ' Ctrl+Z on the board undoes this.' : ''}`, move: 'chat_edit', stage: getState().stage }, 'coach')
        syncRulesNow()
        edited = true
      }
    } finally {
      setThinking(false)
      busy = false
    }
  }

  if (problem.tutorial) {
    // The practice round has no rules: its lines are fixed and follow what the learner has done.
    if (trigger.kind === 'stage') return
    if (trigger.kind === 'stuck' && tutorialProgress(getState(), getLog()) === STEPS.length - 1) record('HintRequested', { level: 1 }, 'coach')
    // The edit phase above may already have announced the next step; do not follow it with a reminder.
    const announcedNow = getLog().slice(turnStart).some((e) => e.type === 'CoachResponded' && (e.payload as { move?: string }).move === 'tutorial')
    const line = tutorialAnnounce(getState(), getLog(), tutorialOpts()) ?? (announcedNow ? null : tutorialRemind(getState(), getLog(), tutorialOpts()))
    if (line) sayTutorial(line)
    render()
    return
  }

  const state = getState()
  const log = getLog()
  const { events, job } = planTurnFull(log, problem, trigger)
  let out: Planned[] = events
  if (job && model.id !== 'scripted' && model.status() === 'ready') {
    busy = true
    setThinking(true)
    try {
      const req = buildRequest({ state, log, stage: job.stage, move: job.move, violation: job.violation, seed: job.seed, learnerMessage, problem: { title: problem.title } })
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
  if (out.length || edited) render()
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

/** The practice round can say "chat writes to the board" only when the model that does that is ready. */
const tutorialOpts = (): TutorialOpts => ({ chatEdits: currentModel().id !== 'scripted' && currentModel().status() === 'ready' && !!currentModel().interpret })

function sayTutorial(line: TutorialLine): void {
  record('CoachResponded', { kind: 'reply', message: line.message, ruleId: line.ruleId, move: 'tutorial', stage: getState().stage }, 'coach')
  if (line.step >= STEPS.length) { try { localStorage.setItem('sdc-tutorial-seen', '1') } catch { /* private window */ } }
}

export function syncRulesNow(): void {
  clearTimeout(timer)
  const state = getState()
  if (!state.problemId) return
  if (problemById(state.problemId).tutorial) {
    const line = tutorialAnnounce(state, getLog(), tutorialOpts())
    if (line) { sayTutorial(line); render() }
    return
  }
  const changes = syncRules(getLog(), evaluate(state, problemById(state.problemId)))
  for (const c of changes) record(c.type, c.payload, 'system')
  if (changes.length) renderDetails(getState())
}

