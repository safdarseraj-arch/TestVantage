/**
 * Detect MCQ OCR context so triangle / fraction-vector repairs do not run on unrelated MSQs.
 */

/** @param {string} text */
export function isVectorTruthMsq(text) {
  const t = String(text ?? '')
  if (/which of the following\s+is\/are\s+true/i.test(t)) return true
  return (
    /four non-zero vectors|linearly independent/i.test(t) &&
    /parallelogram/i.test(t) &&
    /projection/i.test(t)
  )
}

/** @param {string} text */
export function isTriangleAreaMcq(text) {
  return /area of triangle|medians respectively/i.test(String(text ?? ''))
}

/**
 * Box-product / fraction vector MCQ (1/4, 49/4, 4/9, 0) — not "is/are true" MSQ.
 * @param {string} text
 */
export function isFractionVectorMcq(text) {
  const t = String(text ?? '')
  if (isVectorTruthMsq(t)) return false
  return (
    (/\\vec\{a\}.*\\vec\{b\}.*\\vec\{c\}/i.test(t) ||
      /\\left\[[^\]]*\\vec\{a\}/i.test(t)) &&
    (/\\frac\{1\}\{4\}|\\frac\{49\}\{4\}|\\frac\{4\}\{9\}|49\/4|4\/9/i.test(t))
  )
}
