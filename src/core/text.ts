export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const TEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', $: '\\$', '#': '\\#', _: '\\_',
  '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
}

/** Escape text for LaTeX. Non-ASCII becomes "?" because the report uses only the minimal packages. */
export function texEscape(s: string): string {
  return String(s)
    .replace(/[\\&%$#_{}~^]/g, (c) => TEX_ESCAPES[c]!)
    .replace(/→/g, '$\\rightarrow$')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\x7F]/g, '?')
}
