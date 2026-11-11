/**
 * How a match-the-list card lays out on screen, judged from the same List-I / List-II parse
 * the review page draws: question words lost above the lists (2013 P2 Q19), empty or repeated
 * rows, a row missing from a list, rows of one list inside the other, one picture under two
 * labels, and answer codes that name rows the lists do not have. Pure functions only.
 */

import { extractMathpixImageUrls } from './mathpixMedia.js'
import { parseMatchingListForDisplay } from './parseMatchingListDisplay.js'
import { sanitizeStemForDisplay } from './sanitizeStemForDisplay.js'

const LIST_HEAD_RE = /(?:List|Column)\s*[-–]?\s*I/i
/** Words the lists draw as headings or the code table, not as question wording. */
const LAYOUT_WORDS = new Set(['list', 'lists', 'column', 'columns', 'code', 'codes', 'figure', 'caption'])
const LOST_WORDS_MIN = 3
const ROW_HEADING_RE = /^(?:List|Column)\s*[-–]?\s*I{1,2}\b/i
/** "(1) List-II" — the heading the scan printed beside the first row (2024 P1 Q50). */
const LABEL_WITH_HEADING_RE = /^([ \t]*\(\s*(?:[1-6]|[A-Z]|[a-t])\s*\))[ \t]*(?:List|Column)[ \t]*[-–]?[ \t]*I{1,2}[ \t]*$/gm

/**
 * The card text without a List heading printed on a row label's line ("(1) List-II").
 * The same string when there is none.
 * @param {unknown} text
 */
export function withoutHeadingOnRowLabel(text) {
  const t = String(text ?? '')
  return t.replace(LABEL_WITH_HEADING_RE, '$1')
}

/** @param {unknown} text */
function plainWords(text) {
  const s = String(text ?? '')
    .replace(/\$\$[\s\S]*?\$\$|\$[^$\n]*\$/g, ' ')
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}|!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
  return new Set((s.match(/[A-Za-z]{4,}/g) || []).map((w) => w.toLowerCase()).filter((w) => !LAYOUT_WORDS.has(w)))
}

/** @param {string[]} labels */
function labelKind(labels) {
  const kinds = new Set(
    labels.map((l) => {
      if (/^\d+$/.test(l)) return 'number'
      if (/^[a-z]$/.test(l)) return 'lower'
      if (/^[IVX]{2,}$/.test(l)) return 'roman'
      if (/^[A-Z]$/.test(l)) return 'upper'
      return 'other'
    }),
  )
  if (kinds.has('roman') && kinds.has('upper') && labels.every((l) => /^[IVX]+$/.test(l))) return 'roman'
  return kinds.size === 1 ? [...kinds][0] : 'mixed'
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

/** @param {string[]} labels @param {string} kind */
function gapIn(labels, kind) {
  /** @type {(l: string) => number} */
  const at =
    kind === 'number'
      ? (l) => Number(l)
      : kind === 'roman'
        ? (l) => ROMAN.indexOf(l) + 1
        : (l) => l.toUpperCase().charCodeAt(0)
  const nums = labels.map(at).filter((n) => Number.isFinite(n) && n > 0)
  if (nums.length < 2) return ''
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  for (let k = 1; k < sorted.length; k += 1) {
    if (sorted[k] - sorted[k - 1] > 1) {
      const n = sorted[k - 1] + 1
      return kind === 'number' ? String(n) : kind === 'roman' ? ROMAN[n - 1] || '' : String.fromCharCode(n)
    }
  }
  return ''
}

const rowKey = (text) =>
  String(text ?? '')
    .replace(/\\(?:left|right|mathrm|mathbf|text|textbf)\b/g, '')
    .replace(/[\s${}~]/g, '')
    .toLowerCase()

const labelOf = (row) => String(row?.label ?? '').replace(/[()\s.]/g, '')

/** Left / right row labels the answer-code options name ("P-1, Q-3", "P → 2; Q → 4", "(I) (P)"). */
function codeLabels(options) {
  const left = new Set()
  const right = new Set()
  let coded = 0
  for (const opt of Array.isArray(options) ? options : []) {
    const s = String(opt ?? '')
      .replace(/\\(?:rightarrow|to|longrightarrow)\b/g, '→')
      .replace(/\\[a-zA-Z]+/g, ' ')
      .replace(/[$\\{}]/g, ' ')
    const pairs = [...s.matchAll(/(?:^|[\s,;(])([A-Z]|[IVX]{1,4})\s*\)?\s*(?:→|->|-|–|:)\s*\(?\s*((?:\d|[a-t])(?:\s*,\s*(?:\d|[a-t]))*)\s*\)?/g)]
    if (pairs.length < 2) continue
    coded += 1
    for (const m of pairs) {
      left.add(m[1])
      for (const r of m[2].split(/\s*,\s*/)) right.add(r)
    }
  }
  return coded >= 2 ? { left, right } : null
}

/**
 * Plain-words problems with the List-I / List-II layout of a card; [] when the card has no
 * lists or they lay out cleanly.
 * @param {any} card
 * @returns {string[]}
 */
export function officialPyqMatchListLayoutProblems(card) {
  const raw = String(card?.text ?? '')
  if (!LIST_HEAD_RE.test(raw)) return []
  const text = sanitizeStemForDisplay(raw, card?.options)
  const parsed = parseMatchingListForDisplay(text, card?.options)
  const listI = Array.isArray(parsed?.listI) ? parsed.listI : []
  const listII = Array.isArray(parsed?.listII) ? parsed.listII : []
  if (listI.length < 2) return []
  /** Rows read off the answer codes (no rows in the question text) are not a drawn list. */
  const inText = listI.filter((row) => {
    const l = labelOf(row)
    return l && new RegExp(`\\(\\s*(?:\\\\(?:mathrm|text|mathbf)\\s*\\{\\s*)?${l}\\s*\\}?\\s*\\)`).test(text)
  })
  if (inText.length < 2) return []
  const out = []
  const rows = [...listI.map((row) => ['List-I', row]), ...listII.map((row) => ['List-II', row])]

  const drawn = plainWords(
    [parsed.intro, parsed.outro, parsed.listITitle, parsed.listIITitle, ...rows.map(([, row]) => row?.text), ...(card?.options || [])].join(
      '\n',
    ),
  )
  const lost = [...plainWords(text)].filter((w) => !drawn.has(w))
  if (lost.length >= LOST_WORDS_MIN) {
    out.push(`question words are not shown with the lists (“${lost.slice(0, 4).join(' ')}”)`)
  }

  /** One picture of the whole List-II (an original-page crop, 2014 P2 Q37) is a complete list. */
  const listIIPicture =
    listII.length === 1 &&
    extractMathpixImageUrls(String(listII[0]?.text ?? '')).length > 0 &&
    !plainWords(listII[0]?.text).size
  if (listII.length < 2 && !listIIPicture) out.push('List-II is not drawn as a list')

  for (const [name, row] of rows) {
    const body = String(row?.text ?? '').trim()
    if (!body) out.push(`row (${labelOf(row)}) of ${name} is empty`)
    else if (ROW_HEADING_RE.test(body)) out.push(`row (${labelOf(row)}) of ${name} starts with a List heading`)
  }

  for (const [name, list] of [['List-I', listI], ['List-II', listII]]) {
    const labels = list.map(labelOf).filter(Boolean)
    if (labels.length < 2) continue
    const kind = labelKind(labels)
    if (kind === 'mixed') out.push(`${name} mixes row labels (${labels.join(', ')}); rows of the other list are inside it`)
    else if (kind !== 'other') {
      const gap = gapIn(labels, kind)
      if (gap) out.push(`row (${gap}) is missing from ${name}`)
    }
    const seen = new Map()
    for (const row of list) {
      const key = rowKey(row?.text)
      if (key.length < 2) continue
      const first = seen.get(key)
      if (first != null) out.push(`rows (${first}) and (${labelOf(row)}) of ${name} are the same`)
      else seen.set(key, labelOf(row))
    }
  }
  const kindI = labelKind(listI.map(labelOf).filter(Boolean))
  const kindII = labelKind(listII.map(labelOf).filter(Boolean))
  if (listII.length >= 2 && kindI === kindII && kindI !== 'other' && kindI !== 'mixed') {
    out.push('List-I and List-II use the same row labels; one list holds rows of the other')
  }

  const allLabels = new Set(rows.map(([, row]) => labelOf(row)))
  for (const [name, row] of rows) {
    const body = String(row?.text ?? '')
    const inner = [...body.matchAll(/\n[ \t]*\(\s*([A-Z]|\d|[IVX]{1,4})\s*\)/g)].map((m) => m[1])
    const other = inner.find((l) => l !== labelOf(row) && allLabels.has(l))
    if (other) out.push(`row (${labelOf(row)}) of ${name} also holds row (${other})`)
  }

  const pictureRow = new Map()
  for (const [, row] of rows) {
    for (const url of extractMathpixImageUrls(String(row?.text ?? ''))) {
      const first = pictureRow.get(url)
      if (first != null && first !== labelOf(row)) out.push(`rows (${first}) and (${labelOf(row)}) show the same picture`)
      else pictureRow.set(url, labelOf(row))
    }
  }

  const codes = codeLabels(card?.options)
  if (codes) {
    const leftHave = new Set(listI.map(labelOf))
    const rightHave = new Set(listII.map(labelOf))
    const leftMissing = [...codes.left].filter((l) => !leftHave.has(l))
    const rightMissing = listII.length >= 2 ? [...codes.right].filter((l) => !rightHave.has(l)) : []
    if (leftMissing.length) out.push(`the answer codes name row (${leftMissing.join(', ')}), which List-I does not show`)
    if (rightMissing.length) out.push(`the answer codes name row (${rightMissing.join(', ')}), which List-II does not show`)
  }
  return [...new Set(out)]
}
