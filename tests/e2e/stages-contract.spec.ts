import { expect, test } from '@playwright/test'
import { add, events, node, state } from './helpers'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  ;(page as any).__errors = errors
})
test.afterEach(async ({ page }) => { expect((page as any).__errors).toEqual([]) })

const stage = (page: any, n: number) => page.locator(`#stages [data-stage="${n}"]`)
const head = (page: any, b: string) => page.locator(`#chead-${b}`)
const note = (page: any, b: string) => page.locator(`#cnote-${b}`)
/** A clock that only moves when the test says so, so elapsed times are exact. */
async function freezeClock(page: any) {
  const t0 = new Date('2026-03-01T10:00:00').getTime()
  await page.clock.install({ time: t0 })
  await page.clock.pauseAt(t0 + 1)
}

const noteEvents = async (page: any) => (await events(page)).filter((e) => e.type === 'ContractNoteUpdated')

test.describe('stage pill', () => {
  test('starts on stage 1 with only its blocks open and its zone tinted', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#stages [role=radio]')).toHaveCount(5)
    await expect(stage(page, 1)).toHaveAttribute('aria-checked', 'true')
    await expect(head(page, 'functional')).toHaveAttribute('aria-expanded', 'true')
    await expect(head(page, 'nonfunctional')).toHaveAttribute('aria-expanded', 'true')
    await expect(head(page, 'entities')).toHaveAttribute('aria-expanded', 'false')
    await expect(head(page, 'api')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.cblock.zone')).toHaveCount(3)
    await expect(page.locator('#boardCol')).not.toHaveClass(/zone/)
  })

  test('choosing a stage is an event, opens its blocks, moves the tint, and is announced; nothing is hidden', async ({ page }) => {
    await page.goto('/')
    await add(page, 'client', 'Web app')
    await stage(page, 3).click()
    await expect(stage(page, 3)).toHaveAttribute('aria-checked', 'true')
    await expect(head(page, 'api')).toHaveAttribute('aria-expanded', 'true')
    await expect(head(page, 'functional')).toHaveAttribute('aria-expanded', 'true') // left as the learner had it
    await expect(page.locator('.cblock.zone')).toHaveCount(1)
    await expect(page.locator('#sr')).toHaveText('Stage 3, API.')
    expect((await state(page)).stage).toBe(3)
    expect((await events(page)).filter((e) => e.type === 'StageChanged')).toHaveLength(1)
    await stage(page, 4).click()
    await expect(page.locator('#boardCol')).toHaveClass(/zone/)
    await expect(page.locator('.cblock.zone')).toHaveCount(0)
    await expect(node(page, 'Web app')).toBeVisible()
    await stage(page, 5).click()
    await note(page, 'functional').fill('still editable during deep dives'); await page.locator('body').click({ position: { x: 5, y: 400 } })
    expect((await state(page)).contract.functional).toMatch(/still editable during deep dives$/)
  })

  test('keyboard: arrows move focus only, Enter or Space chooses', async ({ page }) => {
    await page.goto('/')
    await stage(page, 1).focus()
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight')
    await expect(stage(page, 3)).toBeFocused()
    expect((await events(page)).filter((e) => e.type === 'StageChanged')).toHaveLength(0)
    await page.keyboard.press('Enter')
    await expect(stage(page, 3)).toHaveAttribute('aria-checked', 'true')
    await expect(stage(page, 3)).toBeFocused()
    await page.keyboard.press('End'); await page.keyboard.press('Space')
    await expect(stage(page, 5)).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('Home')
    await expect(stage(page, 1)).toBeFocused()
    // roving tabindex: exactly one stop in the group
    expect(await page.locator('#stages [role=radio][tabindex="0"]').count()).toBe(1)
  })

  test('shows a quiet clock on the current stage only, cumulative when a stage is revisited', async ({ page }) => {
    await freezeClock(page)
    await page.goto('/')
    await page.clock.runFor(65_000)
    await expect(stage(page, 1).locator('.stagetime')).toHaveText('1:05')
    await expect(page.locator('#stages .stagetime:visible')).toHaveCount(1)
    await stage(page, 2).click()
    await page.clock.runFor(30_000)
    await expect(stage(page, 2).locator('.stagetime')).toHaveText('0:30')
    await stage(page, 1).click()
    await page.clock.runFor(5_000)
    await expect(stage(page, 1).locator('.stagetime')).toHaveText('1:10')
    expect(await stage(page, 1).locator('.stagetime').getAttribute('aria-hidden')).toBe('true')
  })
})

test.describe('contract notes', () => {
  test('collapse and expand with the keyboard; a collapsed field is not focusable', async ({ page }) => {
    await page.goto('/')
    await head(page, 'entities').focus(); await page.keyboard.press('Enter')
    await expect(head(page, 'entities')).toHaveAttribute('aria-expanded', 'true')
    await expect(note(page, 'entities')).toBeVisible()
    await page.keyboard.press('Space')
    await expect(head(page, 'entities')).toHaveAttribute('aria-expanded', 'false')
    await expect(note(page, 'entities')).toBeHidden()
    await expect(head(page, 'entities')).toBeFocused()
  })

  test('typing saves one event after a pause, never re-renders the board, and never steals focus', async ({ page }) => {
    await page.goto('/')
    await add(page, 'database', 'Postgres')
    await page.evaluate(() => { (document.querySelector('[data-node]') as any).__mark = 'same element'; (document.getElementById('edgeLayer') as any); })
    await note(page, 'functional').click()
    const n0 = (await events(page)).length
    await page.keyboard.type('search events by name and date', { delay: 15 })
    expect((await noteEvents(page)).length).toBe(0) // still typing: nothing saved yet
    await page.waitForTimeout(700)
    expect((await noteEvents(page)).length).toBe(1)
    // The coach also records, a moment after the board is still, which rules started failing; those are not edits.
    expect((await events(page)).filter((e) => !e.type.startsWith('Rule')).length).toBe(n0 + 1)
    await expect(note(page, 'functional')).toBeFocused()
    expect(await page.evaluate(() => (document.querySelector('[data-node]') as any).__mark)).toBe('same element')
    await page.keyboard.type('\n--- \npayments'.replace(' ', ''))
    await page.waitForTimeout(700)
    expect((await state(page)).contract.functional).toBe('• search events by name and date\n• ---\n• payments')
    await expect(note(page, 'functional')).toBeFocused()
    expect(await page.evaluate(() => (document.querySelector('[data-node]') as any).__mark)).toBe('same element')
  })

  test('blur saves immediately, so leaving the field never loses text', async ({ page }) => {
    await page.goto('/')
    await note(page, 'nonfunctional').click(); await page.keyboard.type('p99 under 200 ms for search')
    await head(page, 'functional').focus() // blur right away, before the pause elapses
    expect((await state(page)).contract.nonfunctional).toBe('• p99 under 200 ms for search')
  })

  test('text belongs to its session, and is saved when switching problems mid-typing', async ({ page }) => {
    await page.goto('/')
    await note(page, 'functional').click(); await page.keyboard.type('shorten a url')
    await page.locator('#seg [data-id=rate]').click()
    await expect(note(page, 'functional')).toHaveValue('')
    await note(page, 'functional').click(); await page.keyboard.type('limit per client')
    await page.locator('#seg [data-id=url]').click()
    await expect(note(page, 'functional')).toHaveValue('• shorten a url')
    await page.locator('#seg [data-id=rate]').click()
    await expect(note(page, 'functional')).toHaveValue('• limit per client')
  })

  test('opening a problem on its own stage re-expands that stage\'s blocks; Start over clears the text', async ({ page }) => {
    await page.goto('/')
    await stage(page, 3).click()
    await note(page, 'api').fill('POST /urls'); await head(page, 'api').focus()
    await page.locator('#seg [data-id=feed]').click(); await page.locator('#seg [data-id=url]').click()
    await expect(stage(page, 3)).toHaveAttribute('aria-checked', 'true')
    await expect(head(page, 'api')).toHaveAttribute('aria-expanded', 'true')
    await expect(head(page, 'entities')).toHaveAttribute('aria-expanded', 'false')
    await page.click('#detailsBtn'); await page.click('#restart')
    await expect(note(page, 'api')).toHaveValue('')
    await expect(stage(page, 1)).toHaveAttribute('aria-checked', 'true')
  })

  test('board shortcuts and board undo stay out of the text fields', async ({ page }) => {
    await page.goto('/')
    await add(page, 'client', 'A')
    await note(page, 'functional').click()
    await page.keyboard.type('c n e'); await page.keyboard.press('Delete'); await page.keyboard.press('Backspace')
    await page.keyboard.press('ControlOrMeta+z')
    expect((await state(page)).nodes).toHaveLength(1)
    await expect(note(page, 'functional')).toBeFocused()
    await expect(page.locator('#noteInp')).toHaveCount(0)
  })

  test('each field has an accessible name and the group is labelled', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#contract')).toHaveAttribute('aria-label', 'Contract notes')
    await expect(note(page, 'api')).toHaveAttribute('aria-label', 'API and data flow')
    await expect(head(page, 'api')).toHaveAttribute('aria-controls', 'cbody-api')
  })
})

test.describe('layout', () => {
  test('board stays usable beside the notes and nothing overlaps them', async ({ page }) => {
    await page.goto('/')
    for (const [c, n] of [['client', 'A'], ['server', 'B'], ['database', 'C'], ['cache', 'D']] as const) await add(page, c, n)
    const contract = (await page.locator('#contract').boundingBox())!
    const col = (await page.locator('#boardCol').boundingBox())!
    expect(col.x).toBeGreaterThanOrEqual(contract.x + contract.width)
    for (const l of ['A', 'B', 'C', 'D']) { const b = (await node(page, l).boundingBox())!; expect(b.x).toBeGreaterThanOrEqual(col.x - 1); expect(b.x + b.width).toBeLessThanOrEqual(col.x + col.width + 1) }
  })

  test('on a narrow screen the notes stack above the board with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 })
    await page.goto('/')
    await add(page, 'client', 'A')
    const contract = (await page.locator('#contract').boundingBox())!, col = (await page.locator('#boardCol').boundingBox())!
    expect(col.y).toBeGreaterThanOrEqual(contract.y + contract.height - 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test('the report is organised by stage, with time against the targets and the contract notes', async ({ page }) => {
  await freezeClock(page)
  await page.goto('/')
  await note(page, 'functional').fill('search events\nbook a ticket\n---\npayments'); await head(page, 'functional').focus()
  await page.clock.runFor(120_000)
  await stage(page, 4).click()
  await add(page, 'database', 'Postgres')
  await page.clock.runFor(60_000)
  await page.click('#finishBtn')
  const body = page.locator('#reportBody')
  await expect(body.locator('table.pace tbody tr')).toHaveCount(5)
  await expect(body.locator('table.pace tbody tr').nth(0)).toContainText('2:00')
  await expect(body.locator('table.pace tbody tr').nth(3)).toContainText('1:00')
  await expect(body).toContainText('1. Requirements')
  await expect(body).toContainText('4. High-level design')
  await expect(body).toContainText('search events'); await expect(body).toContainText('Out of scope'); await expect(body).toContainText('payments')
  const tex = await page.locator('#texSrc').inputValue()
  expect(tex).toContain('\\section{Time per stage}'); expect(tex).toContain('\\emph{Out of scope}')
})

test('notes are bullets: focus starts one, Enter adds one, Backspace on an empty one ends it, an untouched box stores nothing', async ({ page }) => {
  await page.goto('/?coach=scripted')
  const ta = page.locator('#cnote-functional')
  await ta.focus()
  await expect(ta).toHaveValue('• ')
  await page.keyboard.type('shorten a URL')
  await page.keyboard.press('Enter')
  await expect(ta).toHaveValue('• shorten a URL\n• ')
  await page.keyboard.press('Backspace')
  await expect(ta).toHaveValue('• shorten a URL')
  await ta.blur()
  expect((await events(page)).filter((e) => e.type === 'ContractNoteUpdated').pop()!.payload.text).toBe('• shorten a URL')
  const other = page.locator('#cnote-nonfunctional')
  await other.focus(); await other.blur()
  expect((await events(page)).filter((e) => e.type === 'ContractNoteUpdated' && e.payload.block === 'nonfunctional')).toHaveLength(0)
  await page.screenshot({ path: 'test-results/bullets.png' })
})

test('there is a visible Out of scope box under Functional, and writing in it clears the coach flag', async ({ page }) => {
  await page.goto('/?coach=scripted')
  await expect(page.locator('.cblock').nth(1)).toContainText('Out of scope')
  await note(page, 'functional').click(); await page.keyboard.type('shorten a URL')
  await note(page, 'outofscope').click(); await page.keyboard.type('custom aliases')
  await page.locator('body').click({ position: { x: 600, y: 600 } })
  await page.waitForTimeout(1200)
  const ev = await events(page)
  expect(ev.some((e) => e.type === 'RuleFired' && e.payload.ruleId === 'REQ_NO_OUT_OF_SCOPE')).toBe(false)
  await page.screenshot({ path: 'test-results/outofscope.png' })
})
