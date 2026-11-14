/**
 * The pages an admin chooses to read from a stored book ("1-100, 151-175, 200" or "all"), cut
 * into reading ranges: never across a chapter start, never longer than the chosen size. Ranges
 * already read stay as they are, and their pages are not planned again.
 */

export const MAX_RANGE_PAGES = 40

/**
 * @param {unknown} raw
 * @param {number} pages pages in the book
 * @returns {{ intervals: Array<[number, number]>, error?: string }}
 */
export function parsePageList(raw, pages) {
  const text = String(raw ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\b(?:to|till|until)\b/gi, '-')
    .replace(/\b(?:and|pages?|pp?)\b\.?|&/gi, ',')
    .replace(/\s*-\s*/g, '-')
    .trim()
    .replace(/^,+|,+$/g, '')
    .trim()
  if (!text) return { intervals: [], error: 'Type the pages to read, for example 1-100, 151-175.' }
  if (/^(?:all|whole(?:\s+book)?|full)$/i.test(text)) return { intervals: [[1, pages]] }
  /** @type {Array<[number, number]>} */
  const out = []
  for (const piece of text.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = piece.match(/^(\d{1,5})(?:-(\d{1,5}|end|last))?$/i)
    if (!m) return { intervals: [], error: `“${piece}” is not a page or a page range. Write it like 151-175.` }
    const a = Number(m[1])
    const b = m[2] ? (/^\d/.test(m[2]) ? Number(m[2]) : pages) : a
    const [lo, hi] = a <= b ? [a, b] : [b, a]
    if (lo < 1 || lo > pages) return { intervals: [], error: `Page ${lo} is outside the book (1-${pages}).` }
    out.push([lo, Math.min(hi, pages)])
  }
  return { intervals: mergeIntervals(out) }
}

/** @param {Array<[number, number]>} list */
function mergeIntervals(list) {
  const sorted = [...list].sort((x, y) => x[0] - y[0])
  /** @type {Array<[number, number]>} */
  const out = []
  for (const [a, b] of sorted) {
    const last = out[out.length - 1]
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/**
 * @param {Array<[number, number]>} wanted
 * @param {Array<{ start: number, end: number }>} taken
 */
function subtractRanges(wanted, taken) {
  /** @type {Array<[number, number]>} */
  let out = wanted.map(([a, b]) => [a, b])
  for (const t of taken) {
    /** @type {Array<[number, number]>} */
    const next = []
    for (const [a, b] of out) {
      if (t.end < a || t.start > b) next.push([a, b])
      else {
        if (a < t.start) next.push([a, t.start - 1])
        if (t.end < b) next.push([t.end + 1, b])
      }
    }
    out = next
  }
  return out
}

/**
 * @param {Array<{ title: string, page: number }>} chapters
 * @param {number} page
 */
function chapterAt(chapters, page) {
  let found = null
  for (const c of chapters) if (Number(c.page) <= page && (!found || Number(c.page) >= Number(found.page))) found = c
  return found
}

/**
 * @param {{
 *   pages: number
 *   chapters?: Array<{ title: string, page: number }>
 *   ranges?: Array<import('./bookRangeImport.js').BookRange>
 *   wanted: Array<[number, number]>
 *   rangePages?: number
 *   mode?: 'add' | 'only'
 * }} args `add` keeps the ranges not read yet (a skipped one whose pages are typed is planned again);
 *   `only` drops them, so only the typed pages are left to read
 * @returns {{ ranges: Array<import('./bookRangeImport.js').BookRange>, added: number, addedPages: number, alreadyRead: number, dropped: number }}
 */
export function planBookRanges(args) {
  const pages = Number(args.pages) || 0
  const size = Math.max(1, Math.min(Number(args.rangePages) || 20, MAX_RANGE_PAGES))
  const chapters = (args.chapters || []).filter((c) => Number(c.page) >= 1 && Number(c.page) <= pages)
  const existing = args.ranges || []
  const isRead = (r) => r.status === 'done' || r.status === 'reading'
  const kept = existing.filter(
    (r) => isRead(r) || (args.mode !== 'only' && !(r.status === 'skipped' && overlap(r, args.wanted) > 0)),
  )
  const dropped = existing.length - kept.length
  const readPages = existing.filter(isRead).reduce((n, r) => n + overlap(r, args.wanted), 0)
  const free = subtractRanges(args.wanted, kept)

  const starts = [...new Set(chapters.map((c) => Number(c.page)))].sort((x, y) => x - y)
  /** @type {Array<import('./bookRangeImport.js').BookRange>} */
  const fresh = []
  for (const [a, b] of free) {
    const cuts = [a, ...starts.filter((p) => p > a && p <= b), b + 1]
    for (let i = 0; i + 1 < cuts.length; i += 1) {
      const lo = cuts[i]
      const hi = cuts[i + 1] - 1
      const ch = chapterAt(chapters, lo)
      const count = hi - lo + 1
      const pieces = Math.max(1, Math.ceil(count / size))
      const step = Math.ceil(count / pieces)
      for (let k = 0; k < pieces; k += 1) {
        const s = lo + k * step
        const e = Math.min(hi, s + step - 1)
        if (s > e) continue
        const title = ch?.title ? (pieces > 1 ? `${ch.title} (part ${k + 1} of ${pieces})` : ch.title) : `Pages ${s}-${e}`
        fresh.push({ start: s, end: e, title, chapter: ch?.title || '', status: 'new', paperIds: [] })
      }
    }
  }
  const ranges = [...kept, ...fresh].sort((x, y) => x.start - y.start || x.end - y.end)
  return {
    ranges,
    added: fresh.length,
    addedPages: fresh.reduce((n, r) => n + r.end - r.start + 1, 0),
    alreadyRead: readPages,
    dropped,
  }
}

/** @param {{ start: number, end: number }} r @param {Array<[number, number]>} wanted */
function overlap(r, wanted) {
  return wanted.reduce((n, [a, b]) => n + Math.max(0, Math.min(b, r.end) - Math.max(a, r.start) + 1), 0)
}

/** "1-40, 61-80": the pages of these ranges, joined where they touch. */
export function describePages(ranges) {
  const merged = mergeIntervals(ranges.map((r) => [r.start, r.end]))
  return merged.map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join(', ')
}
