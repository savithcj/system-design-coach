import { LOCAL_MODEL_DEFAULT_ON, LOCAL_MODEL_ID } from './config'
import { fakeModel, type FakeMode } from './fake'
import { scriptedModel } from './scripted'
import type { CoachModel } from './types'
import { hasWebGpu, webllmModel } from './webllm'

/** What the status line says. Wording is fixed by docs/02. */
/** `blocking` is true only while the model is first loading: the whole app is covered and inert. */
export type StatusView = { dot: 'ready' | 'loading' | 'warn'; text: string; blocking?: boolean }

let active: CoachModel = scriptedModel
let view: StatusView = { dot: 'ready', text: 'Coach ready (scripted)' }
const listeners = new Set<(v: StatusView) => void>()

/** True while a model is writing. The chat shows a bubble with moving dots; the status line is left alone. */
let thinking = false
const thinkListeners = new Set<(on: boolean) => void>()
export function setThinking(on: boolean): void {
  if (on === thinking) return
  thinking = on
  thinkListeners.forEach((f) => f(on))
}
export const isThinking = (): boolean => thinking
export function onThinking(f: (on: boolean) => void): () => void { thinkListeners.add(f); return () => { thinkListeners.delete(f) } }

export const currentModel = (): CoachModel => active
export const statusView = (): StatusView => view
export function onStatus(f: (v: StatusView) => void): () => void { listeners.add(f); f(view); return () => { listeners.delete(f) } }
function set(v: StatusView): void { view = v; listeners.forEach((f) => f(v)) }

export type ModelChoice = { kind: 'scripted' } | { kind: 'local'; modelId: string } | { kind: 'fake'; mode: FakeMode }

/** Decide from the URL (dev and tests) and the build defaults. Local model by default where WebGPU exists, except under automation. */
export function chooseModel(search: string, dev: boolean, gpu: boolean, automated = false): ModelChoice {
  const q = new URLSearchParams(search)
  const c = q.get('coach')
  if (c === 'scripted') return { kind: 'scripted' }
  if (dev && c?.startsWith('fake-')) return { kind: 'fake', mode: c.slice(5) as FakeMode }
  if (c === 'local') return { kind: 'local', modelId: dev ? q.get('model') ?? LOCAL_MODEL_ID : LOCAL_MODEL_ID }
  if (LOCAL_MODEL_DEFAULT_ON && gpu && !automated) return { kind: 'local', modelId: LOCAL_MODEL_ID }
  return { kind: 'scripted' }
}

/** Starts loading in the background. The scripted coach is in use until (and unless) the model is ready. */
export function startModel(search = location.search, dev = import.meta.env.DEV): void {
  const choice = chooseModel(search, dev, hasWebGpu(), typeof navigator !== 'undefined' && navigator.webdriver === true)
  if (choice.kind === 'scripted') return
  // Dev only: ?coachLoadMs=1500 stretches the fake model's load so the loading cover can be tested.
  const loadMs = dev ? Number(new URLSearchParams(search).get('coachLoadMs')) || 300 : 300
  const model = choice.kind === 'fake' ? fakeModel(choice.mode, loadMs) : webllmModel(choice.modelId)
  set({ dot: 'loading', text: 'Loading coach 0%', blocking: true })
  model.load((p) => set({ dot: 'loading', text: `Loading coach ${Math.round(p * 100)}%`, blocking: true })).then(
    () => { active = model; set({ dot: 'ready', text: 'Coach ready (local model)' }) },
    // Silent in behaviour (the scripted coach just carries on), said once in the status text.
    () => { active = scriptedModel; set({ dot: 'warn', text: 'Coach ready (scripted). Local model unavailable.' }) },
  )
}
