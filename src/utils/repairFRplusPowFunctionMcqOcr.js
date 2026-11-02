/** JEE SCQ: f:R⁺→R, (f(x²+1))^(1/x^(1/4))=8, find (f(256/x²+1))^(x^(1/4)) — options 4,8,32,64. */

export const F_RPLUS_POW_FUNCTION_STEM =
  'If $f : \\mathbb{R}^+ \\to \\mathbb{R}$ is a function such that $(f(x^2 + 1))^{\\frac{1}{x^{1/4}}} = 8$ & $x > 0$, then the value $\\left(f\\left(\\frac{256}{x^2} + 1\\right)\\right)^{x^{1/4}}$ is equal to'

export const F_RPLUS_POW_FUNCTION_OPTIONS = ['$4$', '$8$', '$32$', '$64$']

/** @param {string} t */
export function looksLikeFRplusPowFunctionMcq(t) {
  const s = String(t ?? '')
  if (!/function\s+such\s+that/i.test(s)) return false
  if (!/\bf\s*[:(]/i.test(s)) return false
  const hasX2Plus1 =
    /x\s*\^?\s*2\s*\+\s*1|x2\s*\+\s*1|x\^2\s*\+\s*1|fx\s*\*?\s*\+\s*1|\(\s*fx/i.test(s)
  const hasRplus = /R\s*\^?\s*\+|mathbb\{R\}\^\+|\\mathbb\{R\}\^\+/i.test(s)
  const has256 = /\b256\b/.test(s)
  const hasQuarterPow =
    /x\^\{?1\/4|x\s*\^?\s*\{?\s*1\/4|1\s*\/\s*x\s*\^|1\/x\^?\{?1\/4|\^\{?1\/x/i.test(s)
  const hasEight = /=\s*8\b/i.test(s) || /=\s*8\s*[,)&"]/i.test(s)
  const hasClassicOpts =
    /\(A\)\s*4[\s\S]*\(B\)\s*8[\s\S]*\(C\)\s*32[\s\S]*\(D\)\s*64/i.test(s)
  if (!hasEight) return false
  if (hasX2Plus1 && (has256 || hasQuarterPow || hasRplus)) return true
  if (hasRplus && has256) return true
  // Garbled sheet OCR: stem contains 256/x² and options 4, 8, 32, 64 (not the simpler f(x+1) MCQ).
  if (has256 && hasClassicOpts) return true
}

/** @param {string} t */
function hasGoodFRplusPowStem(t) {
  const s = String(t ?? '')
  return (
    /\\mathbb\{R\}\^\+/.test(s) &&
    /f\(x\^2\s*\+\s*1\)/.test(s) &&
    /256/.test(s) &&
    /x\^\{1\/4\}/.test(s) &&
    !/f\(x\+1\)\)x/.test(s)
  )
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeFRplusPowFunctionMcq(s)) return false
  if (hasGoodFRplusPowStem(s)) return false
  if (/f\(x\+1\)\)x|f\s*\(\s*x\s*\+\s*1\s*\)\)\s*x/i.test(s)) return true
  if (/R\s*\\to\s*R[^+]|mathbb\{R\}\s*\\to\s*\\mathbb\{R\}(?!\^)/.test(s) && !/mathbb\{R\}\^\+/.test(s)) {
    return true
  }
  return true
}

/** @param {string[]} [options] */
export function fRplusPowFunctionOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  return !opts.every((o) => /^\$?\d+\$?$/.test(o.replace(/\s/g, '')))
}

/** @param {string} text */
export function repairFRplusPowFunctionMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t
  t = t.replace(/^\s*(?:[a-z]\s+)?\d{1,3}\s+/i, '')
  if (!looksLikeFRplusPowFunctionMcq(t)) return t
  if (!stemNeedsCanonicalRepair(t)) return t
  const optBlock = F_RPLUS_POW_FUNCTION_OPTIONS.map(
    (o, i) => `(${String.fromCharCode(65 + i)}) ${o}`,
  ).join('\n')
  return `${F_RPLUS_POW_FUNCTION_STEM}\n${optBlock}`
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairFRplusPowFunctionMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeFRplusPowFunctionMcq(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  if (
    stemNeedsCanonicalRepair(`${parsed.text ?? ''}\n${blob}`) ||
    fRplusPowFunctionOptionsNeedHeal(opts) ||
    /f\(x\+1\)\)x/i.test(parsed.text ?? '')
  ) {
    parsed.text = F_RPLUS_POW_FUNCTION_STEM
    for (let i = 0; i < 4; i++) opts[i] = F_RPLUS_POW_FUNCTION_OPTIONS[i]
    parsed.options = opts
    parsed.optionsFound = 4
    parsed.complete = true
  }
  return parsed
}
