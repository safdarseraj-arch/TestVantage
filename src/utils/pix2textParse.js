/**
 * Pix2Text HTTP response → MCQ-friendly plain text (shared with server/pix2text.js logic).
 */

/**
 * @param {unknown} results
 * @returns {string}
 */
export function normalizePix2TextResults(results) {
  if (typeof results === 'string') return results.trim()
  if (!Array.isArray(results)) return ''
  return results
    .map((block) => {
      const t = String(block?.text ?? '').trim()
      if (!t) return ''
      const type = String(block?.type ?? '').toLowerCase()
      if (type === 'isolated' || type === 'formula' || type === 'embedding') {
        if (/^\$+.+\$+$/.test(t) || t.includes('\\begin{')) return t
        return `$${t}$`
      }
      return t
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function pix2TextLooksMathHeavy(text) {
  const t = String(text ?? '')
  return (
    /\\lim|\\frac|\\ln|\\int|\\sum|\\begin\{|\\operatorname|\\neq/.test(t) ||
    /\$\$?.+\$+?/.test(t)
  )
}

/**
 * Grok diagnosis: nested radicals/fractions in inverse fns, mixed conditions,
 * or long multi-line options — Pix2Text usually beats Gemini/Tesseract here.
 * @param {string} text
 */
export function looksLikeComplexFormulaQuestion(text) {
  const t = String(text ?? '')
  if (!t.trim()) return false
  const nestedInverse =
    /tan\^{-1}|\\tan|toganl|inverse/i.test(t) &&
    (/\\frac|\\sqrt|1-e|1\+e|ecosx|\+ecosx/i.test(t) || /must be same as/i.test(t))
  const mixedConditions = /0\s*<\s*e\s*<\s*1|e\s*>\s*1|where\s+k\s*=|e\s+lies|greater than 1/i.test(t)
  const longOptions =
    ((t.match(/\([A-D]\)/gi) ?? []).length >= 3 && t.length > 280) ||
    /Option\s+[A-D][\s\S]{0,40}Option\s+[A-D]/i.test(t)
  const garbledIntegral =
    /\|\s*he\s+must|\+ecosx|Blog,\s*\(9|2€\s*T0|toganl/i.test(t) ||
    (/must be same as/i.test(t) && !/\\int\s*\\frac/.test(t)) ||
    (/QInx/i.test(t) && /\bdx\b/i.test(t)) ||
    (/241\s*\|/.test(t) && (/\bdx\b|\+ 1\)dx/i.test(t) || /QInx/i.test(t))) ||
    (/\bdx\b/i.test(t) && !/\\int/.test(t) && /\+\s*[Cc]\b/.test(t) && /ln|Inx|x\s*\^/i.test(t))
  return nestedInverse || mixedConditions || longOptions || garbledIntegral
}
