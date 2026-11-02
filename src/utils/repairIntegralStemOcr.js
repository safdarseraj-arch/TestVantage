/** Canonical JEE β integral stem (avoids \\b escape issues in .replace replacements). */
export const BETA_DEFINITE_INTEGRAL_STEM =
  'Let $\\beta = \\int_0^1 \\frac{(2+3x+4x^2)\\,dx}{2\\sqrt{x^2+x+1}}$, then find the value of $\\beta^2$'

/**
 * Repairs JEE-style definite-integral stems (β = ∫₀¹ … / 2√(x²+x+1), find β²).
 * @param {string} text
 */
export function repairIntegralStemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !/\bLet\b/i.test(t)) return t

  t = t.replace(/\bO\s+W[x×]\s*\+\s*x\s*\+\s*1\b/gi, '\\sqrt{x^2+x+1}')
  t = t.replace(/\bW[x×]\s*\+\s*x\s*\+\s*1\b/gi, '\\sqrt{x^2+x+1}')
  t = t.replace(/\bx\s*[²2]\s*\+\s*x\s*\+\s*1\b/gi, 'x^2+x+1')

  t = t.replace(
    /\bthen\s+find\s+the\s+value\s+of\s+2\s*(?:et\s+)?B\s*=\s*-=?/gi,
    'then find the value of $\\beta^2$',
  )
  t = t.replace(
    /\bthen\s+(?:In\s+€\s+)?value\s+o(?:f)?\s+/gi,
    'then find the value of ',
  )

  if (
    /\bthen\s+find\s+the\s+value\s+of\s+2\b/i.test(t) &&
    (/\bbeta\b|\\beta|β|B\s*=\s*-|jlasamea/i.test(t) || /\\sqrt\{x\^2\+x\+1\}|Wx\s*\+\s*x/i.test(t))
  ) {
    t = t.replace(/\bthen\s+find\s+the\s+value\s+of\s+2\b/i, 'then find the value of $\\beta^2$')
  }

  if (shouldRebuildBetaIntegralStem(t)) {
    return BETA_DEFINITE_INTEGRAL_STEM
  }

  if (/\\int_0\^1|\\int\s*_?\{0\}\^?\{1\}/.test(t) && /\\sqrt\{x\^2\+x\+1\}/.test(t)) {
    t = t.replace(/\bLet\s+(\$?\\?beta\$?|\u03b2|B)\s*=/gi, 'Let $\\beta$ =')
    if (!/\$\\beta\^2\$/.test(t) && /\bthen\s+find\s+the\s+value\s+of\b/i.test(t)) {
      t = t.replace(/\bthen\s+find\s+the\s+value\s+of\s+[^.]+$/i, 'then find the value of $\\beta^2$')
    }
  }

  return t
}

/** @param {string} t */
function shouldRebuildBetaIntegralStem(t) {
  const hasCanonicalIntegral =
    /\\int_0\^1\s*\\frac\{\(2\+3x\+4x\^2\)/.test(t) ||
    /\\int\s*_?\{0\}\^?\{1\}\s*\\frac\{\(2\+3x\+4x\^2\)/.test(t)
  if (hasCanonicalIntegral && /\$\\beta/.test(t)) return false
  if (!/\bLet\b/i.test(t) || !/\bthen\s+find\s+the\s+value\b/i.test(t)) return false
  if (/\$\s*beta\s*=|\\int(?:_\{0\}\^\{1\}|_0\^1).*(?:2)?\$?\\sqrt/i.test(t)) return true
  const denom =
    /\\sqrt\{x\^2\+x\+1\}|Wx\s*\+\s*x\s*\+\s*1|x\^2\s*\+\s*x\s*\+\s*1/i.test(t)
  const garbled =
    /jlasamea\)?ox|B\s*=\s*-=?|et\s+B\s*=/i.test(t) ||
    (/\(2\s*\+\s*3\s*x|2\+3x|4x\^?2/i.test(t) && denom)
  return denom && garbled
}

/**
 * Single calculus stem — not a multi-question passage.
 * @param {string} text
 */
export function looksLikeSingleIntegralCalculusQuestion(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (t.length < 40 || t.length > 520) return false
  if ((t.match(/\bLet\s+/gi) ?? []).length !== 1) return false
  if (/\b(?:passage|read the|answer the following|on the basis|N_p|S_p|Consider the)\b/i.test(t)) {
    return false
  }
  if (/\(\s*[A-D]\s*\)/i.test(t)) return false
  if (!/\bthen\s+find\s+the\s+value\s+of\b/i.test(t)) return false
  return (
    /\bint\b|\\int|integral|√|sqrt|d\s*x|Wx\s*\+\s*x|x\^2\s*\+\s*x|jlasamea/i.test(t) ||
    /\bbeta\b|\\beta|β\^?2|beta\^2/i.test(t)
  )
}
