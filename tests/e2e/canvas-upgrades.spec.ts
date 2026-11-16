import { expect, test } from '@playwright/test'
import { add, box, clickEdge, clickEmptyBoard, connectByDrag, edgePoint, events, node, state } from './helpers'

test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  ;(page as any).__errors = errors
  await page.goto('/')
})
test.afterEach(async ({ page }) => { expect((page as any).__errors).toEqual([]) })

const live = (page: any) => page.locator('#sr')

async function twoConnected(page: any) {
  await add(page, 'server', 'API'); await add(page, 'database', 'Postgres')
  await connectByDrag(page, 'API', 'Postgres')
  await clickEmptyBoard(page)
}

test.describe('arrow labels', () => {
  test('double-click an arrow, type, Enter: the label sits on the curve inside the canvas', async ({ page }) => {
    await twoConnected(page)
    await page.waitForTimeout(100)
    const pt = await edgePoint(page)
    await page.mouse.click(pt.x, pt.y)
    await page.mouse.click(pt.x, pt.y) // second tap within 450 ms: same rule as renaming a box
    await expect(page.locator('#edgeInp')).toBeFocused()
    await page.keyboard.type('reserve(ticketId)'); await page.keyboard.press('Enter')
    expect((await state(page)).edges[0].label).toBe('reserve(ticketId)')
    const lbl = page.locator('text.elabel')
    await expect(lbl).toHaveText('reserve(ticketId)')
    const lb = (await lbl.boundingBox())!, cv = (await page.locator('#board').boundingBox())!
    expect(lb.x).toBeGreaterThanOrEqual(cv.x); expect(lb.x + lb.width).toBeLessThanOrEqual(cv.x + cv.width)
    expect((await events(page)).filter((e) => e.type === 'EdgeLabeled')).toHaveLength(1)
  })

  test('keyboard only: E from a box reaches its arrow, Enter labels it, Escape returns to the box', async ({ page }) => {
    await twoConnected(page)
    await node(page, 'API').focus()
    await page.keyboard.press('e')
    const edge = page.locator('path[data-edge][role=button]')
    await expect(edge).toBeFocused()
    await expect(edge).toHaveAttribute('aria-label', /Connection from API to Postgres\. Enter adds a label/)
    await page.keyboard.press('F2')
    await page.keyboard.type('CDC'); await page.keyboard.press('Enter')
    await expect(edge).toBeFocused()
    await expect(live(page)).toHaveText('Labelled API to Postgres CDC.')
    await expect(edge).toHaveAttribute('aria-label', /labelled CDC/)
    await page.keyboard.press('Escape')
    await expect(node(page, 'API')).toBeFocused()
  })

  test('arrow keys cycle through arrows, Delete removes the focused one', async ({ page }) => {
    await add(page, 'client', 'A'); await add(page, 'server', 'B'); await add(page, 'database', 'C')
    await connectByDrag(page, 'A', 'B'); await connectByDrag(page, 'B', 'C')
    await node(page, 'B').focus(); await page.keyboard.press('e')
    const first = await page.locator('path[data-edge][role=button]:focus').getAttribute('data-edge')
    await page.keyboard.press('ArrowRight')
    const second = await page.locator('path[data-edge][role=button]:focus').getAttribute('data-edge')
    expect(second).not.toBe(first)
    await page.keyboard.press('Delete')
    expect((await state(page)).edges.map((e: any) => e.id)).toEqual([first])
  })

  test('Escape reverts, an empty label clears it, blur saves', async ({ page }) => {
    await twoConnected(page)
    await node(page, 'API').focus(); await page.keyboard.press('e'); await page.keyboard.press('Enter')
    await page.keyboard.type('draft'); await page.keyboard.press('Escape')
    expect((await state(page)).edges[0].label).toBeUndefined()
    await page.keyboard.press('Enter'); await page.keyboard.type('SSE')
    await clickEmptyBoard(page) // blur saves
    expect((await state(page)).edges[0].label).toBe('SSE')
    await clickEdge(page); await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter')
    expect((await state(page)).edges[0].label).toBeUndefined()
    await expect(page.locator('text.elabel')).toHaveCount(0)
  })

  test('the label follows its arrow when a box is dragged', async ({ page }) => {
    await twoConnected(page)
    await node(page, 'API').focus(); await page.keyboard.press('e'); await page.keyboard.press('Enter')
    await page.keyboard.type('x'); await page.keyboard.press('Enter')
    const before = (await page.locator('text.elabel').boundingBox())!
    await node(page, 'API').focus(); await page.keyboard.press('Shift+ArrowDown')
    const after = (await page.locator('text.elabel').boundingBox())!
    expect(Math.abs(after.y - before.y) + Math.abs(after.x - before.x)).toBeGreaterThan(5)
  })
})

test.describe('node notes', () => {
  test('N opens the note, Shift+Enter adds a line, Enter saves; the note sits beside the box', async ({ page }) => {
    await add(page, 'database', 'Postgres')
    await node(page, 'Postgres').focus(); await page.keyboard.press('n')
    await expect(page.locator('#noteInp')).toBeFocused()
    await page.keyboard.type('events(id, name)'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('bookings(id, seat)'); await page.keyboard.press('Enter')
    expect((await state(page)).nodes[0].note).toBe('events(id, name)\nbookings(id, seat)')
    await expect(node(page, 'Postgres')).toBeFocused()
    await expect(live(page)).toHaveText('Note saved on Postgres.')
    const n = (await page.locator('.note').boundingBox())!, b = await box(page, 'Postgres')
    // An unconnected box has a free bottom dot, so its note sits just below it, as wide as the box.
    expect(n.y).toBeGreaterThanOrEqual(b.y + b.h); expect(Math.abs(n.x - b.x)).toBeLessThan(2); expect(Math.abs(n.width - b.w)).toBeLessThan(2)
    await expect(node(page, 'Postgres')).toHaveAttribute('aria-label', /Has a note/)
  })

  test('the note moves with its box', async ({ page }) => {
    await add(page, 'database', 'Postgres')
    await node(page, 'Postgres').focus(); await page.keyboard.press('n'); await page.keyboard.type('TTL 10m'); await page.keyboard.press('Enter')
    const b0 = await box(page, 'Postgres'), n0 = (await page.locator('.note').boundingBox())!
    const cx = b0.x + b0.w / 2, cy = b0.y + b0.h / 2
    await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy + 90, { steps: 6 })
    const b1 = await box(page, 'Postgres'), n1 = (await page.locator('.note').boundingBox())!
    expect(Math.round(n1.x - n0.x)).toBe(Math.round(b1.x - b0.x)); expect(Math.round(n1.y - n0.y)).toBe(Math.round(b1.y - b0.y))
    await page.mouse.up()
    const n2 = (await page.locator('.note').boundingBox())!, b2 = await box(page, 'Postgres')
    expect(Math.round(n2.y - b2.y)).toBe(Math.round(n0.y - b0.y))
    expect(Math.round(n2.x - b2.x)).toBe(Math.round(n0.x - b0.x))
  })

  test('click the note or the hover icon to edit; a blank note removes it; Escape reverts', async ({ page }) => {
    await add(page, 'cache', 'Redis')
    const b = await box(page, 'Redis')
    await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2)
    const icon = page.locator('.noteBtn')
    await expect(icon).toHaveCSS('opacity', '1')
    await icon.click()
    await page.keyboard.type('ticketId: true, TTL 10m'); await page.keyboard.press('Enter')
    await expect(page.locator('.note')).toHaveText('ticketId: true, TTL 10m')
    await expect(icon).toBeHidden() // the note itself is now the affordance
    await page.locator('.note').click()
    await page.keyboard.type(' draft'); await page.keyboard.press('Escape')
    expect((await state(page)).nodes[0].note).toBe('ticketId: true, TTL 10m')
    await page.locator('.note').click()
    await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace'); await clickEmptyBoard(page)
    expect((await state(page)).nodes[0].note).toBeUndefined()
    await expect(page.locator('.note')).toHaveCount(0)
    await expect(icon).toHaveCount(1)
  })

  test('the note icon is not a tab stop and is hidden from the accessibility tree', async ({ page }) => {
    await add(page, 'cache', 'Redis')
    await expect(page.locator('.noteBtn')).toHaveAttribute('tabindex', '-1')
    expect(await page.locator('.noteBtn').evaluate((e) => !!e.closest('[aria-hidden=true]'))).toBe(true)
  })
})

test.describe('undo and redo', () => {
  test('Ctrl+Z undoes a new box and its naming as one step; Ctrl+Shift+Z brings it back', async ({ page }) => {
    await add(page, 'cache', 'Redis')
    await node(page, 'Redis').focus()
    const n0 = (await events(page)).length
    await page.keyboard.press('Control+z')
    await expect(page.locator('[data-node]')).toHaveCount(0)
    await expect(live(page)).toHaveText('Undid: Added "Cache" (Cache).')
    await expect(page.locator('#addBtn')).toBeFocused()
    await page.keyboard.press('Control+Shift+z')
    await expect(node(page, 'Redis')).toBeVisible()
    await expect(page.locator('#addBtn')).toBeFocused() // focus stays on a stable control, as after undo
    expect((await events(page)).length).toBe(n0 + 2) // nothing was deleted from the log
    expect((await events(page)).slice(-2).map((e) => e.type)).toEqual(['UserActionUndone', 'UserActionRedone'])
  })

  test('steps back through rename, arrow, label, note and delete in order', async ({ page }) => {
    await twoConnected(page)
    await node(page, 'API').focus(); await page.keyboard.press('e'); await page.keyboard.press('Enter'); await page.keyboard.type('SSE'); await page.keyboard.press('Enter')
    await page.keyboard.press('Escape')
    await page.keyboard.press('n'); await page.keyboard.type('note'); await page.keyboard.press('Enter')
    await page.keyboard.press('Delete')
    expect((await state(page)).nodes.map((n: any) => n.label)).toEqual(['Postgres'])
    await page.keyboard.press('Control+z') // the delete
    let s = await state(page)
    expect(s.nodes.map((n: any) => n.label)).toEqual(['API', 'Postgres'])
    expect(s.nodes[0].note).toBe('note'); expect(s.edges[0].label).toBe('SSE')
    await page.keyboard.press('Control+z') // the note
    expect((await state(page)).nodes[0].note).toBeUndefined()
    await page.keyboard.press('Control+z') // the label
    expect((await state(page)).edges[0].label).toBeUndefined()
    await page.keyboard.press('Control+z') // the arrow
    expect((await state(page)).edges).toHaveLength(0)
    await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z') // both boxes
    await page.keyboard.press('Control+z')
    await expect(live(page)).toHaveText('Nothing to undo.')
    s = await state(page); expect(s.nodes).toHaveLength(0)
  })

  test('a new edit clears redo, and chat does not', async ({ page }) => {
    await add(page, 'client', 'A')
    await page.keyboard.press('Control+z')
    await page.fill('#chatInp', 'hello'); await page.keyboard.press('Enter')
    await page.locator('body').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press('Control+Shift+z')
    await expect(node(page, 'A')).toBeVisible()
    await page.keyboard.press('Control+z')
    await add(page, 'server', 'B')
    await page.keyboard.press('Control+Shift+z')
    await expect(live(page)).toHaveText('Nothing to redo.')
    expect((await state(page)).nodes.map((n: any) => n.label)).toEqual(['B'])
  })

  test('inside a text field Ctrl+Z is the browser\'s own text undo, not a board undo', async ({ page }) => {
    await add(page, 'client', 'A')
    const n0 = (await events(page)).length
    await page.fill('#chatInp', 'typing'); await page.keyboard.press('Control+z')
    expect((await events(page)).length).toBe(n0)
    expect((await state(page)).nodes).toHaveLength(1)
  })

  test('undoing while the box is selected leaves no stale selection', async ({ page }) => {
    await add(page, 'client', 'A'); await add(page, 'server', 'B')
    await node(page, 'B').click(); await node(page, 'B').click()
    await node(page, 'B').focus(); await page.keyboard.press('Control+z')
    await expect(page.locator('[aria-pressed=true]')).toHaveCount(0)
    expect((await state(page)).nodes.map((n: any) => n.label)).toEqual(['A'])
  })

  test('the report notes undone steps', async ({ page }) => {
    await add(page, 'client', 'A')
    await node(page, 'A').focus(); await page.keyboard.press('Control+z')
    await page.click('#finishBtn')
    expect(await page.locator('#texSrc').inputValue()).toContain('Undid: Added')
    await expect(page.locator('#reportBody')).toContainText('Undid: Added')
  })
})

test.describe('layout of labels and notes', () => {
  test('a long label stays readable above the boxes, and a note never covers an arrow\'s dot', async ({ page }) => {
    await add(page, 'client', 'A'); await add(page, 'server', 'B')
    await connectByDrag(page, 'A', 'B')
    await node(page, 'A').focus(); await page.keyboard.press('e'); await page.keyboard.press('Enter')
    await page.keyboard.type('reserve(ticketId)'); await page.keyboard.press('Enter')
    // The label layer is painted after the boxes, so nothing is drawn over it.
    const top = await page.evaluate(() => { const t = document.querySelector('text.elabel')!.getBoundingClientRect(); return document.elementFromPoint(t.x + t.width / 2, t.y + t.height / 2)?.tagName })
    expect(['text', 'path']).toContain(top)
    // A's arrow leaves by its right dot, so the note goes below; B's arrow enters by the left dot.
    await node(page, 'A').focus(); await page.keyboard.press('Escape'); await page.keyboard.press('n'); await page.keyboard.type('x'); await page.keyboard.press('Enter')
    const n = (await page.locator('.note').boundingBox())!, a = await box(page, 'A')
    expect(n.y).toBeGreaterThan(a.y + a.h - 1)
  })
})
