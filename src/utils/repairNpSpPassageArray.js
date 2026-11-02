/**
 * JEE passage: rows of 1/(n²+n) with N_p = 2p−1 terms per row.
 * OCR often drops 1/(7²+7) at the start of row III and 1/(11²+11) at the end.
 */

const FRAC_RE = /\\frac\{1\}\{(\d+)\^\{?2\}?\+\s*(\d+)\}/g

/** @param {string} row */
function extractDenominators(row) {
  const ns = []
  FRAC_RE.lastIndex = 0
  let m
  while ((m = FRAC_RE.exec(row)) !== null) {
    const n = parseInt(m[1], 10)
    const d = parseInt(m[2], 10)
    if (n === d) ns.push(n)
  }
  return ns
}

/** @param {number} n */
function fracCell(n) {
  return `\\frac{1}{${n}^{2}+${n}}`
}

/** @param {string} row @param {number} fallback */
function rowIndexFromLabel(row, fallback) {
  if (/\\mathrm\{III\}/.test(row)) return 3
  if (/\\mathrm\{II\}/.test(row)) return 2
  if (/\\mathrm\{I\}/.test(row)) return 1
  return fallback
}

/**
 * @param {string} row
 * @param {number} p 1-based row index
 * @param {number} prevLastN last denominator index in previous row
 */
function rebuildNpSpRow(row, p, prevLastN) {
  const count = 2 * p - 1
  const startN = p === 1 ? 3 : prevLastN + 1
  const fracs = Array.from({ length: count }, (_, i) => fracCell(startN + i))

  if (p === 1) {
    return `\\mathrm{I}^{\\text {st }} \\text { row } & & ${fracs[0]} & &`
  }
  if (p === 2) {
    return `\\mathrm{II}^{\\text {nd }} \\text { row } & & ${fracs.join(' & ')}`
  }
  if (p === 3) {
    return `\\mathrm{III}^{\\text {rd }} \\text { row } & & ${fracs.join(' & ')}`
  }
  return fracs.join(' & ')
}

/** Restore \\\\ when OCR/operatorname repair flattened I / II / III rows onto one line. */
function restorePassageArrayRowBreaks(inner) {
  let body = String(inner ?? '').trim()
  if (!body || /\\\\/.test(body)) return body

  const marker =
    /(?=\\mathrm\{I{1,3}\}(?:\^|\\text)|\\mathrm\{II\}|\\mathrm\{III\}|\bI{1,3}\s*(?:\^{)?\s*(?:st|nd|rd)\b)/i
  const parts = body.split(marker).map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 2) return parts.join(' \\\\ ')

  return body
}

/** @param {string} inner array body without begin/end */
function repairArrayBody(inner) {
  const normalized = restorePassageArrayRowBreaks(inner)
  const rows = normalized.split(/\\\\/).map((r) => r.trim()).filter(Boolean)
  if (rows.length < 2) return inner

  let prevLast = 0
  const fixed = rows.map((row, i) => {
    const p = rowIndexFromLabel(row, i + 1)
    const expectedCount = 2 * p - 1
    const startN = p === 1 ? 3 : prevLast + 1
    const ns = extractDenominators(row)
    const endN = startN + expectedCount - 1

    const complete =
      ns.length === expectedCount && ns[0] === startN && ns[ns.length - 1] === endN

    if (complete) {
      prevLast = ns[ns.length - 1]
      return row
    }

    const rebuilt = rebuildNpSpRow(row, p, prevLast)
    prevLast = endN
    return rebuilt
  })

  return fixed.join(' \\\\ ')
}

/**
 * Rebuilt rows carry 2p−1 terms, so row III is wider than the OCR column spec.
 * KaTeX rejects a row with more cells than the spec declares.
 * @param {string} colSpec @param {string} body
 */
function widenColSpec(colSpec, body) {
  const spec = String(colSpec ?? '')
  const aligns = spec.match(/[lcr]/g) ?? []
  const maxCells = String(body ?? '')
    .split(/\\\\/)
    .reduce((max, row) => Math.max(max, row.split('&').length), 0)
  if (!maxCells || maxCells <= aligns.length) return spec
  return spec + (aligns[aligns.length - 1] ?? 'c').repeat(maxCells - aligns.length)
}

/**
 * @param {string} text
 * @returns {string}
 */
export function repairNpSpPassageArray(text) {
  if (!text?.includes('\\begin{array}')) return text
  if (!/\\frac\{1\}\{\d+\^\{?2\}?\+\d+\}/.test(text)) return text
  if (!/N_\{?p\}?|N_\\mathrm\{p\}|number of terms of/i.test(text)) return text

  return text.replace(
    /\\begin\{array\}\{([^}]*)\}([\s\S]*?)\\end\{array\}/g,
    (full, colSpec, inner) => {
      const repaired = repairArrayBody(inner)
      if (repaired === inner) return full
      return `\\begin{array}{${widenColSpec(colSpec, repaired)}}${repaired}\\end{array}`
    },
  )
}
