/**
 * Paper-level card damage a one-card check cannot see: the same question on two cards,
 * another question's text inside a card, and a printed question number left on the stem.
 * Repeated number labels alone are not damage (Approve renumbers them). Pure functions only.
 */

import { labelNumberedQuestions } from './numberedQuestionMarkers.js'

let labelledCache = { src: '', out: '' }

function labelledOcr(ocr) {
  const src = String(ocr ?? '')
  if (src.length < 80) return ''
  if (labelledCache.src !== src) labelledCache = { src, out: labelNumberedQuestions(src) }
  return labelledCache.out
}

const isPlaceholder = (q) => !q || typeof q !== 'object' || q.placeholder === true

function plainWords(text) {
  return String(text ?? '')
    .replace(/<smiles\b[\s\S]*?<\/smiles>/gi, ' ')
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .toLowerCase()
    .match(/[a-z]{2,}/g) || []
}

function filledOptions(q) {
  return (Array.isArray(q?.options) ? q.options : [])
    .map((o) => plainWords(o).join(' ') || String(o ?? '').replace(/\s+/g, '').toLowerCase())
    .filter(Boolean)
}

/** First 90 characters with the math kept (spacing, braces and $ dropped); '' under 8 words. */
const openingKey = (text, length = 90) => {
  if (plainWords(text).length < 8) return ''
  return String(text ?? '')
    .replace(/<smiles\b[\s\S]*?<\/smiles>/gi, ' ')
    .replace(/\\includegraphics(?:\[[^\]]*\])?\{[^}]*\}/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\\(?:left|right|mathrm|mathbf|text|operatorname)\b/g, '')
    .replace(/\\[,;:! ]/g, '')
    .replace(/[\s${}~]/g, '')
    .toLowerCase()
    .slice(0, length)
}

const Q_MARKER_RE =
  /(?:\\item\s*\[\s*Q\.?\s*\]\s*\d{1,3}|\\item\s*\[\s*Q\.?\s*\d{1,3}\s*\]|(?<![A-Za-z\\])Q\s*\.\s*\d{1,3})(?!\d)/g

/** How many printed questions open with each 12-word opening; null when the scan has too few markers. */
function scanOpeningCounts(labelled) {
  const marks = [...String(labelled ?? '').matchAll(Q_MARKER_RE)]
  if (marks.length < 2) return null
  /** @type {Map<string, number>} */
  const counts = new Map()
  marks.forEach((m, k) => {
    const from = (m.index ?? 0) + m[0].length
    const to = k + 1 < marks.length ? marks[k + 1].index ?? labelled.length : labelled.length
    const key = openingKey(labelled.slice(from, Math.min(to, from + 600)))
    if (key) counts.set(key, (counts.get(key) || 0) + 1)
  })
  return counts
}

/**
 * Two cards with the same opening (12 words, at least 8). The scan settles it: an opening it
 * prints for two questions (paired match questions) is allowed twice. Without the scan, the
 * same choices (or a card with no choices) make it a duplicate.
 */
function duplicateOf(questions, labelled) {
  const scan = scanOpeningCounts(labelled)
  /** @type {Map<number, number>} */
  const out = new Map()
  /** @type {Map<string, number[]>} */
  const seen = new Map()
  questions.forEach((q, i) => {
    if (isPlaceholder(q)) return
    const key = openingKey(q.text)
    if (!key) return
    const before = seen.get(key) || []
    seen.set(key, [...before, i])
    if (!before.length) return
    // A grid's stem is the section's "Match the entries…" line; its rows are the question.
    if (hasGridRows(q)) {
      const same = before.find((k) => wholeCardWords(questions[k]) === wholeCardWords(q))
      if (same !== undefined) out.set(i, same)
      return
    }
    if (scan) {
      if (before.length + 1 > Math.max(1, scan.get(key) || 0, timesPrinted(labelled, key))) out.set(i, before[0])
      return
    }
    const first = questions[before[0]]
    const a = filledOptions(first)
    const b = filledOptions(q)
    if (a.length >= 2 && b.length >= 2) {
      if (b.filter((o) => a.includes(o)).length >= 2) out.set(i, before[0])
      return
    }
    if (wholeCardWords(first) === wholeCardWords(q)) out.set(i, before[0])
  })
  return out
}

const hasGridRows = (q) => Array.isArray(q?.matrixRows) && q.matrixRows.some((row) => String(row ?? '').trim())

let printedCache = { src: '', flat: '' }

/**
 * How often the scan prints an opening anywhere, not only right after a "Q. N" marker. Generic
 * stems ("Which of the following is the only CORRECT combination?", "Match the entries in
 * Column I…") follow a paragraph or a list, so the marker count misses them (2019 P2 Q51–Q53).
 */
function timesPrinted(labelled, key) {
  if (!key) return 0
  if (printedCache.src !== labelled) {
    printedCache = { src: labelled, flat: openingKey(labelled, Infinity) }
  }
  let n = 0
  for (let at = printedCache.flat.indexOf(key); at >= 0; at = printedCache.flat.indexOf(key, at + key.length)) n += 1
  return n
}

/** Stem plus any grid rows, so two "Match the entries…" grids with different rows differ. */
function wholeCardWords(q) {
  const rows = [q?.matrixRows, q?.matrixCols].flatMap((list) => (Array.isArray(list) ? list : []))
  return plainWords([q?.text, ...rows].map((part) => String(part ?? '')).join(' ')).join(' ')
}

const LEAK_START_RE = /(?:^|\n|\}[ \t]+)[ \t]*(?:Q\s*\.\s*)?(\d{1,3})\s*[.)]?[ \t]+([A-Za-z][^\n]{20,})/g
const ANSWER_THEN_MORE_RE = /(?:^|\s)(?:\\section\*?\{\s*)?Answer\s*[:\-]?\s*\(\s*[A-D]\s*\)\s*\}?\s+\S[\s\S]{11,}/

/** Printed number of another question whose opening sits inside this card (the scan confirms it). */
function leakedQuestionNumber(q, labelled) {
  if (!labelled) return 0
  const parts = [String(q?.text ?? ''), ...(Array.isArray(q?.options) ? q.options : []).map((o) => String(o ?? ''))]
  for (let p = 0; p < parts.length; p += 1) {
    for (const m of parts[p].matchAll(LEAK_START_RE)) {
      if (p === 0 && !parts[p].slice(0, m.index).trim()) continue
      const chunk = m[2].slice(0, 24)
      if (labelled.includes(`Q. ${m[1]} ${chunk}`)) return Number(m[1])
    }
  }
  return 0
}

/**
 * @param {unknown[]} questions
 * @param {unknown} ocr stored OCR (Hindi already removed)
 * @returns {Map<number, string>} card index → reason
 */
export function officialPyqStructureDamage(questions, ocr) {
  const list = Array.isArray(questions) ? questions : []
  /** @type {Map<number, string>} */
  const out = new Map()
  if (list.length < 2) return out
  const labelled = labelledOcr(ocr)
  const dup = duplicateOf(list, labelled)
  list.forEach((q, i) => {
    if (isPlaceholder(q) || q.adminApproved === true) return
    const text = String(q.text ?? '')
    if (dup.has(i)) {
      out.set(i, `The same question is also on Q ${Number(dup.get(i)) + 1}`)
      return
    }
    const leaked = leakedQuestionNumber(q, labelled)
    if (leaked) {
      out.set(i, `Text of printed question ${leaked} is inside this card`)
      return
    }
    if ([text, ...(Array.isArray(q.options) ? q.options : [])].some((part) => ANSWER_THEN_MORE_RE.test(String(part ?? '')))) {
      out.set(i, 'A printed answer line is inside this card, with more text after it')
      return
    }
    const lead = text.match(/^\s*(\d{1,3})\s*[.)](?:[ \t]*(?:\n|$)|[ \t]+(?=[A-Za-z$\\]))/)
    if (lead && (/\n|^\s*\d{1,3}\s*[.)]\s*$/.test(lead[0]) || Number(lead[1]) === Number(q.printedNumber))) {
      out.set(i, 'The card text starts with its printed question number')
    }
  })
  return out
}
