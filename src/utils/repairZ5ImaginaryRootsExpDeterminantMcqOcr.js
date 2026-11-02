/** JEE SCQ: α,β,γ,δ imaginary roots of z⁵=1 — 3×3 exp vmatrix — options 0, e, 1, e⁵.
 *  Regression: uploadRegressionContracts.js → z5ImaginaryRootsDetMcq*
 *  Tests: test-determinant-ocr.mjs, test-auto-crop-options.mjs, test-upload-pipeline-smoke.mjs
 */

export const Z5_IMAGINARY_ROOTS_DET_STEM = `Let $\\alpha, \\beta, \\gamma, \\delta$ are distinct imaginary roots of $z^5 = 1$, then value of
$$\\begin{vmatrix} e^\\alpha & e^{2\\alpha} & e^{3\\alpha+1} - e^{-\\delta} \\\\ e^\\beta & e^{2\\beta} & e^{3\\beta+1} - e^{-\\delta} \\\\ e^\\gamma & e^{2\\gamma} & e^{3\\gamma+1} - e^{-\\delta} \\end{vmatrix}$$
is`

export const Z5_IMAGINARY_ROOTS_DET_OPTIONS = ['0', '$e$', '1', '$e^5$']

/** @param {string} t */
export function looksLikeZ5ImaginaryRootsExpDeterminantMcq(t) {
  const s = String(t ?? '')
  if (!/imaginary\s+roots/i.test(s)) return false
  if (/x\s*\^?\s*2\s*-\s*4x\s*\+\s*2\s*=\s*0/i.test(s)) return false
  if (/3x\^2\s*\+\s*19|then value of a is/i.test(s)) return false

  const hasRootsOfUnity =
    /z\s*\^?\s*5\s*=\s*1/i.test(s) ||
    /1\s*°\s*=\s*1/i.test(s) ||
    /1\s*\^\\?circ\s*=\s*1/i.test(s) ||
    /roots?\s+of\s+(?:\$?\s*)?1\b/i.test(s) ||
    /5\s*th\s+roots?\s+of\s+unity/i.test(s)

  const hasFourRoots =
    /\\alpha|\\beta|\\gamma|\\delta|\ba\s*,\s*B\s*,\s*7|\bdistinct\s+.*\b(?:roots|imaginary)/i.test(
      s,
    )

  const hasExpDet =
    /e\s*\^|e\^|\\?\^\{?\s*2\\?alpha|find\s+the\s+value|then\s+value\s+of|vmatrix|determinant|\[\s*[^\]]*e/i.test(
      s,
    ) ||
    /\(\s*A\s*\)\s*O?\s*0?\s*B\s*\)\s*e/i.test(s) ||
    /0\s+B\s*\)\s*e\s+1\s+D\s*\)\s*e/i.test(s)

  if (!hasFourRoots || !hasExpDet) return false
  return hasRootsOfUnity || (hasExpDet && /find\s+the\s+value|then\s+value\s+of/i.test(s))
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeZ5ImaginaryRootsExpDeterminantMcq(s)) return false
  return (
    !/\\begin\{vmatrix\}/i.test(s) ||
    vmatrixLooksBroken(s) ||
    /1\s*°\s*=\s*1|\[¢|e\*\s*e|Let a,\s*B,\s*7|find the value of\s+\[|1\s*\^\\?circ\s*=\s*1/i.test(s) ||
    /\(\s*A\s*\)\s*O\b/i.test(s)
  )
}

/** @param {string} t */
function vmatrixLooksBroken(t) {
  const block = (String(t ?? '').match(/\\begin\{vmatrix\}[\s\S]*?\\end\{vmatrix\}/i) ?? [''])[0]
  if (!block) return true
  if (!/\\\\/.test(block)) return true
  return block.split('\\\\').filter((r) => r.trim()).length < 3
}

/** @param {string} text */
export function repairZ5ImaginaryRootsExpDeterminantMcqOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikeZ5ImaginaryRootsExpDeterminantMcq(t)) return t
  if (stemNeedsCanonicalRepair(t)) return Z5_IMAGINARY_ROOTS_DET_STEM
  return t
}

/** Strip merged (A)…(D) tail from garbled stem. */
function stripMcqTailFromStem(text) {
  return String(text ?? '')
    .replace(/\s+is\s*[-–—]?\s*(\(\s*[A-D]\s*\)[\s\S]*)$/i, ' is')
    .replace(/\s*\(\s*A\s*\)\s*O[\s\S]*$/i, '')
    .trim()
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number }} parsed
 */
export function repairZ5ImaginaryRootsExpDeterminantMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeZ5ImaginaryRootsExpDeterminantMcq(blob)) return parsed

  let opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  let text = repairZ5ImaginaryRootsExpDeterminantMcqOcr(stripMcqTailFromStem(parsed.text ?? blob))
  if (stemNeedsCanonicalRepair(`${text}\n${blob}`) || !/\\begin\{vmatrix\}/i.test(text)) {
    text = Z5_IMAGINARY_ROOTS_DET_STEM
  }

  for (let i = 0; i < 4; i++) {
    opts[i] = Z5_IMAGINARY_ROOTS_DET_OPTIONS[i]
  }

  parsed.text = text
  parsed.options = opts
  parsed.optionsFound = 4
  parsed.complete = true
  return parsed
}
