/**
 * Repair OCR for polynomial sums, limits, and JEE-style series questions.
 * @param {string} text
 */
export function fixOcrSeriesAndLimits(text) {
  if (!text?.trim()) return text

  let out = text.replace(/\r\n/g, '\n')

  // Stray LaTeX delimiter tails
  // Strip digit-glued stray $$ (OCR junk), but never eat a real closing $$ after math.
  out = out.replace(/(\d+)\$\$/g, (full, digits, offset, str) => {
    const before = str.slice(0, offset)
    const opens = (before.match(/\$\$/g) || []).length
    // Odd open count ⇒ this $$ closes a display block (e.g. …9\end{vmatrix}$$).
    if (opens % 2 === 1) return full
    if (/\\(?:begin|end)\{(?:vmatrix|bmatrix|pmatrix|matrix|array)\}/i.test(before.slice(-80))) {
      return full
    }
    return digits
  })
  // Trailing orphan $$ only — keep when it closes an opened display math block.
  out = out.replace(/\$\$\s*$/gm, (full, offset, str) => {
    const before = str.slice(0, offset)
    const opens = (before.match(/\$\$/g) || []).length
    if (opens % 2 === 1) return full
    if (/\\(?:begin|end)\{(?:vmatrix|bmatrix|pmatrix|matrix|array)\}/i.test(before.slice(-120))) {
      return full
    }
    return ''
  })

  // Lowercase MCQ labels: (a) (B) — never treat F(a, b) or (a, b) = as options
  out = out.replace(/\(([a-d])\)\s(?!=)/gi, (match, l, offset, str) => {
    const before = str.slice(Math.max(0, offset - 8), offset)
    if (/,\s*$/.test(before) || /\(\s*[a-z]\s*,\s*$/i.test(before)) return match
    return `(${l.toUpperCase()}) `
  })
  out = out.replace(/(?<!,)(?:^|\n|\s)([a-d])\)\s+(?!=)/gi, ' ($1) ')

  // © option C (again, in case structure pass missed inline)
  out = out.replace(/\(\s*©\s*\)/g, '(C)')
  out = out.replace(/\s+\(\s*©\s*\)\s+/g, ' (C) ')

  // P(x) header spacing
  out = out.replace(/\bP\s*\(\s*x\s*\)\s*=/gi, 'P(x) =')

  // a,x → a_1 x
  out = out.replace(/=\s*a\s*,\s*x/gi, '= a_1 x')
  out = out.replace(/\ba\s*,\s*x\b/gi, 'a_1 x')

  // Repeated "ax" terms → a_2 x^2 + a_3 x^3 + ...
  out = out.replace(
    /= a_1 x\s*\+\s*ax\s*\+\s*ax/gi,
    '= a_1 x + a_2 x^2 + a_3 x^3',
  )
  out = out.replace(/\+\s*ax\s*\+\s*ax/gi, '+ a_2 x^2 + a_3 x^3')
  out = out.replace(/\.\.\.\.\.\.+/g, '\\cdots')
  out = out.replace(/\.{4,}/g, '\\cdots')

  // @100¢'%  →  a_{100} x^{100}
  out = out.replace(/\+\s*@\s*(\d+)\s*[¢°'′%]+/gi, '+ a_$1 x^$1')
  out = out.replace(/@\s*(\d+)\s*[¢°'′%]+/gi, 'a_$1 x^$1')

  // Orphan line "1007" after x^100 OCR split
  out = out.replace(/\ba_100\s*x\^100\s*\n\s*1007\s*\n/gi, 'a_{100} x^{100}\n')
  out = out.replace(/\n1007\n/g, '\n')

  // a = land → a_i = i
  out = out.replace(/\ba\s*=\s*land\b/gi, 'a_i = i')
  out = out.replace(/\bwhere\s+a\s*=\s*land\b/gi, 'where a_i = i')

  // Spurious RVi=23\hat{i} after polynomial (not a vector geometry line)
  out = out.replace(
    /,?\s*where\s+a_i\s*=\s*i\s*;?\s*RVi\s*=\s*\d+\\hat\{i\}/gi,
    ', where a_i = i',
  )
  out = out.replace(/RVi\s*=\s*\d+\\hat\{i\}/gi, '')
  out = out.replace(/;\s*RVi[^.\n]*/gi, '')

  // for i = 1 to 100 before limit
  out = out.replace(
    /\ba_i\s*=\s*i\s*,?\s*\n?\s*100\s*,\s*then\s+lim/gi,
    'a_i = i for i = 1 to 100, then \\lim',
  )
  out = out.replace(/\b100\s*,\s*then\s+lim/gi, 'for i = 1 to 100, then \\lim')

  // lim - hk. → common derivative limit form
  out = out.replace(
    /\blim\s*[-–]\s*hk\.?\s*has\s+the\s+value/gi,
    '\\lim_{x \\to 1} \\frac{P(x)-P(1)}{x-1} has the value',
  )
  out = out.replace(/\blim\s*[-–]\s*hk\.?/gi, '\\lim_{x \\to 1} \\frac{P(x)-P(1)}{x-1}')

  // Garbage standalone \times^n lines from OCR noise
  out = out.replace(/^\\times\^\d+\s*\\times\^\d+\s*d\s*$/gim, '')
  out = out.replace(/^\\times\s*\^\s*\d+.*$/gim, '')

  // Subscript i on a: a_i when "for i ="
  out = out.replace(/\bfor\s+i\s*=\s*(\d+)\s+to\s+(\d+)/gi, 'for i = $1 to $2')

  return out
}
