import type { Page } from '@playwright/test'

export type Box = { x: number; y: number; w: number; h: number }

export async function add(page: Page, category: string, name: string): Promise<void> {
  await page.click('#addBtn')
  await page.fill('#pickInp', category)
  await page.keyboard.press('Enter')
  await page.keyboard.type(name)
  await page.keyboard.press('Enter')
}

export const state = <T = any>(page: Page) => page.evaluate(() => (window as any).__sdc.state() as T)
export const events = (page: Page) => page.evaluate(() => (window as any).__sdc.log() as { type: string; payload: any }[])

const exact = (label: string) => new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)

/** The box whose name is exactly `label` (substring matching confuses "A" with "Cache"). */
export const node = (page: Page, label: string) =>
  page.locator('[data-node]').filter({ has: page.locator('span', { hasText: exact(label) }) }).first()

/** Click an arrow on its stroke (the middle of a curve's bounding box is usually not on the curve). */
export async function edgePoint(page: Page, index = 0): Promise<{ x: number; y: number }> {
  return page.evaluate((i) => {
    const p = document.querySelectorAll<SVGPathElement>('#edgeSvg path[data-edge]')[i]!
    const q = p.getPointAtLength(p.getTotalLength() / 2)
    const m = p.getScreenCTM()!
    return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }
  }, index)
}

export async function clickEdge(page: Page, index = 0): Promise<void> {
  await page.waitForTimeout(100) // clicks within 60 ms of a drag are deliberately swallowed
  const pt = await edgePoint(page, index)
  await page.mouse.click(pt.x, pt.y)
}

export async function box(page: Page, label: string): Promise<Box> {
  const r = (await node(page, label).boundingBox())!
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}

/** Drag from a box's dot to the middle of another box, like a learner would. */
export async function connectByDrag(page: Page, from: string, to: string, port: 't' | 'r' | 'b' | 'l' = 'r'): Promise<void> {
  const a = await box(page, from)
  await page.mouse.move(a.x + a.w / 2, a.y + a.h / 2)
  const id = await node(page, from).getAttribute('data-node')
  const dot = (await page.locator(`.handle[data-for="${id}"][data-port="${port}"]`).boundingBox())!
  const t = await box(page, to)
  const hx = dot.x + dot.width / 2, hy = dot.y + dot.height / 2
  await page.mouse.move(hx, hy)
  await page.mouse.down()
  await page.mouse.move(hx + 8, hy + 8, { steps: 3 })
  await page.mouse.move(t.x + t.w / 2, t.y + t.h / 2, { steps: 8 })
  await page.mouse.up()
}

/** Click an empty spot inside the board (clicks on the canvas margin outside it do not deselect). */
export async function clickEmptyBoard(page: Page): Promise<void> {
  const b = (await page.locator('#board').boundingBox())!
  await page.mouse.click(b.x + b.width - 30, b.y + b.height - 30)
}
