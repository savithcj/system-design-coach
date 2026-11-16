import type { EventLog, KnownEvent } from './events'
import { boardMermaid } from './mermaid'
import { reduce } from './reduce'
import { nodeName } from './state'
import { roleLabel } from './roles'
import { escapeHtml as esc, texEscape as tex } from './text'
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
        case 'UserMessaged': item = { who: 'you', text: `"${e.payload.text}"`, raw: e.payload.text, chat: true }; break
        case 'CoachResponded': item = { who: 'coach', text: e.payload.message, chat: true }; break
        case 'SessionFinished': item = { who: 'sys', text: 'Session finished.' }; break
        default: break
      }
    }
    if (item) {
      if (item.who === 'you' && e.actor === 'coach') item.who = 'coach'
      out.push({ ...item, seq: e.seq, ts: e.ts })
    }
    before = reduce(log.slice(0, i + 1))
  })
  return out
}

export interface ReportModel {
  title: string
  prompt: string
  steps: Step[]
  /** Elapsed label per step, precomputed so renderers stay pure. */
  times: string[]
  finalMermaid: string
  stats: { events: number; replies: number; hints: number; duration: string }
}

export function buildReport(log: EventLog): ReportModel {
  const s = reduce(log)
  const P = problemById(s.problemId)
  const steps = narrate(log)
  const last = log[log.length - 1]
  return {
    title: P.title,
    prompt: P.prompt,
    steps,
    times: steps.map((st) => elapsed(log, st.ts)),
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

export function renderHtml(r: ReportModel): string {
  let h = `<h3>${esc(r.title)}: Study Guide</h3><div style="color:#555;font-size:13px">${statLine(r)}</div>`
  h += `<h2>Problem</h2><div>${esc(r.prompt)}</div><h2>How we got here</h2><ol>`
  r.steps.forEach((st, i) => { h += `<li><span style="color:#555;font-size:13px">${r.times[i]}</span> <b>${whoLabel(st.who)}:</b> ${esc(st.text)}</li>` })
  h += `</ol><h2>Your design, cleaned up</h2><div class="mm" id="mmFinal"></div><pre>${esc(r.finalMermaid)}</pre>`
  return `<div class="paper">${h}</div>`
}

export function renderLatex(r: ReportModel): string {
  const L: string[] = []
  L.push('\\documentclass[11pt]{article}', '\\usepackage[utf8]{inputenc}', '\\usepackage[T1]{fontenc}', '\\usepackage[margin=1in]{geometry}', '\\usepackage{enumitem}', '')
  L.push(`\\title{${tex(r.title)}: Study Guide}`, '\\date{\\today}', '\\begin{document}', '\\maketitle', '')
  L.push('\\section*{Problem}', tex(r.prompt), '')
  L.push('\\section{How we got here}', '\\begin{enumerate}[leftmargin=*]')
  r.steps.forEach((st, i) => L.push(`  \\item[\\textbf{${r.times[i]}}] \\textbf{${whoLabel(st.who)}:} ${tex(st.text)}`))
  L.push('\\end{enumerate}', '')
  L.push('\\section{Your design, cleaned up}', '% Render with: mmdc -i final.mmd -o final.pdf', '\\begin{verbatim}', r.finalMermaid, '\\end{verbatim}', '')
  L.push(`\\paragraph{Session} ${tex(statLine(r))}`, '', '\\end{document}')
  return L.join('\n')
}
