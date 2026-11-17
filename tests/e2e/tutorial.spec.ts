import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  ;(page as any).__errors = errors
})
test.afterEach(async ({ page }) => { expect((page as any).__errors).toEqual([]) })

const act = (actions: unknown[], words: string) => `ACT ${Buffer.from(JSON.stringify(actions)).toString('base64')} ${words}`
const say = async (page: any, text: string) => { await page.fill('#chatInp', text); await page.press('#chatInp', 'Enter') }
const lastCoach = (page: any) => page.locator('#coach .msg.coach').last()

test('the Tutorial tab is first, and a practice round walks through every part of the tool', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 })
  await page.goto('/?problem=tutorial&coach=fake-act')
  await expect(page.locator('#seg [role=radio]').first()).toHaveText('Tutorial')
  await expect(page.locator('#coach')).toContainText('Step 1 of 7')
  await expect(page.locator('#coachStatusText')).toHaveText('Coach ready (local model)')

  await page.locator('#cnote-functional').click(); await page.keyboard.type('save a link')
  await page.locator('body').click({ position: { x: 5, y: 500 } })
  await expect(lastCoach(page)).toContainText('Step 2 of 7')
  await expect(lastCoach(page)).toContainText('writes it into your notes')

  // Chatting does the next two steps at once (a component and an arrow): the coach moves on to the first thing still undone.
  await say(page, act([{ kind: 'add_component', category: 'client', label: 'Phone' }, { kind: 'add_component', category: 'service', label: 'API' }, { kind: 'connect', from: 'Phone', to: 'API' }], 'add a Phone client and an API server and connect Phone to API'))
  await expect(page.locator('#coach')).toContainText('Step 5 of 7')
  await expect(page.locator('[data-node]')).toHaveCount(2)
  await expect(page.locator('#coach')).not.toContainText('Still on step') // one line, not a line plus a reminder

  await page.getByRole('button', { name: 'Add a floating note' }).click()
  await page.keyboard.type('remember this'); await page.keyboard.press('Enter')
  await expect(page.locator('#coach')).toContainText('Step 6 of 7')

  await page.locator('body').click({ position: { x: 5, y: 600 } })
  await page.keyboard.press('Control+z'); await page.keyboard.press('Meta+z')
  await expect(page.locator('#coach')).toContainText('Step 7 of 7') // undoing the note did not take step 5 back

  await page.click('#stuckBtn')
  await expect(lastCoach(page)).toContainText('That is the whole tool')
  await page.screenshot({ path: 'test-results/tutorial.png' })
})

test('chatting without progress gets a reminder of the current step, not silence or a rule hint', async ({ page }) => {
  await page.goto('/?problem=tutorial&coach=scripted')
  await say(page, 'hello')
  await expect(lastCoach(page)).toContainText('Still on step 1 of 7')
  await page.click('#stuckBtn')
  await expect(lastCoach(page)).toContainText('Still on step 1 of 7')
})

test('the tab bar still fits with five tabs, and automated browsers still open on the URL shortener by default', async ({ page }) => {
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 760 })
    await page.goto('/')
    await expect(page.locator('#seg [role=radio][aria-checked=true]')).toHaveText('URL shortener')
    const fin = await page.locator('#finishBtn').boundingBox()
    const seg = await page.locator('#seg').boundingBox()
    expect(Math.abs(fin!.y - seg!.y)).toBeLessThan(40) // Finish stays on the same row as the problem tabs
  }
})

test('axe finds nothing wrong on the tutorial, light and dark', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/?problem=tutorial&coach=scripted')
    await expect(page.locator('#coach')).toContainText('Step 1 of 7')
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  }
})
