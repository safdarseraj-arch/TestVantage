/** Review-queue shape: leftover $$ + Let/Abe/ano smashed into vmatrix cells. */
export const LET_ABE_SMASHED_VMATRIX_STEM =
  '$$\\begin{vmatrix} L & e & t \\\\ A & b & e \\\\ a & n & o \\end{vmatrix} (A)^p. The value of k + p is:'

/**
 * Shared OCR / Gemini heal: English prose smashed into a vmatrix, plus leaked $$.
 * Never invents the missing matrix or determinant.
 *
 * Classic damage: first row L & e & t (the word "Let"), remaining cells single
 * letters ("Abe" / "ano"), leftover $$ before/after the block.
 */

/** @param {string} body */
export function vmatrixLetterCells(body) {
  return String(body ?? '')
    .replace(/\\quad/g, ' ')
    .replace(/\\\\/g, '&')
    .split('&')
    .map((c) => c.replace(/\\[a-zA-Z]+/g, '').trim())
    .filter(Boolean)
}

/** @param {string} body */
export function vmatrixFirstRowSpellsLet(body) {
  const first = String(body ?? '')
    .split(/\\\\/)[0]
  const cells = String(first)
    .replace(/\\quad/g, ' ')
    .split('&')
    .map((c) => c.trim())
    .filter(Boolean)
  if (cells.length < 3) return false
  if (!cells.every((c) => /^[A-Za-z]$/.test(c))) return false
  return cells.slice(0, 3).join('').toLowerCase() === 'let'
}

/** @param {string} body */
function vmatrixRestCellsAreLetters(body) {
  const rows = String(body ?? '')
    .split(/\\\\/)
    .map((r) => r.trim())
    .filter(Boolean)
  const rest = rows.slice(1).join(' & ')
  const cells = String(rest)
    .replace(/\\quad/g, ' ')
    .split('&')
    .map((c) => c.trim())
    .filter(Boolean)
  if (!cells.length) return true
  return cells.every((c) => /^[A-Za-z]$/.test(c))
}

/** True when a vmatrix is the word "Let" smashed into the first row. */
export function looksLikeSmashedProseVmatrix(text) {
  const t = String(text ?? '')
  if (!/\\begin\{vmatrix\}/i.test(t)) return false
  const re = /\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}/gi
  let m
  while ((m = re.exec(t))) {
    if (vmatrixFirstRowSpellsLet(m[1]) && vmatrixRestCellsAreLetters(m[1])) return true
  }
  return false
}

/**
 * Cut "Let A be an …" stem after the smash was unwrapped — matrix never recovered.
 * Do not invent the missing math.
 * @param {unknown} text
 */
export function looksLikeCutLetMatrixStem(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (/\\begin\{(?:vmatrix|bmatrix|pmatrix)\}/i.test(t)) return false
  if (/\\det\b|\bdeterminant\b/i.test(t)) return false
  if (!/\bLet\s+A\s+be\s+an?\b/i.test(t)) return false
  if (/\([A-Za-z]\)\s*\^|value of\s+[a-z]\s*\+/i.test(t)) return true
  if (t.length < 200 && /\bthe value of\b/i.test(t)) return true
  return false
}

/** @param {string} body */
function unwrapLetRowBody(body) {
  const cells = vmatrixLetterCells(body)
  if (!cells.length) return ''
  const joined = cells.join('')
  if (/^letabean/i.test(joined)) {
    const extra = joined.slice(8)
    return extra ? `Let A be an ${extra}` : 'Let A be an'
  }
  if (/^let/i.test(joined)) {
    return `Let ${cells.slice(3).join(' ')}`.replace(/\s+/g, ' ').trim()
  }
  return cells.join(' ')
}

/**
 * Strip leftover $$ that leaked as visible text (not a closed display pair).
 * Safe for real $$vmatrix$$ blocks — only collapses extras / unclosed openers.
 * @param {unknown} text
 */
export function repairLeakedDisplayDollars(text) {
  let s = String(text ?? '')
  if (!s) return s
  s = s.replace(/\$\$\$+/g, '$$')
  s = s.replace(/\$\$\s+\$\$/g, '$$')
  s = s.replace(/\$\$\s*(\$\$\\begin\{)/g, '$1')
  s = s.replace(/(\\end\{(?:vmatrix|bmatrix|pmatrix)\}\$\$)\s*\$\$(?!\s*\\begin)/gi, '$1 ')
  const trimmed = s.trim()
  if (/^\$\$/.test(trimmed) && /\\begin\{(?:vmatrix|bmatrix|pmatrix)\}/i.test(trimmed)) {
    const after = trimmed.replace(/^\$\$\s*/, '')
    const pairs = after.match(/\$\$/g) || []
    if (pairs.length % 2 === 0) s = after
  }
  // leftover $$ immediately before English (after unwrap, or OCR leak)
  s = s.replace(/(^|[\s])\$\$\s*(?=(?:Let|If|The|Find|Given|Consider)\b)/gi, '$1')
  return s
}

/**
 * Unwrap Let-smashed vmatrix to prose. Never invents the missing determinant.
 * @param {unknown} text
 */
export function repairSmashedProseVmatrixOcr(text) {
  let s = String(text ?? '')
  if (!s) return s
  if (!looksLikeSmashedProseVmatrix(s)) return repairLeakedDisplayDollars(s)

  const replaceBlock = (full, body) => {
    if (!vmatrixFirstRowSpellsLet(body) || !vmatrixRestCellsAreLetters(body)) return full
    return unwrapLetRowBody(body)
  }

  s = s.replace(/\$\$\s*\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}\s*\$\$/gi, replaceBlock)
  s = s.replace(/\$\$?\s*\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}\s*\$\$?/gi, replaceBlock)
  s = s.replace(/\\begin\{vmatrix\}([\s\S]*?)\\end\{vmatrix\}/gi, replaceBlock)
  s = repairLeakedDisplayDollars(s)
  return s.replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
}
