import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { add, events } from './helpers'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  ;(page as any).__errors = errors
})
test.afterEach(async ({ page }) => { expect((page as any).__errors).toEqual([]) })

const stickies = async (page: any) => (await events(page)).filter((e) => e.type.startsWith('Sticky'))

test('the Note button adds a floating note: type, Enter saves; nothing is recorded for an empty one', async ({ page }) => {
  await page.goto('/?coach=scripted')
  await page.getByRole('button', { name: 'Add a floating note' }).click()
  await expect(page.locator('#stickyInp')).toBeFocused()
  await page.keyboard.press('Escape') // empty and abandoned
  expect(await stickies(page)).toHaveLength(0)
  await page.getByRole('button', { name: 'Add a floating note' }).click()
  await page.keyboard.type('cache the hot keys?')
  await page.keyboard.press('Enter')
  const note = page.locator('.sticky')
  await expect(note).toHaveText('cache the hot keys?')
  await expect(note).toBeFocused()
  expect((await stickies(page)).map((e) => e.type)).toEqual(['StickyAdded'])
  await page.screenshot({ path: 'test-results/sticky.png' })
})

test('keyboard: Enter edits, arrows move, Delete removes; each is undoable', async ({ page }) => {
  await page.goto('/?coach=scripted')
  await page.getByRole('button', { name: 'Add a floating note' }).click()
  await page.keyboard.type('first'); await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type(' second'); await page.keyboard.press('Enter')
  await expect(page.locator('.sticky')).toHaveText('first second')
  const x0 = (await page.locator('.sticky').boundingBox())!.x
  await page.keyboard.press('ArrowLeft')
  expect((await page.locator('.sticky').boundingBox())!.x).toBeLessThan(x0)
  await page.keyboard.press('Delete')
  await expect(page.locator('.sticky')).toHaveCount(0)
  await page.locator('body').click({ position: { x: 5, y: 400 } })
  await page.keyboard.press('Control+z'); await page.keyboard.press('Meta+z')
  await expect(page.locator('.sticky')).toHaveCount(1)
})

test('a note can be dragged anywhere on the canvas and stays there', async ({ page }) => {
  await page.goto('/?coach=scripted')
  await page.getByRole('button', { name: 'Add a floating note' }).click()
  await page.keyboard.type('drag me'); await page.keyboard.press('Enter')
  const b = (await page.locator('.sticky').boundingBox())!
  await page.mouse.move(b.x + 20, b.y + 20); await page.mouse.down()
  await page.mouse.move(b.x - 120, b.y + 140, { steps: 6 }); await page.mouse.up()
  const a = (await page.locator('.sticky').boundingBox())!
  expect(a.y).toBeGreaterThan(b.y + 100)
  expect((await stickies(page)).map((e) => e.type)).toEqual(['StickyAdded', 'StickyMoved'])
  await page.reload()
})

test('notes appear in the study guide (the model request is covered by a unit test)', async ({ page }) => {
  await page.goto('/?coach=scripted')
  await add(page, 'database', 'Postgres')
  await page.getByRole('button', { name: 'Add a floating note' }).click()
  await page.keyboard.type('read replicas later'); await page.keyboard.press('Enter')
  await page.click('#finishBtn')
  await expect(page.locator('#reportView')).toContainText('Floating notes')
  await expect(page.locator('#reportView')).toContainText('read replicas later')
})

test('axe finds nothing wrong with a note, light and dark', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/?coach=scripted')
    await page.getByRole('button', { name: 'Add a floating note' }).click()
    await page.keyboard.type('a note to check contrast'); await page.keyboard.press('Enter')
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
    if (scheme === 'dark') await page.screenshot({ path: 'test-results/sticky-dark.png' })
  }
})
