import { expect, test } from '@playwright/test'
import { events, state } from './helpers'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  ;(page as any).__errors = errors
})
test.afterEach(async ({ page }) => { expect((page as any).__errors).toEqual([]) })

const act = (actions: unknown[], words: string) => `ACT ${Buffer.from(JSON.stringify(actions)).toString('base64')} ${words}`
const say = async (page: any, text: string) => { await page.fill('#chatInp', text); await page.press('#chatInp', 'Enter') }
const ready = async (page: any) => { await page.goto('/?coach=fake-act'); await expect(page.locator('#coachStatusText')).toHaveText('Coach ready (local model)') }

test('a chat message can write into the notes box; the coach says what it did; one undo removes it', async ({ page }) => {
  await ready(page)
  await say(page, act([{ kind: 'write', block: 'functional', bullets: ['shorten a url'] }], 'shorten a url'))
  await expect(page.locator('#cnote-functional')).toHaveValue('• shorten a url')
  await expect(page.locator('#coach')).toContainText('Added “shorten a url” under Functional.')
  await expect(page.locator('#coach')).toContainText('Ctrl+Z on the board undoes this.')
  const ev = await events(page)
  expect(ev.find((e) => e.type === 'ContractNoteUpdated')).toMatchObject({ actor: 'coach', payload: { via: expect.stringMatching(/^chat:/) } })
  await page.locator('body').click({ position: { x: 5, y: 500 } })
  await page.keyboard.press('Control+z'); await page.keyboard.press('Meta+z')
  await expect(page.locator('#cnote-functional')).toHaveValue('')
})

test('chat can add components and connect them; one undo reverts the whole message', async ({ page }) => {
  await ready(page)
  await say(page, act([{ kind: 'add_component', category: 'client', label: 'Web app' }, { kind: 'add_component', category: 'cache', label: 'Redis' }, { kind: 'connect', from: 'Web app', to: 'Redis' }], 'add a Web app and Redis cache and connect Web app to Redis'))
  await expect(page.locator('[data-node]')).toHaveCount(2)
  expect((await state(page)).edges).toHaveLength(1)
  await page.locator('body').click({ position: { x: 5, y: 500 } })
  await page.keyboard.press('Control+z'); await page.keyboard.press('Meta+z')
  await expect(page.locator('[data-node]')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/chat-edit.png' })
})

test('nothing is applied when the model invents content or the message is filler', async ({ page }) => {
  await ready(page)
  await say(page, act([{ kind: 'write', block: 'functional', bullets: ['click analytics'] }], 'hello there'))
  await say(page, act([{ kind: 'write', block: 'functional', bullets: ['idk'] }], 'idk'))
  await expect(page.locator('#coach')).not.toContainText('Added')
  await expect(page.locator('#cnote-functional')).toHaveValue('')
  expect((await events(page)).filter((e) => e.type === 'ContractNoteUpdated')).toHaveLength(0)
})
