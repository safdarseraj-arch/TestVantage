/**
 * JEE SCQ: f(x) = sin³x + λ sin²x on (-π/2, π/2), count integer λ with one min + one max.
 */

export const LAMBDA_SIN_EXTREMA_STEM =
  'Let $f(x) = \\sin^3 x + \\lambda \\sin^2 x$, $-\\frac{\\pi}{2} < x < \\frac{\\pi}{2}$, then the number of possible integral values of $\\lambda$ for which $f(x)$ has exactly one minimum and exactly one maximum, is'

export const LAMBDA_SIN_EXTREMA_OPTIONS = ['$0$', '$1$', '$2$', '$3$']

/** @param {string} t */
export function looksLikeLambdaSinCubicExtremaMcq(t) {
  const s = String(t ?? '').replace(/\r\n/g, '\n')
  if (!/\bf\s*\(\s*x\s*\)/i.test(s) && !/\bLet\s+f\b/i.test(s)) return false
  const hasSinPowers =
    /sin\s*\^?\s*3\s*x|sin\s*3\s*x|sin\s*[²2^]+\s*x|sin\^2|sin\^3|\\sin\^/i.test(s)
  const hasLambda =
    /\\lambda|λ|integral values of\s+l\b|values of\s+l\s+for which/i.test(s)
  const hasExtrema =
    /exactly one minimum/i.test(s) &&
    /exactly one maximum/i.test(s)
  const hasInterval =
    /2\s*p\s*<\s*x\s*<\s*2\s*p/i.test(s) ||
    /\\pi\s*\/\s*2|π\/2|-\s*\\frac\{\\pi\}\{2\}/i.test(s)
  return hasSinPowers && hasLambda && hasExtrema && hasInterval
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeLambdaSinCubicExtremaMcq(s)) return false
  if (/sin\s*3\s*x/i.test(s) && /sin\s*[²2^]/i.test(s)) return true
  if (/integral values of\s+l\b/i.test(s)) return true
  if (/\+\s*l\s*sin/i.test(s)) return true
  if (/2\s*p\s*<\s*x/i.test(s)) return true
  if (!/\\sin\^3/.test(s) && !/\\sin\^\{3\}/.test(s)) return true
  if (!/\\lambda/.test(s)) return true
  return false
}

/** @param {string[]} [options] */
export function lambdaSinExtremaOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  const nums = opts.map((o) => o.replace(/\$/g, '').trim())
  if (!['0', '1', '2', '3'].every((n, i) => nums[i] === n || nums[i] === `$${n}$`)) {
    const digitCount = nums.filter((n) => /^[0-3]$/.test(n)).length
    if (digitCount < 4) return true
  }
  if (opts.some((o) => /graph|image option/i.test(o))) return true
  return false
}

/** @param {string} text */
export function repairLambdaSinCubicExtremaStemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  if (looksLikeLambdaSinCubicExtremaMcq(t) && stemNeedsCanonicalRepair(t)) {
    return LAMBDA_SIN_EXTREMA_STEM
  }

  if (!looksLikeLambdaSinCubicExtremaMcq(t)) return t

  t = t.replace(
    /sin\s*3\s*x\s*\+\s*l\s*sin\s*[²2^]?\s*x/gi,
    '$\\sin^3 x + \\lambda \\sin^2 x$',
  )
  t = t.replace(/integral values of\s+l\b/gi, 'integral values of $\\lambda$')
  t = t.replace(/\+\s*l\s*sin/gi, '+ $\\lambda \\sin')
  t = t.replace(/-\s*2\s*p\s*<\s*x\s*<\s*2\s*p/gi, '$-\\frac{\\pi}{2} < x < \\frac{\\pi}{2}$')
  t = t.replace(/then number of possible/gi, 'then the number of possible')

  return t
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairLambdaSinCubicExtremaMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeLambdaSinCubicExtremaMcq(blob)) return parsed

  let text = repairLambdaSinCubicExtremaStemOcr(parsed.text ?? blob)
  let opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  if (stemNeedsCanonicalRepair(blob) || lambdaSinExtremaOptionsNeedHeal(opts)) {
    if (stemNeedsCanonicalRepair(blob)) text = LAMBDA_SIN_EXTREMA_STEM
    if (lambdaSinExtremaOptionsNeedHeal(opts)) opts = [...LAMBDA_SIN_EXTREMA_OPTIONS]
  }

  return {
    ...parsed,
    text,
    options: opts.slice(0, 4),
    optionsFound: opts.filter((o) => String(o ?? '').trim()).length,
    complete: opts.filter((o) => String(o ?? '').trim()).length >= 4,
  }
}
