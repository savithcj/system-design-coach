import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { add, connectByDrag } from './helpers'

const scan = async (page: Page, what: string) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), what).toEqual([])
}

async function populate(page: Page) {
  await page.goto('/')
  await page.locator('#cnote-functional').fill('shorten a link\nfollow a link\n---\naccounts'); await page.locator('#cnote-functional').blur()
  await add(page, 'client', 'Phone'); await add(page, 'server', 'API'); await add(page, 'database', 'Store')
  await connectByDrag(page, 'Phone', 'API')
  await page.click('#stuckBtn')
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${scheme} mode`, () => {
    test.use({ colorScheme: scheme })

    test('design view with notes, boxes, an arrow and a coach message', async ({ page }) => {
      await populate(page)
      await scan(page, 'design')
    })
    test('a selected box with its connect dots and the picker open', async ({ page }) => {
      await populate(page)
      await page.click('#addBtn')
      await scan(page, 'picker')
    })
    test('Details with the replay scrubber', async ({ page }) => {
      await populate(page)
      await page.click('#detailsBtn')
      await scan(page, 'details')
    })
    test('study guide', async ({ page }) => {
      await populate(page)
      await page.click('#finishBtn')
      await expect(page.locator('#mmRef svg')).toBeVisible()
      await scan(page, 'report')
    })
    test('narrow screen', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 800 })
      await populate(page)
      await scan(page, 'narrow')
    })
  })
}

test('reduced motion: nothing pulses or animates when asked not to', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/?coach=fake-good')
  await expect(page.locator('#coachStatusText')).toHaveText(/Loading coach/)
  const anim = await page.locator('#coachStatus .dot').evaluate((e) => getComputedStyle(e).animationName)
  expect(anim).toBe('none')
  const moving = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return s.animationName !== 'none' || parseFloat(s.transitionDuration) > 0.01 }).map((e) => e.tagName + '.' + e.className).slice(0, 5))
  expect(moving).toEqual([])
})

test('every control that does something can be reached and used by keyboard alone', async ({ page }) => {
  await page.goto('/')
  const reached = new Set<string>()
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const id = await page.evaluate(() => { const e = document.activeElement as HTMLElement; return e?.id || e?.getAttribute('data-id') || e?.getAttribute('data-stage') || e?.tagName || '' })
    reached.add(id)
  }
  for (const must of ['detailsBtn', 'finishBtn', 'addBtn', 'chatInp', 'stuckBtn', 'cnote-functional', 'splitter']) expect([...reached], must).toContain(must)
  // focus is always visible
  await page.locator('#stuckBtn').focus()
  const outline = await page.locator('#stuckBtn').evaluate((e) => { const s = getComputedStyle(e); return s.outlineStyle + ' ' + s.outlineWidth + ' ' + s.boxShadow })
  expect(outline).not.toMatch(/^none 0px none$/)
})
