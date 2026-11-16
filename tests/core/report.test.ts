import { describe, expect, it } from 'vitest'
import { boardMermaid, mermaidFrom } from '../../src/core/mermaid'
import { buildReport, narrate, renderHtml, renderLatex } from '../../src/core/report'
import { texEscape } from '../../src/core/text'
import { Session } from './helpers'

function session() {
  const s = new Session()
  const a = s.node('client', 'Web app'), b = s.node('service', 'Nginx'), c = s.node('db', 'Postgres'), q = s.node('queue', 'Kafka')
  s.edge(a, b); s.edge(b, c); s.edge(b, q)
  s.add('NodeRenamed', { id: b, label: 'Envoy' }, 'user', 4000)
  s.add('UserMessaged', { text: 'Is 100 & more <ok>?' })
  s.add('CoachResponded', { kind: 'reply', message: 'What if Postgres is down?' }, 'coach')
  s.add('SessionFinished', {})
  return s
}

describe('mermaid', () => {
  it('uses cylinder for databases, subroutine for queues, and quotes safely', () => {
    const m = mermaidFrom([
      { id: 'a', role: 'db', label: 'PG "main"' }, { id: 'b', role: 'queue', label: 'Kafka' }, { id: 'c', role: 'client', label: 'Web' },
    ], [{ a: 'c', b: 'a' }, { a: 'x', b: 'a' }])
    expect(m).toContain(`N1[("PG 'main'")]`)
    expect(m).toContain('N2[["Kafka"]]')
    expect(m).toContain('N3["Web"]')
    expect(m).toContain('N3 --> N1')
    expect(m).not.toContain('x -->')
  })
  it('lists the board top to bottom by arrows', () => {
    const m = boardMermaid(session().state)
    expect(m.indexOf('Web app')).toBeLessThan(m.indexOf('Envoy'))
    expect(m.indexOf('Envoy')).toBeLessThan(m.indexOf('Postgres'))
  })
})

describe('report', () => {
  it('narrates in order, attributes, and resolves names as they were at the time', () => {
    const steps = narrate(session().log)
    expect(steps.map((x) => x.text)).toContain('Renamed "Nginx" to "Envoy".')
    expect(steps.find((x) => x.chat && x.who === 'coach')?.text).toContain('Postgres')
    expect(steps.find((x) => x.who === 'you' && x.chat)?.raw).toBe('Is 100 & more <ok>?')
    expect(steps.at(-1)).toMatchObject({ who: 'sys' })
  })

  it('skips silent events and attributes coach-authored board events to the coach', () => {
    const s = new Session()
    s.add('NodeAdded', { id: 'k', role: 'cache', label: 'Redis' }, 'coach')
    s.add('NodeDeleted', { id: 'k', silent: true } as never)
    const steps = narrate(s.log)
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ who: 'coach' })
  })

  it('HTML escapes user text', () => {
    const html = renderHtml(buildReport(session().log))
    expect(html).toContain('Is 100 &amp; more &lt;ok&gt;?')
    expect(html).not.toContain('<ok>')
    expect(html).toContain('id="mmFinal"')
  })

  it('LaTeX escapes specials and is a complete document', () => {
    const tex = renderLatex(buildReport(session().log))
    expect(tex).toContain('Is 100 \\& more <ok>?')
    expect(tex.startsWith('\\documentclass')).toBe(true)
    expect(tex.trimEnd().endsWith('\\end{document}')).toBe(true)
    expect(tex).toContain('\\begin{verbatim}')
    expect(texEscape('a_b%c→d é')).toBe('a\\_b\\%c$\\rightarrow$d ?')
  })

  it('reports stats from the log', () => {
    const r = buildReport(session().log)
    expect(r.stats).toMatchObject({ replies: 1, hints: 0 })
    expect(r.stats.events).toBe(session().log.length)
  })
})
