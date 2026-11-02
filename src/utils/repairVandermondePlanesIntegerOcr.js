/** JEE integer: Vandermonde det = 6, points on planes 2x+3y+6z, distance d, find (210d). */
export const VANDERMONDE_PLANES_STEM = `Let $(p_1, q_1, r_1)$ & $(p_2, q_2, r_2)$ are satisfying $$\\begin{vmatrix} 1 & p & p^2 \\\\ 1 & q & q^2 \\\\ 1 & r & r^2 \\end{vmatrix} = 6$$ (where $p_i, q_i, r_i \\in \\mathbb{N}$ and $p_i < q_i < r_i$ & $i = 1, 2$) and point $(p_1, q_1, r_1)$ lies on the plane $2x + 3y + 6z = k_1$ and point $(p_2, q_2, r_2)$ lies on the plane $2x + 3y + 6z = k_2$ (where $p_1 = p_2 = 1$). If distance between these planes is 'd', then value of $(210d)$ is`

/** @param {string} t */
export function looksLikeVandermondePlanesInteger(t) {
  const s = String(t ?? '')
  if (!/210\s*d|\(210d\)/i.test(s)) return false
  if (!/2x\s*\+\s*3y\s*\+\s*6z|distance between these planes/i.test(s)) return false
  return (
    /satisfying|vmatrix|p\s*[\^²2]|p_1|p\s*,\s*q|\[l\s*q\s*q|=\s*6\b/i.test(s) ||
    /lies on the plane/i.test(s)
  )
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeVandermondePlanesInteger(s)) return false
  return (
    !/\\begin\{vmatrix\}/i.test(s) ||
    /\[l\s*q\s*q|\(p\s*,\s*q\s*\.1|Py\.Qy|e Nand|Lp p/i.test(s) ||
    !/\\mathbb\{N\}/i.test(s) ||
    !/\(210d\)\s*is/i.test(s) ||
    !/k_1|k_2/i.test(s)
  )
}

/**
 * Repair garbled OCR for Vandermonde + parallel planes distance integer question.
 * @param {string} text
 */
export function repairVandermondePlanesIntegerOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikeVandermondePlanesInteger(t)) return t

  if (stemNeedsCanonicalRepair(t)) {
    return VANDERMONDE_PLANES_STEM
  }

  t = t.replace(/\[l\s*q\s*q[^\]]*\|\s*=\s*6\s*\(/gi, '$\\begin{vmatrix} 1 & p & p^2 \\\\ 1 & q & q^2 \\\\ 1 & r & r^2 \\end{vmatrix} = 6$')
  t = t.replace(/e Nand/gi, '$\\in \\mathbb{N}$ and')
  t = t.replace(/\(p\s*,\s*q\s*\.1;\)/gi, '$(p_1, q_1, r_1)$')
  t = t.replace(/\(Py\.Qy\.1,\)/gi, '$(p_2, q_2, r_2)$')
  t = t.replace(/2x \+ 3y \+ 6z = k(?!_)/gi, (m, offset, str) => {
    const before = str.slice(0, offset)
    return before.includes('k_1') || /k_1/.test(str.slice(offset + m.length))
      ? '2x + 3y + 6z = k_2'
      : '2x + 3y + 6z = k_1'
  })

  if (stemNeedsCanonicalRepair(t)) return VANDERMONDE_PLANES_STEM
  return t
}

/**
 * Restore full integer stem when option-splitter mis-read (210d) as option (D).
 * @param {{ text?: string, options?: string[], optionsFound?: number }} parsed
 */
export function repairVandermondePlanesIntegerParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeVandermondePlanesInteger(blob)) return parsed

  const opts = (parsed.options ?? []).map((o) => String(o ?? '').trim())
  const falseOptionSplit =
    opts.some((o) => /^is$/i.test(o)) ||
    opts.some((o) => /^\d+\s*d\)?$/i.test(o))

  let text = repairVandermondePlanesIntegerOcr(parsed.text ?? '')
  if (stemNeedsCanonicalRepair(text) || falseOptionSplit || !/\\begin\{vmatrix\}/i.test(text)) {
    text = VANDERMONDE_PLANES_STEM
  }

  parsed.text = text
  parsed.options = ['', '', '', '']
  parsed.optionsFound = 0
  parsed.complete = false
  return parsed
}
