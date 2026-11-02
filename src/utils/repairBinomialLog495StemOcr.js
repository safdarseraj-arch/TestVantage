/** JEE MSQ: 9th term of (1/x² + x/2 log₂ x)^12 equals 495. */
export const BINOMIAL_LOG495_STEM = `If the $9^{\\text{th}}$ term in the expansion of $\\left(\\frac{1}{x^2}+\\frac{x}{2}\\log_2 x\\right)^{12}$ is equal to $495$, then the value of $x$ can be`

export const BINOMIAL_LOG495_OPTIONS = `(A) 1
(B) An integer greater than 1
(C) a fraction
(D) an irrational number`

export const BINOMIAL_LOG495_OPTION_LIST = [
  '1',
  'An integer greater than 1',
  'a fraction',
  'an irrational number',
]

/** @param {string} t */
export function looksLikeBinomialLog495Question(t) {
  const s = String(t ?? '')
  if (!/\b495\b/.test(s)) return false
  if (!/expansion/i.test(s)) return false
  if (
    !/(?:9\s*(?:\^\{[^}]*th[^}]*\}|th|st|nd|rd)?\s*term|9\s+term)/i.test(s) &&
    !/9\^\{\\text\{th\}\}/i.test(s)
  ) {
    return false
  }
  if (!/(?:log|log\s*2|log_2)/i.test(s)) return false
  if (!/\bx\b/i.test(s)) return false
  return (
    /\+\s*log|log\s*,\s*x|\(\s*&\s*\+|\(\s*\+\+|1\s*\/\s*x\^?2|x\s*\/\s*2/i.test(s) ||
    /value\s+of\s+x\s+can\s+be/i.test(s) ||
    /irrational\s+number/i.test(s) ||
    /a\s+fraction/i.test(s)
  )
}

/** @param {string} t */
function hasFullMcqOptions(t) {
  return (
    /\(\s*A\s*\)/i.test(t) &&
    /\(\s*B\s*\)/i.test(t) &&
    /\(\s*C\s*\)/i.test(t) &&
    /\(\s*D\s*\)/i.test(t)
  )
}

/** @param {string} t */
function hasCompleteBinomialLog495Options(t) {
  return (
    /\(\s*A\s*\)\s*\$?1\$?(?:\s|$|\))/i.test(t) &&
    /integer\s+greater\s+than/i.test(t) &&
    /a\s+fraction/i.test(t) &&
    /irrational\s+number/i.test(t)
  )
}

/**
 * Repairs garbled OCR for the binomial (1/x² + x/2 log₂ x)^12, 9th term = 495 MSQ.
 * @param {string} text
 */
export function repairBinomialLog495StemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  const match = looksLikeBinomialLog495Question(t)

  t = t.replace(/^\s*\d{1,3}\.?\s+(?=If\s+the\s+9)/i, '')
  t = t.replace(/\(\s*&\s*\+\s*log\s*,\s*x\s*\)/gi, '$\\left(\\frac{1}{x^2}+\\frac{x}{2}\\log_2 x\\right)^{12}$')
  t = t.replace(/\(\s*\+\+?\s*log\s*2?\s*x\s*\)/gi, '$\\left(\\frac{1}{x^2}+\\frac{x}{2}\\log_2 x\\right)^{12}$')
  t = t.replace(/\b9\s+term\b/gi, '$9^{\\text{th}}$ term')
  t = t.replace(/\b495\s*,/g, '495,')
  t = t.replace(/value\s+of\s+x\s+can\s+be\s*[-–—]?\s*(?:X\s*AI)?(?=\s*(?:\n|\(|$))/i, 'value of $x$ can be')
  t = t.replace(/\$\\ce\{An\}\$/gi, () => 'An integer greater than 1')

  if (!match) return t

  if (
    /\\left\(\\frac\{1\}\{x\^2\}/.test(t) &&
    hasFullMcqOptions(t) &&
    hasCompleteBinomialLog495Options(t)
  ) {
    return t
  }

  if (hasFullMcqOptions(t) && /irrational\s+number|a\s+fraction/i.test(t)) {
    return `${BINOMIAL_LOG495_STEM}\n${BINOMIAL_LOG495_OPTIONS}`
  }

  return `${BINOMIAL_LOG495_STEM}\n${BINOMIAL_LOG495_OPTIONS}`
}

/** @param {import('../data/tests').Question} q @param {string} [blob] */
export function needsBinomialLog495OptionHeal(q, blob = '') {
  const b = blob || [q?.text, ...(q?.options ?? []), q?.ocrRawText, q?.extractedRaw].filter(Boolean).join('\n')
  if (!looksLikeBinomialLog495Question(b)) return false
  const cur = (q?.options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  const ok =
    cur[0] === '1' &&
    /integer\s+greater\s+than/i.test(cur[1] ?? '') &&
    /^a\s+fraction$/i.test(cur[2] ?? '') &&
    /irrational\s+number/i.test(cur[3] ?? '')
  return !ok
}

/**
 * Fix stored binomial log495 MCQ when OCR dropped option A or swapped B/C.
 * @param {import('../data/tests').Question} q
 */
export function healBinomialLog495Question(q) {
  if (!q || typeof q !== 'object') return null
  const blob = [q.text, ...(q.options ?? []), q.ocrRawText, q.extractedRaw].filter(Boolean).join('\n')
  if (!needsBinomialLog495OptionHeal(q, blob)) return null
  let text = String(q.text ?? '').trim()
  if (!/\\frac\{1\}\{x\^2\}/.test(text) || !/\\log_2\s*x/.test(text)) {
    text = BINOMIAL_LOG495_STEM
  }
  return {
    ...q,
    text,
    options: [...BINOMIAL_LOG495_OPTION_LIST],
  }
}
