import { expect, test } from '@playwright/test'
import { add, connectByDrag, events } from './helpers'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  ;(page as any).__errors = errors
})
test.afterEach(async ({ page }) => { expect((page as any).__errors).toEqual([]) })

const boxes = (page: any, root: string) => page.locator(`${root} .rboard svg g[transform]`)
const arrows = (page: any, root: string) => page.locator(`${root} .rboard svg path[marker-end]`)

async function build(page: any) {
  await page.goto('/')
  await add(page, 'client', 'Phone'); await add(page, 'server', 'API'); await add(page, 'database', 'Store')
  await connectByDrag(page, 'Phone', 'API'); await connectByDrag(page, 'API', 'Store')
}

test('the replay slider in Details steps through the session by keyboard, read-only', async ({ page }) => {
  await build(page)
  const before = (await events(page)).length
  await page.click('#detailsBtn')
  const slider = page.locator('#replayDetails input[type=range]')
  await expect(slider).toBeVisible()
  const max = Number(await slider.getAttribute('max'))
  expect(max).toBeGreaterThan(6)
  await expect(boxes(page, '#replayDetails')).toHaveCount(3) // starts at the end: the finished board
  await expect(arrows(page, '#replayDetails')).toHaveCount(2)
  await slider.focus()
  await page.keyboard.press('Home')
  await expect(boxes(page, '#replayDetails')).toHaveCount(0)
  await expect(page.locator('#replayDetails .rcap')).toContainText('Start')
  await page.keyboard.press('ArrowRight') // step 1 is the coach's opening line: still an empty board
  await expect(boxes(page, '#replayDetails')).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await expect(boxes(page, '#replayDetails')).toHaveCount(1)
  await expect(page.locator('#replayDetails .rcap')).toContainText('Step 2 of')
  await expect(slider).toHaveAttribute('aria-valuetext', /Step 2 of \d+: Added "Client"/)
  await page.keyboard.press('End')
  await expect(arrows(page, '#replayDetails')).toHaveCount(2)
  expect((await events(page)).filter((e) => e.type !== 'RuleFired' && e.type !== 'RuleResolved').length).toBe(before) // nothing appended
})

test('the same scrubber sits in the study guide and follows the board as it changes', async ({ page }) => {
  await build(page)
  await page.click('#detailsBtn')
  await expect(boxes(page, '#replayDetails')).toHaveCount(3)
  await page.click('#detClose')
  await add(page, 'cache', 'Redis') // the scrubber was at the end, so it follows the live board
  await page.click('#detailsBtn')
  await expect(boxes(page, '#replayDetails')).toHaveCount(4)
  await page.click('#detClose')
  await page.click('#finishBtn')
  const slider = page.locator('#replayReport input[type=range]')
  await expect(boxes(page, '#replayReport')).toHaveCount(4)
  await slider.focus(); await page.keyboard.press('Home')
  await expect(boxes(page, '#replayReport')).toHaveCount(0)
  await expect(page.locator('#replayReport label')).toHaveText('Replay')
})

test('replay respects dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await build(page)
  await page.click('#detailsBtn')
  await expect(page.locator('#replayDetails .rboard')).toBeVisible()
  const bg = await page.locator('#replayDetails .rboard').evaluate((e) => getComputedStyle(e).backgroundColor)
  expect(bg).not.toBe('rgb(255, 255, 255)')
})
