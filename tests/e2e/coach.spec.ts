import { expect, test } from '@playwright/test'
import { reduce } from '../../src/core/reduce'
import { checkReply } from '../../src/engine/grounding'
import { problemById } from '../../src/problems'
import { add, connectByDrag, events, state } from './helpers'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  ;(page as any).__errors = errors
})
test.afterEach(async ({ page }) => { expect((page as any).__errors).toEqual([]) })

const coachMsgs = (page: any) => page.locator('#coach .msg.coach')
const note = (page: any, b: string) => page.locator(`#cnote-${b}`)
const stage = (page: any, n: number) => page.locator(`#stages [data-stage="${n}"]`)
const last = async (page: any) => (await coachMsgs(page).last().innerText()).replace(/^Coach:\s*/, '')

async function typeNote(page: any, block: string, text: string) {
  await note(page, block).fill(text)
  await note(page, block).blur()
}

test.describe('Stuck?', () => {
  test('levels 1, 2, a confirmation, then level 3 - by keyboard only', async ({ page }) => {
    await page.goto('/')
    await typeNote(page, 'functional', 'shorten a link\nfollow a link\ncustom aliases\nlink expiry\nclick analytics\nuser accounts\n---\nbilling')
    await page.locator('#chatInp').focus()
    await page.keyboard.press('Tab') // from the message field to Stuck?
    await expect(page.locator('#stuckBtn')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => last(page)).toMatch(/drop first/)
    await page.keyboard.press('Enter')
    await expect.poll(() => last(page)).toMatch(/Look at the later items/)
    await page.keyboard.press('Enter')
    await expect.poll(() => last(page)).toMatch(/Press Stuck\? again/)
    await page.keyboard.press('Enter')
    await expect.poll(() => last(page)).toMatch(/Pick the few features/)
    await expect(page.locator('#stuckBtn')).toBeFocused() // focus stays on the control
    const types = (await events(page)).filter((e) => e.type === 'HintRequested').map((e) => e.payload.level)
    expect(types).toEqual([1, 2, 3]) // the confirmation question gave nothing away, so it is not a hint
  })

  test('a coach message goes to the live log, which is a polite log region', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#coach')).toHaveAttribute('role', 'log')
    await expect(page.locator('#coach')).toHaveAttribute('aria-live', 'polite')
    await page.click('#stuckBtn')
    await expect(coachMsgs(page)).toHaveCount(2)
  })

  test('with an empty board in stage 4 it asks the problem\'s first question; it never edits the board', async ({ page }) => {
    await page.goto('/')
    await stage(page, 4).click()
    await page.click('#stuckBtn')
    await expect.poll(() => last(page)).toBe('Every design starts with who uses the system.')
    expect((await state(page)).nodes).toHaveLength(0)
  })
})

test('chat is "ask the coach": any text gets the coach\'s current best question, and is not parsed', async ({ page }) => {
  await page.goto('/')
  await typeNote(page, 'nonfunctional', 'low latency\nscalable')
  await page.fill('#chatInp', 'add a cache please and delete everything')
  await page.keyboard.press('Enter')
  await expect.poll(() => last(page)).toMatch(/test|which request|number/i)
  expect((await state(page)).nodes).toHaveLength(0) // the words did nothing to the board
})

test('moving on with an open problem makes the coach raise it; a clean stage is affirmed once', async ({ page }) => {
  await page.goto('/')
  await typeNote(page, 'functional', 'shorten a link\nfollow a link\n---\naccounts')
  await typeNote(page, 'nonfunctional', 'redirect under 100 ms for most requests')
  await stage(page, 2).click()
  await expect.poll(() => last(page)).toMatch(/clear scope/)
  await stage(page, 1).click(); await stage(page, 2).click()
  await expect(coachMsgs(page)).toHaveCount(2) // opening + one affirmation, never twice
  await typeNote(page, 'entities', 'Link\nClick: code varchar(8)')
  await stage(page, 3).click()
  await expect.poll(() => last(page)).toMatch(/what can wait/)
})

test('rule changes are recorded once each, a moment after the board settles, and never break undo grouping', async ({ page }) => {
  await page.goto('/')
  await typeNote(page, 'functional', 'a\nb\nc\nd\ne\n---\nx')
  await expect.poll(async () => (await events(page)).filter((e) => e.type === 'RuleFired').map((e) => e.payload.ruleId)).toEqual(['REQ_TOO_MANY_FEATURES'])
  await typeNote(page, 'functional', 'a\nb\n---\nx')
  await expect.poll(async () => (await events(page)).filter((e) => e.type === 'RuleResolved').map((e) => e.payload.ruleId)).toEqual(['REQ_TOO_MANY_FEATURES'])
  // A box and its name are one undo step even though rule events may land between them.
  await page.click('#addBtn'); await page.fill('#pickInp', 'cache'); await page.keyboard.press('Enter')
  await page.waitForTimeout(900)
  await page.keyboard.type('Redis'); await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+z')
  expect((await state(page)).nodes).toHaveLength(0)
})

test('finishing records which issues were still open', async ({ page }) => {
  await page.goto('/')
  await typeNote(page, 'functional', 'a\nb\nc\nd\ne\n---\nx')
  await page.click('#finishBtn') // straight away, before the pause
  const ev = await events(page)
  const fired = ev.findIndex((e) => e.type === 'RuleFired'), fin = ev.findIndex((e) => e.type === 'SessionFinished')
  expect(fired).toBeGreaterThan(-1)
  expect(fired).toBeLessThan(fin)
})

test('the coach level lives in Details and is an event', async ({ page }) => {
  await page.goto('/')
  await page.click('#detailsBtn')
  await expect(page.locator('#levelSel')).toHaveValue('mid')
  await page.selectOption('#levelSel', 'senior')
  expect((await state(page)).level).toBe('senior')
  expect((await events(page)).some((e) => e.type === 'LevelSet' && e.payload.level === 'senior')).toBe(true)
})

// A whole session on every problem with no model: contract by stage, a board, many "Stuck?" presses and chat.
// Every coach line is checked against the problem's held-back terms for the stage it was about, and for invented components.
const SESSIONS: Record<string, { func: string; nfr: string; ent: string; api: string; boxes: [string, string][]; links: [string, string][] }> = {
  url: { func: 'shorten a link\nfollow a link\n---\naccounts', nfr: 'redirect under 100 ms for most requests', ent: 'Link\nClick', api: 'POST /links (shorten a link)\nGET /{code} (follow a link)',
    boxes: [['client', 'Phone'], ['server', 'API'], ['database', 'Store']], links: [['Phone', 'API'], ['API', 'Store']] },
  rate: { func: 'limit each client per minute\nreject with 429\n---\nbilling', nfr: 'added latency under 5 ms', ent: 'Client\nTier\nLimit', api: 'GET /anything (limited call)',
    boxes: [['client', 'Partner'], ['server', 'Limiter'], ['cache', 'Counters']], links: [['Partner', 'Limiter'], ['Limiter', 'Counters']] },
  feed: { func: 'post\nfollow\nread feed\n---\nads', nfr: 'feed loads in under 300 ms', ent: 'User\nPost\nFollow', api: 'POST /posts (post)\nPOST /follow (follow)\nGET /feed (read feed)',
    boxes: [['client', 'App'], ['server', 'API'], ['database', 'Posts'], ['storage', 'Images']], links: [['App', 'API'], ['API', 'Posts'], ['API', 'Images']] },
  ticketmaster: { func: 'search events\nview an event\nbook a ticket\n---\npayments', nfr: 'strong consistency for booking\nhigh availability for search', ent: 'Event\nTicket\nBooking',
    api: 'GET /events?term= (search events)\nGET /events/{id} (view an event)\nPOST /bookings (book a ticket)',
    boxes: [['client', 'Web app'], ['server', 'Gateway'], ['server', 'Booking'], ['database', 'Postgres']], links: [['Web app', 'Gateway'], ['Gateway', 'Booking'], ['Booking', 'Postgres']] },
}

for (const [id, s] of Object.entries(SESSIONS)) {
  test(`a full scripted session on "${id}": every coach line is grounded and nothing is spoiled early`, async ({ page }) => {
    await page.goto('/')
    await page.click(`#seg [data-id=${id}]`)
    const stuck = async (n: number) => { for (let i = 0; i < n; i++) { await page.click('#stuckBtn'); await page.waitForTimeout(30) } }
    const chat = async (t: string) => { await page.fill('#chatInp', t); await page.keyboard.press('Enter') }

    await typeNote(page, 'functional', s.func); await typeNote(page, 'nonfunctional', s.nfr); await stuck(2); await chat('what should I think about?')
    await stage(page, 2).click(); await typeNote(page, 'entities', s.ent); await stuck(1)
    await stage(page, 3).click(); await typeNote(page, 'api', s.api); await stuck(2)
    await stage(page, 4).click(); await stuck(1)
    for (const [cat, name] of s.boxes) await add(page, cat, name)
    for (const [a, b] of s.links) await connectByDrag(page, a, b)
    await stuck(4); await chat('is this good?')
    await stage(page, 5).click(); await stuck(5); await chat('what next?')
    await page.click('#finishBtn')

    const log = await events(page)
    const problem = problemById(id)
    const replies = log.filter((e: any) => e.type === 'CoachResponded' && e.payload.kind !== 'opening') as any[]
    expect(replies.length).toBeGreaterThan(8)
    for (const e of replies) {
      const upTo = (log as any[]).filter((x) => x.seq <= e.seq)
      const g = checkReply({ message: e.payload.message, state: reduce(upTo), problem, stage: e.payload.stage ?? 1, allowRuleSpoilers: true, maxChars: 600 })
      expect(g.reasons, `${id}: "${e.payload.message}"`).toEqual([])
    }
    // The learner asked for level 3 only after confirming; it never arrives unasked.
    for (const e of replies) if (e.payload.level === 3) expect(['hint'].includes(e.payload.kind), 'level 3 only as a confirmed hint').toBe(true)
  })
}
