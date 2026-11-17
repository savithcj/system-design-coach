import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildReport, renderLatex } from '../../src/core/report'
import { Session } from './helpers'

/** A finished session whose text is as hostile to LaTeX as a learner can make it. */
function hostileLog() {
  const s = new Session()
  s.add('ProblemLoaded', { problemId: 'ticketmaster' }, 'system')
  s.add('ContractNoteUpdated', { block: 'functional', text: 'Search & view events (100% of users)\n$5 fee_per #ticket {x} ~ ^ \\ “smart quotes” – dash … \n---\nrefunds → later' })
  s.add('ContractNoteUpdated', { block: 'api', text: 'POST /bookings { userId }\nGET /events?term=a_b&c=100%' })
  const a = s.node('client', 'Web_app #1'), b = s.node('db', 'Postgres & "Redis" 50%')
  s.edge(a, b)
  s.add('EdgeLabeled', { id: s.state.edges[0]!.id, label: 'SELECT * FROM t WHERE x_y = 5%' })
  s.add('RuleFired', { ruleId: 'HLD_CLIENT_TO_DB', stage: 4, evidence: [] }, 'system')
  s.add('HintRequested', { level: 1, ruleId: 'HLD_CLIENT_TO_DB' }, 'coach')
  s.add('CoachResponded', { kind: 'reply', message: 'Why does Web_app → Postgres? 100% sure… ‘ok’ 日本語' }, 'coach')
  s.add('SessionFinished', {})
  return s.log
}

describe('LaTeX output', () => {
  const tex = renderLatex(buildReport(hostileLog()))

  it('is plain ASCII, so it builds with any engine and only the minimal packages', () => {
    expect(tex).toMatch(/^[\x00-\x7F]*$/)
    const pkgs = [...tex.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)].map((m) => m[1])
    expect(pkgs).toEqual(['inputenc', 'fontenc', 'geometry', 'enumitem'])
  })

  it('has balanced environments', () => {
    const count = (re: RegExp) => (tex.match(re) ?? []).length
    for (const env of ['itemize', 'enumerate', 'tabular', 'verbatim', 'document']) {
      expect(count(new RegExp(`\\\\begin\\{${env}\\}`, 'g')), env).toBe(count(new RegExp(`\\\\end\\{${env}\\}`, 'g')))
    }
  })

  const tectonic = spawnSync('tectonic', ['--version'])
  it.skipIf(tectonic.status !== 0)('compiles with Tectonic (a real LaTeX engine)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdc-latex-'))
    writeFileSync(join(dir, 'report.tex'), tex)
    const r = spawnSync('tectonic', ['report.tex'], { cwd: dir, encoding: 'utf8', timeout: 170_000 })
    expect(r.stderr + r.stdout, 'tectonic output').not.toMatch(/error:/i)
    expect(r.status).toBe(0)
    expect(existsSync(join(dir, 'report.pdf'))).toBe(true)
    expect(readFileSync(join(dir, 'report.pdf')).subarray(0, 4).toString()).toBe('%PDF')
  }, 180_000)
})
