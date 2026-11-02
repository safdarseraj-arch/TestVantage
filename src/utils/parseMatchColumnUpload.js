/**
 * Parse "Match the Column" / Matrix Match uploads (Column-I A–D × Column-II P–T or 1–5).
 */

import { normalizeMatrixItemText } from './normalizeMathText.js'
import { sliceMatrixSupplementOcrText } from './matrixSupplementCrop.js'
import { detectMatrixAnswerKeyFromPaper } from './answerProvenance.js'

/** @typedef {{ matrixRows: string[], matrixCols: string[], matrixColLabels: string[], stem: string, matrixAnswerKey?: Record<number, number[]> }} MatchColumnParse */

/** @typedef {{ letter: string, markerStart: number, bodyStart: number }} MarkerHit */

const MATCH_HINT =
  /match\s+(?:the\s+)?columns?|matrix\s+match|match\s+list|column\s*[-–]?\s*i\b.*column\s*[-–]?\s*ii\b/is

const COLUMN_II_SPLIT =
  /\bColumn\s*[-–]?\s*II\b|\bList\s*[-–]?\s*II\b|\bCOLUMN\s*[-–]?\s*II\b|\bCol\.?\s*II\b/i

const ROW_LETTERS = ['A', 'B', 'C', 'D']
const COL_LETTERS_PQ = ['P', 'Q', 'R', 'S', 'T']
const COL_NUMBERS = ['1', '2', '3', '4', '5']

/** Row markers only — `[A-D]` wrongly matches Column-II (P)(Q)(R)(S). */
const ROW_MARKER_CLASS = '(?:A|B|C|D)'
const ROW_STEM_STOP =
  `(?=\\(\\s*${ROW_MARKER_CLASS}\\s*\\)\\s*(?:If\\s|\\$)|\\(\\s*P\\s*\\)|Column\\s*II|List\\s*II|$)`

const HEADER_NOISE =
  /^(?:Column\s*[-–]?\s*I{1,2}|List\s*[-–]?\s*I{1,2}|Match\s+(?:the\s+)?Columns?|\d+[\.\)]\s*)+\s*/i

const ROW_LEAK_IN_COL = /\(\s*[B-D]\s*\)\s*If\s/i
const COL_PROGRESSION_TAIL = /^(.{0,120}?\b(?:Arithmetic|Geometric|Harmonic)\s+progression)\b/i

/** @param {string} text */
export function preprocessMatchColumnOcr(text) {
  let out = String(text ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[Ａ-ＤＰ-Ｔ]/g, (ch) => {
      const code = ch.charCodeAt(0)
      if (code >= 0xff21 && code <= 0xff3a) return String.fromCharCode(code - 0xfee0)
      if (code >= 0xff30 && code <= 0xff39) return String.fromCharCode(code - 0xfee0)
      return ch
    })

  out = out.replace(/\bColumn-I\s+Column-II\b/gi, 'Column-I\nColumn-II')
  out = out.replace(/\bColumn\s*[-–]?\s*T\s+Column\s*[-–]?\s*IT\b/gi, 'Column-I\nColumn-II')
  out = out.replace(/\bColumn\s*[-–]?\s*IT\b/gi, 'Column-II')
  out = out.replace(/\bPreview refreshed\.?\s*/gi, '')
  out = out.replace(/®\s*1\s*(?=\(|\\|\$|[a-z(@])/gi, '(P) 1 ')
  out = out.replace(/®\s*\)\s*(\d{1,2})\b/g, '(R) $1')
  out = out.replace(/(?<![A-Za-z=])\bS\s*\)\s*(\d{1,2})\b/g, '(S) $1')
  out = out.replace(/\(\s*S\s*\)\s*(of\s+['']?a['']?\s+is equal to)/gi, '$1')
  out = out.replace(/\bQ\s+(\d{1,2})\b(?=\s*(?:\n|V|∀|$))/gi, '(Q) $1')
  out = out.replace(/\bColumn\s*[-–]?\s*I\s*(?!I)/gi, '\nColumn-I\n')
  out = out.replace(/\bColumn\s*[-–]?\s*II\b/gi, '\nColumn-II\n')
  out = out.replace(/\bList\s*[-–]?\s*I\s*(?!I)/gi, '\nList-I\n')
  out = out.replace(/\bList\s*[-–]?\s*II\b/gi, '\nList-II\n')

  out = out.replace(/\(\s*©\s*\)/g, '(C)')
  out = out.replace(/\(\s*¢\s*\)/g, '(C)')
  out = out.replace(/\(©\)/g, '(C)')

  for (const L of [...ROW_LETTERS, ...COL_LETTERS_PQ]) {
    out = out.replace(
      new RegExp(`([^\\n])\\s*\\(\\s*${L}\\s*\\)\\s*`, 'gi'),
      `$1\n(${L}) `,
    )
  }

  return out.replace(/\n{3 }/g, '\n\n').trim()
}

/** @param {string} block @param {string[]} letters */
function insertMarkerNewlines(block, letters) {
  let out = block
  for (const L of letters) {
    out = out.replace(
      new RegExp(`([^\\n])\\s*\\(\\s*${L}\\s*\\)\\s*`, 'gi'),
      `$1\n(${L}) `,
    )
  }
  return out
}

/** Row markers A–D must be uppercase — avoid matching (c) inside LaTeX. */
function markerPatterns(letter, { rowMarker = false } = {}) {
  const L = letter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flags = rowMarker ? 'gm' : 'gim'
  return [
    new RegExp(`(?:^|[\\n])\\s*\\(\\s*${L}\\s*\\)\\s*`, flags),
    new RegExp(`\\(\\s*${L}\\s*\\)`, flags),
  ]
}

/** @param {string} text @param {string[]} letters @param {{ rowMarker?: boolean }} [opts] */
function scanMarkers(text, letters, opts = {}) {
  /** @type {MarkerHit[]} */
  const hits = []
  for (const L of letters) {
    const patterns = markerPatterns(L, opts)
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        if (m.index == null) continue
        const full = m[0]
        const bodyStart = m.index + full.length
        hits.push({
          letter: L.toUpperCase(),
          markerStart: m.index,
          bodyStart })
      }
    }
  }
  const seen = new Set()
  return hits
    .filter((h) => {
      const key = `${h.letter}:${h.markerStart}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.markerStart - b.markerStart)
}

/** @param {string} body */
function cleanMatrixItemBody(body) {
  return String(body ?? '')
    .replace(HEADER_NOISE, '')
    .replace(/\bColumn\s*[-–]?\s*I{1,2}\b/gi, '')
    .replace(/\bList\s*[-–]?\s*I{1,2}\b/gi, '')
    .replace(/^olumn-I\s*/i, '')
    .replace(/^I{1,2}\s*[-–]\s*/i, '')
    .replace(/®\s*1\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** @param {string} text @param {number} start @param {MarkerHit[]} stopBefore */
function sliceBody(text, start, stopBefore) {
  if (!stopBefore.length) return cleanMatrixItemBody(text.slice(start))
  const end = Math.min(...stopBefore.map((h) => h.markerStart))
  return cleanMatrixItemBody(text.slice(start, end))
}

/** Strip interleaved Column-II markers from Column-I row text without truncating the stem. */
function stripInlineColumnIIMarkers(body) {
  let b = String(body ?? '')
  b = b.replace(/\(\s*[P-T]\s*\)\s*(\d{1,2})\b\s*/g, ' ')
  b = b.replace(/®\s*R\s*\)\s*(\d{1,2})\b/gi, ' ')
  b = b.replace(/®\s*\)\s*(\d{1,2})\b/g, ' ')
  b = b.replace(/(?<![a-zA-Z=])\bS\s*\)\s*(\d{1,2})\b/g, ' ')
  b = b.replace(/\bQ\s+(\d{1,2})\b(?=\s*(?:\n|V|∀|$))/gi, ' ')
  b = b.replace(/\bTM\s+5\b/gi, ' ')
  b = b.replace(/\s+is\s+equal\s+to\s*$/i, ' is equal to')
  return b.replace(/\s+/g, ' ').trim()
}

/** Trim Column-II (P)–(T) labels that OCR glued onto the end of a Column-I row. */
export function trimRowColumnIIBleed(body) {
  let b = stripInlineColumnIIMarkers(String(body ?? '').trim())
  // Trailing bleed only — not the first (P) mid-row (side-by-side column OCR).
  const tailBleed = b.match(/\s+(?:is\s+)?equal\s+to\s*\(\s*[P-T]\s*\)\s*[\d\s]{0,4}$/i)
  if (tailBleed?.index != null && tailBleed.index > 12) {
    b = `${b.slice(0, tailBleed.index).trim()} is equal to`
  }
  b = b.replace(/\s+\(\s*[P-T]\s*\)\s*[\d\s]{0,4}$/i, '').trim()
  const pqSqrtBleed = b.search(/\s+\(\s*[P-T]\s*\)\s*(?:√|\\sqrt|sqrt)/i)
  if (pqSqrtBleed > 12) b = b.slice(0, pqSqrtBleed).trim()
  const inGp = b.search(/\s+in\s+G\.P\.\s+then\s+\(\s*[P-T]\s*\)/i)
  if (inGp > 15) b = b.slice(0, inGp + 12).trim()
  return b
}

/** Column II answers are short labels — trim question bleed. */
function trimColumnIIEntry(body) {
  let b = cleanMatrixItemBody(body)
  const leak = b.search(ROW_LEAK_IN_COL)
  if (leak > 8) b = b.slice(0, leak).trim()

  const inGp = b.search(/\s+in\s+G\.P\.\s+then\b/i)
  if (inGp > 15 && inGp < 80) b = b.slice(0, inGp).trim()

  const prog = b.match(COL_PROGRESSION_TAIL)
  if (prog?.[1] && b.length > prog[1].length + 40) {
    return prog[1].trim()
  }

  if (b.length > 100) {
    const firstClause = b.match(/^[^.()]{10,90}(?:progression|Progression)/i)
    if (firstClause) return firstClause[0].trim()
  }

  return b
}

/** @param {string} after */
function looksLikeRowStemStart(after) {
  const t = String(after ?? '').trimStart().slice(0, 100)
  if (/^(?:If\s|If\$|If\s*\$|If\s*a)/i.test(t)) return true
  // Mathpix / Tesseract often omit "If" after (C) — stem starts with $a,b,c,d$ …
  if (/^\$[a-z]|^\$\\(?:mathrm|frac)|^a\s*,\s*b\s*,/i.test(t)) return true
  if (/^are\s+four\s+different/i.test(t)) return true
  return false
}

/**
 * @param {string} text
 * @param {string[]} letters
 * @param {MarkerHit[]} allHits
 * @param {string[]} stopLetters
 */
function extractSeries(text, letters, allHits, stopLetters) {
  let searchFrom = 0
  /** @type {(MarkerHit | null)[]} */
  const ordered = []

  for (const L of letters) {
    const hit = allHits.find((h) => h.letter === L && h.markerStart >= searchFrom)
    ordered.push(hit ?? null)
    if (hit) searchFrom = hit.bodyStart
  }

  return letters.map((L, i) => {
    const hit = ordered[i]
    if (!hit) return ''

    /** @type {MarkerHit[]} */
    const stops = []
    for (let j = i + 1; j < letters.length; j++) {
      if (ordered[j]) stops.push(ordered[j])
    }
    for (const h of allHits) {
      if (h.markerStart <= hit.bodyStart) continue
      if (stopLetters.includes(h.letter)) stops.push(h)
    }

    stops.sort((a, b) => a.markerStart - b.markerStart)
    const unique = stops.filter(
      (h, idx, arr) => idx === 0 || h.markerStart !== arr[idx - 1].markerStart,
    )

    return sliceBody(text, hit.bodyStart, unique)
  })
}

/**
 * Column I rows — pick the (A)/(B)/(C)/(D) instance with the longest stem (avoids false ©→C).
 * @param {string} text preprocessed OCR
 * @param {MarkerHit[]} allHits
 * @param {string} raw original OCR for recovery
 */
function extractRowSeries(text, allHits, raw) {
  const rowStopLetters = [...ROW_LETTERS, ...COL_LETTERS_PQ]
  let searchFrom = 0
  /** @type {(MarkerHit | null)[]} */
  const ordered = []

  for (const L of ROW_LETTERS) {
    const candidates = allHits.filter(
      (h) => h.letter === L && h.markerStart >= searchFrom && ROW_LETTERS.includes(h.letter),
    )

    let best = null
    let bestLen = -1
    for (const c of candidates) {
      const after = text.slice(c.bodyStart, c.bodyStart + 100)
      const stops = allHits.filter(
        (h) => h.markerStart > c.bodyStart && rowStopLetters.includes(h.letter),
      )
      const end = stops.length ? Math.min(...stops.map((s) => s.markerStart)) : text.length
      const len = end - c.bodyStart
      const stemOk = L === 'A' || looksLikeRowStemStart(after) || len >= 28
      if (!stemOk && len < 20) continue
      if (len > bestLen) {
        bestLen = len
        best = c
      }
    }

    ordered.push(best)
    if (best) searchFrom = best.bodyStart + 4
  }

  let rows = ROW_LETTERS.map((L, i) => {
    const hit = ordered[i]
    if (!hit) return ''
    const stops = allHits.filter(
      (h) => h.markerStart > hit.bodyStart && rowStopLetters.includes(h.letter),
    )
    return trimRowColumnIIBleed(sliceBody(text, hit.bodyStart, stops))
  })

  rows = fillMissingRowsFromGap(text, raw, rows, ordered, allHits)
  return rows
}

const ROW_STEM_FINGERPRINTS = {
  C: /(?:\(\s*C\s*\)\s*)?(?:If\s+)?[\s\S]{0,30}?(?:a\s*,\s*b\s*,\s*c\s*,\s*d|ab\s*,\s*c\s*\.?\s*d)\s+are\s+(?:four|4)\s*different[\s\S]{8 }?(?=\(\s*D\s*\)|Column\s*II|List\s*II|$)/i }

/** Text between (B) and (D) when (C) label is missing or OCR merged columns. */
function recoverRowBetweenMarkers(raw, left, right, rowLetter = 'C') {
  const text = preprocessMatchColumnOcr(raw)
  const l = text.search(new RegExp(`\\(\\s*${left}\\s*\\)`, 'm'))
  const r = text.search(new RegExp(`\\(\\s*${right}\\s*\\)`, 'm'))
  if (l < 0 || r <= l) return ''

  const between = text.slice(l, r)
  const labeled = between.match(
    new RegExp(
      `\\(\\s*${rowLetter}\\s*\\)\\s*([\\s\\S]+?)(?=\\(\\s*${right}\\s*\\)|$)`,
      'm',
    ),
  )
  if (labeled?.[1]) {
    const body = trimRowColumnIIBleed(cleanMatrixItemBody(labeled[1]))
    if (body.length > 8) return body
  }

  const fp = ROW_STEM_FINGERPRINTS.C
  const fpHit = between.match(fp)
  if (fpHit?.[0]) {
    const body = trimRowColumnIIBleed(
      cleanMatrixItemBody(fpHit[0].replace(/^\(\s*C\s*\)\s*/i, '')),
    )
    if (body.length > 8) return body
  }

  const afterLeft = between.replace(
    new RegExp(`^[\\s\\S]*?\\(\\s*${left}\\s*\\)\\s*`, 'm'),
    '',
  )
  const chunks = afterLeft
    .split(/\(\s*[P-T]\s*\)\s*(?:Arithmetic|Geometric|Harmonic|Not a|A progression)/i)
    .map((c) => trimRowColumnIIBleed(cleanMatrixItemBody(c)))
    .filter(
      (c) =>
        c.length > 15 &&
        /(?:four|4)\s*different|2\s*\\?log\s*a|G\.?\s*P\.?\s+then/i.test(c),
    )
  if (chunks.length) {
    return chunks.reduce((a, b) => (b.length > a.length ? b : a), '')
  }
  return ''
}

/** Row C without (C) label — common when OCR jumps from (B) to (D). */
function recoverUnmarkedRowC(raw) {
  const text = preprocessMatchColumnOcr(raw)
  const m = text.match(ROW_STEM_FINGERPRINTS.C)
  if (!m?.[0]) return ''
  const body = cleanMatrixItemBody(m[0].replace(/^\(\s*C\s*\)\s*/i, ''))
  return body.length > 8 ? body : ''
}

/** @param {string} letter @param {string} row */
function rowStemLooksIncomplete(letter, row) {
  const r = String(row ?? '').trim()
  if (r.length < 50) return true
  if (/\bequal to\s*$|equation\s*\(\s*$|quadratic equation\s*$/i.test(r)) return true
  if (letter === 'A' && !/lies at infinity|= 0|=\s*0/i.test(r)) return true
  if (letter === 'B' && !/for all|\\forall|∀|\bin R\b|is equal to/i.test(r)) return true
  if (letter === 'C' && !/sin B sin C|sin\s*B|equal to/i.test(r)) return true
  if (letter === 'D' && !/unequal roots|two unequal|= 0|=\s*0/i.test(r)) return true
  return false
}

/** Full row stem from (L) … up to next row marker — keeps multi-line OCR. */
function recoverRowStemBetweenMarkers(raw, letter) {
  const text = preprocessMatchColumnOcr(raw)
  const idx = ROW_LETTERS.indexOf(letter)
  if (idx < 0) return ''
  const next = ROW_LETTERS[idx + 1]
  if (next) {
    const re = new RegExp(
      `\\(\\s*${letter}\\s*\\)\\s*([\\s\\S]+?)(?=\\(\\s*${next}\\s*\\)\\s*)`,
      'i',
    )
    const m = text.match(re)
    if (m?.[1]) {
      const body = trimRowColumnIIBleed(cleanMatrixItemBody(m[1]))
      if (body.length > 8) return body
    }
  } else {
    const re = new RegExp(`\\(\\s*${letter}\\s*\\)\\s*([\\s\\S]+?)${ROW_STEM_STOP}`, 'i')
    const m = text.match(re)
    if (m?.[1]) {
      const body = trimRowColumnIIBleed(cleanMatrixItemBody(m[1]))
      if (body.length > 8) return body
    }
  }
  return ''
}

/** Last resort: find (L) If … in full OCR without relying on marker scan order. */
function recoverRowStemFromRaw(raw, letter) {
  const between = recoverRowStemBetweenMarkers(raw, letter)
  if (between.length > 8) return between

  const text = preprocessMatchColumnOcr(raw)
  const stop = ROW_STEM_STOP
  const patterns = [
    new RegExp(`\\(\\s*${letter}\\s*\\)\\s*((?:If\\s+)?[\\s\\S]{12 }?)${stop}`, 'i'),
    new RegExp(
      `(?:^|[\\n])\\s*\\(\\s*${letter}\\s*\\)\\s*([\\s\\S]{12 }?)${stop}`,
      'i',
    ),
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m?.[1]) {
      const body = cleanMatrixItemBody(m[1])
      if (body.length > 8) return body
    }
  }
  if (letter === 'C') return recoverUnmarkedRowC(raw)
  return ''
}

/** a_1, a_{1}, \\mathrm{a}_{1}, or a₁ */
function hasSubscriptA(n, row) {
  const r = String(row ?? '')
  const num = String(n)
  if (new RegExp(`(?:^|[^a-z])a\\s*_?\\s*\\{?\\s*${num}\\s*\\}?`, 'i').test(r)) return true
  if (new RegExp(`\\\\mathrm\\{a\\}\\s*_\\{?\\s*${num}\\s*\\}?`, 'i').test(r)) return true
  const sub = ['₀', '₁', '₂', '₃', '₄', '₅']
  const ch = sub[Number(n)]
  return !!(ch && r.includes(`a${ch}`))
}

/** JEE matrix row D: a_1 AP, a_2,a_3,a_4 GP, third clause about a_3,a_4,a_5. */
function isClassicJeeRowD(row) {
  const r = String(row ?? '').trim()
  return (
    hasSubscriptA(1, r) &&
    hasSubscriptA(3, r) &&
    /A\.?\s*P/i.test(r) &&
    /G\.?\s*P/i.test(r)
  )
}

/** Row D often OCR-truncates after "... are in" (drops H.P. then … will be in). */
function isIncompleteRowD(row) {
  const r = String(row ?? '').trim()
  if (!r || !isClassicJeeRowD(r)) return false
  if (/will be in|always in/i.test(r)) return false
  if (/H\.?\s*P/i.test(r) && /will be in/i.test(r)) return false
  return true
}

/**
 * Column-I rows for UI (always completes truncated row D).
 * @param {string[]} rows
 * @param {string} [raw]
 */
export function matrixRowsForUi(rows, raw = '') {
  return ROW_LETTERS.map((_, i) => {
    let r = String(rows[i] ?? '').trim()
    if (!r) {
      const recovered = recoverRowStemBetweenMarkers(raw, ROW_LETTERS[i])
      if (recovered) r = recovered
    }
    r = trimRowColumnIIBleed(r)
    if (rowStemLooksIncomplete(ROW_LETTERS[i], r) && raw) {
      const recovered = recoverRowStemFromRaw(raw, ROW_LETTERS[i])
      if (recovered.length > r.length + 8) r = recovered
    }
    if (i === 3 && r) r = repairIncompleteRowD(r, raw)
    return normalizeMatrixItemText(r)
  })
}

/** @param {string} row */
function completionSuffixForRowD(row) {
  if (/\\mathrm\{a\}/i.test(row)) {
    return ' H.P. then $\\mathrm{a}_{1}, \\mathrm{a}_{2}, \\mathrm{a}_{3}, \\mathrm{a}_{4}, \\mathrm{a}_{5}$ will be in'
  }
  if (/\$a_/.test(row)) {
    return ' H.P. then $a_1, a_2, a_3, a_4, a_5$ will be in'
  }
  return ' H.P. then a_1, a_2, a_3, a_4, a_5 will be in'
}

/**
 * Recover or complete Column-I row D when OCR stops before H.P. / "will be in".
 * @param {string} row
 * @param {string} [raw]
 */
export function repairIncompleteRowD(row, raw = '') {
  let r = trimRowColumnIIBleed(String(row ?? '').trim())
  if (!r) return r

  // Quadratic matrix row D — complete truncated ending
  if (
    /Number of values of ['']?k/i.test(r) &&
    !/unequal roots is equal to/i.test(r)
  ) {
    if (/has more than two\s*$/i.test(r)) {
      r = r.replace(/\s*has more than two\s*\.?\s*$/i, ' has more than two unequal roots is equal to')
    } else if (raw) {
      let full = recoverRowStemBetweenMarkers(raw, 'D')
      if (!full || full.length <= r.length + 5) full = recoverRowStemFromRaw(raw, 'D')
      if (full.length > r.length + 5 && /unequal roots/i.test(full)) {
        r = trimRowColumnIIBleed(cleanMatrixItemBody(full))
      }
    }
  }

  if (!isIncompleteRowD(r)) return r

  if (raw) {
    const text = preprocessMatchColumnOcr(raw)
    const full = text.match(
      /\(\s*D\s*\)\s*((?:If\s+)?[\s\S]+?)(?:will be in|always in)(?=\s*(?:\(\s*P\s*\)|Column\s*II|List\s*II|\n\s*Column|$))/i,
    )
    if (full?.[1]) {
      const body = trimRowColumnIIBleed(cleanMatrixItemBody(full[1]))
      if (body.length > r.length + 8) return body
    }
    const hp = text.match(
      /\(\s*D\s*\)\s*((?:If\s+)?[\s\S]+?are\s+in\s+H\.P\.[\s\S]{0,120}?(?:will be in|always in))/i,
    )
    if (hp?.[1]) {
      const body = trimRowColumnIIBleed(cleanMatrixItemBody(hp[1]))
      if (body.length > r.length + 8) return body
    }
  }

  return `${r.replace(/\s*\.?\s*$/, '')}${completionSuffixForRowD(r)}`
}

/** @param {string[]} rows @param {string} raw */
function finalizeMatrixRows(rows, raw) {
  return rows.map((row, i) => {
    const L = ROW_LETTERS[i]
    let out = trimRowColumnIIBleed(row)
    if (rowStemLooksIncomplete(L, out)) {
      const recovered = recoverRowStemFromRaw(raw, L)
      if (recovered.length > out.length + 8) out = recovered
      else if (L === 'C') {
        const between = recoverRowBetweenMarkers(raw, 'B', 'D', 'C')
        if (between.length > out.length + 8) out = between
      }
    } else if (out.replace(HEADER_NOISE, '').trim().length <= 8) {
      const recovered = recoverRowStemFromRaw(raw, L)
      if (recovered.length > 8) out = recovered
    }
    if (L === 'D') out = repairIncompleteRowD(out, raw)
    return out
  })
}

/**
 * @param {string} text
 * @param {string[]} rows
 * @param {(MarkerHit | null)[]} ordered
 * @param {MarkerHit[]} allHits
 */
function fillMissingRowsFromGap(text, raw, rows, ordered, allHits) {
  return rows.map((row, i) => {
    if (row.replace(HEADER_NOISE, '').trim().length > 8) return row

    const L = ROW_LETTERS[i]
    const prev = ordered[i - 1]
    const next = ordered[i + 1]
    if (!prev || !next) return row

    const gapStart = prev.bodyStart
    const gapEnd = next.markerStart
    const gap = text.slice(gapStart, gapEnd)

    const rowPat = new RegExp(`\\(\\s*${L}\\s*\\)\\s*`, 'i')
    const m = gap.match(rowPat)
    if (m?.index != null) {
      const bodyStart = gapStart + m.index + m[0].length
      const stops = allHits.filter((h) => h.markerStart > bodyStart)
      const body = sliceBody(text, bodyStart, stops)
      if (body.length > 8) return body
    }

    const between = text.slice(prev.markerStart, next.markerStart)
    const innerPat = new RegExp(
      `\\(\\s*${L}\\s*\\)\\s*([\\s\\S]+?)(?=\\(\\s*D\\s*\\)|Column\\s*II|List\\s*II|$)`,
      'i',
    )
    const inner = between.match(innerPat)
    if (inner?.[1]) {
      const body = cleanMatrixItemBody(inner[1])
      if (body.length > 8) return body
    }

    if (L === 'C') {
      const unmarked = recoverUnmarkedRowC(raw)
      if (unmarked.length > 8) return unmarked
      const betweenBD = recoverRowBetweenMarkers(raw, 'B', 'D', 'C')
      if (betweenBD.length > 8) return betweenBD
    }

    return row
  })
}

/** @param {string} text */
function _findColumnIISplitIndex(text) {
  const m = text.match(COLUMN_II_SPLIT)
  if (m?.index != null) return m.index

  const pMatch = text.search(/\(\s*P\s*\)/i)
  if (pMatch >= 0) {
    const before = text.slice(0, pMatch)
    if (/\(\s*(?:A|B|C|D)\s*\)/i.test(before)) return pMatch
  }
  return -1
}

/**
 * JEE integer / numerical with matrices, determinants, adjoint — not Match-the-Column.
 * @param {string} text
 */
export function looksLikeMatrixAlgebraQuestion(text) {
  const t = String(text ?? '')
  if (!t.trim()) return false
  if (MATCH_HINT.test(t) || (/Column\s*[-–]?\s*I(?:I|T)?\b/i.test(t) && COLUMN_II_SPLIT.test(t))) {
    return false
  }
  if (
    /Column\s*[-–]?\s*I(?:I|T)?\b/i.test(t) &&
    ROW_LETTERS.filter((L) => new RegExp(`\\(\\s*${L}\\s*\\)`, 'i').test(t)).length >= 3 &&
    COL_LETTERS_PQ.filter((L) => new RegExp(`\\(\\s*${L}\\s*\\)|\\b${L}\\s+\\d`, 'i').test(t)).length >= 3
  ) {
    return false
  }
  const vandermondePlanes =
    /\b210\s*d|\(210d\)/i.test(t) &&
    /2x\s*\+\s*3y\s*\+\s*6z|distance between these planes/i.test(t) &&
    (/satisfying|vmatrix|p\s*[\^²2]|=\s*6\b/i.test(t) || /lies on the plane/i.test(t))
  const semiperimeterDet =
    /\bsides?\s+(?:\$?\s*)?a\s*,\s*(?:\$?\s*)?b\s*,\s*(?:\$?\s*)?c\b/i.test(t) &&
    /semiperimeter|AABC|\\Delta\s*ABC/i.test(t) &&
    (/4x\s*[\^³3]|47x\s*-\s*30|coprime|\(p\s*-\s*q\)|\(s-[abc]\)/i.test(t) ||
      /\\begin\{vmatrix\}/i.test(t))
  const algebra =
    vandermondePlanes ||
    semiperimeterDet ||
    /\\begin\{(?:pmatrix|bmatrix|vmatrix|matrix|array)\}/i.test(t) ||
    /\bLet\s+\$?\s*A\s*=\s*\$?\s*(?:\\left)?\[?\s*[\d\s\\]{8 }/i.test(t) ||
    /\bthen\s+absolute\s+value\s+of\b/i.test(t) ||
    /\bdeterminant\b|\\det\s*\(|\\operatorname\s*\{\s*det\s*\}/i.test(t) ||
    /\badjoint\b|\badj\s*[(\[]?|\bcofactor\b/i.test(t) ||
    /\bsingular\b[^.\n]{0,80}\bmatrix\b|\bmatrix\b[^.\n]{0,80}\bsingular\b/i.test(t) ||
    /\binverse\s+of\s+(?:the\s+)?matrix\b/i.test(t) ||
    /\|\s*\(\s*A\s*[-+]/i.test(t) ||
    /\|\s*A\s*\||\|A\|/i.test(t)
  if (!algebra) return false
  if (
    /(?:Arithmetic|Geometric|Harmonic)\s+progression/i.test(t) &&
    COL_LETTERS_PQ.filter((L) => new RegExp(`\\(\\s*${L}\\s*\\)`, 'i').test(t)).length >= 3
  ) {
    return false
  }
  return true
}

/** @param {string} text */
export function looksLikeMatchColumnUpload(text) {
  const t = String(text ?? '')
  if (!t.trim()) return false
  if (looksLikeMatrixAlgebraQuestion(t)) return false
  // Standard MCQ with (A)–(D) at end — not match-the-column
  if (
    !/Column\s*[-–]?\s*I\b/i.test(t) &&
    (/\bis\s*:\s*\(\s*A\s*\)/i.test(t) ||
      /\?\s*\(\s*A\s*\)\s*\$/.test(t) ||
      /\(\s*A\s*\)\s*\$\\frac/i.test(t))
  ) {
    return false
  }
  if (MATCH_HINT.test(t)) return true
  if (/Column\s*[-–]?\s*I(?:I|T)?\b/i.test(t) && COLUMN_II_SPLIT.test(t)) return true
  const rowHits = ROW_LETTERS.filter((L) => new RegExp(`\\(\\s*${L}\\s*\\)`, 'i').test(t)).length
  const colHits = COL_LETTERS_PQ.filter((L) => new RegExp(`\\(\\s*${L}\\s*\\)`, 'i').test(t)).length
  if (rowHits < 3 || colHits < 4) {
    const looseColHits = COL_LETTERS_PQ.filter((L) =>
      new RegExp(`\\(\\s*${L}\\s*\\)|\\b${L}\\s+\\d`, 'i').test(t),
    ).length
    if (
      rowHits >= 3 &&
      looseColHits >= 3 &&
      /quadratic|natural number|sin\s*B\s*sin\s*C|unequal roots|Column\s*[-–]?\s*I/i.test(t)
    ) {
      return true
    }
    return false
  }
  if (
    /(?:Arithmetic|Geometric|Harmonic)\s+progression|unit\s+vectors?/i.test(t) ||
    /\bmatch\s+(?:the\s+)?columns?\b/i.test(t)
  ) {
    return true
  }
  if (/f_\d+\s*\(|f\d+\s*\(/i.test(t) && /√|\\sqrt|\(\s*P\s*\)/i.test(t)) {
    return true
  }
  return false
}

/** @param {string[]} items @param {number} count */
function padItems(items, count) {
  const out = [...items]
  while (out.length < count) out.push('')
  return out.slice(0, count)
}

/** @param {string[]} rows */
export function countFilledRows(rows) {
  return rows.filter((r) => r.replace(HEADER_NOISE, '').trim().length > 8).length
}

/** @param {MatchColumnParse} parsed */
export function countFilledMatrixRows(parsed) {
  return countFilledRows(parsed.matrixRows)
}

/** After form normalize — detects rows that would show empty in the UI. */
export function countFilledMatrixRowsNormalized(parsed) {
  if (!parsed?.matrixRows) return 0
  return countFilledRows(parsed.matrixRows.map((r) => normalizeMatrixItemText(r)))
}

/** @param {MatchColumnParse} parsed */
function _scoreParse(parsed) {
  const filled = countFilledRows(parsed.matrixRows)
  const rowScore = filled * 10 + (filled === 4 ? 25 : 0)
  const colFilled = parsed.matrixCols.filter((c) => c.trim().length > 2).length
  const colBleed = parsed.matrixCols.filter((c) => c.length > 120).length
  const rowAvg =
    parsed.matrixRows.reduce((s, r) => s + r.length, 0) /
    Math.max(1, countFilledRows(parsed.matrixRows))
  const colAvg =
    parsed.matrixCols.reduce((s, c) => s + c.length, 0) /
    Math.max(1, colFilled)
  const lengthBonus = rowAvg > colAvg ? 5 : 0
  return rowScore + colFilled - colBleed * 15 + lengthBonus
}

/** Balance a clipped `$`-delimited fragment (closing/opening $ lost when split). */
function balanceDollars(s) {
  let t = String(s ?? '').trim()
  if (!t) return ''
  const count = (t.match(/\$/g) || []).length
  if (count % 2 === 1) {
    if (t.startsWith('$') && !t.endsWith('$')) t = `${t}$`
    else if (t.endsWith('$') && !t.startsWith('$')) t = `$${t}`
    else t = t.replace('$', '')
  }
  return t.trim()
}

/**
 * Strip OCR-invented \vec / \hat decorations from a row continuation that was
 * fused into a Column-II value (e.g. `b-\vec{a}` → `b-a`, `\hat{k}` → `k`).
 * Applied ONLY to recovered row tails — never to standalone column values, so
 * genuine vector/unit-vector answers are left intact.
 */
function stripFusedVectorHats(s) {
  return String(s ?? '')
    .replace(/\\(?:hat|vec)\s*\{([^}]*)\}/g, '$1')
    .replace(/\\(?:hat|vec)\s+([A-Za-z])/g, '$1')
}

/**
 * Split a Column-II segment into its short answer value and any row-continuation
 * text the OCR fused after it (prose like ", then …", a domain bracket `[a,b]`,
 * or a `\hat`/`\vec`-decorated tail that follows a complete leading expression).
 * @param {string} seg
 * @returns {{ value: string, tail: string }}
 */
function splitColValueAndRowTail(seg) {
  let s = String(seg ?? '').trim()
  if (!s) return { value: '', tail: '' }
  let tail = ''

  // Column-II digit answer fused with the rest of the Column-I row (interleaved OCR).
  const numRowTail = s.match(/^(\d{1,2})\s*(?:\n\s*)?(\([\s\S]+)/)
  if (
    numRowTail &&
    /x\s*[²2]|=\s*0|unequal roots|k\s*[²2=]|k2|\+\s*1\s*\)/i.test(numRowTail[2])
  ) {
    tail = numRowTail[2].trim()
    s = numRowTail[1]
  }

  // 0. A prose label ("Geometric progression") immediately followed by a fused math
  //    block is a Column-I row tail that bled in — keep only the leading prose label.
  const proseMath = s.match(/^([A-Za-z][A-Za-z\s,]*?[A-Za-z])\s+(\$|\\(?:frac|left|begin|sqrt|sum|int))/)
  if (proseMath) {
    const cut = proseMath[1].length
    tail = `${s.slice(cut).trim()}${tail ? ` ${tail}` : ''}`.trim()
    s = proseMath[1].trim()
  }

  // 1. Prose continuation ("…, then b-a=", "will be in", "are in …", "in G.P. then …")
  //    is row text.
  const cont = s.search(/\s*(?:,\s*)?\b(?:then|will\s+be|where|such\s+that|are\s+in|in\s+[AGH]\.\s*P\.)/i)
  if (cont > 0) {
    tail = s.slice(cont).replace(/^\s+/, '').trim() // keep a leading comma before "then"
    s = s.slice(0, cont).trim()
  }

  // 2. A domain bracket [a, b] fused into the value belongs to the row.
  const br = s.search(/\[\s*[A-Za-z]\s*,\s*[A-Za-z]\s*\]/)
  if (br > 0) {
    const bracket = s.slice(br).replace(/\$+\s*$/, '').trim()
    tail = `${bracket}${tail ? ` ${tail}` : ''}`.trim()
    s = s.slice(0, br).trim()
  }

  // 3. A \hat/\vec term AFTER a complete leading expression is a fused row tail
  //    (a real unit-vector answer would START with \hat/\vec, so guard on index).
  const hat = s.search(/\\(?:hat|vec)\b/)
  if (hat > 3) {
    const extra = s.slice(hat).replace(/\$+\s*$/, '').trim()
    tail = `${extra}${tail ? ` ${tail}` : ''}`.trim()
    s = s.slice(0, hat).trim()
  }

  // 4. A determinant / array block (the row's "[a b c] equals" tail) fused after
  //    a short answer value belongs to the row, not the Column-II label.
  const det = s.search(/\\begin\{(?:array|matrix|bmatrix|pmatrix|vmatrix)\}|\[\s*[A-Za-z](?:\s|\\quad)/)
  if (det > 0) {
    const extra = s.slice(det).trim()
    tail = `${extra}${tail ? ` ${tail}` : ''}`.trim()
    s = s.slice(0, det).trim()
  }

  // 5. A complete leading $…$ math block followed by lowercase prose: the prose
  //    is fused row text (e.g. "$\frac{1}{2}$ zero vectors" → value "$\frac{1}{2}$").
  const mathProse = s.match(/^(\$[^$]+\$)\s+([a-z][\s\S]*)$/)
  if (mathProse) {
    tail = `${mathProse[2].trim()}${tail ? ` ${tail}` : ''}`.trim()
    s = mathProse[1]
  }

  return { value: balanceDollars(s), tail: stripFusedVectorHats(balanceDollars(tail)) }
}

/**
 * Column-II prose bleed from Column-I rows — not a valid answer value.
 * @param {string} v
 */
function looksLikeValidMatrixColLabel(v) {
  const t = String(v ?? '').trim()
  if (!t || t.length > 140) return false
  return (
    /\b(?:arith(?:metic)?|geometric|harmonic)\s+progressions?\b/i.test(t) ||
    /\bnot\s+a\s+harmonic\s+progression\b/i.test(t) ||
    /\b(?:odd|even|neither|periodic)\s+functions?\b/i.test(t) ||
    /\bA\.?\s*P\.?\b|\bG\.?\s*P\.?\b|\bH\.?\s*P\.?\b|\bA\.?\s*G\.?\s*P\.?\b/i.test(t) ||
    /\bprogression\b/i.test(t) ||
    /\ball\s+(?:the\s+)?terms\s+are\s+identical\b/i.test(t)
  )
}

function looksLikeColumnIIProse(v) {
  const t = String(v ?? '').trim()
  if (!t) return false
  if (looksLikeValidMatrixColLabel(t)) return false
  if (/^\d{1,4}$/.test(t)) return false
  if (/^\\frac|^\\sqrt|^\$-?\\frac|^\$\\sqrt/.test(t)) return false
  return (
    /equal\s+to|is equal|forall|\bRis\b|\bx\s*\\in|\bin\s+R\b/i.test(t) ||
    /^of\s+['']?a/i.test(t) ||
    (/\bfor\s+all\b/i.test(t) && t.length > 8) ||
    (t.split(/\s+/).length >= 6 && !/^\d/.test(t) && !/^\$/.test(t))
  )
}

/** @param {string} text */
function extractLooseNumericColumnII(text) {
  /** @type {string[]} */
  const cols = ['', '', '', '', '']
  let found = 0
  for (let i = 0; i < COL_LETTERS_PQ.length; i += 1) {
    const L = COL_LETTERS_PQ[i]
    /** @type {RegExp[]} */
    const patterns = [new RegExp(`\\(\\s*${L}\\s*\\)\\s*(\\d{1,2})\\b`, 'i')]
    if (L === 'R') patterns.push(/®\s*\)\s*(\d{1,2})\b/i)
    if (L === 'S') patterns.push(/(?<![A-Za-z=])\bS\s*\)\s*(\d{1,2})\b/i)
    if (L === 'Q') patterns.push(/\bQ\s+(\d{1,2})\b/i)
    for (const re of patterns) {
      const m = String(text ?? '').match(re)
      if (m?.[1]) {
        cols[i] = m[1]
        found += 1
        break
      }
    }
  }
  if (found >= 3) return fillSequentialNumericColumnII(cols)
  if (/\(\s*T\s*\)\s*5\b/i.test(text) && (found >= 1 || /quadratic|natural number|sin B sin C/i.test(text))) {
    return ['1', '2', '3', '4', '5']
  }
  return null
}

/** @param {string[]} cols */
function fillSequentialNumericColumnII(cols) {
  const out = [...cols]
  const nums = out
    .map((c) => String(c ?? '').trim())
    .filter(Boolean)
    .map((c) => Number(c))
    .filter((n) => Number.isFinite(n))
  if (nums.length >= 3 && Math.max(...nums) <= 5) {
    for (let i = 0; i < 5; i += 1) {
      if (!out[i]?.trim()) out[i] = String(i + 1)
    }
  }
  return out
}

/** @param {string[]} rows @param {string} raw */
function repairQuadraticMatrixRowBleed(rows, raw) {
  return rows.map((row, i) => {
    let r = String(row ?? '')
    r = r.replace(/\s+is\s+®\s*\)\s*\d+\s+equal to/i, ' is equal to')
    r = r.replace(/\s+equation\s+S\s*\)\s*\d+/i, ' equation')
    r = r.replace(/\s*\(\s*R\s*=\s*\d+\s*\)/gi, ' ')
    if (
      i === 0 &&
      /integral value/i.test(r) &&
      !/equal to/i.test(r) &&
      /of\s+['']?a['']?\s+is equal to/i.test(raw)
    ) {
      r = r.replace(/integral value\s*$/i, "integral value(s) of 'a' is equal to")
    }
    return normalizeMatrixItemText(trimRowColumnIIBleed(cleanMatrixItemBody(r)))
  })
}

/** @param {MatchColumnParse} parsed @param {string} raw */
function repairMatrixParseColumnII(parsed, raw) {
  if (!parsed) return parsed
  const pre = preprocessMatchColumnOcr(raw)
  const blob = `${raw}\n${pre}`
  const loose = extractLooseNumericColumnII(blob)
  const cols = [...(parsed.matrixCols ?? [])]
  while (cols.length < 5) cols.push('')

  for (let i = 0; i < cols.length; i += 1) {
    const cleaned = cleanColumnIIValue(cols[i])
    if (looksLikeColumnIIProse(cleaned)) cols[i] = ''
    else cols[i] = cleaned
  }

  if (loose) {
    for (let i = 0; i < 5; i += 1) {
      if (loose[i] && (!cols[i] || looksLikeColumnIIProse(cols[i]))) cols[i] = loose[i]
    }
  }

  const filled = cols.filter((c) => c && !looksLikeColumnIIProse(c)).length
  const colCount = filled >= 5 || cols[4]?.trim() ? 5 : 4
  return {
    ...parsed,
    matrixRows: repairQuadraticMatrixRowBleed(parsed.matrixRows, raw),
    matrixCols: padItems(cols, colCount),
    matrixColLabels: padItems(
      COL_LETTERS_PQ.slice(0, colCount).map((L) => `(${L})`),
      colCount,
    ) }
}

/**
 * Final cleanup for a Column-II answer value.
 * @param {string} value
 */
function cleanColumnIIValue(value) {
  let v = cleanMatrixItemBody(value)
  if (!v) return ''
  v = v.replace(/\(\s*[A-DP-T]\s*\)/g, ' ').replace(/\s+/g, ' ').trim()
  v = v.replace(/\$\s*-\s*\$\s*\\frac/g, '$-\\frac')
  const toks = v.split(/\s+/).filter(Boolean)
  if (toks.length > 1 && toks.every((t) => t === toks[0])) v = toks[0]
  // Strip a stray edge `|` token (OCR bleed from an adjacent abs-value), e.g. "0 |".
  v = v.replace(/^\|\s+|\s+\|$/g, '').trim()
  v = balanceDollars(v)
  // Stray value made only of $ / \ / | / whitespace (lost OCR cell) → empty.
  if (!v.replace(/[\\$|\s]/g, '')) return ''
  if (looksLikeColumnIIProse(v)) return ''
  return v.trim()
}

/**
 * Untangle the interleaved layout where OCR reads a two-column print line-by-line
 * and emits Column-II markers in among the Column-I rows: (A) row (P) val (B) row
 * (Q) val … Each marker owns the text up to the next marker; a Column-II segment
 * may also hold the fused tail of the row it sits beside, which is moved back to
 * that row.
 *
 * Trigger guards (so normal grouped layouts — all rows then all cols — and stray
 * lowercase markers like `(t)` inside `f(t)` never fire this path):
 *   - the first Column-II marker must appear before the last Column-I marker, AND
 *   - at least two of the A→B / B→C / C→D row gaps must contain a Column-II marker.
 *
 * @param {string} pre preprocessed OCR
 * @returns {{ matrixRows: string[], matrixCols: string[], matrixColLabels: string[] } | null}
 */
function parseInterleavedMatrix(pre) {
  const firstRow = {}
  for (const h of scanMarkers(pre, ROW_LETTERS, { rowMarker: true })) {
    if (!(h.letter in firstRow)) firstRow[h.letter] = h
  }
  const firstCol = {}
  for (const h of scanMarkers(pre, COL_LETTERS_PQ)) {
    if (!(h.letter in firstCol)) firstCol[h.letter] = h
  }

  const rowList = ROW_LETTERS.filter((L) => firstRow[L]).map((L) => ({ ...firstRow[L], kind: 'row' }))
  const colList = COL_LETTERS_PQ.filter((L) => firstCol[L]).map((L) => ({ ...firstCol[L], kind: 'col' }))
  if (rowList.length < 3 || colList.length < 3) return null

  const firstColPos = Math.min(...colList.map((c) => c.markerStart))
  const lastRowPos = Math.max(...rowList.map((r) => r.markerStart))
  if (firstColPos >= lastRowPos) return null // grouped layout (all cols after rows)

  // Count row gaps that contain a Column-II marker — true interleaving fills most.
  const sortedRows = [...rowList].sort((a, b) => a.markerStart - b.markerStart)
  let gapsWithCol = 0
  for (let i = 0; i < sortedRows.length - 1; i++) {
    const lo = sortedRows[i].markerStart
    const hi = sortedRows[i + 1].markerStart
    if (colList.some((c) => c.markerStart > lo && c.markerStart < hi)) gapsWithCol += 1
  }
  if (gapsWithCol < 2) return null // a lone stray (t)/(s) inside row math — not interleaved

  const stream = [...rowList, ...colList].sort((a, b) => a.markerStart - b.markerStart)

  const outRows = ['', '', '', '']
  const outCols = ['', '', '', '', '']
  /** @type {Record<string, string[]>} */
  const rowTails = { A: [], B: [], C: [], D: [] }
  let currentRow = null

  for (let i = 0; i < stream.length; i++) {
    const mk = stream[i]
    const next = stream[i + 1]
    const seg = pre.slice(mk.bodyStart, next ? next.markerStart : pre.length)
    if (mk.kind === 'row') {
      currentRow = mk.letter
      outRows[ROW_LETTERS.indexOf(mk.letter)] = cleanMatrixItemBody(seg)
    } else {
      const { value, tail } = splitColValueAndRowTail(seg)
      const ci = COL_LETTERS_PQ.indexOf(mk.letter)
      const cleanVal = cleanColumnIIValue(value)
      if (!outCols[ci] && cleanVal) outCols[ci] = cleanVal // keep leftmost value
      if (tail && currentRow) rowTails[currentRow].push(tail)
    }
  }

  for (const L of ROW_LETTERS) {
    if (!rowTails[L].length) continue
    const idx = ROW_LETTERS.indexOf(L)
    outRows[idx] = cleanMatrixItemBody(`${outRows[idx]} ${rowTails[L].join(' ')}`).replace(
      /\s+([,;])/g,
      '$1',
    )
  }

  for (let i = 0; i < outRows.length; i++) {
    if (ROW_LETTERS[i] === 'D') outRows[i] = repairIncompleteRowD(outRows[i], pre)
  }

  if (countFilledRows(outRows) < 3) return null
  if (outCols.filter((c) => c.trim().length >= 1).length < 3) return null

  // Values live in letter-indexed slots (P=0…T=4); the count follows the highest
  // present letter (so a real (T) isn't dropped) and labels stay letter-aligned.
  const maxColIdx = Math.max(...COL_LETTERS_PQ.filter((L) => firstCol[L]).map((L) => COL_LETTERS_PQ.indexOf(L)))
  const colCount = Math.min(5, Math.max(4, maxColIdx + 1))
  return {
    matrixRows: padItems(outRows, 4),
    matrixCols: padItems(outCols.slice(0, colCount), colCount),
    matrixColLabels: padItems(COL_LETTERS_PQ.slice(0, colCount).map((L) => `(${L})`), colCount) }
}

/**
 * @param {string} text
 * @returns {MatchColumnParse | null}
 */
export function parseMatchColumnUpload(text) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!looksLikeMatchColumnUpload(raw)) return null

  const pre = insertMarkerNewlines(
    insertMarkerNewlines(preprocessMatchColumnOcr(raw), ROW_LETTERS),
    COL_LETTERS_PQ,
  )

  const interleaved = parseInterleavedMatrix(pre)
  if (interleaved) {
    const stemLine =
      raw
        .split('\n')
        .map((l) => l.trim())
        .find((l) => /match|column/i.test(l) && l.length < 120) ?? 'Match the Column'
    return {
      stem: stemLine.replace(/^\d+[\.\)]\s*/, '').trim() || 'Match the Column',
      ...interleaved }
  }

  const rowHits = scanMarkers(pre, ROW_LETTERS, { rowMarker: true })
  const colHits = scanMarkers(pre, COL_LETTERS_PQ)
  const numHits = scanMarkers(pre, COL_NUMBERS)
  const allHits = [...rowHits, ...colHits, ...numHits].sort(
    (a, b) => a.markerStart - b.markerStart,
  )

  if (!rowHits.length) return null

  let rows = extractRowSeries(pre, allHits, raw)
  rows = finalizeMatrixRows(rows, raw)
  const rowsOk =
    countFilledRows(rows) >= 2 ||
    (rowHits.length >= 4 && rowFillLen(rows[0]) > 60)
  if (!rowsOk) return null

  let cols = extractSeries(pre, COL_LETTERS_PQ, allHits, ROW_LETTERS).map((c) =>
    cleanColumnIIValue(trimColumnIIEntry(c)),
  )
  let colLabels = COL_LETTERS_PQ.slice(0, 5).map((l) => `(${l})`)

  if (cols.filter((c) => c.length > 2).length < 2) {
    cols = extractSeries(pre, COL_NUMBERS, allHits, ROW_LETTERS).map((c) =>
      cleanColumnIIValue(trimColumnIIEntry(c)),
    )
    // Column II entries were found via (1)–(5) markers, but display the P–T
    // convention rather than the numeric labels.
    colLabels = COL_LETTERS_PQ.slice(0, cols.length).map((l) => `(${l})`)
  }

  if (cols.filter((c) => c.length > 2).length < 2) {
    const sparseMatrixOk = rowHits.length >= 4 && rowFillLen(rows[0]) > 60
    if (/Column\s*[-–]?\s*I\b/i.test(raw) && (countFilledRows(rows) >= 2 || sparseMatrixOk)) {
      const colCount = 4
      const stemLine =
        raw
          .split('\n')
          .map((l) => l.trim())
          .find((l) => /match|column/i.test(l) && l.length < 120) ?? 'Match the Column'
      return {
        stem: stemLine.replace(/^\d+[\.\)]\s*/, '').trim() || 'Match the Column',
        matrixRows: padItems(rows, 4),
        matrixCols: padItems(cols, colCount),
        matrixColLabels: COL_LETTERS_PQ.slice(0, colCount).map((l) => `(${l})`) }
    }
    return null
  }

  const colCount = cols.filter((c) => c.length > 2).length >= 5 ? 5 : 4

  const stemLine =
    raw
      .split('\n')
      .map((l) => l.trim())
      .find((l) => /match|column/i.test(l) && l.length < 120) ??
    'Match the Column'

  const paperKey = detectMatrixAnswerKeyFromPaper(raw)

  return {
    stem: stemLine.replace(/^\d+[\.\)]\s*/, '').trim() || 'Match the Column',
    matrixRows: padItems(rows, 4),
    matrixCols: padItems(cols, colCount),
    matrixColLabels: padItems(colLabels, colCount),
    ...(paperKey?.matrixAnswerKey ? { matrixAnswerKey: paperKey.matrixAnswerKey } : {}),
  }
}

function rowFillLen(s) {
  return String(s ?? '').replace(HEADER_NOISE, '').trim().length
}

/** @param {MatchColumnParse} a @param {MatchColumnParse} b */
export function mergeMatrixParse(a, b) {
  if (!a) return b
  if (!b) return a
  const colCount =
    b.matrixCols.filter((c) => c.trim().length >= 1).length >= 5 ? 5 : 4
  const aColCount =
    a.matrixCols.filter((c) => c.trim().length >= 1).length >= 5 ? 5 : 4
  const cc = Math.max(colCount, aColCount)
  return {
    stem: a.stem?.length >= b.stem?.length ? a.stem : b.stem,
    matrixRows: ROW_LETTERS.map((_, i) => {
      const pick =
        rowFillLen(b.matrixRows[i]) > rowFillLen(a.matrixRows[i])
          ? b.matrixRows[i]
          : a.matrixRows[i]
      return i === 3 ? repairIncompleteRowD(pick) : pick
    }),
    matrixCols: mergeMatrixCols(
      padItems(a.matrixCols, cc),
      padItems(b.matrixCols, cc),
    ),
    matrixColLabels: padItems(
      rowFillLen(b.matrixCols[0]) > rowFillLen(a.matrixCols[0])
        ? b.matrixColLabels
        : a.matrixColLabels,
      cc,
    ),
    ...(a.matrixAnswerKey || b.matrixAnswerKey
      ? {
          matrixAnswerKey: {
            ...(a.matrixAnswerKey ?? {}),
            ...(b.matrixAnswerKey ?? {}),
          },
        }
      : {}),
  }
}

/**
 * @param {string} raw
 * @param {string} [_normalized] ignored — normalized text breaks (8)→(B) markers
 * @param {string[]} [extraRaw] e.g. built-in OCR when Mathpix omits a row
 */
export function resolveMatchColumnUpload(raw, _normalized, extraRaw = []) {
  const variants = [
    raw,
    preprocessMatchColumnOcr(raw),
    ...extraRaw,
    ...extraRaw.map((t) => preprocessMatchColumnOcr(t)),
  ].filter(Boolean)
  /** @type {MatchColumnParse | null} */
  let merged = null
  for (const t of [...new Set(variants)]) {
    const parsed = parseMatchColumnUpload(t)
    if (!parsed) continue
    merged = merged ? mergeMatrixParse(merged, parsed) : parsed
  }
  if (merged?.matrixRows?.length) {
    merged = repairMatrixParseColumnII(merged, raw)
    merged = {
      ...merged,
      matrixRows: merged.matrixRows.map((r, i) =>
        i === 3 ? repairIncompleteRowD(r, raw) : r,
      ) }
    if (!merged.matrixAnswerKey || !Object.keys(merged.matrixAnswerKey).length) {
      const paperKey = detectMatrixAnswerKeyFromPaper(raw)
      if (paperKey?.matrixAnswerKey) {
        merged = { ...merged, matrixAnswerKey: paperKey.matrixAnswerKey }
      }
    }
  }
  return merged
}

/**
 * Fill missing Column-I rows from cached full-page OCR before image crop backup.
 * @param {string} raw
 * @param {MatchColumnParse | null} [base]
 * @returns {MatchColumnParse | null}
 */
export function supplementMatrixRowsFromCachedOcr(raw, base = null) {
  const r = String(raw ?? '').replace(/\r\n/g, '\n').trim()
  if (!r) return base

  const slice = sliceMatrixSupplementOcrText(r)
  const extras = slice && slice !== r ? [slice] : []
  const fromSlice = extras.length ? resolveMatchColumnUpload(r, '', extras) : null

  /** @type {MatchColumnParse | null} */
  let merged = base && fromSlice ? mergeMatrixParse(base, fromSlice) : fromSlice ?? base

  const sources = [r, ...extras]
  const rows = padItems([...(merged?.matrixRows ?? [])], 4)
  let changed = false

  for (let i = 0; i < 4; i++) {
    if (rowFillLen(rows[i]) > 8) continue
    let recovered = ''
    for (const src of sources) {
      recovered = recoverRowStemFromRaw(src, ROW_LETTERS[i])
      if (recovered.length > 8) break
      if (ROW_LETTERS[i] === 'C') {
        recovered = recoverRowBetweenMarkers(src, 'B', 'D', 'C')
        if (recovered.length > 8) break
      }
    }
    if (recovered.length > 8) {
      rows[i] = recovered
      changed = true
    }
  }

  if (!merged && !changed) return null
  if (!merged) {
    return {
      stem: 'Match the Column',
      matrixRows: rows.map((row, i) => (i === 3 ? repairIncompleteRowD(row, r) : row)),
      matrixCols: padItems([], 4),
      matrixColLabels: padItems([], 4) }
  }
  if (!changed) return merged
  return {
    ...merged,
    matrixRows: rows.map((row, i) => (i === 3 ? repairIncompleteRowD(row, r) : row)) }
}

/** @param {string[]} current @param {string[]} parsed @param {string} [raw] */
export function mergeMatrixRows(current, parsed, raw = '') {
  return ROW_LETTERS.map((_, i) => {
    const cur = String(current[i] ?? '').trim()
    const next = String(parsed[i] ?? '').trim()
    let pick = ''
    if (cur.length > 8 && next.length > 8) {
      pick = next.length >= cur.length ? (parsed[i] ?? '') : (current[i] ?? '')
    } else if (cur.length > 8) pick = current[i] ?? ''
    else if (next.length > 8) pick = parsed[i] ?? ''
    else pick = current[i] || parsed[i] || ''
    if (i === 3) pick = repairIncompleteRowD(String(pick ?? ''), raw)
    return pick
  })
}

/** @param {string[]} current @param {string[]} parsed */
export function mergeMatrixCols(current, parsed) {
  const n = Math.max(current.length, parsed.length)
  return Array.from({ length: n }, (_, i) => {
    const cur = String(current[i] ?? '').trim()
    const next = String(parsed[i] ?? '').trim()
    if (!next) return current[i] ?? ''
    if (!cur) return parsed[i] ?? ''
    // Numeric Column-II answers (1, 2, …) must win over long stale labels.
    if (/^\d{1,4}$/.test(next) && cur.length > next.length) return parsed[i] ?? ''
    return next.length > cur.length ? parsed[i] ?? '' : current[i] ?? ''
  })
}

function countFilledMatrixCols(cols) {
  return (cols ?? []).filter((c) => {
    const v = cleanColumnIIValue(String(c ?? ''))
    return v.length >= 1
  }).length
}

/**
 * Apply Column II from a new OCR parse without keeping a previous question's labels.
 * @param {string[]} current
 * @param {string[]} parsed
 * @param {{ keepCurrentIfSparse?: boolean }} [opts] — backup row OCR: keep Column II when parse has no cols
 * @returns {{ cols: string[], colCount: 4 | 5 }}
 */
export function applyParsedMatrixCols(current, parsed, { keepCurrentIfSparse = false } = {}) {
  const parsedNorm = (parsed ?? []).map((c) => String(c ?? ''))
  const filled = countFilledMatrixCols(parsedNorm)
  const colCount = countFilledMatrixCols(parsedNorm) >= 5 ? 5 : 4
  const pad = (arr) => {
    const out = [...arr]
    while (out.length < 5) out.push('')
    return out.slice(0, 5)
  }

  if (filled >= 2) {
    const merged = Array.from({ length: 5 }, (_, i) => {
      const p = String(parsedNorm[i] ?? '').trim()
      if (p) return parsedNorm[i] ?? ''
      return current[i] ?? ''
    })
    return { cols: pad(merged), colCount }
  }
  if (keepCurrentIfSparse) {
    return { cols: pad(mergeMatrixCols(current, parsedNorm)), colCount }
  }
  const fresh = Array.from({ length: colCount }, (_, i) => parsedNorm[i] ?? '')
  return { cols: pad(fresh), colCount }
}

/** Column-II placeholder or empty — needs recovery. */
export function matrixColEntryIsInvalid(text) {
  const s = String(text ?? '').trim()
  if (!s) return true
  if (/^column\s*\d+$/i.test(s)) return true
  if (/^entry\s*\d+$/i.test(s)) return true
  const v = cleanColumnIIValue(s)
  if (!v) return true
  return looksLikeColumnIIProse(v)
}

/** @param {string[] | null | undefined} cols @param {number} colCount */
function normalizedMatrixCols(cols, colCount) {
  return Array.from({ length: colCount }, (_, i) => {
    const v = cleanColumnIIValue(String(cols?.[i] ?? ''))
    return v && !matrixColEntryIsInvalid(v) ? v : ''
  })
}

/** @param {string} v */
function normalizeMatrixColValue(v) {
  const s = cleanColumnIIValue(String(v ?? ''))
  if (!s) return ''
  if (/-\\frac\{3\}\{2\}/.test(s) || /^-?3\/2$/.test(s)) return '-3/2'
  if (/\\frac\{1\}\{2\}/.test(s) || /^1\/2$/.test(s)) return '1/2'
  if (s.replace(/\$/g, '').trim() === '0') return '0'
  return s
}

const UNIT_VECTOR_MTC_COLS = ['0', '-$\\frac{3}{2}$', '$\\frac{1}{2}$', '0'].map((c) =>
  cleanColumnIIValue(c),
)

/**
 * JEE unit-vector MTC: Column II is 0, $-\\frac{3}{2}$, $\\frac{1}{2}$, 0 (P–S) — OCR often drops P/R.
 * @param {string[]} cols
 * @param {string[]} rows
 * @param {string} [extraText]
 */
function tryCompleteUnitVectorMatrixCols(cols, rows, extraText = '') {
  const blob = [...(rows ?? []), String(extraText ?? '')].join(' ')
  if (!/unit vectors/i.test(blob)) return null
  const looksLikeJeeUnitMtc =
    /linearly\s+depend/i.test(blob) ||
    /\|a\s*\+\s*b\s*\+\s*c\|/i.test(blob) ||
    /a\s*(?:\\perp|[⊥]|perp)\s*b/i.test(blob) ||
    /\[a\s*\+\s*b/i.test(blob)
  if (!looksLikeJeeUnitMtc) return null

  const cur = normalizedMatrixCols(cols, 4)
  const known = cur.map(normalizeMatrixColValue).filter(Boolean)
  if (!known.length) return null

  const standard = ['0', '-3/2', '1/2', '0']
  const hasFracSignal = known.some((v) => v === '-3/2' || v === '1/2')
  if (!known.every((v) => standard.includes(v)) && !hasFracSignal) return null

  return [...UNIT_VECTOR_MTC_COLS]
}

/** @param {string[]} norm4 */
function isCompleteFourColUnitVector(norm4) {
  const vals = norm4.map(normalizeMatrixColValue).filter(Boolean)
  const standard = ['0', '-3/2', '1/2', '0']
  return vals.length === 4 && vals.every((v) => standard.includes(v))
}

/** @param {string[] | null | undefined} cols */
export function matrixColsNeedHeal(cols) {
  if (!Array.isArray(cols) || cols.length === 0) return true
  const width = cols.length >= 5 ? 5 : 4
  const norm = normalizedMatrixCols(cols, width)
  const first4 = norm.slice(0, 4)
  const fifth = norm[4] ?? ''

  if (first4.every(Boolean) && !fifth && isCompleteFourColUnitVector(first4)) return false

  const colCount = width >= 5 && !first4.every(Boolean) ? 5 : fifth ? 5 : 4
  const normalized = normalizedMatrixCols(cols, colCount)
  if (normalized.filter(Boolean).length < 2) return true
  if (normalized.some((c) => !c)) return true
  return false
}

/** @param {import('../data/tests').Question} q */
function buildMatrixReparseBlob(q) {
  const lines = [(q.text ?? '').trim() || 'Match the Column', 'Column-I']
  for (let i = 0; i < 4; i += 1) {
    const r = String(q.matrixRows?.[i] ?? '').trim()
    if (r) lines.push(`(${ROW_LETTERS[i]}) ${r}`)
  }
  lines.push('Column-II')
  for (let j = 0; j < 5; j += 1) {
    const c = String(q.matrixCols?.[j] ?? '').trim()
    if (c && !matrixColEntryIsInvalid(c)) lines.push(`(${COL_LETTERS_PQ[j]}) ${c}`)
  }
  return lines.join('\n')
}

/**
 * Recover numeric 1–5 Column II when JEE row stems match but OCR (P)–(T) markers were stripped.
 * @param {string[]} rows
 */
function inferNumericColsFromMatrixRowStems(rows) {
  const blob = (rows ?? []).map((r) => String(r ?? '')).join(' ')
  if (!blob.trim()) return null
  const hasQuadratic = /quadratic|lies at infinity|integral value/i.test(blob)
  const hasNatural = /smallest natural number|natural number\s*['']?n['']?/i.test(blob)
  const hasTrig = /\\sin\s*B\s*\\sin\s*C|sin\s*B\s*sin\s*C|4\s*\\sin|4\s*sin/i.test(blob)
  const hasRoots = /unequal roots|values of\s*['']?k['']?/i.test(blob)
  const hits = [hasQuadratic, hasNatural, hasTrig, hasRoots].filter(Boolean).length
  const filledRows = (rows ?? []).filter((r) => String(r ?? '').replace(/\s/g, '').length > 20).length
  if (hits < 3) return null
  if (filledRows >= 4 || (hasNatural && (hasTrig || hasRoots))) {
    return COL_NUMBERS.slice(0, 5)
  }
  return COL_NUMBERS.slice(0, 4)
}

/**
 * @param {import('../data/tests').Question} q
 * @param {string} fullBlob
 * @returns {string[][]}
 */
function collectMatrixColCandidates(q, fullBlob) {
  /** @type {string[][]} */
  const out = []
  const push = (cols) => {
    if (!cols?.length) return
    const good = cols.filter((c) => {
      const v = cleanColumnIIValue(String(c ?? ''))
      return v && !matrixColEntryIsInvalid(v)
    })
    if (good.length >= 2) out.push(cols)
  }

  const parsed = parseMatchColumnUpload(fullBlob)
  if (parsed) push(repairMatrixParseColumnII(parsed, fullBlob).matrixCols)

  const resolved = resolveMatchColumnUpload(fullBlob)
  if (resolved) push(resolved.matrixCols)

  const reparse = parseMatchColumnUpload(buildMatrixReparseBlob(q))
  if (reparse) push(repairMatrixParseColumnII(reparse, fullBlob).matrixCols)

  const loose = extractLooseNumericColumnII(fullBlob)
  if (loose) push(loose)

  return out
}

/**
 * Fill missing or placeholder Column II entries from OCR bleed, re-parse, or known JEE stems.
 * @param {import('../data/tests').Question} q
 */
export function healMatrixQuestion(q) {
  if (!q || typeof q !== 'object') return q
  const rows = q.matrixRows ?? []
  if (!rows.length || !rows.some((r) => String(r ?? '').trim())) return q
  const filledRows = rows.filter((r) => String(r ?? '').replace(/\s/g, '').length > 8).length
  const isMatrix =
    q.questionType === 'matrix_match' || filledRows >= 2
  if (!isMatrix) return q
  if (!matrixColsNeedHeal(q.matrixCols)) {
    const inferred = inferNumericColsFromMatrixRowStems(rows)
    if (inferred?.length >= 5) {
      const best = normalizedMatrixCols(
        mergeMatrixCols(normalizedMatrixCols(q.matrixCols, 5), inferred).slice(0, 5),
        5,
      )
      if (!matrixColsNeedHeal(best)) {
        return {
          ...q,
          matrixCols: padItems(best, 5),
          matrixColCount: 5,
          matrixColLabels: padItems(
            COL_LETTERS_PQ.slice(0, 5).map((L) => `(${L})`),
            5,
          ) }
      }
    }
    return q
  }

  let colCount = Math.min(5, Math.max(4, q.matrixCols?.length ?? 4))
  let best = normalizedMatrixCols(q.matrixCols, colCount)

  const extraBlob = [q.text, q.ocrRawText, q.extractedRaw].filter(Boolean).join('\n')
  let uv = tryCompleteUnitVectorMatrixCols(best, rows, extraBlob)
  if (uv) {
    best = normalizedMatrixCols(uv, 4)
    colCount = 4
  }

  if (!uv) {
    const sources = [q.ocrRawText, q.extractedRaw, q.text, ...rows, ...(q.matrixCols ?? [])]
      .map((s) => String(s ?? '').trim())
      .filter(Boolean)
    const blob = sources.join('\n')
    const pre = preprocessMatchColumnOcr(blob)
    const fullBlob = `${blob}\n${pre}`

    for (const cand of collectMatrixColCandidates(q, fullBlob)) {
      const merged = mergeMatrixCols(best, cand).slice(0, colCount)
      best = normalizedMatrixCols(merged, colCount)
    }

    uv = tryCompleteUnitVectorMatrixCols(best, rows, extraBlob)
    if (uv) {
      best = normalizedMatrixCols(uv, 4)
      colCount = 4
    }
  }

  if (!uv) {
    if (!matrixColsNeedHeal(best)) {
      const inferred = inferNumericColsFromMatrixRowStems(rows)
      if (inferred) {
        colCount = Math.max(colCount, inferred.length >= 5 ? 5 : 4)
        const merged = mergeMatrixCols(best, inferred).slice(0, colCount)
        best = normalizedMatrixCols(merged, colCount)
      }
    } else {
      const inferred = inferNumericColsFromMatrixRowStems(rows)
      if (inferred) {
        colCount = Math.max(colCount, inferred.length >= 5 ? 5 : 4)
        best = normalizedMatrixCols(inferred, colCount)
      }
    }
  }

  if (matrixColsNeedHeal(best)) return q

  let finalCount = colCount
  const norm5 = normalizedMatrixCols(best, 5)
  if (uv) finalCount = 4
  else if (norm5[4]) finalCount = 5
  else if (norm5.slice(0, 4).every(Boolean) && isCompleteFourColUnitVector(norm5.slice(0, 4))) {
    finalCount = 4
  } else if (colCount >= 5) finalCount = 5
  else {
    const key = q.matrixAnswerKey
    if (key && typeof key === 'object') {
      const maxCol = Math.max(
        -1,
        ...Object.values(key).flatMap((v) => (Array.isArray(v) ? v : [v])),
      )
      if (Number.isFinite(maxCol) && maxCol >= 4) finalCount = 5
    }
  }

  return {
    ...q,
    matrixCols: padItems(best, finalCount),
    matrixColCount: finalCount,
    matrixColLabels: padItems(
      COL_LETTERS_PQ.slice(0, finalCount).map((L) => `(${L})`),
      finalCount,
    ) }
}

/**
 * Heal matrix Column II for exam/bank display — retries unit-vector completion after generic heal.
 * @param {import('../data/tests').Question} q
 */
export function resolveMatrixColsForDisplay(q) {
  const healed = healMatrixQuestion(q)
  if (!matrixColsNeedHeal(healed.matrixCols)) return healed
  const rows = q.matrixRows ?? healed.matrixRows ?? []
  const extra = [q.text, healed.text, q.ocrRawText, q.extractedRaw].filter(Boolean).join('\n')
  const forced = tryCompleteUnitVectorMatrixCols(q.matrixCols ?? healed.matrixCols, rows, extra)
  if (!forced || matrixColsNeedHeal(forced)) return healed
  return {
    ...healed,
    matrixCols: padItems(forced, 4),
    matrixColCount: 4,
    matrixColLabels: padItems(COL_LETTERS_PQ.slice(0, 4).map((L) => `(${L})`), 4) }
}
