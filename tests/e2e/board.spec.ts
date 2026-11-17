import { expect, test } from '@playwright/test'
import { add, box, clickEdge, clickEmptyBoard, connectByDrag, events, node, state } from './helpers'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  ;(page as any).__errors = errors
  await page.goto('/')
})
test.afterEach(async ({ page }) => { expect((page as any).__errors).toEqual([]) })

test('connecting must not move boxes; arrows must stay inside the canvas', async ({ page }) => {
  for (const [c, n] of [['client', 'Browser'], ['server', 'API'], ['database', 'DB'], ['cache', 'Cache'], ['queue', 'Kafka']] as const) await add(page, c, n)
  await page.mouse.click(900, 680)
  const positions = () => page.evaluate(() => Array.from(document.querySelectorAll('[data-node]')).map((b) => `${Math.round(b.getBoundingClientRect().x)},${Math.round(b.getBoundingClientRect().y)}`))
  const start = await positions()
  for (const [a, b] of [['Browser', 'API'], ['API', 'DB'], ['API', 'Cache'], ['Cache', 'Kafka'], ['Kafka', 'DB']]) await connectByDrag(page, a!, b!)
  expect(await positions()).toEqual(start)
  expect((await state(page)).edges).toHaveLength(5)
  const outside = await page.evaluate(() => Array.from(document.querySelectorAll<SVGGraphicsElement>('#edgeSvg path[data-edge]')).some((p) => { const b = p.getBBox(); return b.x < -2 || b.y < -2 }))
  expect(outside).toBe(false)
})

test('picker lists seven categories, filters, and adds a box with its name ready to type', async ({ page }) => {
  await page.click('#addBtn')
  await expect(page.locator('#pickList [role=option]')).toHaveCount(7)
  await page.fill('#pickInp', 'dat')
  await expect(page.locator('#pickList [role=option]')).toHaveCount(1)
  await page.fill('#pickInp', '')
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter')
  const inp = page.locator('#nameInp')
  await expect(inp).toBeFocused()
  expect(await inp.evaluate((e: HTMLInputElement) => [e.selectionStart, e.selectionEnd, e.value])).toEqual([0, 5, 'Cache'])
  await page.keyboard.type('Redis'); await page.keyboard.press('Enter')
  expect((await state(page)).nodes.map((n: any) => [n.role, n.label])).toEqual([['cache', 'Redis']])
  await expect(node(page, 'Redis')).toBeFocused()
})

test('Escape keeps the default name, the third server is numbered by category count, Escape closes the picker', async ({ page }) => {
  await page.click('#addBtn'); await page.fill('#pickInp', 'server'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape')
  await add(page, 'server', 'API')
  await page.click('#addBtn'); await page.fill('#pickInp', 'server'); await page.keyboard.press('Enter'); await page.keyboard.press('Escape')
  expect((await state(page)).nodes.map((n: any) => n.label)).toEqual(['Server', 'API', 'Server 3'])
  await page.click('#addBtn'); await page.keyboard.press('Escape')
  await expect(page.locator('#picker')).toBeHidden()
  await expect(page.locator('#addBtn')).toBeFocused()
})

test('rename by double-click, F2 and Enter; blur saves; the field edits the box it opened on', async ({ page }) => {
  await add(page, 'client', 'A'); await add(page, 'server', 'B')
  await node(page, 'A').dblclick()
  await expect(page.locator('#nameInp')).toBeVisible()
  await page.keyboard.type('Mobile app'); await page.keyboard.press('Enter')
  await node(page, 'B').focus(); await page.keyboard.press('F2')
  await page.keyboard.type('Nginx'); await page.keyboard.press('Enter')
  await node(page, 'Nginx').focus(); await page.keyboard.press('Enter')
  await page.keyboard.type('Envoy')
  await page.mouse.click(900, 680) // blur saves
  expect((await state(page)).nodes.map((n: any) => n.label)).toEqual(['Mobile app', 'Envoy'])
})

test('dots show on hover only, never merely because a box is selected', async ({ page }) => {
  await add(page, 'client', 'A')
  const id = await node(page, 'A').getAttribute('data-node')
  const dot = page.locator(`.handle[data-for="${id}"][data-port="r"]`)
  await page.mouse.click(900, 680)
  await expect(dot).toHaveCSS('opacity', '0')
  await node(page, 'A').click()
  await page.mouse.move(900, 680)
  await expect(dot).toHaveCSS('opacity', '0')
  const b = await box(page, 'A')
  await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2)
  await expect(dot).toHaveCSS('opacity', '1')
})

test('click a dot, then a box to connect; C does the same from the keyboard and toggles the arrow off', async ({ page }) => {
  await add(page, 'client', 'A'); await add(page, 'server', 'B')
  const a = await box(page, 'A')
  await page.mouse.move(a.x + a.w / 2, a.y + a.h / 2)
  const id = await node(page, 'A').getAttribute('data-node')
  await page.locator(`.handle[data-for="${id}"][data-port="r"]`).click()
  await node(page, 'B').click()
  expect((await state(page)).edges).toHaveLength(1)
  await node(page, 'A').focus(); await page.keyboard.press('c'); await node(page, 'B').click()
  expect((await state(page)).edges).toHaveLength(0) // same pair again removes the arrow
  await node(page, 'A').focus(); await page.keyboard.press('c'); await node(page, 'B').click()
  expect((await state(page)).edges).toHaveLength(1)
  await node(page, 'B').focus(); await page.keyboard.press('c'); await node(page, 'A').click()
  expect((await state(page)).edges).toHaveLength(2) // the reverse direction is a different pair
})

test('select an arrow and delete it; delete a box; click empty canvas deselects', async ({ page }) => {
  await add(page, 'client', 'A'); await add(page, 'server', 'B')
  await connectByDrag(page, 'A', 'B')
  await clickEdge(page)
  await page.keyboard.press('Delete')
  expect((await state(page)).edges).toHaveLength(0)
  await node(page, 'A').click()
  await expect(node(page, 'A')).toHaveAttribute('aria-pressed', 'true')
  await clickEmptyBoard(page)
  await expect(node(page, 'A')).toHaveAttribute('aria-pressed', 'false')
  await node(page, 'A').focus(); await page.keyboard.press('Delete')
  expect((await state(page)).nodes).toHaveLength(1)
})

test('copy and paste a box with the keyboard', async ({ page }) => {
  await add(page, 'database', 'Postgres')
  // After naming, the box is still selected and focused: Ctrl+C then Ctrl+V works with no click.
  await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v')
  await expect(node(page, 'Postgres copy')).toBeFocused()
  await page.keyboard.press('Control+v')
  expect((await state(page)).nodes.map((n: any) => n.label)).toEqual(['Postgres', 'Postgres copy', 'Postgres copy 2'])
  expect((await state(page)).edges).toHaveLength(0)
})

test('Ctrl+C on a focused box copies instead of starting a connection', async ({ page }) => {
  await add(page, 'client', 'A')
  await node(page, 'A').focus()
  await page.keyboard.press('Control+c')
  await expect(node(page, 'A')).not.toHaveClass(/target/)
  await expect(page.locator('#sr')).toHaveText('Copied A.')
})

test('arrow keys move a box, Shift moves further, bursts coalesce into one event', async ({ page }) => {
  await add(page, 'client', 'A')
  await node(page, 'A').focus()
  const before = await box(page, 'A'); const n0 = (await events(page)).length
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  const mid = await box(page, 'A')
  expect(Math.round(mid.x - before.x)).toBe(48)
  await page.keyboard.press('Shift+ArrowDown')
  expect(Math.round((await box(page, 'A')).y - before.y)).toBe(48)
  expect((await events(page)).length).toBe(n0 + 1)
  await expect(node(page, 'A')).toBeFocused()
})

test('dragging moves a box and its dots; a tiny movement is a click, not a move', async ({ page }) => {
  await add(page, 'database', 'D')
  await page.mouse.click(900, 680)
  const id = await node(page, 'D').getAttribute('data-node')
  const b = await box(page, 'D'); const n0 = (await events(page)).length
  await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await page.mouse.down(); await page.mouse.move(b.x + b.w / 2 + 2, b.y + b.h / 2 + 1); await page.mouse.up()
  expect((await events(page)).filter((e) => e.type === 'NodeMoved')).toHaveLength(0)
  await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await page.mouse.down(); await page.mouse.move(b.x + b.w / 2 + 60, b.y + b.h / 2 + 70, { steps: 5 })
  const dotR = (await page.locator(`.handle[data-for="${id}"][data-port="r"]`).boundingBox())!
  const live = await box(page, 'D')
  expect(Math.abs(dotR.x + dotR.width / 2 - (live.x + live.w))).toBeLessThan(1.5)
  await page.mouse.up()
  const moved = (await events(page)).filter((e) => e.type === 'NodeMoved')
  expect(moved).toHaveLength(1)
  expect((await events(page)).length).toBeGreaterThan(n0)
})

test('Tidy up appears with two boxes and an arrow, and pins every box', async ({ page }) => {
  await add(page, 'client', 'A'); await add(page, 'server', 'B')
  await expect(page.locator('#tidyBtn')).toBeHidden()
  await connectByDrag(page, 'A', 'B')
  await page.mouse.click(900, 680)
  await page.click('#tidyBtn')
  expect((await events(page)).at(-1)!.type).toBe('LayoutReset')
  expect((await state(page)).nodes.every((n: any) => n.fx !== undefined)).toBe(true)
})

test('problems switch and keep their own sessions; Start over clears one', async ({ page }) => {
  await add(page, 'client', 'A')
  await page.locator('#seg [data-id=rate]').click()
  await expect(page.locator('#seg [data-id=rate]')).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('[data-node]')).toHaveCount(0)
  await expect(page.locator('#coach')).toContainText('rate limiter')
  await page.locator('#seg [data-id=url]').click()
  await expect(page.locator('[data-node]')).toHaveCount(1)
  await page.click('#detailsBtn')
  await expect(page.locator('#mmSrc')).toContainText('flowchart')
  await page.click('#restart')
  await expect(page.locator('[data-node]')).toHaveCount(0)
  await page.locator('#seg [data-id=url]').focus(); await page.keyboard.press('ArrowRight')
  await expect(page.locator('#seg [data-id=rate]')).toHaveAttribute('aria-checked', 'true')
})

test('chat records the message and the coach answers; blank is ignored', async ({ page }) => {
  await page.fill('#chatInp', 'I think a limiter goes first'); await page.keyboard.press('Enter')
  await expect(page.locator('#coach .msg.you')).toContainText('limiter goes first')
  await expect(page.locator('#chatInp')).toHaveValue('')
  await expect(page.locator('#coach .msg')).toHaveCount(3) // opening, the question, the coach's answer
  await page.fill('#chatInp', '   '); await page.keyboard.press('Enter')
  await expect(page.locator('#coach .msg')).toHaveCount(3)
})

test('splitter resizes with the keyboard', async ({ page }) => {
  await page.locator('#splitter').focus(); await page.keyboard.press('ArrowLeft')
  await expect(page.locator('#splitter')).toHaveAttribute('aria-valuenow', '384')
})

test('Finish opens the study guide with a rendered diagram and LaTeX; Back returns to the board', async ({ page }) => {
  await add(page, 'client', 'Web app'); await add(page, 'database', 'Postgres')
  await connectByDrag(page, 'Web app', 'Postgres')
  await page.click('#finishBtn')
  await expect(page.locator('#reportH')).toBeFocused()
  await expect(page.locator('#mmFinal svg')).toBeVisible({ timeout: 15000 })
  expect(await page.locator('#texSrc').inputValue()).toContain('Web app')
  await page.click('#backBtn')
  await expect(page.locator('#addBtn')).toBeFocused()
  await expect(page.locator('[data-node]')).toHaveCount(2)
})
