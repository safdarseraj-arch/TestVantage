/**
 * JEE SCQ: Let a=i+j, b=j+k, c=αa+βb; coplanar with i−2j+k, 3i+2j−k → α/β.
 * Also applies generic vector OCR polish used by other coplanar stems.
 */
import { finalizeStemForBank } from './stemBankGuard.js'

export const COPLANAR_ALPHA_BETA_RATIO_STEM =
  'Let $\\vec{a} = \\hat{i} + \\hat{j}$, $\\vec{b} = \\hat{j} + \\hat{k}$ and $\\vec{c} = \\alpha \\vec{a} + \\beta \\vec{b}$. If the vectors $\\hat{i} - 2\\hat{j} + \\hat{k}$, $3\\hat{i} + 2\\hat{j} - \\hat{k}$ and $\\vec{c}$ are coplanar, then $\\dfrac{\\alpha}{\\beta}$ is'

export const COPLANAR_ALPHA_BETA_RATIO_OPTIONS = ['$1$', '$2$', '$3$', '$-3$']

/**
 * Generic vector OCR fixes for future uploads (not one question only).
 * @param {string} text
 */
export function polishGarbledVectorStemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n')
  if (!t.trim()) return t

  // Glued English
  t = t.replace(/\bIfthe\b/gi, 'If the')
  t = t.replace(/\bandthe\b/gi, 'and the')
  t = t.replace(/\bthenthe\b/gi, 'then the')
  t = t.replace(/\barecoplanar\b/gi, 'are coplanar')
  t = t.replace(/([a-zA-Z}k])and(?=[¢c\\])/gi, '$1 and ')
  t = t.replace(/([jk])and(?=\s*[¢c\\aα])/gi, '$1 and ')

  // ¢ / copyright glyph often = vector c (or option C elsewhere)
  if (/coplanar|\\vec|vector|\bhat\b|\\hat|[îĵk̂]/i.test(t)) {
    t = t.replace(/¢/g, (m, offset, str) => {
      const before = str.slice(Math.max(0, offset - 24), offset)
      if (/\(\s*$/.test(before)) return 'C' // (¢) option label
      return '\\vec{c}'
    })
  }

  // Let s=i+j → Let a = i+j (OCR a→s) when followed by b= / vec b
  t = t.replace(
    /\bLet\s+s\s*=\s*i\s*\+\s*j\b/gi,
    'Let $\\vec{a} = \\hat{i} + \\hat{j}$',
  )
  t = t.replace(
    /\bLet\s+(?:\\vec\{a\}|a)\s*=\s*i\s*\+\s*j\b/gi,
    'Let $\\vec{a} = \\hat{i} + \\hat{j}$',
  )

  // \vec{b}=j+k / b=j+k
  t = t.replace(
    /(?:\\vec\{b\}|\bb)\s*=\s*j\s*\+\s*k\b/gi,
    '$\\vec{b} = \\hat{j} + \\hat{k}$',
  )

  // c = α a + β b (OCR: a a +pb, aa+pb, αa+βb)
  t = t.replace(
    /(?:\\vec\{c\}|\bc)\s*=\s*(?:a\s*a|α\s*a|\\alpha\s*\\vec\{a\}|\\alpha\s*a)\s*\+\s*(?:p\s*b|β\s*b|\\beta\s*\\vec\{b\}|\\beta\s*b)/gi,
    '$\\vec{c} = \\alpha \\vec{a} + \\beta \\vec{b}$',
  )
  t = t.replace(
    /\\vec\{c\}\s*=\s*a\s*a\s*\+\s*p\s*b/gi,
    '$\\vec{c} = \\alpha \\vec{a} + \\beta \\vec{b}$',
  )

  // i — 2 ĵ + k  /  i-2j+k
  t = t.replace(
    /\bi\s*[—–-]\s*2\s*(?:\\hat\{j\}|ĵ|j)\s*\+\s*(?:\\hat\{k\}|k̂|k)\b/gi,
    '$\\hat{i} - 2\\hat{j} + \\hat{k}$',
  )

  // 31 + 27 - k → 3i + 2j - k (digit glued to i/j)
  t = t.replace(
    /\b3\s*1\s*\+\s*2\s*7\s*[—–-]\s*k\b/gi,
    '$3\\hat{i} + 2\\hat{j} - \\hat{k}$',
  )
  t = t.replace(
    /\b3i\s*\+\s*2j\s*[—–-]\s*k\b/gi,
    '$3\\hat{i} + 2\\hat{j} - \\hat{k}$',
  )
  t = t.replace(
    /\b3\\hat\{i\}\s*\+\s*2\\hat\{j\}\s*[—–-]\s*(?:\\hat\{k\}|k)\b/gi,
    '$3\\hat{i} + 2\\hat{j} - \\hat{k}$',
  )

  // then 5 is / then α is → α/β when coplanar αβ stem
  if (/coplanar/i.test(t) && (/\\alpha|\\beta|α|β|\\vec\{a\}.*\\vec\{b\}/i.test(t) || /a\s*a\s*\+\s*p/i.test(t))) {
    t = t.replace(/\bthen\s+5\s+is\b/gi, 'then $\\dfrac{\\alpha}{\\beta}$ is')
    t = t.replace(/\bthen\s+(?:α|\\alpha)\s+is\b/gi, 'then $\\dfrac{\\alpha}{\\beta}$ is')
    t = t.replace(/\bthen\s+α\s*\/\s*β\s+is\b/gi, 'then $\\dfrac{\\alpha}{\\beta}$ is')
  }

  // Bare unit vectors in coplanar list: prefer hats when already mixed
  if (/coplanar/i.test(t)) {
    t = t.replace(/(?<!\\hat\{)(?<![a-zA-Z])\bi\b(?!\s*=)/g, (m, offset, str) => {
      const ctx = str.slice(Math.max(0, offset - 8), offset + 12)
      if (/\\hat\{i\}|\\vec/.test(ctx)) return '\\hat{i}'
      if (/[+\-–—]\s*$/.test(str.slice(Math.max(0, offset - 3), offset))) return '\\hat{i}'
      return m
    })
  }

  return t.replace(/[ \t]+/g, ' ').replace(/\s+\n/g, '\n').trim()
}

/** @param {string} t */
export function looksLikeCoplanarAlphaBetaRatioMcq(t) {
  const s = String(t ?? '')
  if (!/coplanar/i.test(s)) return false
  // Must look like a=i+j / b=j+k / c=αa+βb family (not the unit-d perpendicular SCQ)
  if (/unit\s+vector|perpendicular/i.test(s) && /\\wedge|30|\\cdot\s*\\hat/i.test(s)) return false

  const hasAb =
    /\\vec\{a\}|Let\s+s\s*=|Let\s+a\s*=|a\s*=\s*i\s*\+\s*j|\\hat\{i\}\s*\+\s*\\hat\{j\}/i.test(s)
  const hasB = /\\vec\{b\}|b\s*=\s*j\s*\+\s*k|\\hat\{j\}\s*\+\s*\\hat\{k\}/i.test(s)
  const hasC =
    /\\vec\{c\}|¢|\\alpha|α|a\s*a\s*\+\s*p|\\beta|β/i.test(s) ||
    /c\s*=\s*.*a.*\+.*b/i.test(s)
  const hasTrip =
    /i\s*[—–-]\s*2|\\hat\{i\}\s*-\s*2|3\s*1\s*\+\s*2|3i\s*\+\s*2j|3\\hat\{i\}/i.test(s)
  const asksRatio =
    /then\s+5\s+is|then\s+(?:α|\\alpha|\\dfrac\{\\alpha\})|α\s*\/\s*β|\\alpha\s*\/\s*\\beta|dfrac\{\\alpha\}\{\\beta\}/i.test(
      s,
    ) || /then\s+.+\s+is\s*$/i.test(s.trim())

  return hasAb && hasB && (hasC || hasTrip) && (asksRatio || hasTrip)
}

/** @param {string} text */
export function coplanarAlphaBetaRatioStemNeedsCanonical(text) {
  const t = String(text ?? '')
  if (!looksLikeCoplanarAlphaBetaRatioMcq(t)) return false
  const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
  return norm(t) !== norm(COPLANAR_ALPHA_BETA_RATIO_STEM)
}

/** @param {string} o */
function optionLooksLikeAlphaBetaRatio(o) {
  const t = String(o ?? '').trim()
  if (!t) return false
  return /^\$?-?3\$?$/.test(t) || /^\$?[123]\$?$/.test(t) || /^-?3$/.test(t) || /^[123]$/.test(t)
}

/**
 * @param {string} text
 */
export function repairCoplanarAlphaBetaRatioMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  const rawLooks = looksLikeCoplanarAlphaBetaRatioMcq(t)
  t = polishGarbledVectorStemOcr(t)
  if (!rawLooks && !looksLikeCoplanarAlphaBetaRatioMcq(t)) return t

  // Always restore golden for this fingerprint — polish alone leaves commas/$ gaps.
  return COPLANAR_ALPHA_BETA_RATIO_STEM
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, suggestedQuestionType?: string, complete?: boolean }} parsed
 */
export function repairCoplanarAlphaBetaRatioMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeCoplanarAlphaBetaRatioMcq(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  let text = repairCoplanarAlphaBetaRatioMcqOcr(parsed.text ?? '')
  const realOpts = opts.filter((o) => optionLooksLikeAlphaBetaRatio(o)).length
  const needs =
    realOpts < 4 ||
    coplanarAlphaBetaRatioStemNeedsCanonical(text) ||
    /[¢]|Ifthe|then\s+5\s+is/i.test(text)

  if (needs) {
    text = COPLANAR_ALPHA_BETA_RATIO_STEM
    for (let i = 0; i < 4; i++) opts[i] = COPLANAR_ALPHA_BETA_RATIO_OPTIONS[i]
  } else {
    text = finalizeStemForBank(text, opts)
    for (let i = 0; i < 4; i++) {
      if (!optionLooksLikeAlphaBetaRatio(opts[i])) opts[i] = COPLANAR_ALPHA_BETA_RATIO_OPTIONS[i]
      else opts[i] = finalizeStemForBank(opts[i])
    }
  }

  parsed.text = text
  parsed.options = opts
  parsed.optionsFound = 4
  parsed.complete = true
  parsed.suggestedQuestionType = 'single_correct'
  return parsed
}
