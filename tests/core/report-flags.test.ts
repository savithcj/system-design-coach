import { describe, expect, it } from 'vitest'
import { buildReport, renderHtml, renderLatex } from '../../src/core/report'
import { Session } from './helpers'

function session() {
  const s = new Session()
  s.add('ProblemLoaded', { problemId: 'ticketmaster' }, 'system')
  s.add('ContractNoteUpdated', { block: 'functional', text: 'a\nb\nc\nd\ne' })
  s.add('RuleFired', { ruleId: 'REQ_TOO_MANY_FEATURES', stage: 1, evidence: ['e'] }, 'system', 30_000)
  s.add('RuleFired', { ruleId: 'REQ_NO_OUT_OF_SCOPE', stage: 1, evidence: [] }, 'system', 0)
  s.add('HintRequested', { level: 1, ruleId: 'REQ_TOO_MANY_FEATURES' }, 'coach', 5_000)
  s.add('HintRequested', { level: 2, ruleId: 'REQ_TOO_MANY_FEATURES' }, 'coach', 5_000)
  s.add('ContractNoteUpdated', { block: 'functional', text: 'a\nb\n---\nc' })
  s.add('RuleResolved', { ruleId: 'REQ_TOO_MANY_FEATURES' }, 'system', 25_000)
  s.add('RuleResolved', { ruleId: 'REQ_NO_OUT_OF_SCOPE' }, 'system', 0)
  s.add('RuleFired', { ruleId: 'DD_SURGE_NO_CHOKEPOINT', stage: 5, evidence: [] }, 'system', 10_000)
  return s
}

describe('what the coach flagged', () => {
  it('lists each issue with when it was raised and cleared, in the order raised, and what is still open', () => {
    const r = buildReport(session().log)
    expect(r.flags.map((f) => [f.title, f.stage, f.firedAt, f.resolvedAt])).toEqual([
      ['Too many features for a first pass', 1, '0:30', '1:05'],
      ['Nothing marked out of scope', 1, '0:30', '1:05'],
      ['Nothing limits a surge reaching the booking store', 5, '1:15', null],
    ])
    expect(r.flags[0]!.hints).toEqual([1, 2])
    expect(r.flags[1]!.hints).toEqual([])
  })

  it('appears in both the HTML and the LaTeX, with open items marked', () => {
    const r = buildReport(session().log)
    const html = renderHtml(r), tex = renderLatex(r)
    expect(html).toContain('What the coach flagged')
    expect(html).toContain('Hints used: level 1, level 2.')
    expect(html).toContain('still open at the end')
    expect(tex).toContain('\\section{What the coach flagged}')
    expect(tex).toContain('still open at the end')
  })

  it('is omitted when nothing was flagged', () => {
    const s = new Session(); s.node('client')
    expect(renderHtml(buildReport(s.log))).not.toContain('What the coach flagged')
  })
})

describe('the reference design', () => {
  it('is absent while the session is running, in every output', () => {
    const s = session()
    s.node('client', 'Phone'); s.node('db', 'Ledger')
    const r = buildReport(s.log)
    expect(r.reference).toBeUndefined()
    for (const out of [renderHtml(r), renderLatex(r)]) {
      expect(out).not.toContain('One reasonable design')
      expect(out).not.toContain('Payment Provider')
    }
  })

  it('appears after the session is finished, compared by category and never as a score', () => {
    const s = session()
    s.node('client', 'Phone'); s.node('db', 'Ledger')
    s.add('SessionFinished', {})
    const r = buildReport(s.log)
    const byLabel = Object.fromEntries(r.reference!.components.map((c) => [c.label, c.yours]))
    expect(byLabel['Client']).toBe('Phone')
    expect(byLabel['Relational Database']).toBe('Ledger')
    expect(byLabel['API Gateway']).toBeNull()
    const html = renderHtml(r)
    expect(html).toContain('One reasonable design')
    expect(html).toContain('On your board: Phone.')
    expect(html).toContain('Not on your board.')
    expect(html).toContain('id="mmRef"')
    expect(html).toMatch(/nothing here is a score/)
    expect(renderLatex(r)).toContain('\\section{One reasonable design}')
  })

  it('matches a second box of the same category to the second box the learner drew', () => {
    const s = new Session()
    s.add('ProblemLoaded', { problemId: 'url' }, 'system')
    s.node('service', 'Edge'); s.node('service', 'API')
    s.add('SessionFinished', {})
    const mine = buildReport(s.log).reference!.components.filter((c) => c.category === 'Server').map((c) => c.yours)
    expect(mine.slice(0, 3)).toEqual(['Edge', 'API', null])
  })
})
