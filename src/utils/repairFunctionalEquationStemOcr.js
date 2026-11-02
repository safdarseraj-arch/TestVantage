/** JEE SCQ: f(x) + 2f(1/x) = 3x, f(x) = f(-x). */
export const FUNCTIONAL_EQUATION_STEM = `The function $f$ is not defined for $x=0$, but for all non-zero real number $x$, $f(x) + 2f(\\frac{1}{x}) = 3x$. The equation $f(x) = f(-x)$ is satisfied by`

/** @param {string} t */
export function looksLikeFunctionalEquationStem(t) {
  const s = String(t ?? '')
  return (
    /function\s+f\s+is\s+not\s+defined/i.test(s) &&
    /f\s*\(\s*x\s*\)\s*=\s*f\s*\(\s*-x\s*\)/i.test(s) &&
    /satisfied\s+by/i.test(s) &&
    (/non\s*-?\s*zero\s+real/i.test(s) || /2f/i.test(s))
  )
}

/**
 * Repair garbled OCR for f(x)+2f(1/x)=3x functional equation SCQ.
 * @param {string} text
 */
export function repairFunctionalEquationStemOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t) return t

  const hint =
    looksLikeFunctionalEquationStem(t) ||
    (/function\s+f\s+is\s+not\s+defined/i.test(t) && /2f\s*2\s*\)/i.test(t))
  if (!hint) return t

  t = t.replace(/\bThe\s+X\s+equation\b/gi, 'The equation')
  t = t.replace(/\bnon\s+zero\b/gi, 'non-zero')
  t = t.replace(/\bx\s*=\s*0\b/g, '$x=0$')

  t = t.replace(
    /\bf\s*\(\s*x\s*\)\s*\+\s*2f\s*2\s*\)\s*=?\s*3\s*x\b/gi,
    '$f(x) + 2f(\\frac{1}{x}) = 3x$',
  )
  t = t.replace(
    /\bf\s*\(\s*x\s*\)\s*\+\s*2f\s*\(\s*\\frac\s*\{\s*1\s*\}\s*\{\s*x\s*\}\s*\)\s*=?\s*3\s*x\b/gi,
    '$f(x) + 2f(\\frac{1}{x}) = 3x$',
  )
  t = t.replace(
    /\bf\s*\(\s*x\s*\)\s*\+\s*2f\s*\(\s*1\s*\/\s*x\s*\)\s*=?\s*3\s*x\b/gi,
    '$f(x) + 2f(\\frac{1}{x}) = 3x$',
  )

  t = t.replace(
    /\bThe equation\s+f\s*\(\s*x\s*\)\s*=\s*f\s*\(\s*-x\s*\)/gi,
    'The equation $f(x) = f(-x)$',
  )

  t = t.replace(/\$f\(x\) \+ 2f\(\$\s*\\frac\{1\}\{x\}\s*\$\)/g, '$f(x) + 2f(\\frac{1}{x})')
  t = t.replace(/\$\$f\(x\) \+ 2f\(\\frac\{1\}\{x\}\) = 3x\$\$/g, '$f(x) + 2f(\\frac{1}{x}) = 3x$')
  t = t.replace(/\$\$x=0\$\$/g, '$x=0$')

  return t
}
