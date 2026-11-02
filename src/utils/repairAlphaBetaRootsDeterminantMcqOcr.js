/** JEE SCQ: α,β roots of x²-4x+2=0, 3×3 determinant in α,β — options 125/64/25/16. */

export const ALPHA_BETA_DET_STEM = `If $\\alpha, \\beta$ where $\\alpha > \\beta$ are roots of $x^2 - 4x + 2 = 0$, then value of determinant
$$\\begin{vmatrix} 1 + \\alpha - \\beta & 2\\sqrt{\\alpha\\beta} & -2\\sqrt{\\beta} \\\\ 2\\sqrt{\\alpha\\beta} & 1 - \\alpha + \\beta & 2\\sqrt{\\alpha} \\\\ 2\\sqrt{\\beta} & -2\\sqrt{\\alpha} & 1 - \\alpha - \\beta \\end{vmatrix}$$
is`

export const ALPHA_BETA_DET_OPTIONS = ['125', '64', '25', '16']

/** @param {string} t */
export function looksLikeAlphaBetaRootsDeterminantMcq(t) {
  const s = String(t ?? '')
  if (!/determinant|vmatrix|2Jap|2a\s*\\?\s*l\^?1|I\+a-B/i.test(s)) return false
  return (
    /x\s*\^?\s*2\s*-\s*4x\s*\+\s*2\s*=\s*0/i.test(s) &&
    (/roots?\s+of|where\s+o\s*>\s*B|where\s+\\?alpha\s*>\s*\\?beta|\ba\s*,\s*where/i.test(s) ||
      /\\alpha|\\beta|\ba\s*,.*\bb\b/i.test(s))
  )
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeAlphaBetaRootsDeterminantMcq(s)) return false
  return (
    !/\\begin\{vmatrix\}/i.test(s) ||
    vmatrixLooksBroken(s) ||
    /I\+a-B|2Jap|Jo\^?1|p2a2B|where o\s*>\s*B/i.test(s) ||
    /\(\s*A\s*\)\s*125/i.test(s)
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
export function repairAlphaBetaRootsDeterminantMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikeAlphaBetaRootsDeterminantMcq(t)) return t

  if (stemNeedsCanonicalRepair(t)) {
    return ALPHA_BETA_DET_STEM
  }

  t = t.replace(/\bwhere o\s*>\s*B\b/gi, 'where $\\alpha > \\beta$')
  t = t.replace(/\bIf a,\s*where\b/gi, 'If $\\alpha, \\beta$ where')
  return t
}

/** Strip (A)125…(D)16 tail from garbled stem before canonical replace. */
function stripMcqTailFromStem(text) {
  return String(text ?? '')
    .replace(/\s+is\s*[-–—]?\s*(\(\s*[A-D]\s*\)[\s\S]*)$/i, ' is')
    .replace(/\s*\(\s*[A-D]\s*\)\s*\d+[\s\S]*$/i, '')
    .trim()
}

/** Pull (A)125 … from OCR blob when parse missed options. */
function extractNumericOptionsFromBlob(blob) {
  const opts = ['', '', '', '']
  for (let i = 0; i < 4; i++) {
    const L = String.fromCharCode(65 + i)
    const m = String(blob ?? '').match(new RegExp(`\\(\\s*${L}\\s*\\)\\s*(\\d{1,4})`, 'i'))
    if (m?.[1]) opts[i] = m[1]
  }
  return opts
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number }} parsed
 */
export function repairAlphaBetaRootsDeterminantMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeAlphaBetaRootsDeterminantMcq(blob)) return parsed

  let opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')
  if (opts.filter((o) => /^\d{1,4}$/.test(String(o ?? '').trim())).length < 2) {
    opts = extractNumericOptionsFromBlob(blob)
  }

  let text = repairAlphaBetaRootsDeterminantMcqOcr(stripMcqTailFromStem(parsed.text ?? blob))
  if (stemNeedsCanonicalRepair(`${text}\n${blob}`) || !/\\begin\{vmatrix\}/i.test(text)) {
    text = ALPHA_BETA_DET_STEM
  }

  for (let i = 0; i < 4; i++) {
    const n = ALPHA_BETA_DET_OPTIONS[i]
    const cur = String(opts[i] ?? '').trim().replace(/^\(\s*[A-D]\s*\)\s*/i, '')
    opts[i] = /^\d{1,4}$/.test(cur) ? cur : n
  }

  parsed.text = text
  parsed.options = opts
  parsed.optionsFound = 4
  parsed.complete = true
  return parsed
}
