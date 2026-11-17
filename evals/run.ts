import { loadFixtures, runFixture, runFixtureWithModel, summarizeModel } from './harness'
import { openAiCompatible } from './openai'

const args = process.argv.slice(2)
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }

const fixtures = loadFixtures()
const results = fixtures.map((f) => runFixture(f))
const mark = (fails: string[]) => (fails.length ? 'FAIL' : 'ok')
const w = Math.max(...results.map((r) => r.id.length), 8)

console.log(`${'fixture'.padEnd(w)}  A flags  B move  C reply`)
for (const r of results) {
  console.log(`${r.id.padEnd(w)}  ${mark(r.a).padEnd(7)}  ${mark(r.b).padEnd(6)}  ${mark(r.c)}`)
  for (const m of [...r.a.map((x) => `A: ${x}`), ...r.b.map((x) => `B: ${x}`), ...r.c.map((x) => `C: ${x}`)]) console.log(`    ${m}`)
}

const n = results.reduce((s, r) => s + r.phrasings, 0)
const leaks = results.reduce((s, r) => s + r.spoilerLeaks, 0)
const ghosts = results.reduce((s, r) => s + r.ghosts, 0)
const pct = (k: number) => (n ? `${((100 * k) / n).toFixed(1)}%` : 'n/a')
const failed = results.filter((r) => r.a.length || r.b.length || r.c.length).length
console.log(`\n${results.length} fixtures, ${failed} failing. Phrasings checked: ${n} (scripted coach).`)
console.log(`Spoiler-leak rate: ${pct(leaks)}   Ghost-component rate: ${pct(ghosts)}   (release gates: both 0%)`)
let bad = failed > 0 || leaks > 0 || ghosts > 0

// Optional: score a model behind an OpenAI-compatible endpoint, e.g.  npm run evals -- --openai http://localhost:8080/v1 --model my-model
const url = flag('--openai')
if (url) {
  const model = openAiCompatible(url, flag('--model') ?? 'default', process.env['OPENAI_API_KEY'])
  const rs = []
  for (const f of fixtures) rs.push(await runFixtureWithModel(f, model, Number(flag('--timeout')) || 20000))
  const s = summarizeModel(rs)
  const f1 = (x: number) => `${x.toFixed(1)}%`
  console.log(`\nModel ${model.id}: ${s.phrasings} phrasings`)
  console.log(`  raw first reply  spoiler-leak ${f1(s.rawSpoilerRate)}  ghost ${f1(s.rawGhostRate)}  shape ${f1(s.rawOtherRate)}  errors ${f1(s.rawErrorRate)}`)
  console.log(`  after the gate   shown-bad ${f1(s.shownBadRate)}  scripted fallback ${f1(s.fallbackRate)}   (release gate: raw spoiler-leak and ghost 0%; shown-bad must be 0%)`)
  if (s.shownBadRate > 0 || s.rawSpoilerRate > 0 || s.rawGhostRate > 0) bad = true
}
process.exit(bad ? 1 : 0)
