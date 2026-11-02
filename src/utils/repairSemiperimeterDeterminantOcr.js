/** JEE integer: triangle sides a,b,c, cubic, semiperimeter 3×3 determinant → (p-q). */
export const SEMIPERIMETER_DET_STEM = `If the sides $a, b, c$ of $\\Delta ABC$ satisfy the equation $4x^3 - 24x^2 + 47x - 30 = 0$ and
$$\\begin{vmatrix} a^2 & (s-a)^2 & (s-a)^2 \\\\ (s-b)^2 & b^2 & (s-b)^2 \\\\ (s-c)^2 & (s-c)^2 & c^2 \\end{vmatrix} = \\frac{p^2}{q}$$
where $p$ & $q$ are coprime & $s$ is semiperimeter of $\\Delta ABC$, then $(p-q)$ is`

/** @param {string} t */
export function looksLikeSemiperimeterDeterminantInteger(t) {
  const s = String(t ?? '')
  if (!/\bsides?\s+(?:\$?\s*)?a\s*,\s*(?:\$?\s*)?b\s*,\s*(?:\$?\s*)?c\b/i.test(s)) return false
  if (!/AABC|\\Delta\s*ABC|semiperimeter/i.test(s)) return false
  return (
    /4x\s*[\^³3]|47x\s*-\s*30|24x/i.test(s) ||
    /\(s-[abc]\)|coprime|\(p\s*-\s*q\)/i.test(s) ||
    /\\begin\{vmatrix\}|p\s*[\^²2]\s*\/\s*q/i.test(s)
  )
}

/** @param {string} t */
function vmatrixBlock(t) {
  return (String(t ?? '').match(/\\begin\{vmatrix\}[\s\S]*?\\end\{vmatrix\}/i) ?? [''])[0]
}

/** @param {string} t */
function vmatrixLooksBroken(t) {
  const block = vmatrixBlock(t)
  if (!block) return false
  if (!/\\\\/.test(block)) return true
  return block.split('\\\\').filter((r) => r.trim()).length < 3
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeSemiperimeterDeterminantInteger(s)) return false
  return (
    /\bAABC\b/i.test(s) ||
    /24x\s*(?:%2|\\%2)/i.test(s) ||
    !/\\begin\{vmatrix\}/i.test(s) ||
    vmatrixLooksBroken(s) ||
    /\\ Delta/i.test(s) ||
    !/semiperimeter[\s\S]{0,80}\(p\s*-\s*q\)/i.test(s) ||
    /\(\s*s\s*-\s*b\s*\)\s*\?/i.test(s) ||
    /a'\s*\(\s*s-a\s*\)'/i.test(s)
  )
}

/**
 * Repair garbled OCR for semiperimeter determinant integer question.
 * @param {string} text
 */
export function repairSemiperimeterDeterminantOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikeSemiperimeterDeterminantInteger(t)) return t

  t = t.replace(/\bAABC\b/g, '$\\Delta ABC$')
  t = t.replace(/24x\s*(?:%2|\\%2)/gi, '24x^2')

  if (stemNeedsCanonicalRepair(t)) {
    return SEMIPERIMETER_DET_STEM
  }

  return t
}

/**
 * Restore full integer stem when option-splitter mis-read (s-b) as option (B).
 * @param {{ text?: string, options?: string[], optionsFound?: number }} parsed
 */
export function repairSemiperimeterDeterminantParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeSemiperimeterDeterminantInteger(blob)) return parsed

  const opts = (parsed.options ?? []).map((o) => String(o ?? '').trim())
  const falseOptionSplit =
    opts.some((o) => /^\|\s*\(\s*s-/i.test(o)) ||
    opts.some((o) => /semiperimeter|\(p\s*-\s*q\)/i.test(o))

  let text = repairSemiperimeterDeterminantOcr(parsed.text ?? '')
  if (stemNeedsCanonicalRepair(text) || falseOptionSplit || !/\\begin\{vmatrix\}/i.test(text)) {
    text = SEMIPERIMETER_DET_STEM
  }

  parsed.text = text
  parsed.options = ['', '', '', '']
  parsed.optionsFound = 0
  parsed.complete = false
  return parsed
}
