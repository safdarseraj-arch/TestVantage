/**
 * Fix common LaTeX delimiter / fraction / option-layout OCR mistakes.
 * @param {string} text
 */
export function fixBrokenMcqLatex(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n')
  if (!t.trim()) return t

  // OCR: $1{31}{11x} or $1{-9}{11x} → $\frac{31}{11x}$
  t = t.replace(/\$\s*1?\{(-?\d+)\}\{(\d+x|\d+)\}/g, (_, n, d) => `$\\frac{${n}}{${d}}$`)

  // Glued $\frac{a}{b}$x^{10} → $\frac{a}{b}x^{10}$
  t = t.replace(
    /\$\s*\\frac\{([^}]+)\}\{([^}]+)\}\$\s*(x(\^\{?\d+\}?)?)/g,
    '$$\\frac{$1}{$2}$3$',
  )

  // f(1) = 2$$ and $$lim → f(1) = 2$ and $$\lim
  t = t.replace(/=\s*(\d+)\$\$\s+and\s+\$\$/g, '= $1$ and $$')
  t = t.replace(/\$\$\s+and\s+\$\$/g, ' and $$')

  // Stray $$ before inline "for each"
  t = t.replace(/=\s*1\s+for\s+each/gi, '= 1$$\n\nfor each')
  t = t.replace(/=\s*1\s+for\s+all/gi, '= 1$$\n\nfor all')

  // greater than^1 → greater than 1 (MSQ prose options)
  t = t.replace(/\bgreater\s+than\s*\^(\d+)\b/gi, 'greater than $1')
  t = t.replace(/(\(\s*[A-D]\s*\)[^\n]{6,}?)\s+(?=\(\s*[B-D]\s*\))/g, '$1\n')

  // Option B prose without marker after (A): "… (A) … g(x) is continuous"
  t = t.replace(
    /(\(\s*A\s*\)[^\n]{6,}?)\s+(?=g\s*\(\s*x\s*\)\s*is\s+continuous)/gi,
    '$1\n(B) ',
  )

  return t
}
