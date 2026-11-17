import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkReply } from '../../src/engine/grounding'
import { nextNudge } from '../../src/engine/nudge'
import { RULES } from '../../src/engine/rules/registry'
import { BASELINES } from '../../src/problems/baselines'
import { PROBLEMS, problemById } from '../../src/problems'
import { board } from './helpers'

describe('problems', () => {
  it('has the three ported problems and Ticketmaster, with unique ids', () => {
    expect(PROBLEMS.map((p) => p.id)).toEqual(['url', 'rate', 'feed', 'ticketmaster'])
    expect(problemById('nope').id).toBe('url')
  })

  it('every challenge names a real rule that is marked as problem-specific, in a unique order', () => {
    for (const p of PROBLEMS) {
      const orders = p.challenges.map((c) => c.order)
      expect(new Set(orders).size, p.id).toBe(orders.length)
      for (const c of p.challenges) {
        const r = RULES.find((x) => x.id === c.ruleId)
        expect(r, `${p.id} ${c.ruleId}`).toBeDefined()
        expect(r!.needsChallenge, c.ruleId).toBe(true)
        expect(c.stage).toBe(r!.stage)
      }
    }
  })

  it('every problem-specific rule is used by some problem', () => {
    const used = new Set(PROBLEMS.flatMap((p) => p.challenges.map((c) => c.ruleId)))
    for (const r of RULES.filter((x) => x.needsChallenge)) expect(used.has(r.id), r.id).toBe(true)
  })

  it('every problem has a rubric for each stage and baselines whose edges point at real boxes', () => {
    for (const p of PROBLEMS) {
      for (const s of [1, 2, 3, 4, 5] as const) expect(p.stageRubrics[s].length, `${p.id} ${s}`).toBeGreaterThan(10)
      const b = BASELINES[p.id]!
      const ids = new Set(b.nodes.map((n) => n.id))
      expect(ids.size).toBe(b.nodes.length)
      for (const [a, c] of b.edges) expect(ids.has(a) && ids.has(c), `${p.id} ${a}->${c}`).toBe(true)
    }
  })

  it('the reference design is read only by the report (Step 9): nothing else imports baselines', () => {
    const root = join(__dirname, '..', '..', 'src')
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
    const importers = walk(root).filter((f) => /\.ts$/.test(f) && /from '[./]*(?:problems\/)?baselines'/.test(readFileSync(f, 'utf8')))
    expect(importers.map((f) => f.slice(root.length + 1)).filter((f) => f !== 'core/report.ts')).toEqual([])
  })

  it('nudges are questions or neutral prompts that pass the gate at their own stage', () => {
    for (const p of PROBLEMS) {
      for (const n of p.nudges) {
        const g = checkReply({ message: n.text, state: board().state(), problem: p, stage: 4 })
        expect(g.reasons, `${p.id}: ${n.text}`).toEqual([])
      }
    }
  })
})

describe('nextNudge', () => {
  const p = problemById('url')
  it('asks about the first missing category, by category and count only', () => {
    const b = board()
    expect(nextNudge(p, b.state())).toMatch(/who uses/i)
    b.node('client', 'Phone')
    expect(nextNudge(p, b.state())).toMatch(/single point of failure/)
    b.node('service', 'Anything at all')
    expect(nextNudge(p, b.state())).toMatch(/create-link/) // a second server is wanted next
    b.node('service', 'Another')
    expect(nextNudge(p, b.state())).toMatch(/100 to 1/)
  })
  it('is null once every category has enough boxes', () => {
    const b = board()
    for (const r of ['client', 'service', 'service', 'cache', 'db', 'queue'] as const) b.node(r, r + Math.random())
    expect(nextNudge(p, b.state())).toBeNull()
  })
})
