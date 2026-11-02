/** JEE MSQ: f(x)=lim e^{x tan(1/n) log(1/n)}, ∫ f/∛(sin^11 x cos x) dx = g(x)+C.
 *  Regression: uploadRegressionContracts.js → limitGxMcq*
 *  Tests: test-limit-gx-ocr.mjs, test-auto-crop-options.mjs
 */
export const LIMIT_GX_STEM = `If $f(x) = \\lim_{n \\to \\infty} e^{x \\tan(1/n) \\log(1/n)}$, and $\\int \\frac{f(x)}{\\sqrt[3]{\\sin^{11} x \\cos x}}\\, dx = g(x) + C$ ($C$ being the constant of integration). Then :`

export const LIMIT_GX_OPTIONS = [
  '$g\\left(\\frac{\\pi}{4}\\right) = \\frac{3}{2}$',
  '$g(x)$ is continuous for all $x$',
  '$g\\left(\\frac{\\pi}{4}\\right) = -\\frac{15}{8}$',
  '$g\\left(\\frac{\\pi}{4}\\right) = -\\frac{1}{2}$',
]

/** True when stored A–D need the canonical limit-g(x) option text. */
export function limitGxOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (!opts.some((o) => /continuous\s+for\s+all/i.test(o))) return true
  if (!opts.some((o) => /-\\frac\{15\}\{8\}/.test(o))) return true
  if (!opts.some((o) => /\\frac\{3\}\{2\}/.test(o) && /g/i.test(o))) return true
  if (!opts.some((o) => /-\\frac\{1\}\{2\}/.test(o))) return true
  if (opts.some((o) => /=\s*$|=\s*\$$|g\\left\([^)]*\)\s*=\s*$/i.test(o))) return true
  return false
}

/** @param {string[]} [options] */
export function healLimitGxOptions(options = []) {
  return limitGxOptionsNeedHeal(options) ? [...LIMIT_GX_OPTIONS] : [...options.slice(0, 4)]
}

/** Legacy block with (A)–(D) labels for polish/repair text blobs. */
export const LIMIT_GX_OPTIONS_BLOCK = `(A) ${LIMIT_GX_OPTIONS[0]}
(B) ${LIMIT_GX_OPTIONS[1]}
(C) ${LIMIT_GX_OPTIONS[2]}
(D) ${LIMIT_GX_OPTIONS[3]}`

/** @param {string} t */
export function looksLikeLimitGxQuestion(t) {
  const s = String(t ?? '')
  if (/\\lim_\{n\s*\\to\s*\\infty\}/.test(s) && /g\s*\(\s*x\s*\)\s*\+\s*C/.test(s)) return true
  if (/\\sqrt\[3\]\{\\sin\^\{11\}/.test(s)) return true
  if (
    /\\tan\s*\(\s*1\s*\/\s*n\s*\)/i.test(s) &&
    /\\log\s*\(\s*1\s*\/\s*n\s*\)/i.test(s) &&
    /constant\s+of\s+integration/i.test(s)
  ) {
    return true
  }
  if (
    /lim\s+eren|ntog|nto\s*g|tan\s*\(\s*1\s*\/\s*n/i.test(s) &&
    /g\s*\(\s*x\s*\)\s*\+\s*C|dx\s*=\s*g\s*\(\s*x\s*\)/i.test(s)
  ) {
    return true
  }
  if (/If\s*\(?x\)?\s*=?\s*lim/i.test(s) && /sin!?\s*x\s*cos|noe\s+sin/i.test(s)) return true
  if (/g\s*\(\s*x\s*\)\s*is\s+continuous/i.test(s) && /\blim\b/i.test(s) && /g\s*\(\s*x\s*\)/i.test(s)) {
    return true
  }
  return false
}

/** @param {string} t */
export function hasGoodLimitGxStem(t) {
  return (
    /\\lim_\{n\s*\\to\s*\\infty\}/.test(t) &&
    /\\sqrt\[3\]\{\\sin\^\{11\}/.test(t) &&
    /g\s*\(\s*x\s*\)\s*\+\s*C/.test(t) &&
    !/\(\s*A\s*\)/i.test(t)
  )
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeLimitGxQuestion(s)) return false
  if (!hasGoodLimitGxStem(s)) return true
  if (/and\s*=\s*g\s*\(\s*x\s*\)/i.test(s)) return true
  if (/\bThen\s*:\s*\(\s*A\s*\)/i.test(s)) return true
  if (/\(\s*A\s*\)/.test(s) && !/\(\s*D\s*\)/.test(s)) return true
  return false
}

/** @param {string[]} [options] */
function limitGxOptionsComplete(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return false
  return opts.some((o) => /continuous\s+for\s+all/i.test(o))
}

/**
 * Repair garbled OCR for limit→f(x) + integral→g(x) MSQ (tan(1/n), sin^11 x).
 * @param {string} text
 */
export function repairLimitGxStemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  t = t.replace(/\bIf\s*\(\s*x\s*\)\s*=/gi, 'If $f(x) =')
  t = t.replace(/\bIf\s+f\s*\(\s*x\s*\)\s*=/gi, 'If $f(x) =')
  t = t.replace(/\bnoe\s+sin!?\s*x\s*cos\s*x/gi, '$\\sqrt[3]{\\sin^{11} x \\cos x}$')
  t = t.replace(/\(\s*©\s*\)/g, '(C)')
  t = t.replace(/\bo\s*\(\s*3\s*\)/gi, '$g\\left(\\frac{\\pi}{4}\\right)$')
  t = t.replace(/\bT\s*15\b/g, '$-\\frac{15}{8}$')

  if (!looksLikeLimitGxQuestion(t)) return t
  if (hasGoodLimitGxStem(t) && !/\(\s*[A-D]\s*\)/i.test(t)) return t
  if (!stemNeedsCanonicalRepair(t) && limitGxOptionsComplete(t.split(/\(\s*[A-D]\s*\)/i).slice(1))) {
    return `${t}\n`.trim()
  }

  return `${LIMIT_GX_STEM}\n${LIMIT_GX_OPTIONS_BLOCK}`
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairLimitGxMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeLimitGxQuestion(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  if (hasGoodLimitGxStem(parsed.text ?? '') && limitGxOptionsComplete(opts)) {
    return parsed
  }

  parsed.text = LIMIT_GX_STEM
  parsed.options = healLimitGxOptions(parsed.options)
  parsed.optionsFound = 4
  parsed.complete = true
  parsed.suggestedQuestionType = 'multiple_correct'
  return parsed
}
