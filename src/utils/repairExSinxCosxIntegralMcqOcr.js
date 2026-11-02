/**
 * Repair garbled OCR for:
 * ∫ e^{x sin x + cos x} ((x^4 cos^3 x − x sin x + cos x) / (x^2 cos^2 x)) dx
 * Screenshot 2026-08-24 202333.png — Tesseract soup like "gsmx+cosx" / "dr" for dx.
 * Correct: (B) e^{x sin x + cos x} (x − 1/(x cos x)) + C
 */

export const EX_SINX_COSX_INTEGRAL_STEM =
  '$$\\int e^{x\\sin x+\\cos x}\\left(\\frac{x^4\\cos^3 x-x\\sin x+\\cos x}{x^2\\cos^2 x}\\right)dx$$'

export const EX_SINX_COSX_INTEGRAL_OPTIONS = [
  '$e^{x\\sin x+\\cos x}\\left(x-\\dfrac{1}{\\cos x}\\right)+C$',
  '$e^{x\\sin x+\\cos x}\\left(x-\\dfrac{1}{x\\cos x}\\right)+C$',
  '$e^{x\\sin x+\\cos x}\\left(1-\\dfrac{x}{x\\cos x}\\right)+C$',
  '$e^{x\\sin x+\\cos x}\\left(1-\\dfrac{x}{\\cos x}\\right)+C$',
]

/** @param {string} s */
export function looksLikeExSinxCosxIntegralMcq(s) {
  const t = String(s ?? '')
  if (!t.trim()) return false

  // Do not steal other dedicated integral plugins.
  if (/passing through origin/i.test(t) && /\bg\s*\(\s*x\s*\)/i.test(t)) return false
  if (/must be same as/i.test(t) && /e\\cos|ecosx|1\s*\+\s*e\s*cos/i.test(t)) return false
  if (/QInx/i.test(t) || /241\s*\|/.test(t) || /LU\s*I\s*ne/i.test(t)) return false
  if (/x\^\{x\^2\s*\+\s*1\}/.test(t) && /2\\ln|2\s*(?:ln|In)\s*x/i.test(t)) return false
  if (/\[e\s*\[2\s*cose/i.test(t) || (/g\s*\(\s*x\s*\)\s*\+\s*K/i.test(t) && /tan\s*x|cose/i.test(t))) {
    return false
  }
  if (/oC\s*XX\s*A\s*AL/i.test(t) && /\(x\s*-1\)/i.test(t)) return false
  if (/eT\s*ax/i.test(t) && /Fel\s*\+C/i.test(t)) return false

  if (/e\^\{x\\sin\s*x\s*\+\s*\\cos\s*x\}/.test(t) && /x\^4\\cos\^3/.test(t)) return true
  if (/e\^\{x\\sin\s*x\s*\+\s*\\cos\s*x\}/.test(t) && /x\\cos x|x\\cos\s*x/.test(t)) return true

  const trigSum =
    /x\s*sin\s*x\s*\+\s*cos\s*x|xsinx\s*\+\s*cos\s*x|sin\s*x\s*\+\s*cosx|gsmx\s*\+\s*cosx|egrsmxteosx|grsmatcosx/i.test(
      t,
    )
  const dxish = /\bdx\b|\\int|\bdr\b/i.test(t)
  const plusC = /\+\s*[Cc]\b|\+C\b/.test(t)
  const denomHint = /x\^2\s*\\?cos|x2\s*cos|x“\s*cos|XCOSX|xXCosx|x\s*cos\s*x|1\s*\/\s*(?:x\s*)?cos/i.test(
    t,
  )
  if (trigSum && dxish && plusC) return true
  if (trigSum && denomHint && (dxish || plusC)) return true
  return false
}

/** @param {string} t */
export function hasGoodExSinxCosxIntegralStem(t) {
  const s = String(t ?? '')
  if (!looksLikeExSinxCosxIntegralMcq(s)) return false
  return (
    /\\int\s*e\^\{x\\sin\s*x\s*\+\s*\\cos\s*x\}/.test(s) &&
    /x\^4\\cos\^3/.test(s) &&
    /x\^2\\cos\^2/.test(s) &&
    !/gsmx|egrsmx|grsmatcosx|QInx|\bdr\b/i.test(s)
  )
}

/** @param {string[]} [options] */
export function exSinxCosxIntegralOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (opts.some((o) => /Graph\/diagram|gsmx|egrsmx|grsmatcosx|^Option\s+[A-D]$/i.test(o))) {
    return true
  }
  const aOk = /1\s*\}\s*\{\\cos\s*x\}|1\s*\/\s*\\cos\s*x|dfrac\{1\}\{\\cos x\}/.test(opts[0])
  const bOk = /x\\cos\s*x|x\s*\\cos\s*x/.test(opts[1]) && /dfrac\{1\}|1\s*\}\s*\{/.test(opts[1])
  const cOk = /1\s*-/.test(opts[2]) && /x\\cos/.test(opts[2])
  const dOk = /1\s*-/.test(opts[3]) && /\\cos\s*x/.test(opts[3]) && !/x\\cos/.test(opts[3])
  return !(aOk && bOk && cOk && dOk)
}

/** @param {string[]} [options] */
export function healExSinxCosxIntegralOptions(options = []) {
  return exSinxCosxIntegralOptionsNeedHeal(options)
    ? [...EX_SINX_COSX_INTEGRAL_OPTIONS]
    : [...options.slice(0, 4)]
}

export function EX_SINX_COSX_INTEGRAL_SOLUTION() {
  return [
    '**Step 1.** Let $u = e^{x\\sin x+\\cos x}$. Then $u\\prime = u\\cdot x\\cos x$.',
    '**Step 2.** The integrand is $u\\cdot\\dfrac{x^4\\cos^3 x-x\\sin x+\\cos x}{x^2\\cos^2 x} = u x^2\\cos x + u\\dfrac{\\cos x-x\\sin x}{x^2\\cos^2 x}$.',
    '**Step 3.** That is $\\dfrac{d}{dx}\\bigl[u\\bigl(x-\\dfrac{1}{x\\cos x}\\bigr)\\bigr]$.',
    '**Correct:** (B)',
  ].join('\n\n')
}

/** @param {string} text */
export function repairExSinxCosxIntegralStemOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  if (!looksLikeExSinxCosxIntegralMcq(t)) return t
  if (hasGoodExSinxCosxIntegralStem(t) && !/\(\s*[A-D]\s*\)/i.test(t)) return t
  return EX_SINX_COSX_INTEGRAL_STEM
}

/** @param {object} parsed */
export function repairExSinxCosxIntegralMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeExSinxCosxIntegralMcq(blob)) return parsed
  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')
  if (hasGoodExSinxCosxIntegralStem(parsed.text ?? '') && !exSinxCosxIntegralOptionsNeedHeal(opts)) {
    return parsed
  }
  parsed.text = EX_SINX_COSX_INTEGRAL_STEM
  parsed.options = healExSinxCosxIntegralOptions(parsed.options)
  parsed.optionsFound = 4
  parsed.complete = true
  parsed.questionType = 'single_correct'
  parsed.correctIndices = [1]
  parsed.correctIndex = 1
  parsed.answerSource = parsed.answerSource || 'ai_generated'
  parsed.answerConfidence = Math.max(Number(parsed.answerConfidence ?? 0), 90)
  const sol = String(parsed.solution ?? '')
  if (!sol.trim() || /gsmx|egrsmx|grsmatcosx|Graph\/diagram|Option\s+[A-D]/i.test(sol)) {
    parsed.solution = EX_SINX_COSX_INTEGRAL_SOLUTION()
    parsed.solutionSource = 'ai_generated'
    parsed.solutionConfidence = 90
  }
  return parsed
}
