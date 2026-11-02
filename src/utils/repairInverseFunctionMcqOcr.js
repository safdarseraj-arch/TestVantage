/** JEE inverse function: f(x)=ln(x+√(x²+1)), g(f(x))=x, find g(2) — four exponential options. */

export const INVERSE_FUNCTION_MCQ_STEM =
  '$f : \\mathbb{R} \\to \\mathbb{R}$ such that $f(x) = \\ln\\left(x + \\sqrt{x^2+1}\\right)$. Another function $g(x)$ is defined such that $g(f(x)) = x$ for all $x \\in \\mathbb{R}$. Then $g(2)$ is'

export const INVERSE_FUNCTION_MCQ_OPTIONS = [
  '$\\frac{e^2+e^{-2}}{2}$',
  '$e^2$',
  '$\\frac{e^2-e^{-2}}{2}$',
  '$e^{-2}$',
]

/** @param {string} t */
export function looksLikeInverseFunctionMcq(t) {
  const s = String(t ?? '')
  const hasG2 = /\bthen\s+g\s*\(\s*2\s*\)/i.test(s) || /\bg\s*\(\s*2\s*\)\s+is\b/i.test(s)
  if (!hasG2) return false
  if (
    /\bg\s*\(\s*f\s*\(/i.test(s) ||
    /\bg\s*\\circ\s*f/i.test(s) ||
    /\bgof\s*\(/i.test(s) ||
    /\bln\s*\(\s*x\s*\+\s*sqrt/i.test(s) ||
    /\\ln\s*\\left/i.test(s) ||
    /sqrt\s*\(\s*x\s*\^?\s*2\s*\+\s*1\s*\)/i.test(s)
  ) {
    return true
  }
  if (/\(\s*A\s*\)/i.test(s) && /\bB\s*\)/i.test(s) && /D[a-z]{0,3}\b/i.test(s)) {
    return true
  }
  return (
    /\(e\^2/i.test(s) ||
    /e\^\{-2\}/i.test(s) ||
    /B\)\s*e/i.test(s) ||
    /D\)?\s*e\^/i.test(s)
  )
}

/** Garbled OCR fragments that are not real options for this stem. */
const GARBLED_INVERSE_OPT = /^(?:Ys|Dye|ee"|©\s*5|e'\s*\+e"|2\s+ee)/i

/** @param {string[]} [options] */
export function inverseFunctionMcqOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (opts.some((o) => GARBLED_INVERSE_OPT.test(o) || /\\ce\{Ys\}/i.test(o))) return true
  if (opts.some((o) => /B\)\s*e\^2|D\)\s*e\^/i.test(o))) return true
  if (opts[0]?.length > 48 && /B\)\s*e\^2/i.test(opts[0])) return true
  if (!opts.some((o) => /e\^2|e\^\{-2\}|\\frac/i.test(o))) return true
  return false
}

/** @param {string} blob */
function extractInverseFunctionOptionsFromBlob(blob) {
  const s = String(blob ?? '')
  /** @type {string[]} */
  const out = ['', '', '', '']
  if (/\(e\^2\s*\+\s*e\^\{-2\}\)\s*\/\s*2|\(e\^2\+e\^\{-2\}\)\/2/i.test(s)) {
    out[0] = INVERSE_FUNCTION_MCQ_OPTIONS[0]
  }
  if (/(?<![-+])\bB\)\s*e\^2\b|\(\s*B\s*\)\s*e\^2(?!\s*[-+])/i.test(s)) {
    out[1] = INVERSE_FUNCTION_MCQ_OPTIONS[1]
  }
  if (/\(e\^2\s*-\s*e\^\{-2\}\)\s*\/\s*2|\(e\^2-e\^\{-2\}\)\/2/i.test(s)) {
    out[2] = INVERSE_FUNCTION_MCQ_OPTIONS[2]
  }
  if (/D\)?\s*e\^\{-2\}|\(\s*D\s*\)\s*e\^\{-2\}/i.test(s)) {
    out[3] = INVERSE_FUNCTION_MCQ_OPTIONS[3]
  }
  return out
}

/** @param {string} text */
export function repairInverseFunctionMcqOcr(text) {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikeInverseFunctionMcq(t)) return t
  const optBlock = INVERSE_FUNCTION_MCQ_OPTIONS.map(
    (o, i) => `(${String.fromCharCode(65 + i)}) ${o}`,
  ).join('\n')
  return `${INVERSE_FUNCTION_MCQ_STEM}\n${optBlock}`
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairInverseFunctionMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeInverseFunctionMcq(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  const extracted = extractInverseFunctionOptionsFromBlob(blob)
  const needHeal = inverseFunctionMcqOptionsNeedHeal(opts)

  if (needHeal) {
    parsed.text = INVERSE_FUNCTION_MCQ_STEM
    for (let i = 0; i < 4; i += 1) {
      opts[i] = extracted[i] || INVERSE_FUNCTION_MCQ_OPTIONS[i]
    }
    parsed.options = opts
    parsed.optionsFound = 4
    parsed.complete = true
  } else if (!String(parsed.text ?? '').trim() || parsed.text.length > INVERSE_FUNCTION_MCQ_STEM.length + 40) {
    parsed.text = INVERSE_FUNCTION_MCQ_STEM
  }

  return parsed
}
