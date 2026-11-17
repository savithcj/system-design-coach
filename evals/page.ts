// The browser-run eval page (docs/08, Step 8). Dev route: /evals.html
import { chooseModel } from '../src/model/manager'
import { fakeModel } from '../src/model/fake'
import { scriptedModel } from '../src/model/scripted'
import { webllmModel, hasWebGpu } from '../src/model/webllm'
import type { CoachModel } from '../src/model/types'
import { runFixtureWithModel, summarizeModel, type Fixture, type ModelResult } from './check'

const files = import.meta.glob('./fixtures/*.json', { eager: true, import: 'default' }) as Record<string, Fixture>
const fixtures = Object.keys(files).sort().map((k) => files[k]!)

const status = document.getElementById('status')!
const out = document.getElementById('out')!
const pct = (x: number) => `${x.toFixed(1)}%`

async function main(): Promise<void> {
  const choice = chooseModel(location.search, true, hasWebGpu())
  const model: CoachModel = choice.kind === 'scripted' ? scriptedModel : choice.kind === 'fake' ? fakeModel(choice.mode) : webllmModel(choice.modelId)
  status.textContent = `Loading ${model.id}…`
  try { await model.load((p) => { status.textContent = `Loading ${model.id} ${Math.round(p * 100)}%` }) } catch (e) {
    status.textContent = `Could not load ${model.id}: ${(e as Error).message}`
    document.body.dataset['done'] = 'error'
    return
  }
  const results: ModelResult[] = []
  for (const f of fixtures) {
    status.textContent = `Running ${results.length + 1} of ${fixtures.length}: ${f.id}`
    results.push(await runFixtureWithModel(f, model))
  }
  const s = summarizeModel(results)
  const gate = s.rawSpoilerRate === 0 && s.rawGhostRate === 0 && s.shownBadRate === 0
  status.textContent = gate ? `Done. ${model.id} meets the release gates (raw spoiler and ghost rates 0%).` : `Done. ${model.id} does NOT meet the release gates.`
  out.innerHTML = `<table><tr><th>fixture</th><th>phrasings</th><th>raw spoiler</th><th>raw ghost</th><th>raw shape</th><th>raw errors</th><th>scripted fallback</th><th>shown bad</th></tr>` +
    results.map((r) => `<tr><td>${r.id}</td><td>${r.phrasings}</td><td${r.rawSpoilerLeaks ? ' class="bad"' : ''}>${r.rawSpoilerLeaks}</td><td${r.rawGhosts ? ' class="bad"' : ''}>${r.rawGhosts}</td><td>${r.rawOther}</td><td>${r.rawErrors}</td><td>${r.fellBack}</td><td${r.shownBad ? ' class="bad"' : ''}>${r.shownBad}</td></tr>`).join('') +
    `</table><h2>Summary (${s.phrasings} phrasings)</h2><ul>
      <li>Raw spoiler-leak rate: <b>${pct(s.rawSpoilerRate)}</b> (gate: 0%)</li>
      <li>Raw ghost-component rate: <b>${pct(s.rawGhostRate)}</b> (gate: 0%)</li>
      <li>Raw shape failures: ${pct(s.rawOtherRate)}, errors or timeouts: ${pct(s.rawErrorRate)}</li>
      <li>Scripted fallback after the gate: ${pct(s.fallbackRate)}</li>
      <li>Bad lines a learner would see: <b>${pct(s.shownBadRate)}</b> (must be 0%)</li></ul>`
  ;(window as unknown as { __evalSummary: unknown }).__evalSummary = { model: model.id, ...s, gate }
  document.body.dataset['done'] = gate ? 'pass' : 'fail'
}
void main()
