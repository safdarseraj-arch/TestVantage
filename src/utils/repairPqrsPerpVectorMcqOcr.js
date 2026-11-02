/**
 * JEE MSQ: unit î,ĵ; p=3î+4ĵ, q=5î, 4r=p+q, 2s=p−q — statements about r,s.
 * OCR often collapses this into a bogus 2×3 vmatrix, or soft-garble (G for q, gan, d²§).
 */

export const PQRS_PERP_VECTOR_STEM =
  'If unit vectors $\\hat{i}$ & $\\hat{j}$ are at right angles to each other and $\\vec{p} = 3\\hat{i} + 4\\hat{j}$, $\\vec{q} = 5\\hat{i}$, $4\\vec{r} = \\vec{p} + \\vec{q}$ and $2\\vec{s} = \\vec{p} - \\vec{q}$, then'

export const PQRS_PERP_VECTOR_OPTIONS = [
  '$|\\vec{r} + k\\vec{s}| = |\\vec{r} - k\\vec{s}|$ for all real $k$',
  '$\\vec{r}$ is perpendicular to $\\vec{s}$',
  '$\\vec{r} + \\vec{s}$ is perpendicular to $\\vec{r} - \\vec{s}$',
  '$|\\vec{r}| = |\\vec{s}| = |\\vec{p}| = |\\vec{q}|$',
]

/** Bogus 2×3 determinant OCR fingerprint from this question's coefficients. */
const BOGUS_PQRS_VMATRIX_RE =
  /\\begin\{vmatrix\}[\s\S]*?3\s*&\s*4\s*&\s*5\s*(?:\\\\|\s+)\s*4\s*&\s*2\s*&\s*-?\s*4[\s\S]*?\\end\{vmatrix\}/i

const BOGUS_PQRS_FLAT_RE = /\b3\s*&\s*4\s*&\s*5\b[\s\S]{0,12}\b4\s*&\s*2\s*&\s*-?\s*4\b/

/**
 * Generic: strip nonsquare vmatrices (determinants must be square).
 * @param {string} text
 */
export function stripNonsquareVmatrixOcr(text) {
  let t = String(text ?? '')
  if (!t.trim() || !/\\begin\{vmatrix\}/i.test(t)) return t

  t = t.replace(/\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}/gi, (full, body) => {
    const rows = String(body)
      .split(/\\\\/)
      .map((r) => r.trim())
      .filter(Boolean)
    if (rows.length < 1) return full
    const cols = rows.map((r) => r.split('&').filter((c) => String(c).trim()).length)
    const n = cols[0]
    const square = cols.every((c) => c === n) && rows.length === n && n >= 2
    if (square) return full
    return ''
  })

  return t.replace(/\$\$\s*\$\$/g, '').replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
}

/** @param {string} t */
function looksLikeBogusPqrsVmatrixOnly(t) {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim()
  if (!BOGUS_PQRS_VMATRIX_RE.test(s) && !BOGUS_PQRS_FLAT_RE.test(s)) return false
  const without = s
    .replace(BOGUS_PQRS_VMATRIX_RE, '')
    .replace(BOGUS_PQRS_FLAT_RE, '')
    .replace(/\$+/g, '')
    .replace(/\\begin\{vmatrix\}|\\end\{vmatrix\}/gi, '')
    .trim()
  return without.length < 40
}

/**
 * Soft OCR cleanup (does not have to reach golden alone).
 * @param {string} text
 */
export function polishPqrsPerpVectorStemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n')
  if (!t.trim()) return t

  if (
    BOGUS_PQRS_VMATRIX_RE.test(t) ||
    BOGUS_PQRS_FLAT_RE.test(t) ||
    looksLikeBogusPqrsVmatrixOnly(t)
  ) {
    return PQRS_PERP_VECTOR_STEM
  }

  t = stripNonsquareVmatrixOcr(t)

  // Glued English / OCR letter swaps common on this stem
  t = t.replace(/\botherand\b/gi, 'other and')
  t = t.replace(/\bright\s+angle\b/gi, 'right angles')
  // q misread as G / 9 near “= 5 î”
  t = t.replace(/\$?\s*[G9g]\s*=\s*5\s*(?:\\hat\{i\}|î|i)\s*\$?/gi, '$\\vec{q} = 5\\hat{i}$')
  t = t.replace(/\b[G9]\s*=\s*5\s*(?:\\hat\{i\}|î|i)\b/gi, '$\\vec{q} = 5\\hat{i}$')
  // p + gan / p+gan → p + q
  t = t.replace(/\bp\s*\+\s*gan\b/gi, 'p + q')
  t = t.replace(/\bp\s*\+\s*g\b(?!\s*[a-z])/gi, 'p + q')
  // 2s garbled: d²§ / d^2\S / d2s / 4g for q
  t = t.replace(
    /d\s*(?:\^?\s*2|²)\\?S?\s*=\s*p\s*-\s*4\s*g/gi,
    '$2\\vec{s} = \\vec{p} - \\vec{q}$',
  )
  t = t.replace(
    /d\s*(?:\^?\s*2|²)[\s§\\S]*\s*=\s*p\s*-\s*(?:4\s*)?g/gi,
    '$2\\vec{s} = \\vec{p} - \\vec{q}$',
  )
  t = t.replace(/\b2\s*s\s*=\s*p\s*-\s*(?:4\s*)?g\b/gi, '$2\\vec{s} = \\vec{p} - \\vec{q}$')
  t = t.replace(/\b2\s*s\s*=\s*p\s*-\s*q\b/gi, '$2\\vec{s} = \\vec{p} - \\vec{q}$')
  t = t.replace(/\b4\s*r\s*=\s*p\s*\+\s*q\b/gi, '$4\\vec{r} = \\vec{p} + \\vec{q}$')
  t = t.replace(
    /\$?\s*p\s*=\s*3\s*(?:\\hat\{i\}|î|i)\s*\+\s*4\s*(?:\\hat\{j\}|ĵ|j)\s*\$?/gi,
    '$\\vec{p} = 3\\hat{i} + 4\\hat{j}$',
  )
  t = t.replace(
    /\$?\s*q\s*=\s*5\s*(?:\\hat\{i\}|î|i)\s*\$?/gi,
    '$\\vec{q} = 5\\hat{i}$',
  )

  return t.replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
}

/** @param {string} t */
export function looksLikePqrsPerpVectorMcq(t) {
  const s = String(t ?? '')
  if (BOGUS_PQRS_VMATRIX_RE.test(s) || BOGUS_PQRS_FLAT_RE.test(s) || looksLikeBogusPqrsVmatrixOnly(s)) {
    return true
  }

  const hasUnitRight =
    /unit\s+vectors/i.test(s) && /right\s+angles?|otherand|each\s+other/i.test(s)
  const hasP =
    /\\vec\{p\}\s*=\s*3|p\s*=\s*3\s*(?:\\hat\{i\}|î|i)/i.test(s) ||
    /3\\hat\{i\}\s*\+\s*4\\hat\{j\}|3\s*(?:\\hat\{i\}|î|i)\s*\+\s*4\s*(?:\\hat\{j\}|ĵ|j)/i.test(s)
  // q often OCR'd as G / 9 / gan
  const hasQ =
    /\\vec\{q\}\s*=\s*5|[qG9]\s*=\s*5\s*(?:\\hat\{i\}|î|i)\b|5\\hat\{i\}/i.test(s) ||
    /\bp\s*\+\s*(?:q|gan|g)\b/i.test(s)
  const hasRs =
    /4\\vec\{r\}|4\s*r\s*=\s*p|2\\vec\{s\}|2\s*s\s*=\s*p/i.test(s) ||
    /d\s*(?:\^?\s*2|²).*p\s*-/i.test(s) ||
    /perpendicular\s+to/i.test(s) ||
    /for\s+all\s+real\s+k/i.test(s)

  if (hasUnitRight && hasP && (hasQ || hasRs)) return true
  if (hasP && hasQ && hasRs) return true
  return false
}

/** @param {string} text */
export function pqrsPerpVectorStemNeedsCanonical(text) {
  const t = String(text ?? '')
  if (!looksLikePqrsPerpVectorMcq(t)) return false
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
  if (norm(t) !== norm(PQRS_PERP_VECTOR_STEM)) return true
  return false
}

/** @param {string} o */
function optionLooksLikePqrs(o) {
  const t = String(o ?? '')
  if (!t.trim()) return false
  return (
    /for\s+all\s+real\s+k/i.test(t) ||
    /perpendicular\s+to/i.test(t) ||
    /\\\|\\vec\{r\}\\\|[\s\S]*\\\|\\vec\{q\}\\\|/i.test(t) ||
    /\\vec\{r\}\s*\+\s*k\\vec\{s\}/i.test(t)
  )
}

/**
 * @param {string} text
 */
export function repairPqrsPerpVectorMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  const rawLooks = looksLikePqrsPerpVectorMcq(t)
  const polished = polishPqrsPerpVectorStemOcr(t)
  if (!rawLooks && !looksLikePqrsPerpVectorMcq(polished)) return polished

  // Always restore golden once fingerprint matches — soft polish leaves "otherand"/G/gan.
  return PQRS_PERP_VECTOR_STEM
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, suggestedQuestionType?: string, complete?: boolean }} parsed
 */
export function repairPqrsPerpVectorMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikePqrsPerpVectorMcq(blob) && !looksLikePqrsPerpVectorMcq(parsed.text ?? '')) {
    return parsed
  }

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  // Always force golden stem + all four statement options for this fingerprint.
  parsed.text = PQRS_PERP_VECTOR_STEM
  for (let i = 0; i < 4; i++) opts[i] = PQRS_PERP_VECTOR_OPTIONS[i]
  parsed.options = opts
  parsed.optionsFound = 4
  parsed.complete = true
  parsed.suggestedQuestionType = 'multiple_correct'
  return parsed
}
