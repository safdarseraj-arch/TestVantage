/**
 * Repair garbled OCR for:
 * If ∫ e^x ( 2 tan x/(1+tan x) + csc²(x+π/4) ) dx = e^x · g(x) + K,
 * then g(5π/4) = 0, 1, -1, or 2.
 *
 * Identity: 2tanx/(1+tanx) = 1 + tan(x-π/4), and csc²(x+π/4) = sec²(x-π/4).
 * So g + g' = 1 + tan(x-π/4) + sec²(x-π/4) ⇒ g(x) = 1 + tan(x-π/4)
 *   = 2 sin x / (sin x + cos x).
 * g(5π/4) = 1 + tan(π) = 1. Correct: (B), not (A)=0.
 */

export const TAN_CSC_GX_INTEGRAL_STEM =
  'If $$\\int e^{x}\\left(\\dfrac{2\\tan x}{1+\\tan x}+\\csc^{2}\\left(x+\\dfrac{\\pi}{4}\\right)\\right)dx=e^{x}\\cdot g(x)+K$$, then $g\\left(\\dfrac{5\\pi}{4}\\right)=$'

export const TAN_CSC_GX_INTEGRAL_OPTIONS = ['$0$', '$1$', '$-1$', '$2$']

/** @param {string} s */
export function looksLikeTanCscGxIntegralMcq(s) {
  const t = String(s ?? '')
  if (!t.trim()) return false

  // Do not steal other dedicated plugins.
  if (/passing through origin/i.test(t) && /\bg\s*\(\s*x\s*\)/i.test(t)) return false
  if (/QInx/i.test(t) || /241\s*\|/.test(t) || /LU\s*I\s*ne/i.test(t)) return false
  if (/x\^\{x\^2\s*\+\s*1\}/.test(t) && /2\\ln|2\s*(?:ln|In)\s*x/i.test(t)) return false
  if (/oC\s*XX\s*A\s*AL/i.test(t) && /\(x\s*-1\)/i.test(t)) return false
  if (/gsmx\s*\+\s*cosx|egrsmxteosx|grsmatcosx/i.test(t)) return false
  if (/where[\s\S]{0,24}?k\s*[=:.]/i.test(t) && /tan\^{-1}|toganl/i.test(t)) return false

  // Screenshot soup: "If [e [2 cose (2 )ar=e g(x) + K, then f =) χ" + broken 2 tan x latex.
  if (/\[e\s*\[2\s*cose/i.test(t) && /g\s*\(\s*x\s*\)\s*\+\s*K/i.test(t)) return true
  if (/\[e\s*\[2\s*cose/i.test(t) && /then\s+f\s*=/i.test(t)) return true
  if (/g\s*\(\s*x\s*\)\s*\+\s*K/i.test(t) && /2\s*\\tan\s*x|2\s*tan\s*x/i.test(t)) return true
  if (/cose/i.test(t) && /g\s*\(\s*x\s*\)\s*\+\s*K/i.test(t) && /then/i.test(t)) return true

  // Canonical / healed stem uses \csc^{2} (not \csc^2) and g\left(5\pi/4\right).
  if (
    /2\\tan\s*x/.test(t) &&
    /\\csc\^(?:\{2\}|2)|csc\^2|cosec\^2|\\operatorname\{cosec\}/i.test(t) &&
    /g\s*\(\s*x\s*\)|g\\left/.test(t)
  ) {
    return true
  }
  if (
    /g\\left\(\\dfrac\{5\\pi\}\{4\}|g\s*\(\s*\\dfrac\{5\\pi\}\{4\}|g\s*\(\s*5\\pi|g\s*\(\s*5\s*\\pi/i.test(t) &&
    /2\\tan\s*x|2\s*tan\s*x|\\csc/i.test(t)
  ) {
    return true
  }
  return false
}

/** @param {string} t */
export function hasGoodTanCscGxIntegralStem(t) {
  const s = String(t ?? '')
  if (!looksLikeTanCscGxIntegralMcq(s)) return false
  return (
    /\\int/.test(s) &&
    /2\\tan\s*x/.test(s) &&
    /\\csc\^(?:\{2\}|2)/.test(s) &&
    /g\\left\(\\dfrac\{5\\pi\}\{4\}/.test(s) &&
    !/\[e\s*\[2\s*cose|then\s+f\s*=|\\begin\{array\}/i.test(s)
  )
}

/** @param {string[]} [options] */
export function tanCscGxIntegralOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (opts.some((o) => /Graph\/diagram|^Option\s+[A-D]$/i.test(o))) return true
  const nums = opts.map((o) => o.replace(/\$/g, '').trim())
  return !(nums[0] === '0' && nums[1] === '1' && nums[2] === '-1' && nums[3] === '2')
}

/** @param {string[]} [options] */
export function healTanCscGxIntegralOptions(options = []) {
  return tanCscGxIntegralOptionsNeedHeal(options)
    ? [...TAN_CSC_GX_INTEGRAL_OPTIONS]
    : [...options.slice(0, 4)]
}

export function TAN_CSC_GX_INTEGRAL_SOLUTION() {
  return [
    '**Step 1.** $\\int e^{x}(f+f\\prime)\\,dx=e^{x}f+K$, so $g=f$ (a constant cannot be absorbed into $K$ because it would add an extra $e^{x}$).',
    '**Step 2.** $\\dfrac{2\\tan x}{1+\\tan x}=\\dfrac{2\\sin x}{\\sin x+\\cos x}=1+\\tan(x-\\pi/4)$ and $\\csc^{2}(x+\\pi/4)=\\sec^{2}(x-\\pi/4)$.',
    '**Step 3.** $g+g\\prime=1+\\tan(x-\\pi/4)+\\sec^{2}(x-\\pi/4)$, hence $g(x)=1+\\tan(x-\\pi/4)=\\dfrac{2\\sin x}{\\sin x+\\cos x}$.',
    '**Step 4.** $g(5\\pi/4)=1+\\tan(\\pi)=1$, or $2\\sin(5\\pi/4)/(\\sin(5\\pi/4)+\\cos(5\\pi/4))=1$. Dropping the $1$ and using only $\\tan(x-\\pi/4)$ wrongly gives $0$.',
    '**Correct:** (B)',
  ].join('\n\n')
}

/** @param {string} text */
export function repairTanCscGxIntegralStemOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  if (!looksLikeTanCscGxIntegralMcq(t)) return t
  if (hasGoodTanCscGxIntegralStem(t) && !/\(\s*[A-D]\s*\)/i.test(t)) return t
  return TAN_CSC_GX_INTEGRAL_STEM
}

/** @param {object} parsed */
export function repairTanCscGxIntegralMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const parts = [parsed.text ?? '', (parsed.options ?? []).join('\n'), parsed._ocrSource ?? '']
  if (!parts.some((p) => looksLikeTanCscGxIntegralMcq(p))) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  if (hasGoodTanCscGxIntegralStem(parsed.text ?? '') && !tanCscGxIntegralOptionsNeedHeal(opts)) {
    return parsed
  }

  parsed.text = TAN_CSC_GX_INTEGRAL_STEM
  parsed.options = healTanCscGxIntegralOptions(parsed.options)
  parsed.optionsFound = 4
  parsed.complete = true
  parsed.questionType = 'single_correct'
  parsed.correctIndices = [1]
  parsed.correctIndex = 1
  parsed.answerSource = parsed.answerSource || 'ai_generated'
  parsed.answerConfidence = Math.max(Number(parsed.answerConfidence ?? 0), 90)

  const sol = String(parsed.solution ?? '')
  if (
    !sol.trim() ||
    /\[e\s*\[2\s*cose|Graph\/diagram|Option\s+[A-D]|then\s+f\s*=/i.test(sol)
  ) {
    parsed.solution = TAN_CSC_GX_INTEGRAL_SOLUTION()
    parsed.solutionSource = 'ai_generated'
    parsed.solutionConfidence = 90
  }
  return parsed
}
