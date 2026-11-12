const FIGURE_IN_TEXT_RE = /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}|!\[[^\]]*\]\(([^)\s]+)\)/g
const PAGE_CROP_RE = /\/api\/official-pyq\/original\/crops\/[^}\s)?]*\?page=(\d+)&x0=([\d.]+)&y0=([\d.]+)&x1=([\d.]+)&y1=([\d.]+)/
const MATHPIX_BOX_RE = /cdn\.mathpix\.com\/cropped\/[^?\s)}]*?-(\d{2,3})\.jpg\?height=(\d+)&width=(\d+)&top_left_y=(\d+)&top_left_x=(\d+)/
/** Mathpix renders a paper page about 2066 × 2922 px; crops of the original PDF use page fractions. */
const MATHPIX_PAGE_W = 2066
const MATHPIX_PAGE_H = 2922
const EDGE = 0.02

/** @param {string} option */
function optionPageCrops(option) {
  return [...option.matchAll(FIGURE_IN_TEXT_RE)]
    .map((m) => String(m[1] || m[2]).match(PAGE_CROP_RE))
    .filter(Boolean)
    .map((m) => ({ page: Number(m[1]), cx: (Number(m[2]) + Number(m[4])) / 2, cy: (Number(m[3]) + Number(m[5])) / 2 }))
}

/**
 * One scan picture of all the option drawings stays in the stem after the options were cropped
 * from the original page, so the drawings show twice (2012 P2 Q9).
 * @param {string} text
 * @param {unknown[]} options
 */
function stemWithoutPictureOfOptionCrops(text, options) {
  const filled = options.map((o) => String(o ?? '')).filter((o) => o.trim())
  if (filled.length < 2) return text
  const perOption = filled.map(optionPageCrops)
  if (perOption.some((crops) => !crops.length)) return text
  const crops = perOption.flat()
  let dropped = false
  const next = text.replace(FIGURE_IN_TEXT_RE, (all, a, b) => {
    const m = String(a || b).match(MATHPIX_BOX_RE)
    if (!m) return all
    const [page, h, w, top, left] = m.slice(1, 6).map(Number)
    const box = { x0: left / MATHPIX_PAGE_W, y0: top / MATHPIX_PAGE_H, x1: (left + w) / MATHPIX_PAGE_W, y1: (top + h) / MATHPIX_PAGE_H }
    const inside = crops.filter(
      (c) => c.page === page && c.cx >= box.x0 - EDGE && c.cx <= box.x1 + EDGE && c.cy >= box.y0 - EDGE && c.cy <= box.y1 + EDGE,
    )
    if (inside.length < 2) return all
    dropped = true
    return ''
  })
  return dropped ? next.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim() : text
}

/**
 * The scan repeats the stem figure after the last option when the figure sits beside the options (2013 P2 Q2, Q3).
 * @template {{ text?: unknown, options?: unknown[] }} T
 * @param {T} q
 * @returns {T} the same object when no option repeats a stem figure
 */
export function dropOptionFigureRepeatingStem(q) {
  if (!q || !Array.isArray(q.options)) return q
  if (typeof q.text === 'string') {
    const stem = stemWithoutPictureOfOptionCrops(q.text, q.options)
    if (stem !== q.text && stem.length >= 20) q = { ...q, text: stem }
  }
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
