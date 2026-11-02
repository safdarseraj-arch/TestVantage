/**
 * Repair garbled OCR for:
 * integral with tan inverse and blank k.
 */

export const TAN_INVERSE_K_INTEGRAL_STEM =
  '$$\\int \\frac{(x^2 - 2)\\,dx}{(x^4 + 5x^2 + 4)\\,\\tan^{-1}\\!\\left(\\frac{x^2 + 2}{x}\\right)} = \\log\\left|\\tan^{-1}\\!\\left(x + \\frac{k}{x}\\right)\\right| + C,\\ \\text{where } k = \\underline{\\hspace{1.5em}}.$$'

/** @param {string} s */
export function looksLikeTanInverseKIntegral(s) {
  const t = String(s ?? '')
  if (!t.trim()) return false
  if (!/where[\s\S]{0,24}?k\s*[=:.]/i.test(t)) return false

  const tanSig =
    /\btan\b|\\tan|tan\^{-1}|tan\^|toganl|toga\s*nl|taninv|tan\s*[-−]?\s*1/i.test(t)
  const logSig = /\\log|\blog\b|ln\b|\\ln|dxlog|\+\s*C\b|\bCe\b|\bec\b/i.test(t)
  const intSig = /\bint\b|\\int|\bdx\b|dxlog/i.test(t)

  if (
    tanSig &&
    (/toganl\s*\(\s*x\s*\+|\\tan\^{-1}[\s\S]{0,48}?k/i.test(t) ||
      /x\s*\+\s*[\d/k]|\\frac\{k\}\{x\}|k\s*\./i.test(t))
  ) {
    return true
  }

  if (!tanSig) return false
  if (!logSig || !intSig) {
    const partialNum =
      /x\^?\{?4\}?|x\s*4|\+\s*5\s*x|5\s*x\^?\{?2\}?|552|5x2|4\]/i.test(t) ||
      /x\^?\{?2\}?\s*[-−]\s*2|2\s*[-−]\s*2|×\s*2\s*[-−]\s*2|2\s*[-−_~]+\s*/i.test(t) ||
      /k\s*\/\s*x|\\frac\{k\}\{x\}/i.test(t)
    return partialNum && (logSig || intSig)
  }

  const hasNum =
    /x\^?\{?4\}?|x\s*4|\+\s*5\s*x|5\s*x\^?\{?2\}?|552|5x2|4\]/i.test(t) ||
    /x\^?\{?2\}?\s*[-−]\s*2|2\s*[-−]\s*2|×\s*2\s*[-−]\s*2|2\s*[-−_~]+\s*/i.test(t) ||
    /k\s*\/\s*x|\\frac\{k\}\{x\}/i.test(t)
  return hasNum
}

/** @param {string} t */
export function hasGoodTanInverseKIntegralStem(t) {
  const s = String(t ?? '')
  if (!looksLikeTanInverseKIntegral(s)) return false
  return (
    /\\int[\s\S]*\\frac[\s\S]*\(x\^2\s*-\s*2\)/.test(s) &&
    /x\^4\s*\+\s*5x\^2\s*\+\s*4/.test(s) &&
    /\\tan\^{-1}/.test(s) &&
    /\\frac\{x\^2\s*\+\s*2\}\{x\}/.test(s) &&
    /\\log[\s\S]*\\tan\^{-1}[\s\S]*\\frac\{k\}\{x\}/.test(s) &&
    !/552\s*von|XxX|£\)|toganl|-_-|\bEN\s+Ce|\bec\./i.test(s)
  )
}

/** @param {string} text */
export function repairTanInverseKIntegralOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  if (!looksLikeTanInverseKIntegral(t)) return t
  if (hasGoodTanInverseKIntegralStem(t)) return t
  return TAN_INVERSE_K_INTEGRAL_STEM
}

/** @param {string} text */
export function tanInverseKIntegralAnswer(text) {
  const blob = String(text ?? '')
  if (!looksLikeTanInverseKIntegral(blob)) return null
  return 2
}

/**
 * Restore integer stem when OCR/AI returns soup for tan inverse k integral.
 * @param {{ text?: string, options?: string[], optionsFound?: number, questionType?: string, correctInteger?: number, _ocrSource?: string }} parsed
 */
export function repairTanInverseKIntegralParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = [parsed._ocrSource, parsed.text, ...(parsed.options ?? [])].filter(Boolean).join('\n')
  if (!looksLikeTanInverseKIntegral(blob)) return parsed

  parsed.text = repairTanInverseKIntegralOcr(String(parsed.text ?? ''))
  parsed.options = ['', '', '', '']
  parsed.optionsFound = 0
  if (!parsed.questionType || parsed.questionType === 'single_correct') {
    parsed.questionType = 'integer'
  }
  if (parsed.correctInteger == null || parsed.correctInteger === '') {
    parsed.correctInteger = tanInverseKIntegralAnswer(blob)
  }
  return parsed
}
