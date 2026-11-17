import { describe, expect, it } from 'vitest'
import { parseBlock } from '../../src/engine/contract'
import { buildReport, renderHtml, renderLatex, narrate } from '../../src/core/report'
import { reduce } from '../../src/core/reduce'
import { STAGES, formatClock, stageBySeq, stageTimes } from '../../src/core/stages'
import { undoView } from '../../src/core/undo'
import { Session, undo } from './helpers'

describe('stage and contract state', () => {
  it('starts at stage 1 with empty notes, and follows StageChanged', () => {
    const s = new Session()
    expect(s.state.stage).toBe(1)
    expect(s.state.contract).toEqual({ functional: '', nonfunctional: '', entities: '', api: '' })
    s.add('StageChanged', { stage: 4 })
    expect(s.state.stage).toBe(4)
  })
  it('ignores stages outside 1..5 and unknown blocks', () => {
    const s = new Session()
    s.add('StageChanged', { stage: 9 }); s.add('StageChanged', { stage: 0 }); s.add('StageChanged', { stage: 2.4 })
    expect(s.state.stage).toBe(2)
    s.add('ContractNoteUpdated', { block: 'nope' as never, text: 'x' })
    expect(Object.keys(s.state.contract)).toHaveLength(4)
  })
  it('keeps the exact text of the last update per block, including blank lines and the divider', () => {
    const s = new Session()
    s.add('ContractNoteUpdated', { block: 'functional', text: 'search events\n\n---\npayments' })
    s.add('ContractNoteUpdated', { block: 'api', text: 'GET /events' })
    s.add('ContractNoteUpdated', { block: 'functional', text: 'search events\n---\n' })
    expect(s.state.contract.functional).toBe('search events\n---\n')
    expect(s.state.contract.api).toBe('GET /events')
  })
  it('stage changes and note edits are not board-undoable, and undo leaves them alone', () => {
    const s = new Session()
    s.node('client')
    s.add('StageChanged', { stage: 3 })
    s.add('ContractNoteUpdated', { block: 'api', text: 'x' })
    expect(undoView(s.log).groups).toHaveLength(1)
    undo(s)
    expect(s.state.stage).toBe(3)
    expect(s.state.contract.api).toBe('x')
    expect(s.state.nodes).toHaveLength(0)
  })
})

describe('stage times', () => {
  it('splits time between stages and accumulates when a stage is revisited', () => {
    const s = new Session()
    const t0 = s.log[0]!.ts
    s.add('StageChanged', { stage: 2 }, 'user', 60_000)
    s.add('StageChanged', { stage: 1 }, 'user', 30_000)
    s.add('StageChanged', { stage: 3 }, 'user', 10_000)
    // 0-60 s stage 1, 60-90 s stage 2, 90-100 s stage 1 again, 100-120 s stage 3
    expect(stageTimes(s.log, t0 + 120_000)).toEqual([70_000, 30_000, 20_000, 0, 0])
  })
  it('an empty log or a log with no stage changes spends everything in stage 1', () => {
    expect(stageTimes([], 5)).toEqual([0, 0, 0, 0, 0])
    const s = new Session()
    expect(stageTimes(s.log, s.log[0]!.ts + 5000)).toEqual([5000, 0, 0, 0, 0])
  })
  it('maps each event to the stage it happened in', () => {
    const s = new Session()
    s.node('client'); s.add('StageChanged', { stage: 4 }); s.node('db')
    const m = stageBySeq(s.log)
    expect([...m.values()]).toEqual([1, 1, 4, 4])
  })
  it('formats m:ss', () => {
    expect(formatClock(0)).toBe('0:00'); expect(formatClock(65_999)).toBe('1:05'); expect(formatClock(-5)).toBe('0:00')
    expect(STAGES.map((g) => g.targetMin)).toEqual([5, 2, 5, 12, 10])
  })
})

describe('parseBlock', () => {
  it('splits at the divider and strips bullets and numbering', () => {
    const p = parseBlock('- search events\n* view event\n1. book tickets\n2) pay\n\n---\n- refunds\n• admin')
    expect(p).toEqual({ inScope: ['search events', 'view event', 'book tickets', 'pay'], outOfScope: ['refunds', 'admin'], hasDivider: true })
  })
  it('no divider means everything is in scope', () => {
    expect(parseBlock('a\nb')).toEqual({ inScope: ['a', 'b'], outOfScope: [], hasDivider: false })
  })
  it('accepts longer dividers, windows newlines, and a divider with nothing below', () => {
    expect(parseBlock('a\r\n-----\r\n')).toEqual({ inScope: ['a'], outOfScope: [], hasDivider: true })
  })
  it('only treats a line that is entirely dashes as the divider', () => {
    expect(parseBlock('--- not a divider\n-- also not\na - b').hasDivider).toBe(false)
    expect(parseBlock('- --- nested').hasDivider).toBe(false)
  })
  it('the first divider wins; later ones keep lines below the line', () => {
    expect(parseBlock('a\n---\nb\n---\nc')).toEqual({ inScope: ['a'], outOfScope: ['b', 'c'], hasDivider: true })
  })
  it('empty text, and a bullet with no text, give nothing', () => {
    expect(parseBlock('')).toEqual({ inScope: [], outOfScope: [], hasDivider: false })
    expect(parseBlock('-\n*\n')).toEqual({ inScope: [], outOfScope: [], hasDivider: false })
  })
})

describe('report by stage', () => {
  function run() {
    const s = new Session()
    s.add('ContractNoteUpdated', { block: 'functional', text: 'search events\nbook a ticket\n---\npayments' })
    s.add('ContractNoteUpdated', { block: 'api', text: 'GET /events?q=' })
    s.node('client', 'Web app')
    s.add('StageChanged', { stage: 4 }, 'user', 120_000)
    s.node('db', 'Postgres')
    s.add('SessionFinished', {}, 'user', 60_000)
    return s
  }
  it('groups steps under the stage they happened in and shows time against the targets', () => {
    const r = buildReport(run().log)
    expect(r.stages.map((g) => g.spent)).toEqual(['2:00', '0:00', '0:00', '1:00', '0:00'])
    const texts = (n: number) => r.stages[n - 1]!.stepIdx.map((i) => r.steps[i]!.text)
    expect(texts(1)).toContain('Added "Web app" (Client).')
    expect(texts(4)).toContain('Added "Postgres" (Database).')
    expect(texts(4)).toContain('Session finished.')
    expect(narrate(run().log).map((x) => x.text)).toContain('Moved to stage 4: High-level design.')
  })
  it('includes the contract notes with the out-of-scope part separate, and omits empty blocks', () => {
    const r = buildReport(run().log)
    expect(r.contract.map((c) => c.title)).toEqual(['Functional', 'API / data flow'])
    expect(r.contract[0]).toMatchObject({ inScope: ['search events', 'book a ticket'], outOfScope: ['payments'] })
  })
  it('HTML and LaTeX carry the pacing table, stage headings and notes', () => {
    const r = buildReport(run().log)
    const html = renderHtml(r)
    expect(html).toContain('<th scope="row">4. High-level design</th><td>12 min</td><td>1:00</td>')
    expect(html).toContain('2:00 of about 5 min')
    expect(html).toContain('Out of scope')
    expect(html).not.toContain('<h4>2. Entities') // a stage with nothing in it gets no heading
    const tex = renderLatex(r)
    expect(tex).toContain('\\begin{tabular}{lrr}')
    expect(tex).toContain('4. High-level design & 12 min & 1:00 \\\\')
    expect(tex).toContain('\\subsection*{1. Requirements (2:00 of about 5 min)}')
    expect(tex).toContain('\\emph{Out of scope}')
    expect(tex).toContain('\\item payments')
  })
  it('is deterministic: the same log always renders the same report', () => {
    const s = run()
    expect(renderHtml(buildReport(s.log))).toBe(renderHtml(buildReport(s.log)))
    expect(reduce(s.log).stage).toBe(4)
  })
})

describe('bulleted notes', () => {
  it('reads the divider even when the box put a bullet in front of it', () => {
    const p = parseBlock('• shorten a URL\n• ---\n• analytics')
    expect(p.inScope).toEqual(['shorten a URL'])
    expect(p.outOfScope).toEqual(['analytics'])
    expect(p.hasDivider).toBe(true)
  })
})
