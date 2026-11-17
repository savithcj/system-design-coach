import { expect, test } from '@playwright/test'

const run = async (page: any, q: string) => {
  await page.goto(`/evals.html${q}`)
  await expect(page.locator('body')).toHaveAttribute('data-done', /pass|fail|error/, { timeout: 60000 })
  return page.evaluate(() => (window as any).__evalSummary)
}

test('the in-browser eval page scores a model and shows the release-gate verdict', async ({ page }) => {
  const good = await run(page, '?coach=fake-good')
  expect(good).toMatchObject({ gate: true, rawSpoilerRate: 0, rawGhostRate: 0, shownBadRate: 0 })
  await expect(page.locator('#status')).toContainText('meets the release gates')
})

test('a model that invents components fails the gate on the page, yet nothing bad would be shown', async ({ page }) => {
  const bad = await run(page, '?coach=fake-ghost')
  expect(bad.gate).toBe(false)
  expect(bad.rawGhostRate).toBe(100)
  expect(bad.shownBadRate).toBe(0)
  await expect(page.locator('#status')).toContainText('does NOT meet')
})

test('a model that cannot load is reported, not hidden', async ({ page }) => {
  await page.goto('/evals.html?coach=local&model=not-a-real-model')
  await expect(page.locator('body')).toHaveAttribute('data-done', 'error', { timeout: 30000 })
  await expect(page.locator('#status')).toContainText('Could not load')
})
