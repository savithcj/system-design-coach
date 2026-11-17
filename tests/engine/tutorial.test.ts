import { describe, expect, it } from 'vitest'
import { STEPS, announcedStep, tutorialAnnounce, tutorialProgress, tutorialRemind } from '../../src/engine/tutorial'
import { Session, undo } from '../core/helpers'

const opts = { chatEdits: true }
const say = (s: Session, line: { message: string; ruleId: string } | null) => { if (line) s.add('CoachResponded', { kind: 'reply', message: line.message, ruleId: line.ruleId, move: 'tutorial' }, 'coach') }

describe('the practice round', () => {
  it('starts with step 1 and says each next step only once', () => {
    const s = new Session()
    const first = tutorialAnnounce(s.state, s.log, opts)!
    expect(first.message).toMatch(/^Step 1 of 7\. Welcome/)
    say(s, first)
    expect(tutorialAnnounce(s.state, s.log, opts)).toBeNull() // nothing new yet
    s.add('ContractNoteUpdated', { block: 'functional', text: '• save a link' })
    const second = tutorialAnnounce(s.state, s.log, opts)!
    expect(second.message).toMatch(/^Step 2 of 7\. Now try the chat/)
    say(s, second)
    expect(announcedStep(s.log)).toBe(1)
  })
  it('follows what is done, in any order, and waits for the first unfinished step', () => {
    const s = new Session()
    s.node('client', 'Phone'); s.node('service', 'API'); s.edge(s.state.nodes[0]!.id, s.state.nodes[1]!.id)
    expect(tutorialProgress(s.state, s.log)).toBe(0) // functional notes are still empty
    s.add('ContractNoteUpdated', { block: 'functional', text: '• save a link' })
    s.add('UserMessaged', { text: 'hi' })
    expect(tutorialProgress(s.state, s.log)).toBe(4) // component and arrow already done: next is the note
    expect(tutorialAnnounce(s.state, s.log, opts)!.message).toMatch(/^Step 5 of 7\. Press Note/)
  })
  it('finishes after the Stuck? step and never goes backwards when something is undone', () => {
    const s = new Session()
    s.add('ContractNoteUpdated', { block: 'functional', text: '• a' }); s.add('UserMessaged', { text: 'x' })
    s.node('client', 'A'); s.node('db', 'B'); s.edge(s.state.nodes[0]!.id, s.state.nodes[1]!.id)
    s.add('StickyAdded', { id: 's1', fx: 0.5, y: 0, text: 'note' })
    undo(s) // removes the note, but also counts as the undo step
    say(s, tutorialAnnounce(s.state, s.log, opts))
    s.add('HintRequested', { level: 1 }, 'coach')
    const end = tutorialAnnounce(s.state, s.log, opts)
    expect(end?.message).toMatch(/whole tool/)
  })
  it('a reminder names the current step and does not repeat the welcome', () => {
    const s = new Session()
    const r = tutorialRemind(s.state, s.log, opts).message
    expect(r).toMatch(/^Still on step 1 of 7\. Start with the notes/)
    expect(STEPS).toHaveLength(7)
  })
  it('only promises chat edits when the model that does them is ready', () => {
    const s = new Session(); s.add('ContractNoteUpdated', { block: 'functional', text: '• a' })
    expect(tutorialAnnounce(s.state, s.log, { chatEdits: false })!.message).toMatch(/answers in words/)
    expect(tutorialAnnounce(s.state, s.log, { chatEdits: true })!.message).toMatch(/writes it into your notes/)
  })
})
