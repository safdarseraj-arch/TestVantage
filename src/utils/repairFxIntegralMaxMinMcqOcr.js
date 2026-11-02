/**
 * JEE: f(x) = 1/2 + ∫₀^x (t-x) sin t dt on [0, π], find M - m.
 */

export const FX_INTEGRAL_MAXMIN_STEM =
  'Let $f(x) = \\frac{1}{2} + \\int_0^x (t-x)\\sin t \\, dt$, for $x \\in [0, \\pi]$. If $M$ and $m$ are the maximum and minimum value of $f(x)$ respectively in $x \\in [0, \\pi]$, then $(M-m)$ is equal to'

/** @param {string} t */
export function fixOcrIntegralGraveAccent(t) {
  return String(t ?? '')
    .replace(
      /ò\s*\(\s*t\s*-\s*x\s*sin\s*t\s*dt\s*\)/gi,
      '\\int_0^x (t-x)\\sin t \\, dt',
    )
    .replace(
      /ò\s*\(\s*([^)]*?\bdt\b[^)]*)\)/gi,
      '\\int_0^x ($1)',
    )
    .replace(/ò\s*\(/gi, '\\int_0^x (')
}

/** @param {string} t */
export function looksLikeFxIntegralMaxMinMcq(t) {
  const s = String(t ?? '').replace(/\r\n/g, '\n')
  const hasF =
    /\bf\s*\(\s*x\s*\)/i.test(s) ||
    /\bLet\s+f\s+x\s*\(\s*\)/i.test(s) ||
    /\bLet\s+f\b/i.test(s)
  const hasMaxMin =
    /\bM\b.*\bm\b/i.test(s) ||
    /maximum.*minimum/i.test(s) ||
    /\(M\s*-\s*m\)/i.test(s)
  const hasSinIntegral =
    /sin\s*t|sin\s*\(\s*t/i.test(s) ||
    /\(t\s*-\s*x\)/i.test(s) ||
    /t\s*-\s*x\s*sin/i.test(s)
  const hasIntegral =
    /ò|\\int|integral|\bdt\b/i.test(s)
  const hasInterval =
    /\[?\s*0\s*,\s*(?:p|π|\\pi)\s*\]?/i.test(s) ||
    /\\in\s*\[\s*0/i.test(s)
  return hasF && hasMaxMin && hasSinIntegral && hasIntegral && hasInterval
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = fixOcrIntegralGraveAccent(String(t ?? ''))
  if (!looksLikeFxIntegralMaxMinMcq(s)) return false
  if (/ò/i.test(s)) return true
  if (/\bf\s+x\s*\(\s*\)/i.test(s)) return true
  if (/=\s*1\s+2\s*\+/.test(s)) return true
  if (/\[\s*0\s*,\s*p\s*\]/i.test(s)) return true
  if (!/\\int_0\^x/.test(s) && !/\\frac\{1\}\{2\}/.test(s)) return true
  return false
}

/** @param {string} text */
export function repairFxIntegralMaxMinStemOcr(text) {
  let t = fixOcrIntegralGraveAccent(String(text ?? '').replace(/\r\n/g, '\n').trim())
  if (!t) return t

  if (looksLikeFxIntegralMaxMinMcq(t) && stemNeedsCanonicalRepair(t)) {
    return FX_INTEGRAL_MAXMIN_STEM
  }

  if (!looksLikeFxIntegralMaxMinMcq(t)) return t

  t = t.replace(/\bLet\s+f\s+x\s*\(\s*\)\s*=/gi, 'Let $f(x)$ =')
  t = t.replace(/\bf\s+x\s*\(\s*\)/gi, 'f(x)')
  t = t.replace(/=\s*1\s+2\s*\+/g, '= $\\frac{1}{2}$ +')
  t = t.replace(/\[\s*0\s*,\s*p\s*\]/gi, '$[0, \\pi]$')
  t = t.replace(/x\s*∈\s*\[\s*0\s*,\s*p\s*\]/gi, '$x \\in [0, \\pi]$')
  t = t.replace(/\(M\s*-\s*m\)(?!\s+is)/i, '$(M-m)$ is equal to')

  if (!/\\int/.test(t) && /\bdt\b/i.test(t)) {
    t = t.replace(
      /\+\s*\(\s*t\s*-\s*x\s*sin\s*t\s*dt\s*\)/i,
      '+ $\\int_0^x (t-x)\\sin t \\, dt$',
    )
  }

  return t
}

/**
 * @param {{ text?: string, _ocrSource?: string }} parsed
 */
export function repairFxIntegralMaxMinMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeFxIntegralMaxMinMcq(blob)) return parsed
  const text = repairFxIntegralMaxMinStemOcr(parsed.text ?? blob)
  return { ...parsed, text }
}
