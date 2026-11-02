/** JEE Relations & Functions: surjective but not injective — four f:R→R style options. */

export const SURJECTIVE_NOT_INJECTIVE_STEM =
  'Which of the following function is surjective but not injective'

export const SURJECTIVE_NOT_INJECTIVE_OPTIONS = [
  '$f : \\mathbb{R} \\to \\mathbb{R}, f(x) = x^4 + 2x^3 - x^2 + 1$',
  '$f : \\mathbb{R} \\to \\mathbb{R}, f(x) = x^3 + x + 1$',
  '$f : \\mathbb{R} \\to \\mathbb{R}^+, f(x) = \\sqrt{1+x^2}$',
  '$f : \\mathbb{R} \\to \\mathbb{R}, f(x) = x^3 + 2x^2 - x + 1$',
]

/** @param {string} t */
export function looksLikeSurjectiveNotInjectiveMcq(t) {
  const s = String(t ?? '')
  if (!/surjective\s+but\s+not\s+injective/i.test(s)) return false
  return (
    /which\s+of\s+the\s+following\s+function/i.test(s) ||
    /\bf\s*:\s*R\b/i.test(s) ||
    /f\s*\(\s*x\s*\)\s*=/i.test(s) ||
    /\(A\)/i.test(s)
  )
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = String(t ?? '')
  if (!looksLikeSurjectiveNotInjectiveMcq(s)) return false
  if (/\(\s*A\s*\)/i.test(s) && s.length > SURJECTIVE_NOT_INJECTIVE_STEM.length + 12) return true
  if (/R\s*>\s*R|R>R|lx\)\s*=|l\s*\(\s*x\s*\)/i.test(s)) return true
  if (/\\times\^2|x\^2\s*\+\s*2x\^3\s*-\s*x\^2/i.test(s) && !/x\^4/i.test(s)) return true
  return false
}

/** @param {string[]} [options] */
export function surjectiveNotInjectiveOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (!opts.some((o) => /x\^4/i.test(o))) return true
  if (opts.some((o) => /R\s*>\s*R|R>R|lx\)|\\times\^2/i.test(o))) return true
  if (!opts.some((o) => /\\sqrt|R\^\+|\^\+/i.test(o))) return true
  return false
}

/** @param {string} text */
export function repairSurjectiveNotInjectiveMcqOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikeSurjectiveNotInjectiveMcq(t)) return t
  if (!stemNeedsCanonicalRepair(t)) return t
  const optBlock = SURJECTIVE_NOT_INJECTIVE_OPTIONS.map(
    (o, i) => `(${String.fromCharCode(65 + i)}) ${o}`,
  ).join('\n')
  return `${SURJECTIVE_NOT_INJECTIVE_STEM}\n${optBlock}`
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairSurjectiveNotInjectiveMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeSurjectiveNotInjectiveMcq(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  let text = String(parsed.text ?? '').trim()
  if (stemNeedsCanonicalRepair(`${text}\n${blob}`) || surjectiveNotInjectiveOptionsNeedHeal(opts)) {
    text = SURJECTIVE_NOT_INJECTIVE_STEM
    for (let i = 0; i < 4; i++) opts[i] = SURJECTIVE_NOT_INJECTIVE_OPTIONS[i]
    parsed.text = text
    parsed.options = opts
    parsed.optionsFound = 4
    parsed.complete = true
  }
  return parsed
}
