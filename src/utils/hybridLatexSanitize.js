/**
 * LaTeX + MCQ option cleanup for Hybrid AI sync (mirrors hybrid_latex_sanitize.py).
 */
import {
  canonicalizeBeginMatrixEnv,
  ensureMatrixStemDelimiters,
  repairMatrixRowBreaks,
} from './repairMatrixStem.js'
import { detectBrokenBankStem } from './stemBankGuard.js'

const MATRIX_ENV_RE =
  /\\begin\{(bmatrix|pmatrix|vmatrix|matrix)\}([\s\S]*?)\\end\{\1\}/gi

const ASKS_MATRIX_ANSWER =
  /A\s*\^|\^n\b|matrix.{0,40}equal|equal\s+to\s+\$?\\begin\{(?:bmatrix|pmatrix)\}/i

const OPTION_MATRIX_PREFIX =
  /^\s*(?:\$+\s*)?([A-Za-z])\s*=\s*(\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\})/i

const PROSE_LET_A_BE = /\bLet\s+A\s+be\s+a\s+3\b/i
const REAL_ASK =
  /\\det\b|\bdeterminant\b|\bfind\b|\bvalue\b|\bcompute\b|\bevaluate\b|\bcalculate\b|\bwhich\b|\bprove\b|\binverse\b|\btrace\b|\brank\b|\badj(?:oint)?\b|\beigen|\^\s*\{?\s*n\b/i
const EQUAL_TO_VALUE = /\bequal(?:s| to)\s+(?:\$+\s*)?(?:\\(?:frac|sqrt|dfrac)|[-+]?\d)/i
const TRAILING_IS_EQUAL_TO =
  /(?:^|\s+)(?:\\text\{\s*)?is\s+equal\s+to(?:\s*\})?\s*[:.]?\s*$/i

export const INCOMPLETE_MATRIX_STEM_ERROR =
  "Question stem is only a matrix plus 'is equal to' with no real ask (determinant, find, or value)."

/** @param {string} row */
function normalizeMatrixRow(row) {
  const r = String(row ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!r || r.includes('&')) return r
  if (/^\d{2}$/.test(r)) return `${r[0]} & ${r[1]}`
  const parts = r.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return parts.join(' & ')
  return r
}

/** @param {string} body @param {number} [cols] */
function repairFlatMatrixBody(body, cols = 2) {
  let inner = String(body ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!inner || /\\\\/.test(inner)) return inner
  if (inner.includes('&')) {
    const cells = inner.split('&').map((s) => s.trim()).filter(Boolean)
    if (cells.length >= cols && cells.length % cols === 0) {
      const rows = []
      for (let i = 0; i < cells.length; i += cols) {
        rows.push(cells.slice(i, i + cols).join(' & '))
      }
      return rows.join(' \\\\ ')
    }
    return inner
  }
  const parts = inner.split(/\s+/).filter(Boolean)
  if (parts.length >= cols && parts.length % cols === 0) {
    const rows = []
    for (let i = 0; i < parts.length; i += cols) {
      rows.push(parts.slice(i, i + cols).join(' & '))
    }
    return rows.join(' \\\\ ')
  }
  return inner
}

/** @param {string} body */
function matrixBodyTokens(body) {
  return String(body ?? '')
    .replace(/\\\\/g, ' ')
    .replace(/&/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[{}$]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/**
 * Cells are the words "Let A be a 3…" smashed into letters (L e t / A b e / a 3 t).
 * @param {string} body
 */
export function matrixBodyIsLetterSoup(body) {
  const tokens = matrixBodyTokens(body)
  if (tokens.length < 6) return false
  const short = tokens.filter((tok) => /^[A-Za-z]$/.test(tok) || /^\d$/.test(tok))
  if (short.length < Math.max(6, Math.floor(tokens.length * 0.75))) return false
  const joined = tokens.join('').toLowerCase()
  if (joined.startsWith('let') || joined.includes('letabe')) return true
  const letters = tokens.filter((tok) => /^[A-Za-z]$/.test(tok)).map((tok) => tok.toLowerCase())
  if (letters.length >= 6 && letters.slice(0, 3).join('') === 'let') {
    const next = letters.slice(3, 6).join('')
    if (next === 'abe' || next === 'bea') return true
  }
  return false
}

/** Ordinary English "Let A be a 3…" must stay words. Do not wrap it in bmatrix. */
export function proseLetABeMustStayProse(text) {
  const raw = String(text ?? '')
  if (raw.includes('\\begin{')) return false
  return PROSE_LET_A_BE.test(raw)
}

/** @param {string} stem */
function textOutsideMatrices(stem) {
  MATRIX_ENV_RE.lastIndex = 0
  const outside = String(stem ?? '')
    .replace(MATRIX_ENV_RE, ' ')
    .replace(/\$+/g, ' ')
    .replace(/\\(?:text|mathrm|mathbf)\{([^{}]*)\}/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim()
  MATRIX_ENV_RE.lastIndex = 0
  return outside
}

/** det / find / value, or "equal to" a number, outside the matrix cells. */
export function stemHasRealAsk(stem) {
  const outside = textOutsideMatrices(stem)
  return REAL_ASK.test(outside) || EQUAL_TO_VALUE.test(outside)
}

/**
 * Invalid Hybrid draft: only a matrix (often Let/Abe letter soup) plus "is equal to".
 * Prefer reject + retry. Do not invent the missing question.
 * @param {string | null | undefined} stem
 */
export function stemIsIncompleteMatrixOnly(stem) {
  const raw = String(stem ?? '').trim()
  if (!raw) return false
  MATRIX_ENV_RE.lastIndex = 0
  let soup = false
  let sawMatrix = false
  raw.replace(MATRIX_ENV_RE, (full, _env, body) => {
    sawMatrix = true
    if (matrixBodyIsLetterSoup(body)) soup = true
    return full
  })
  MATRIX_ENV_RE.lastIndex = 0
  if (soup) return true
  if (stemHasRealAsk(raw)) return false
  if (sawMatrix) {
    const outside = textOutsideMatrices(raw)
    let core = outside.replace(/\b(?:is\s+equal\s+to|equals?)\s*[:.]?\s*$/i, '')
    core = core.replace(/^(?:let\s+)?[A-Za-z]\s*=\s*$/i, '').replace(/^[\s.,:;$-]+|[\s.,:;$-]+$/g, '')
    return !core.trim()
  }
  if (!proseLetABeMustStayProse(raw)) return false
  const rest = raw
    .replace(PROSE_LET_A_BE, ' ')
    .replace(/\bis\s+equal\s+to\s*[:.]?\s*$/i, ' ')
    .replace(/[×x]\s*3|\b3\b/g, ' ')
    .replace(
      /\b(?:matrix|matrices|square|real|entries|entry|with|order|times|positive|integer|numbers?)\b/gi,
      ' ',
    )
  const words = rest.match(/[A-Za-z]{4,}/g) ?? []
  return words.length === 0
}

/**
 * Drop a leaked trailing "is equal to". Keep "is equal to 12" and "is equal to $\\sqrt{2}$".
 * @param {string | null | undefined} option
 */
export function stripTrailingIsEqualTo(option) {
  let opt = String(option ?? '').trim()
  if (!opt) return ''
  if (/is\s+equal\s+to\s+\S/i.test(opt)) return opt
  opt = opt.replace(TRAILING_IS_EQUAL_TO, '').trim()
  if (/^is\s+equal\s+to\s*[:.]?$/i.test(opt)) return ''
  return opt
}

/** Column count already in the cells. 3×3 wins when the cell count divides by 3. */
function inferMatrixCols(body) {
  const raw = String(body ?? '').trim()
  if (/\\\\/.test(raw)) {
    const first = raw.split(/\\\\/)[0]
    const n = first.split('&').map((s) => s.trim()).filter(Boolean).length
    if (n >= 2) return n
  }
  if (raw.includes('&')) {
    const n = raw.split('&').map((s) => s.trim()).filter(Boolean).length
    if (n >= 3 && n % 3 === 0) return 3
    if (n >= 2 && n % 2 === 0) return 2
  }
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length >= 9 && parts.length % 3 === 0) return 3
  if (parts.length >= 4 && parts.length % 2 === 0) return 2
  return 2
}

/** @param {string | null | undefined} text */
export function normalizeMatrixEnvironments(text) {
  const raw = String(text ?? '')
  if (!raw.includes('\\begin{')) return raw
  if (proseLetABeMustStayProse(raw)) return raw
  MATRIX_ENV_RE.lastIndex = 0
  const out = raw.replace(MATRIX_ENV_RE, (full, env, body) => {
    // Nearby words such as "L e t / A b e / a 3 t" are smashed prose, not cells.
    if (matrixBodyIsLetterSoup(body)) return full
    const rows = String(body).split(/\\\\/)
    const fixed = rows.map((r) => normalizeMatrixRow(r)).filter((r) => r.trim())
    let joined = fixed.join(' \\\\ ')
    const cols = inferMatrixCols(joined)
    joined = repairFlatMatrixBody(joined, cols)
    joined = repairMatrixRowBreaks(joined, cols)
    if (!/\\\\/.test(joined) && cols !== 3) {
      const alt = repairMatrixRowBreaks(repairFlatMatrixBody(String(body), 3), 3)
      if (/\\\\/.test(alt)) joined = alt
    }
    return `\\begin{${env}}${joined}\\end{${env}}`
  })
  MATRIX_ENV_RE.lastIndex = 0
  return out
}

/** @param {string | null | undefined} stem */
export function stemAsksForMatrixValue(stem) {
  return ASKS_MATRIX_ANSWER.test(String(stem ?? ''))
}

/** @param {string | null | undefined} stem @param {string | null | undefined} option */
export function stripMisleadingMatrixOptionPrefix(stem, option) {
  const opt = String(option ?? '').trim()
  if (!opt || !stemAsksForMatrixValue(stem)) return opt
  return opt.replace(OPTION_MATRIX_PREFIX, '$2').trim()
}

/** @param {string} out */
function fixCommonHybridMathTypos(out) {
  let t = String(out ?? '')
  t = t.replace(/(\d+)\\hat\s*\{\s*i\s*\}/gi, '$1I')
  t = t.replace(/(\d+)\s*\\hat\s*\{\s*i\s*\}/gi, '$1I')
  t = t.replace(/\+\s*kA\s*\+\s*(\d+)\\hat\{i\}/gi, '+ kA + $1I')
  t = t.replace(/\bIfA\s*=/gi, 'If $A = ')
  t = t.replace(/\bIf\s+A\s*=\s*\\begin/gi, 'If $A = \\begin')
  return t.replace(
    /\\begin\{(bmatrix|pmatrix)\}([\s\S]*?)\\end\{\1\}/gi,
    (full, env, body) => {
      const fixedBody = String(body).replace(/\bO\b/g, '0')
      return `\\begin{${env}}${fixedBody}\\end{${env}}`
    },
  )
}

/** @param {string | null | undefined} text */
export function sanitizeHybridLatexText(text) {
  const raw = String(text ?? '')
  if (proseLetABeMustStayProse(raw)) return raw
  let out = fixCommonHybridMathTypos(raw)
  out = normalizeMatrixEnvironments(out)
  out = canonicalizeBeginMatrixEnv(out)
  if (/\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}/i.test(out)) {
    out = ensureMatrixStemDelimiters(out)
  }
  // ensureMatrixStemDelimiters turns "If $A = \begin…" into "If $$A=…$$" — keep inline If $A = for Hybrid drafts
  out = out.replace(
    /\bIf\s*\$\$A\s*=\s*(\\begin\{(?:bmatrix|pmatrix)\}[\s\S]*?\\end\{(?:bmatrix|pmatrix)\})\$\$/gi,
    'If $A = $1',
  )
  return out
}

/**
 * Repair stem/options/solution on an in-bank draft (trial or Hybrid AI).
 * @param {import('../data/tests').Question} q
 */
/** @param {import('../data/tests').Question} q */
export function shouldAttemptHybridLatexHeal(q) {
  const stem = String(q?.text ?? '')
  if (!stem.trim()) return false
  if (/\\begin\{(?:bmatrix|pmatrix|vmatrix|matrix)\}/i.test(stem)) return true
  if (/\\hat\s*\{\s*i\s*\}/i.test(stem)) return true
  if (/\bIfA\s*=/i.test(stem)) return true
  if (detectBrokenBankStem(stem).length > 0) return true
  return false
}

/** @param {import('../data/tests').Question} q */
export function maybeHealHybridDraftQuestion(q) {
  if (!q || !shouldAttemptHybridLatexHeal(q)) return q
  const healed = healQuestionLatexForBank(q)
  return JSON.stringify(healed) === JSON.stringify(q) ? q : healed
}

export function healQuestionLatexForBank(q) {
  if (!q || typeof q !== 'object') return q
  const stem = sanitizeHybridLatexText(String(q.text ?? '').trim())
  const next = { ...q, text: stem }
  if (Array.isArray(q.options) && q.options.length) {
    next.options = q.options.map((o) => sanitizeHybridOption(stem, o))
  }
  if (q.solution) {
    next.solution = sanitizeHybridLatexText(String(q.solution))
  }
  next.source = normalizeHybridSourceLabel(q.source)
  return next
}

/** @param {string | null | undefined} stem @param {string | null | undefined} option */
export function sanitizeHybridOption(stem, option) {
  const cleaned = sanitizeHybridLatexText(option)
  return stripTrailingIsEqualTo(stripMisleadingMatrixOptionPrefix(stem, cleaned))
}

export const HYBRID_AI_SOURCE_LABEL = 'Hybrid AI (Postgres)'

const LEGACY_HYBRID_SOURCES = new Set([
  'gemini scq trial',
  'gemini trial',
  'gemini scq',
  'scq trial',
])

/** @param {string | null | undefined} source */
export function normalizeHybridSourceLabel(source) {
  const raw = String(source ?? '').trim()
  if (/gemini\s+scq\s+trial/i.test(raw)) return HYBRID_AI_SOURCE_LABEL
  const key = raw.replace(/\s+/g, ' ').toLowerCase()
  if (!key || LEGACY_HYBRID_SOURCES.has(key) || key.startsWith('gemini')) {
    return HYBRID_AI_SOURCE_LABEL
  }
  if (/^hybrid ai/i.test(raw)) return raw
  return raw
}
