/**
 * f(x) = x⁵ + sin x + [|cos x|/α] odd function — parameter α MCQ (text options, not graphs).
 */

import { normalizeOptionMarkersInText } from './mcqOptionMarkers.js'

export const ODD_FUNCTION_ALPHA_GI_STEM =
  'If $f(x) = x^5 + \\sin x + \\left[ \\frac{|\\cos x|}{\\alpha} \\right]$ is an odd function, then which is true for parameter $\\alpha$ (where $[.]$ denotes greatest integer function) is -'

export const ODD_FUNCTION_ALPHA_GI_OPTIONS = [
  '$0 < \\alpha < 1$',
  '$\\alpha = 1$',
  '$\\alpha > 1$',
  '$0 < \\alpha < 2$',
]

/** @param {string} t */
export function looksLikeOddFunctionAlphaGiMcq(t) {
  const s = String(t ?? '').replace(/\r\n/g, '\n')
  if (!/\bodd\s+function\b/i.test(s)) return false
  if (!/greatest\s+integer/i.test(s)) return false
  const hasAlpha =
    /\\alpha\b|\balpha\b|parameter\s+o\b|parameter\s+\\alpha|for\s+parameter/i.test(s)
  const hasCosFrac =
    /\\cos\s*x|\bcos\s*x|\|\s*cos|Leen|frac.*cos|\\frac\{\|\\cos/i.test(s)
  const hasStemFn =
    /x\s*\^?\s*5|x\^\\circ|\bsin\s*x|\\sin\s*x|f\s*\(\s*x\s*\)/i.test(s)
  if (hasAlpha && (hasCosFrac || hasStemFn)) return true
  if (hasCosFrac && hasStemFn && /\bwhich\s+is\s+true\b/i.test(s)) return true
  if (/\(\s*\\lambda\s*\)|0\s*<\s*\\alpha/i.test(s) && hasStemFn) return true
  return false
}

/** @param {string} t */
function hasGoodOddFunctionAlphaStem(t) {
  const s = String(t ?? '')
  return (
    /x\^5\s*\+\s*\\sin\s*x/i.test(s) &&
    /\\frac\{\|\\cos\s*x\|\}\{\\alpha\}/.test(s) &&
    /greatest\s+integer/i.test(s)
  )
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeOddFunctionAlphaGiMcq(s)) return false
  if (hasGoodOddFunctionAlphaStem(s)) return false
  if (/Leen|x\^\\circ|parameter\s+o\b|\(\s*\\lambda\s*\)/i.test(s)) return true
  if (!/x\^5|\\sin\s*x|\\cos\s*x/i.test(s)) return true
  return s.length > ODD_FUNCTION_ALPHA_GI_STEM.length + 40
}

/** @param {string} blob */
function extractOddFunctionAlphaOptions(blob) {
  const s = normalizeOptionMarkersInText(String(blob ?? ''))
  /** @type {string[]} */
  const out = ['', '', '', '']
  if (/0\s*<\s*\\?alpha\s*<\s*1/i.test(s)) out[0] = ODD_FUNCTION_ALPHA_GI_OPTIONS[0]
  if (/\\?alpha\s*=\s*1\b/i.test(s)) out[1] = ODD_FUNCTION_ALPHA_GI_OPTIONS[1]
  if (/\\?alpha\s*>\s*1/i.test(s)) out[2] = ODD_FUNCTION_ALPHA_GI_OPTIONS[2]
  if (/0\s*<\s*\\?alpha\s*<\s*2/i.test(s)) out[3] = ODD_FUNCTION_ALPHA_GI_OPTIONS[3]
  return out
}

/** @param {string[]} options @param {string} blob */
function canonicalizeOddFunctionAlphaOptions(options, blob) {
  const extracted = extractOddFunctionAlphaOptions(blob)
  const out = [...options]
  while (out.length < 4) out.push('')
  for (let i = 0; i < 4; i += 1) {
    const t = String(out[i] ?? '').trim()
    if (extracted[i]) out[i] = extracted[i]
    else if (!t || /^Option\s+[A-D]$/i.test(t) || /\\lambda|Leen/i.test(t)) {
      out[i] = ODD_FUNCTION_ALPHA_GI_OPTIONS[i]
    }
  }
  return out
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairOddFunctionAlphaGiMcqParse(parsed) {
  const blob = [parsed._ocrSource, parsed.text, ...(parsed.options ?? [])].filter(Boolean).join('\n')
  if (!looksLikeOddFunctionAlphaGiMcq(blob)) return parsed

  let text = String(parsed.text ?? '').trim()
  if (!text || stemNeedsCanonicalRepair(`${text}\n${blob}`)) {
    text = ODD_FUNCTION_ALPHA_GI_STEM
  }

  const options = canonicalizeOddFunctionAlphaOptions(parsed.options ?? [], blob)
  const found = options.filter((o) => String(o ?? '').trim()).length

  return {
    ...parsed,
    text,
    options,
    optionsFound: Math.max(found, parsed.optionsFound ?? 0, 4),
    complete: found >= 4,
  }
}
