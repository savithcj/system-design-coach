import { LOCAL_MODEL_DEFAULT_ON, LOCAL_MODEL_ID } from './config'
import { fakeModel, type FakeMode } from './fake'
import { scriptedModel } from './scripted'
import type { CoachModel } from './types'
import { hasWebGpu, webllmModel } from './webllm'

/** What the status line says. Wording is fixed by docs/02. */
export type StatusView = { dot: 'ready' | 'loading' | 'warn'; text: string }

let active: CoachModel = scriptedModel
let view: StatusView = { dot: 'ready', text: 'Coach ready (scripted)' }
const listeners = new Set<(v: StatusView) => void>()

/** Shown while a model is writing a reply; restores the previous status afterwards. */
let before: StatusView | null = null
export function setThinking(on: boolean): void {
  if (on && !before) { before = view; set({ dot: 'loading', text: 'Coach is thinking…' }) }
  else if (!on && before) { const b = before; before = null; set(b) }
}

export const currentModel = (): CoachModel => active
export const statusView = (): StatusView => view
export function onStatus(f: (v: StatusView) => void): () => void { listeners.add(f); f(view); return () => { listeners.delete(f) } }
function set(v: StatusView): void { view = v; listeners.forEach((f) => f(v)) }

export type ModelChoice = { kind: 'scripted' } | { kind: 'local'; modelId: string } | { kind: 'fake'; mode: FakeMode }

/** Decide from the URL (dev and tests) and the build defaults. Production defaults to scripted until the eval page has passed. */
export function chooseModel(search: string, dev: boolean, gpu: boolean): ModelChoice {
  const q = new URLSearchParams(search)
  const c = q.get('coach')
  if (c === 'scripted') return { kind: 'scripted' }
  if (dev && c?.startsWith('fake-')) return { kind: 'fake', mode: c.slice(5) as FakeMode }
  if (c === 'local') return { kind: 'local', modelId: dev ? q.get('model') ?? LOCAL_MODEL_ID : LOCAL_MODEL_ID }
  if (!dev && LOCAL_MODEL_DEFAULT_ON && gpu) return { kind: 'local', modelId: LOCAL_MODEL_ID }
  return { kind: 'scripted' }
}

/** Starts loading in the background. The scripted coach is in use until (and unless) the model is ready. */
export function startModel(search = location.search, dev = import.meta.env.DEV): void {
  const choice = chooseModel(search, dev, hasWebGpu())
  if (choice.kind === 'scripted') return
  const model = choice.kind === 'fake' ? fakeModel(choice.mode, 300) : webllmModel(choice.modelId)
  set({ dot: 'loading', text: 'Loading coach 0%' })
  model.load((p) => set({ dot: 'loading', text: `Loading coach ${Math.round(p * 100)}%` })).then(
    () => { active = model; set({ dot: 'ready', text: 'Coach ready (local model)' }) },
    // Silent in behaviour (the scripted coach just carries on), said once in the status text.
    () => { active = scriptedModel; set({ dot: 'warn', text: 'Coach ready (scripted). Local model unavailable.' }) },
  )
}
