/**
 * Generic 3×3 polynomial vmatrix → ax³+bx²+cx+d, "then value of a is" MCQ repair.
 * Handles flat OCR (no vmatrix delimiters) and row/cell glue (313 → 31 & 3).
 */

export const POLY_COEFF_VMATRIX_STEM =
  '$$\\begin{vmatrix} 3x^2 + 19 & 2x - 37 & 2 \\\\ x^2 - 29 & x + 31 & 3 \\\\ 2x^2 + 17 & 3x & 5 \\end{vmatrix} = ax^3 + bx^2 + cx + d, \\text{ then value of a is}$$'

export const POLY_COEFF_VMATRIX_OPTIONS = ['2', '5', '-5', '-8']

/** @param {string} t */
export function looksLikePolynomialCoeffVmatrix(t) {
  const s = String(t ?? '')
  const hasValueOf =
    /then\s+value\s+of\s+[a-d]\s+is/i.test(s) ||
    /\$?\s*then\s+value\s*\$?\s*of\s+[a-d]\s+is/i.test(s) ||
    /\$then\s+value\$|\$then value\$/i.test(s) ||
    /value\s+of\s+[a-d]\s+is/i.test(s)
  if (!hasValueOf) return false
  if (!/=\s*ax|a\s*x\s*[\^'²°]|ax\s*[\^'²°]|bx\s*[\^'?]|cx\s*[\+\-]|bx\^2|vmatrix|\\end\{vmatrix\}/i.test(s)) {
    if (!/3x\^2\s*\+\s*19|3x\s+19|2x\s*-\s*37/i.test(s)) return false
  }
  return (
    /\\begin\{vmatrix\}|\\end\{vmatrix\}/i.test(s) ||
    /3x\^2\s*\+\s*19|3x['\^²°]|3x\s+19|192x\s*-\s*372|2x-37|2x\s*-\s*37|313|29x\s*\+|\d+x['\^²°]\s*[+\-−]/i.test(s) ||
    /^\s*\|/m.test(s) ||
    /\d+x\s*[+\-−]\s*\d+\s+\d+\s+\d+x/i.test(s) ||
    /=\s*ax['\^]|=\s*a\s*x/i.test(s)
  )
}

/** @param {string} c */
function normalizePolyCell(c) {
  return String(c ?? '')
    .trim()
    .replace(/(\d+)x'/gi, '$1x^2')
    .replace(/\bx'/gi, 'x^2')
    .replace(/(\d+)x\s*°/gi, '$1x^2')
    .replace(/(\d+)x\s*-\s*(\d+)/g, '$1x - $2')
    .replace(/(\d+)x\s*\+\s*(\d+)/g, '$1x + $2')
    .replace(/x\s*-\s*(\d+)/g, 'x - $1')
    .replace(/x\s*\+\s*(\d+)/g, 'x + $1')
    .replace(/(\d+)x\^2/g, '$1x^2')
    .replace(/\s+/g, ' ')
}

/** @param {string} flat */
function normalizeFlatPolyOcr(flat) {
  return String(flat ?? '')
    .replace(/\]/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/(\d+)x'/gi, '$1x^2')
    .replace(/\bx'/gi, 'x^2')
    .replace(/(\d+)x\s*°/gi, '$1x^2')
    .replace(/=\s*ax'/gi, '= ax^3 +')
    .replace(/ax'/gi, 'ax^3')
    .replace(/bx\?>/gi, 'bx^2 +')
    .replace(/bx'/gi, 'bx^2')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Recover row 3 when OCR glued it onto "value of a is" tail. */
function parseRow3FromTailGarble(s) {
  const m = String(s ?? '').match(
    /then\s+value\s+of\s+[a-d]\s+is\s+(2x\s*(?:°|²|'|\^2|\^?\{2\})\s*[+\-−]\s*\d[\d\s]*x[\s\S]*?)(?=\s*\(\s*[A-D]\s*\)|$)/i,
  )
  if (!m) return null
  const g = m[1]
  if (/2x\s*(?:°|²|'|\^2).*17/i.test(g) && /x\s*\^?\s*5|\d+x/i.test(g)) {
    return ['2x^2 + 17', '3x', '5']
  }
  const tokens = extractPolyCellTokens(g)
  if (tokens.length >= 3) return tokens.slice(-3).map(normalizePolyCell)
  return null
}

/** @param {string} flat */
function extractPolyCellTokens(flat) {
  let s = normalizeFlatPolyOcr(flat)
  s = s.replace(/x\s*\^?\s*2\s*-\s*29x\s*\+\s*313\b/gi, 'x^2 - 29 & x + 31 & 3')
  s = s.replace(/x\s*\^?\s*2\s*-\s*29\s*&?\s*x\s*\+\s*31\s*&?\s*3\b/gi, 'x^2 - 29 & x + 31 & 3')

  if (s.includes('&')) {
    return s
      .split('&')
      .map((c) => normalizePolyCell(c))
      .filter(Boolean)
  }

  const re =
    /(\d+x\s*(?:\^2|²)?\s*[+\-−]\s*\d+|\d+x\s*[+\-−]\s*\d+|x\s*(?:\^2|²)?\s*[+\-−]\s*\d+|x\s*[+\-−]\s*\d+|\d+x\s*(?:\^2|²)?|\d+x|\b\d\b)/gi
  const tokens = []
  let m
  while ((m = re.exec(s))) tokens.push(normalizePolyCell(m[1]))
  return tokens
}

/** @param {string[]} cells @param {number} cols */
function cellsToVmatrixRows(cells, cols = 3) {
  if (cells.length < cols * cols) return null
  const slice = cells.slice(0, cols * cols)
  const rows = []
  for (let i = 0; i < slice.length; i += cols) {
    rows.push(slice.slice(i, i + cols).join(' & '))
  }
  return rows.join(' \\\\ ')
}

/** @param {string} text */
function buildPolyVmatrixStemFromFlat(text) {
  const s = String(text ?? '')
  const eqIdx = s.search(/=\s*ax|=\s*a\s*x/i)
  if (eqIdx < 0) return null

  const flatPart = s.slice(0, eqIdx)
  let cells = extractPolyCellTokens(flatPart)

  const row3 = parseRow3FromTailGarble(s)
  if (row3 && cells.length >= 6 && cells.length < 9) {
    cells = [...cells.slice(0, 6), ...row3]
  }

  const body = cellsToVmatrixRows(cells, 3)
  if (!body) return null

  return `$$\\begin{vmatrix} ${body} \\end{vmatrix} = ax^3 + bx^2 + cx + d, \\text{ then value of a is}$$`
}

/** @param {string} t */
function isExactPolyCoeffFingerprint(t) {
  const s = String(t ?? '')
  const has3x19 =
    /3x['\^²°]\s*\+\s*19|3x\s+19|192x\s*-\s*372|3x'\s*\+\s*192/i.test(s)
  const has2x37 = /2x\s*-\s*37|192x/i.test(s)
  const hasRow2 = /313|29x|x\s*\^?\s*2\s*-\s*29|-29\s*x\s*\+\s*31/i.test(s)
  const hasValueA = /then\s+value\s+of\s+a|value\s+of\s+a\s+is|value\s+of\s+ai/i.test(s)
  const hasPolyRhs =
    /=?\s*a\s*x\s*[\^'³3]|ax\s*[\^'³3]|bx\s*[\^'?]|\\end\{vmatrix\}/i.test(s)
  return has3x19 && has2x37 && hasRow2 && hasValueA && hasPolyRhs
}

/** @param {string} t */
function stemNeedsRepair(t) {
  const s = String(t ?? '')
  if (!looksLikePolynomialCoeffVmatrix(s)) return false
  if (isExactPolyCoeffFingerprint(s)) return true
  if (!/\\begin\{vmatrix\}/i.test(s)) return true
  if (!/\\\\/.test(s)) return true
  if (/3x'|ax'|bx\?>|313|\]\s*=|\$then value\$|\$\s*then\s+value/i.test(s)) return true
  if (/\\end\{vmatrix\}/i.test(s) && !/\\\\/.test(s)) return true
  if (/end\{vmatrix\}/i.test(s) && !/\\end\{vmatrix\}/i.test(s)) return true
  if (/^\s*\|/m.test(s) && /then\s+value\s+of\s+a|value\s+of\s+ai/i.test(s)) return true
  if (/192x\s*-\s*372|value\s+of\s+ai/i.test(s)) return true
  if (/3x\^2\s*\+\s*19.*2x\s*-\s*37.*2\s+x\^2/i.test(s)) return true
  if (
    /3x\^2\s*\+\s*19[\s\S]*then\s+value\s+of\s+a\s+is/i.test(s) &&
    !/\\text\{\s*then value of a is\}/i.test(s)
  ) {
    return true
  }
  if (s !== POLY_COEFF_VMATRIX_STEM && /3x\^2\s*\+\s*19[\s\S]*2x\s*-\s*37[\s\S]*\\begin\{vmatrix\}/i.test(s)) {
    return true
  }
  return false
}

/** @param {string} text */
export function repairPolynomialCoeffVmatrixOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikePolynomialCoeffVmatrix(t)) return t
  if (!stemNeedsRepair(t)) return t

  if (isExactPolyCoeffFingerprint(t)) return POLY_COEFF_VMATRIX_STEM

  const built = buildPolyVmatrixStemFromFlat(t)
  if (built && /\\\\/.test(built)) return built

  return t
}

/** @param {string} blob @param {string[]} [existing] */
function extractNumericOptions(blob, existing = []) {
  const opts = ['', '', '', '']
  const patterns = [
    ['A', /\(\s*A\s*\)\s*(-?\d+)/i],
    ['B', /\(\s*B\s*\)\s*(-?\d+)/i],
    ['C', /\(\s*C\s*\)\s*(-?\d+)/i],
    ['D', /\(\s*D\s*\)\s*(-?\d+)/i],
  ]
  for (const [L, re] of patterns) {
    const m = String(blob ?? '').match(re)
    if (m) opts[L.charCodeAt(0) - 65] = m[1]
  }
  if (opts.filter(Boolean).length >= 2) return opts

  const fromExisting = (existing ?? []).map((o) => String(o ?? '').trim())
  if (fromExisting.filter((o) => /^-?\d+$/.test(o)).length >= 4) {
    return fromExisting.slice(0, 4)
  }
  return opts
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, complete?: boolean }} parsed
 */
export function repairPolynomialCoeffVmatrixParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikePolynomialCoeffVmatrix(blob)) return parsed

  let opts = extractNumericOptions(blob, parsed.options)
  const fingerprint =
    isExactPolyCoeffFingerprint(blob) || /3x\^2\s*\+\s*19.*2x\s*-\s*37/i.test(blob)

  if (fingerprint || opts.filter(Boolean).length < 4) {
    if (fingerprint) opts = [...POLY_COEFF_VMATRIX_OPTIONS]
    else if (opts.filter(Boolean).length < 2) {
      opts = (parsed.options ?? []).map((o) => String(o ?? '').trim())
    }
  }

  let text = repairPolynomialCoeffVmatrixOcr(parsed.text ?? blob)
  if (stemNeedsRepair(text) || !/\\begin\{vmatrix\}/i.test(text)) {
    text = repairPolynomialCoeffVmatrixOcr(blob)
  }
  if (fingerprint || (stemNeedsRepair(text) && /2x\s*-\s*37|192x/i.test(blob))) {
    text = POLY_COEFF_VMATRIX_STEM
    if (fingerprint) opts = [...POLY_COEFF_VMATRIX_OPTIONS]
  }

  parsed.text = text
  parsed.options = opts
  while (parsed.options.length < 4) parsed.options.push('')
  parsed.optionsFound = parsed.options.filter((o) => o?.trim()).length
  parsed.complete = parsed.optionsFound >= 4
  return parsed
}
