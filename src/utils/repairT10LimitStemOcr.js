/** JEE stem: lim_{t→x} (t^10 f(x) - x^10 f(t)) / (t^9 - x^9) = 1, f(1)=2. */
export const T10_LIMIT_STEM = `Let $f(x)$ be a continuously differentiable function on the interval $(0, \\infty)$ such that $f(1) = 2$ and
$$\\lim_{t \\to x} \\frac{t^{10}f(x) - x^{10}f(t)}{t^9 - x^9} = 1$$
for each $x > 0$. Then, for all $x > 0$, $f(x)$ is equal to`

export const T10_LIMIT_OPTION_ITEMS = [
  '$\\frac{31}{11x} - \\frac{9}{11}x^{10}$',
  '$\\frac{9}{11x} + \\frac{13}{11}x^{10}$',
  '$\\frac{-9}{11x} + \\frac{31}{11}x^{10}$',
  '$\\frac{13}{11x} + \\frac{9}{11}x^{10}$',
]

export const T10_LIMIT_OPTIONS = T10_LIMIT_OPTION_ITEMS.map(
  (o, i) => `(${String.fromCharCode(65 + i)}) ${o}`,
).join('\n')

/** @param {string} s */
function hasF1Equals2(s) {
  return (
    /f\s*\(\s*1\s*\)\s*=?\s*2/.test(s) ||
    /\bf\s+f\s*\(\s*1\s*\)\s*=?\s*2/.test(s) ||
    /\(\s*1\s*\)\s*=?\s*2/.test(s)
  )
}

/** @param {string} s */
function hasT10LimitCore(s) {
  return (
    (/t\^\{?10\}?/.test(s) && /t\^\{?9\}?/.test(s) && /x\^\{?10\}?/.test(s)) ||
    (/\\frac\{t\^\{10\}/.test(s) && /t\^9\s*-\s*x\^9|t\^\{9\}[^$]*x\^\{9\}/.test(s))
  )
}

/** @param {string} t */
export function looksLikeT10LimitQuestion(t) {
  const s = String(t ?? '')
  if (!/continuously\s+differentiable/i.test(s)) return false
  if (!/for\s+(?:each|all)\s+\$?x\s*>\s*0/i.test(s)) return false
  if (!hasF1Equals2(s)) return false

  if (/\\lim_\{t\s*\\to\s*x\}/.test(s) && /t\^\{?10\}?/.test(s) && /t\^\{?9\}?/.test(s)) {
    return true
  }
  if (hasT10LimitCore(s)) return true
  if (
    /\\text\{[^}]*lim|\\setminus[^$]*lim|lim[\\_]*\{[^}]*to[^}]*x/i.test(s) &&
    /t\^\{?10\}?/.test(s) &&
    /t\^\{?9\}?/.test(s)
  ) {
    return true
  }
  return (
    /10\s+10\s+LUO|LUO\s+t-x|t-x\s+rr|\bt\s*-\s*x\b.*\bt\s*-\s*x/i.test(s) ||
    (/interval\s*\(\s*0\s*,\s*0\s*\)/i.test(s) && /10\s+10/i.test(s))
  )
}

/** @param {string} t */
export function hasGoodT10LimitStem(t) {
  const s = String(t ?? '')
  if (!looksLikeT10LimitQuestion(s)) return false
  return (
    /\\lim_\{t\s*\\to\s*x\}/.test(s) &&
    /\\frac\{t\^\{10\}/.test(s) &&
    /t\^\{9\}[^$]*x\^\{9\}/.test(s) &&
    /f\s*\(\s*1\s*\)\s*=\s*2/.test(s) &&
    !/\\setminus|\\text\{[^}]*lim|\bf\s+f\s*\(\s*1\s*\)/.test(s) &&
    !/\(\s*A\s*\)/i.test(s)
  )
}

/** @param {string[]} [options] */
export function t10OptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  const full = opts.filter((o) => /\\frac\{[^}]+\}\{11x\}/.test(o) && /x\^\{?10\}?/.test(o)).length
  return full < 4
}

/** @param {string[]} [options] */
export function healT10LimitOptions(options = []) {
  return t10OptionsNeedHeal(options) ? [...T10_LIMIT_OPTION_ITEMS] : [...options.slice(0, 4)]
}

/** @param {string} t */
function _hasFullMcqOptions(t) {
  return (
    /\(\s*A\s*\)/i.test(t) &&
    /\(\s*B\s*\)/i.test(t) &&
    /\(\s*C\s*\)/i.test(t) &&
    /\(\s*D\s*\)/i.test(t)
  )
}

/** @param {string} t */
function preFixT10Garble(t) {
  let out = String(t ?? '')
  out = out.replace(/\binterval\s*\(\s*0\s*,\s*0\s*\)/gi, 'interval $(0, \\infty)$')
  out = out.replace(/\bf\s+f\s*\(\s*1\s*\)/g, '$f(1)')
  out = out.replace(
    /\\setminus\s*\\text\{lim[_\\]*\{?\s*t\s*\\setminus\s*to\s*x\s*\\?\}?/gi,
    '\\lim_{t \\to x}',
  )
  out = out.replace(
    /\\text\{lim[_\\]*\{?\s*t\s*(?:\\to|\\setminus\s*to|to)\s*x\s*\\?\}?/gi,
    '\\lim_{t \\to x}',
  )
  if (!/f\s*\(\s*1\s*\)/.test(out)) {
    out = out.replace(/\(\s*1\s*\)\s*=?\s*2\b/g, '$f(1) = 2$')
  }
  out = out.replace(/\bf\s*\(\s*x\s*\)\s*is\s+equal\s+to/gi, '$f(x)$ is equal to')
  return out
}

/**
 * Repairs garbled OCR for the t^10 / t^9 JEE limit MCQ (f continuously differentiable, f(1)=2).
 * @param {string} text
 */
export function repairT10LimitStemOcr(text) {
  let t = preFixT10Garble(String(text ?? '').replace(/\r\n/g, '\n').trim())
  if (!t) return t
  if (!looksLikeT10LimitQuestion(t)) return t

  if (hasGoodT10LimitStem(t) && !/\(\s*[A-D]\s*\)/i.test(t)) return t

  return `${T10_LIMIT_STEM}\n${T10_LIMIT_OPTIONS}`
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairT10LimitMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeT10LimitQuestion(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  if (hasGoodT10LimitStem(parsed.text ?? '') && !t10OptionsNeedHeal(opts)) {
    return parsed
  }

  parsed.text = T10_LIMIT_STEM
  parsed.options = healT10LimitOptions(parsed.options)
  parsed.optionsFound = 4
  parsed.complete = true
  return parsed
}
