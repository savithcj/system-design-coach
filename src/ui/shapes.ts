import type { Role } from '../core/roles'

/** Outline of each category inside a w x h box. Same geometry as the prototype. */
export function shapeSvg(role: Role | string, W: number, H: number, mini = false): string {
  const sw = 1.4
  const i = sw / 2 + 0.5
  let d: string
  let extra = ''
  switch (role) {
    case 'client': d = `M${H / 2} ${i}H${W - H / 2}A${H / 2 - i} ${H / 2 - i} 0 0 1 ${W - H / 2} ${H - i}H${H / 2}A${H / 2 - i} ${H / 2 - i} 0 0 1 ${H / 2} ${i}Z`; break
    case 'cache': { const k = Math.min(16, W * 0.12); d = `M${k + i} ${i}H${W - i}L${W - k - i} ${H - i}H${i}Z`; break }
    case 'db': {
      const ry = Math.min(8, H * 0.16)
      d = `M${i} ${ry + i}A${W / 2 - i} ${ry} 0 0 1 ${W - i} ${ry + i}V${H - ry - i}A${W / 2 - i} ${ry} 0 0 1 ${i} ${H - ry - i}Z`
      extra = `<path d="M${i} ${ry + i}A${W / 2 - i} ${ry} 0 0 0 ${W - i} ${ry + i}" fill="none" stroke="currentColor" stroke-width="${sw}"/>`
      break
    }
    case 'blob': { const t = Math.min(12, W * 0.08); d = `M${i} ${i}H${W - i}L${W - t - i} ${H - i}H${t + i}Z`; break }
    case 'queue': { const a = Math.min(16, W * 0.12); d = `M${i} ${i}H${W - a - i}L${W - i} ${H / 2}L${W - a - i} ${H - i}H${i}Z`; break }
    case 'other': { const hx = Math.min(14, W * 0.1); d = `M${hx + i} ${i}H${W - hx - i}L${W - i} ${H / 2}L${W - hx - i} ${H - i}H${hx + i}L${i} ${H / 2}Z`; break }
    default: d = `M8 ${i}H${W - 8}Q${W - i} ${i} ${W - i} 8V${H - 8}Q${W - i} ${H - i} ${W - 8} ${H - i}H8Q${i} ${H - i} ${i} ${H - 8}V8Q${i} ${i} 8 ${i}Z`
  }
  return `<svg class="shp${mini ? ' mini' : ''}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><path d="${d}" class="sf" stroke="currentColor" stroke-width="${sw}"/>${extra}</svg>`
}
