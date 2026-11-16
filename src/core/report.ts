import type { EventLog, KnownEvent } from './events'
import { boardMermaid } from './mermaid'
import { reduce } from './reduce'
import { nodeName } from './state'
import { roleLabel } from './roles'
import { escapeHtml as esc, texEscape as tex } from './text'
import { CONTRACT_BLOCKS, CONTRACT_TITLES, STAGES, formatClock, stageBySeq, stageTimes } from './stages'
import { parseBlock } from '../engine/contract'
import { problemById } from '../problems'

export interface Step { who: 'you' | 'coach' | 'sys'; text: string; seq: number; ts: number; chat?: boolean; raw?: string }

/** mm:ss since the first event. */
export function elapsed(log: EventLog, ts: number): string {
  const first = log[0]?.ts ?? ts
  const d = Math.max(0, Math.round((ts - first) / 1000))
  return `${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')}`
}

/** The log as a human timeline. Events marked `silent` (inverse events appended by undo) are skipped. */
export function narrate(log: EventLog): Step[] {
  const out: Step[] = []
  const texts = new Map<number, string>()
  const quote = (s: string) => `"${s}"`
  let before = reduce([])
  log.forEach((raw, i) => {
    const e = raw as KnownEvent
    const p = e.payload as unknown as Record<string, unknown>
    let item: Omit<Step, 'seq' | 'ts'> | null = null
    if (!p || !p['silent']) {
      switch (e.type) {
        case 'NodeAdded': item = { who: 'you', text: `Added "${e.payload.label}" (${roleLabel(e.payload.role)}).` }; break
        case 'NodeRenamed': {
          const to = (e.payload as { label?: string; to?: string }).label ?? (e.payload as { to?: string }).to ?? ''
          item = { who: 'you', text: `Renamed "${nodeName(before, e.payload.id)}" to "${to}".` }
          break
        }
        case 'NodeDeleted': item = { who: 'you', text: `Removed "${nodeName(before, e.payload.id)}" and its connections.` }; break
        case 'EdgeAdded': item = { who: 'you', text: `Connected "${nodeName(before, e.payload.a)}" → "${nodeName(before, e.payload.b)}".` }; break
        case 'EdgeDeleted': {
          const ed = before.edges.find((x) => x.id === e.payload.id)
          item = { who: 'you', text: `Removed the connection "${ed ? nodeName(before, ed.a) : '?'}" → "${ed ? nodeName(before, ed.b) : '?'}".` }
          break
        }
        case 'EdgeLabeled': {
          const ed = before.edges.find((x) => x.id === e.payload.id)
          const ends = ed ? `${quote(nodeName(before, ed.a))} → ${quote(nodeName(before, ed.b))}` : 'a connection'
          item = { who: 'you', text: e.payload.label.trim() ? `Labelled the connection ${ends} ${quote(e.payload.label.trim())}.` : `Cleared the label on the connection ${ends}.` }
          break
        }
        case 'NodeNoteUpdated': {
          const was = before.nodes.find((x) => x.id === e.payload.id)?.note
          const name = quote(nodeName(before, e.payload.id))
          item = { who: 'you', text: !e.payload.text.trim() ? `Removed the note on ${name}.` : was ? `Edited the note on ${name}.` : `Added a note to ${name}.` }
          break
        }
        case 'UserActionUndone':
        case 'UserActionRedone': {
          const t = texts.get(e.payload.targetSeq)
          const verb = e.type === 'UserActionUndone' ? 'Undid' : 'Redid'
          item = { who: 'you', text: t ? `${verb}: ${t}` : `${verb} a change.` }
          break
        }
        case 'StageChanged': item = { who: 'you', text: `Moved to stage ${e.payload.stage}: ${STAGES[Math.round(e.payload.stage) - 1]?.label ?? ''}.` }; break
        case 'UserMessaged': item = { who: 'you', text: `"${e.payload.text}"`, raw: e.payload.text, chat: true }; break
        case 'CoachResponded': item = { who: 'coach', text: e.payload.message, chat: true }; break
        case 'SessionFinished': item = { who: 'sys', text: 'Session finished.' }; break
        default: break
      }
    }
    if (item) {
      if (e.type !== 'UserActionUndone' && e.type !== 'UserActionRedone') texts.set(e.seq, item.text)
      if (item.who === 'you' && e.actor === 'coach') item.who = 'coach'
      out.push({ ...item, seq: e.seq, ts: e.ts })
    }
    before = reduce(log.slice(0, i + 1))
  })
  return out
}

export interface StageSection {
  n: number
  label: string
  targetMin: number
  spent: string
  /** Indices into `steps`. */
  stepIdx: number[]
}

export interface ContractSection { id: string; title: string; inScope: string[]; outOfScope: string[] }

export interface ReportModel {
  title: string
  prompt: string
  steps: Step[]
  /** Elapsed label per step, precomputed so renderers stay pure. */
  times: string[]
  stages: StageSection[]
  contract: ContractSection[]
  finalMermaid: string
  stats: { events: number; replies: number; hints: number; duration: string }
}

export function buildReport(log: EventLog): ReportModel {
  const s = reduce(log)
  const P = problemById(s.problemId)
  const steps = narrate(log)
  const last = log[log.length - 1]
  const stageOf = stageBySeq(log)
  // Time is measured to the last event, not the wall clock, so the same log always gives the same report.
  const spent = stageTimes(log, last?.ts ?? 0)
  return {
    title: P.title,
    prompt: P.prompt,
    steps,
    times: steps.map((st) => elapsed(log, st.ts)),
    stages: STAGES.map((g) => ({
      n: g.n, label: g.label, targetMin: g.targetMin, spent: formatClock(spent[g.n - 1]!),
      stepIdx: steps.flatMap((st, i) => (stageOf.get(st.seq) === g.n ? [i] : [])),
    })),
    contract: CONTRACT_BLOCKS.flatMap((id) => {
      const p = parseBlock(s.contract[id])
      return p.inScope.length || p.outOfScope.length ? [{ id, title: CONTRACT_TITLES[id], inScope: p.inScope, outOfScope: p.outOfScope }] : []
    }),
    finalMermaid: boardMermaid(s),
    stats: {
      events: log.length,
      replies: log.filter((e) => e.type === 'CoachResponded' && (e.payload as { kind?: string }).kind === 'reply').length,
      hints: log.filter((e) => e.type === 'CoachResponded' && (e.payload as { kind?: string }).kind === 'hint').length,
      duration: last ? elapsed(log, last.ts) : '0:00',
    },
  }
}

const whoLabel = (w: Step['who']) => (w === 'you' ? 'You' : w === 'coach' ? 'Coach' : 'Note')
const statLine = (r: ReportModel) => `${r.stats.events} events, ${r.stats.replies} coach replies, ${r.stats.hints} hints, ${r.stats.duration} total.`
const paceLine = (g: StageSection) => `${g.spent} of about ${g.targetMin} min`

export function renderHtml(r: ReportModel): string {
  const muted = 'style="color:#555;font-size:13px"'
  let h = `<h3>${esc(r.title)}: Study Guide</h3><div ${muted}>${statLine(r)}</div>`
  h += `<h2>Problem</h2><div>${esc(r.prompt)}</div>`
  h += '<h2>Time per stage</h2><table class="pace"><thead><tr><th scope="col">Stage</th><th scope="col">Target</th><th scope="col">Spent</th></tr></thead><tbody>'
  for (const g of r.stages) h += `<tr><th scope="row">${g.n}. ${esc(g.label)}</th><td>${g.targetMin} min</td><td>${g.spent}</td></tr>`
  h += '</tbody></table><h2>How we got here</h2>'
  for (const g of r.stages) {
    if (!g.stepIdx.length) continue
    h += `<h4>${g.n}. ${esc(g.label)} <span ${muted}>${paceLine(g)}</span></h4><ol>`
    for (const i of g.stepIdx) h += `<li><span ${muted}>${r.times[i]}</span> <b>${whoLabel(r.steps[i]!.who)}:</b> ${esc(r.steps[i]!.text)}</li>`
    h += '</ol>'
  }
  if (r.contract.length) {
    h += '<h2>Contract notes</h2>'
    for (const c of r.contract) {
      h += `<h4>${esc(c.title)}</h4>`
      if (c.inScope.length) h += `<ul>${c.inScope.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
      if (c.outOfScope.length) h += `<div ${muted}>Out of scope</div><ul>${c.outOfScope.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
    }
  }
  h += `<h2>Your design, cleaned up</h2><div class="mm" id="mmFinal"></div><pre>${esc(r.finalMermaid)}</pre>`
  return `<div class="paper">${h}</div>`
}

export function renderLatex(r: ReportModel): string {
  const L: string[] = []
  L.push('\\documentclass[11pt]{article}', '\\usepackage[utf8]{inputenc}', '\\usepackage[T1]{fontenc}', '\\usepackage[margin=1in]{geometry}', '\\usepackage{enumitem}', '')
  L.push(`\\title{${tex(r.title)}: Study Guide}`, '\\date{\\today}', '\\begin{document}', '\\maketitle', '')
  L.push('\\section*{Problem}', tex(r.prompt), '')
  L.push('\\section{Time per stage}', '\\begin{tabular}{lrr}', 'Stage & Target & Spent \\\\ \\hline')
  for (const g of r.stages) L.push(`${g.n}. ${tex(g.label)} & ${g.targetMin} min & ${g.spent} \\\\`)
  L.push('\\end{tabular}', '')
  L.push('\\section{How we got here}')
  for (const g of r.stages) {
    if (!g.stepIdx.length) continue
    L.push(`\\subsection*{${g.n}. ${tex(g.label)} (${tex(paceLine(g))})}`, '\\begin{enumerate}[leftmargin=*]')
    for (const i of g.stepIdx) L.push(`  \\item[\\textbf{${r.times[i]}}] \\textbf{${whoLabel(r.steps[i]!.who)}:} ${tex(r.steps[i]!.text)}`)
    L.push('\\end{enumerate}')
  }
  L.push('')
  if (r.contract.length) {
    L.push('\\section{Contract notes}')
    for (const c of r.contract) {
      L.push(`\\subsection*{${tex(c.title)}}`)
      if (c.inScope.length) L.push('\\begin{itemize}', ...c.inScope.map((l) => `  \\item ${tex(l)}`), '\\end{itemize}')
      if (c.outOfScope.length) L.push('\\emph{Out of scope}', '\\begin{itemize}', ...c.outOfScope.map((l) => `  \\item ${tex(l)}`), '\\end{itemize}')
    }
    L.push('')
  }
  L.push('\\section{Your design, cleaned up}', '% Render with: mmdc -i final.mmd -o final.pdf', '\\begin{verbatim}', r.finalMermaid, '\\end{verbatim}', '')
  L.push(`\\paragraph{Session} ${tex(statLine(r))}`, '', '\\end{document}')
  return L.join('\n')
}

/** Chat messages only, in order. Cheaper than narrate(): the chat pane re-renders on every board change. */
export function chatFeed(log: EventLog): { seq: number; who: 'you' | 'coach'; text: string }[] {
  const out: { seq: number; who: 'you' | 'coach'; text: string }[] = []
  for (const raw of log) {
    const e = raw as KnownEvent
    if (e.type === 'UserMessaged') out.push({ seq: e.seq, who: 'you', text: e.payload.text })
    else if (e.type === 'CoachResponded') out.push({ seq: e.seq, who: 'coach', text: e.payload.message })
  }
  return out
}
