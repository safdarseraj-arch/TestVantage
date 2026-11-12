/**
 * Damage a fresh split of the scan settles on one card: list rows that belong to another
 * printed question (2014 P2 Q18/Q19 carried Q17's List-I / List-II), and the option pictures
 * repeated at the end of the stem (2014 P2 Q1). Pure functions only.
 */

const LIST_HEADER_RE = /^\s*(?:\\textbf\{\s*)?(?:List|Column)\s*[-–]?\s*(I{1,2})\b/i
const LIST_ROW_RE = /^\s*(?:\(\s*[PQRSTpqrst1-5]\s*\)|[PQRSTpqrst1-5]\s*[.)])\s*(\S.*)$/
const IMAGE_LINE_RE = /^\s*(?:!\[[^\]]*\]\([^)]*\)|\\includegraphics(?:\[[^\]]*\])?\{[^}]*\})\s*$/
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)|\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g

const compact = (text) =>
  String(text ?? '')
    .replace(/\\(?:left|right|mathrm|mathbf|text|textbf)\b/g, '')
    .replace(/[\s${}~]/g, '')
    .toLowerCase()

function listTwoHeaders(text) {
  return String(text ?? '')
    .split('\n')
    .filter((line) => LIST_HEADER_RE.exec(line)?.[1]?.toUpperCase() === 'II').length
}

/**
 * Rows on this card that the scan prints for another question, and that question's index in
 * the fresh split. null when every row is the card's own.
 * @param {any} q saved card
 * @param {any} fresh the same question in a fresh split of the scan
 * @param {any[]} items the fresh split
 * @returns {{ lines: Set<number>, source: number } | null}
 */
export function listRowsFromAnotherQuestion(q, fresh, items) {
  if (!fresh || !Array.isArray(items)) return null
  const text = String(q?.text ?? '')
  if (!/(?:List|Column)\s*[-–]?\s*I/i.test(text)) return null
  const own = compact([fresh.text, fresh.passageText, ...(Array.isArray(fresh.options) ? fresh.options : [])].join(' '))
  /** @type {{ index: number, body: string }[]} */
  const foreign = []
  text.split('\n').forEach((line, index) => {
    const row = line.match(LIST_ROW_RE)
    if (!row) return
    const body = compact(row[1])
    if (body.length >= 2 && !own.includes(body)) foreign.push({ index, body })
  })
  if (foreign.length < 2) return null
  // Short rows such as "(1) +x" only count when the card also repeats a List-II heading.
  if (!foreign.some(({ body }) => body.length >= 6) && listTwoHeaders(text) <= listTwoHeaders(fresh.text)) return null
  const source = items.findIndex(
    (other) => other && other !== fresh && foreign.every(({ body }) => compact(other.text).includes(body)),
  )
  if (source < 0) return null
  return { lines: new Set(foreign.map(({ index }) => index)), source }
}

const OPTION_LINE_RE = /^\s*\(\s*([A-D])\s*\)\s*(\S.*)$/

/**
 * "(A) … (D)" lines in the stem that are another question's options, while this card has its own
 * (2019 P2 Q52 carried Q51's four choices). null when not the case.
 * @param {any} q
 * @param {any} fresh
 * @param {any[]} items
 * @returns {{ lines: Set<number>, source: number } | null}
 */
export function optionLinesFromAnotherQuestion(q, fresh, items) {
  if (!fresh || !Array.isArray(items)) return null
  const mine = (Array.isArray(q?.options) ? q.options : []).map(compact).filter(Boolean)
  if (mine.length < 2) return null
  const own = compact([fresh.text, fresh.passageText].join(' '))
  /** @type {{ index: number, body: string }[]} */
  const foreign = []
  String(q?.text ?? '')
    .split('\n')
    .forEach((line, index) => {
      const m = line.match(OPTION_LINE_RE)
      if (!m) return
      const body = compact(m[2])
      if (body && !mine.includes(body) && !own.includes(body)) foreign.push({ index, body })
    })
  if (foreign.length < 3) return null
  const source = items.findIndex((other) => {
    if (!other || other === fresh || !Array.isArray(other.options)) return false
    const theirs = other.options.map(compact)
    return foreign.filter(({ body }) => theirs.some((o) => o === body || (body.length >= 6 && o.startsWith(body)))).length >= 3
  })
  if (source < 0) return null
  return { lines: new Set(foreign.map(({ index }) => index)), source }
}

/** The card text without the foreign rows, and without a list heading left with no rows under it. */
export function withoutForeignListRows(text, lines) {
  const kept = String(text ?? '')
    .split('\n')
    .filter((_, i) => !lines.has(i))
  const out = kept.filter((line, i) => {
    if (!LIST_HEADER_RE.test(line)) return true
    for (let k = i + 1; k < kept.length; k += 1) {
      if (!kept[k].trim()) continue
      return !LIST_HEADER_RE.test(kept[k])
    }
    return false
  })
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Stem without the option pictures repeated at its end: every option is a picture and the stem
 * ends with that many pictures the scan does not print in the stem. '' when not the case.
 * @param {any} q
 * @param {any} fresh
 */
export function stemWithoutOptionPictures(q, fresh) {
  const options = Array.isArray(q?.options) ? q.options.map((o) => String(o ?? '')) : []
  if (options.length < 2 || !options.every((o) => IMAGE_LINE_RE.test(o))) return ''
  const lines = String(q?.text ?? '').trimEnd().split('\n')
  let start = lines.length
  while (start > 0 && IMAGE_LINE_RE.test(lines[start - 1])) start -= 1
  const trailing = lines.length - start
  if (trailing < options.length || start === 0) return ''
  if (fresh && (String(fresh.text ?? '').match(IMAGE_RE) || []).length >= trailing) return ''
  return lines.slice(0, lines.length - options.length).join('\n').trimEnd()
}

const CROP_URL_RE = /https:\/\/cdn\.mathpix\.com\/cropped\/[^\s)}"'\\]+/g
const cropUrls = (text) => [...String(text ?? '').matchAll(CROP_URL_RE)].map((m) => m[0])

/**
 * A stem picture the scan prints for another question, while this question's own picture is
 * missing (2025 P2 Q40 showed Q39's reaction scheme). null when every picture is the card's own.
 * @param {any} q
 * @param {any} fresh
 * @param {any[]} items
 * @returns {{ url: string, replacement: string, source: number } | null}
 */
export function figureFromAnotherQuestion(q, fresh, items) {
  if (!fresh || !Array.isArray(items)) return null
  const mine = cropUrls(q?.text)
  if (!mine.length) return null
  const own = new Set(cropUrls([fresh.text, fresh.passageText, ...(Array.isArray(fresh.options) ? fresh.options : [])].join('\n')))
  const missing = cropUrls(fresh.text).filter((url) => !mine.includes(url))
  if (!missing.length) return null
  for (const url of mine) {
    if (own.has(url)) continue
    const source = items.findIndex(
      (other) => other && other !== fresh && cropUrls([other.text, other.passageText].join('\n')).includes(url),
    )
    if (source >= 0) return { url, replacement: missing[0], source }
  }
  return null
}

/**
 * A chapter field holding math, a list row or the opening of the question (2014 P2 saved
 * "$m_{2} g \sin \theta$" and "Four charges $Q_{1}, Q_{2}, Q_{3}$ and $" as chapters).
 */
export function chapterIsNotAName(q) {
  const chapter = String(q?.chapter ?? '').trim()
  if (!chapter) return false
  if (/[$\\]|^\(?[PQRS1-5]\)?[.)]?\s/.test(chapter)) return true
  const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  return chapter.length >= 20 && squash(q?.text).startsWith(squash(chapter))
}
