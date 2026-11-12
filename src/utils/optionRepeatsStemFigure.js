const FIGURE_IN_TEXT_RE = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}|!\[[^\]]*\]\(([^)\s]+)\)/g

/**
 * The scan repeats the stem figure after the last option when the figure sits beside the options (2013 P2 Q2, Q3).
 * @template {{ text?: unknown, options?: unknown[] }} T
 * @param {T} q
 * @returns {T} the same object when no option repeats a stem figure
 */
export function dropOptionFigureRepeatingStem(q) {
  if (!q || !Array.isArray(q.options)) return q
  const stemFigures = new Set([...String(q.text ?? '').matchAll(FIGURE_IN_TEXT_RE)].map((m) => m[1] || m[2]))
  if (!stemFigures.size) return q
  let changed = false
  const options = q.options.map((o) => {
    if (typeof o !== 'string') return o
    let dropped = false
    const next = o
      .replace(FIGURE_IN_TEXT_RE, (all, a, b) => {
        if (!stemFigures.has(a || b)) return all
        dropped = true
        return ''
      })
      .replace(/[ \t]+$/gm, '')
      .trimEnd()
    if (dropped && next.trim()) {
      changed = true
      return next
    }
    return o
  })
  return changed ? { ...q, options } : q
}
