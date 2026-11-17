import { loadFixtures, runFixture } from './harness'

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
process.exit(failed || leaks || ghosts ? 1 : 0)
