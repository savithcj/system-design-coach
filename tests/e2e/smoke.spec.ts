import { expect, test } from '@playwright/test'

test('app loads in real Chrome', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto('/')
  await expect(page.locator('#app')).toHaveText('System Design Coach')
  expect(errors).toEqual([])
})
