import { expect, test } from '@playwright/test'
import { events } from './helpers'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  ;(page as any).__errors = errors
})
test.afterEach(async ({ page }) => { expect((page as any).__errors).toEqual([]) })

const status = (page: any) => page.locator('#coachStatusText')
const tooMany = async (page: any) => {
  await page.locator('#cnote-functional').fill('a\nb\nc\nd\ne\n---\nx')
  await page.locator('#cnote-functional').blur()
}
const coach = async (page: any) => (await events(page)).filter((e) => e.type === 'CoachResponded' && e.payload.kind !== 'opening')

test('by default the scripted coach is shown and used', async ({ page }) => {
  await page.goto('/')
  await expect(status(page)).toHaveText('Coach ready (scripted)')
  await expect(page.locator('#coachStatus')).toHaveAttribute('data-dot', 'ready')
})

test('a local model loads in the background, with progress, and then rewords the selected move', async ({ page }) => {
  await page.goto('/?coach=fake-good')
  await expect(status(page)).toHaveText(/Loading coach \d+%/)
  await expect(page.locator('#coachStatus')).toHaveAttribute('data-dot', 'loading')
  await expect(status(page)).toHaveText('Coach ready (local model)')
  await tooMany(page)
  await page.click('#stuckBtn')
  await expect.poll(async () => (await coach(page)).length).toBe(1)
  const [reply] = await coach(page)
  expect(reply!.payload.by).toBe('fake-good')
  expect(reply!.payload.message).toMatch(/drop first/)
  expect(reply!.payload.ruleId).toBe('REQ_TOO_MANY_FEATURES') // the move was chosen by code, not by the model
})

test('a model that invents a component is rejected: the learner sees the scripted line and the log says why', async ({ page }) => {
  await page.goto('/?coach=fake-ghost')
  await expect(status(page)).toHaveText('Coach ready (local model)')
  await tooMany(page)
  await page.click('#stuckBtn')
  await expect.poll(async () => (await coach(page)).length).toBe(1)
  const ev = await events(page)
  expect(ev.filter((e) => e.type === 'CoachReplyRejected').map((e) => e.payload.reason)).toEqual(['ghost:kafka', 'ghost:kafka'])
  const [reply] = await coach(page)
  expect(reply!.payload.by).toBeUndefined()
  await expect(page.locator('#coach .msg.coach').last()).not.toContainText('Kafka')
  await expect(page.locator('#coach .msg.coach').last()).toContainText('drop first')
})

test('a model that leaks a held-back term is rejected the same way', async ({ page }) => {
  await page.goto('/?coach=fake-spoiler')
  await expect(status(page)).toHaveText('Coach ready (local model)')
  await page.click('#seg [data-id=ticketmaster]') // the problem that holds those terms back until stage 5
  await tooMany(page)
  await page.click('#stuckBtn')
  await expect.poll(async () => (await coach(page)).length).toBe(1)
  expect((await events(page)).filter((e) => e.type === 'CoachReplyRejected').every((e) => /spoiler:waiting queue/.test(e.payload.reason))).toBe(true)
  await expect(page.locator('#coach .msg.coach').last()).not.toContainText('waiting queue')
})

test('a model that never answers: the coach says "thinking", then carries on scripted, and extra presses do not pile up', async ({ page }) => {
  await page.goto('/?coach=fake-hang&coachTimeout=600')
  await expect(status(page)).toHaveText('Coach ready (local model)')
  await tooMany(page)
  await page.click('#stuckBtn')
  await expect(status(page)).toHaveText('Coach is thinking…')
  await page.click('#stuckBtn'); await page.click('#stuckBtn') // ignored while it is writing
  await expect.poll(async () => (await coach(page)).length, { timeout: 4000 }).toBe(1)
  await expect(status(page)).toHaveText('Coach ready (local model)')
  expect((await events(page)).filter((e) => e.type === 'CoachReplyRejected').map((e) => e.payload.reason)).toEqual(['model:timeout'])
})

test('a model that fails to load leaves the scripted coach running and says so once', async ({ page }) => {
  await page.goto('/?coach=local&model=not-a-real-model')
  await expect(status(page)).toHaveText('Coach ready (scripted). Local model unavailable.')
  await expect(page.locator('#coachStatus')).toHaveAttribute('data-dot', 'warn')
  await tooMany(page)
  await page.click('#stuckBtn')
  await expect(page.locator('#coach .msg.coach').last()).toContainText('drop first')
})

test('?coach=scripted never loads anything', async ({ page }) => {
  await page.goto('/?coach=scripted')
  await expect(status(page)).toHaveText('Coach ready (scripted)')
})
