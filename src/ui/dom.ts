export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el as T
}

/** Announce through the polite live region. Cleared first so repeating a message is still read. */
export function say(text: string): void {
  const el = $('sr')
  el.textContent = ''
  setTimeout(() => { el.textContent = text }, 30)
}

/** Roving tabindex: exactly one visible item is in the tab order. */
export function syncRove(container: HTMLElement, itemSel: string): void {
  const all = Array.from(container.querySelectorAll<HTMLElement>(itemSel))
  const items = all.filter((x) => !x.hidden)
  const cur = items.find((x) => x.tabIndex === 0) ?? items[0]
  for (const x of all) x.tabIndex = x === cur ? 0 : -1
}

/** Arrow/Home/End navigation over a roving group; `select` also activates the item (radio behaviour). */
export function rove(container: HTMLElement, itemSel: string, select: boolean): void {
  container.addEventListener('keydown', (e) => {
    const items = Array.from(container.querySelectorAll<HTMLElement>(itemSel)).filter((x) => !x.hidden)
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    let n: HTMLElement | undefined
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = items[(i + 1) % items.length]
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = items[(i - 1 + items.length) % items.length]
    else if (e.key === 'Home') n = items[0]
    else if (e.key === 'End') n = items[items.length - 1]
    if (!n) return
    e.preventDefault()
    n.tabIndex = 0
    for (const x of items) if (x !== n) x.tabIndex = -1
    n.focus()
    if (select) n.click()
  })
}
