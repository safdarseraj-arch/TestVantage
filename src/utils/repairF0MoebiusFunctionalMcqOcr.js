/**
 * JEE SCQ: f((x+1)/(x-1)) = 2f(x) + 1/(x-1), then f(0) — options 0, 2/3, 3/4, 5/6.
 */

import { normalizeOptionMarkersInText } from './mcqOptionMarkers.js'
import { parseQuestionText } from './parseQuestionText.js'

export const F0_MOEBIUS_FUNCTIONAL_STEM =
  'Suppose $f(x)$ is a real function satisfying $f\\left(\\frac{x+1}{x-1}\\right) = 2f(x) + \\frac{1}{x-1}$ for all $x \\in \\mathbb{R} \\setminus \\{1\\}$, then $f(0)$ is equal to'

export const F0_MOEBIUS_FUNCTIONAL_OPTIONS = ['$0$', '$\\frac{2}{3}$', '$\\frac{3}{4}$', '$\\frac{5}{6}$']

/** @param {string} text */
export function stripOcrHlineTableArtifact(text) {
  let t = String(text ?? '')
  const hlineSpam = /(?:\\hline){3,}/i.test(t)
  const tabularSpam =
    /\\begin\{tabular\}|\\text\{begin\}\{tabular\}|\\backslash\\text\{begin\}/i.test(t)
  const isF0 = looksLikeF0MoebiusFunctionalMcq(t)
  if (!hlineSpam && !tabularSpam && !isF0) return t.trim()

  const tabAt = t.search(/\\backslash\\text\{begin\}|\\begin\{tabular\}|\\text\{begin\}\{tabular\}/i)
  if (tabAt > 20) t = t.slice(0, tabAt).trim()

  return t
    .replace(/\\backslash\\text\{begin\}\{[^}]*\}(?:\{[^}]*\})?[\s\S]*$/i, '')
    .replace(/\\text\{begin\}\{tabular\}[\s\S]*$/i, '')
    .replace(/\\begin\{tabular\}[\s\S]*$/i, '')
    .replace(/\\begin\{array\}\s*\{[^}]*\}(?:\\hline)+/gi, '')
    .replace(/(?:\\hline){2,}/gi, '')
    .replace(/\\begin\{array\}\s*\{[^}]*\}/gi, '')
    .replace(/\\end\{array\}/gi, '')
    .replace(/\s+is\s*-\s*\\frac\s*\{\s*1\s*\}\s*\{\s*2\s*\}\s*\.?\s*$/i, ' is -')
    .trim()
}

/** Garbled tail when OCR merges stem + options or drops the top of the page. */
function looksLikeF0MoebiusGarbledTail(s) {
  if (!/\bf\s*\(\s*0\s*\)/i.test(s)) return false
  const hasWrongFracs =
    /(?:\\frac\s*\{\s*1\s*\}\s*\{\s*3\s*\}|[^\d]1\s*\/\s*3\b)/.test(s) &&
    /(?:\\frac\s*\{\s*1\s*\}\s*\{\s*4\s*\}|[^\d]1\s*\/\s*4\b)/.test(s) &&
    /(?:\\frac\s*\{\s*1\s*\}\s*\{\s*6\s*\}|[^\d]1\s*\/\s*6\b)/.test(s)
  const hasPrimeLabels =
    /\(\s*A\s*['′]|A\s*\\prime|B\s*\\prime|\(\s*B\s*\{\s*\\prime/i.test(s)
  const hasEqualTail = /then\s+.*f\s*\(\s*0\s*\)\s+is\s+equal/i.test(s)
  return (
    (hasWrongFracs || hasPrimeLabels) &&
    (hasEqualTail ||
      /Suppose|real function|satisfying|2\s*f\s*\(\s*x|2f\s*\(\s*x|frac\s*\{\s*x\s*\+\s*1/i.test(s))
  )
}

/** @param {string} t */
export function looksLikeF0MoebiusFunctionalMcq(t) {
  const s = String(t ?? '').replace(/\r\n/g, '\n')
  if (looksLikeF0MoebiusGarbledTail(s)) return true
  if (!/\bf\s*\(\s*0\s*\)/i.test(s) && !/then\s+\$?\s*f\s*\(\s*0\s*\)/i.test(s)) return false
  const hasMoebius =
    /f\s*(?:\\left\s*\(\s*)?\\?frac\s*\{\s*x\s*\+\s*1/i.test(s) ||
    /f\s*\(\s*\\?(?:left\s*\(\s*)?\\?frac\s*\{\s*x\s*\+\s*1/i.test(s) ||
    /f\s*\(\s*\(\s*x\s*\+\s*1\s*\)\s*\/\s*\(\s*x\s*-\s*1\s*\)\s*\)/i.test(s) ||
    /\\frac\s*\{\s*x\s*\+\s*1\s*\}\s*\{\s*x\s*-\s*1\s*\}/i.test(s) ||
    /\(x\s*\+\s*1\s*\)\s*\/\s*\(\s*x\s*-\s*1\s*\)/i.test(s)
  const hasFunctional =
    /2\s*f\s*\(\s*x\s*\)/i.test(s) ||
    /2f\s*\(\s*x/i.test(s) ||
    /\+\s*\\?frac\s*\{\s*1\s*\}\s*\{\s*x\s*-\s*1\s*\}/i.test(s) ||
    /\+\s*1\s*\/\s*\(\s*x\s*-\s*1\s*\)/i.test(s)
  if (!hasMoebius || !hasFunctional) return false
  return (
    /Suppose/i.test(s) ||
    /real function/i.test(s) ||
    /satisfying/i.test(s) ||
    /forall|for all/i.test(s)
  )
}

/** @param {string} t */
function stemNeedsCanonicalRepair(t) {
  const s = stripOcrHlineTableArtifact(String(t ?? ''))
  if (!looksLikeF0MoebiusFunctionalMcq(s)) return false
  if (/\\hline|\\begin\{array\}/i.test(s)) return true
  if (/[A-D]\s*['′]|\\prime/i.test(s)) return true
  if (/\(\s*A\s*['′]/i.test(s)) return true
  if (/\(A\)\s*\(\s*A/i.test(s)) return true
  if (/\$\$/.test(s) && /\(\s*[A-D]/i.test(s)) return true
  if (!/\$f\\left\(\\frac\{x\+1\}/.test(s) && !/f\s*\(\s*\\frac\{x\+1\}/.test(s)) return true
  return false
}

/** @param {string[]} [options] */
export function f0MoebiusOptionsNeedHeal(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  if (opts.filter(Boolean).length < 4) return true
  if (opts.some((o) => /['′]|\\prime/i.test(o))) return true
  if (opts.some((o) => /\(\s*[A-D]\s*['′]/i.test(o))) return true
  if (opts.some((o) => /\\frac\{1\}\{[346]\}/.test(o))) return true
  const _canon = ['0', '2', '3', '5']
  const nums = opts.map((o) => o.replace(/\$/g, ''))
  if (!nums[0]?.includes('0') || nums[0].length > 3) return true
  if (!/\\frac\{2\}\{3\}|2\s*\/\s*3/.test(opts[1] ?? '')) return true
  return false
}

/** @param {string} text */
export function repairF0MoebiusFunctionalMcqOcr(text) {
  let t = stripOcrHlineTableArtifact(String(text ?? '').replace(/\r\n/g, '\n').trim())
  if (!t) return t
  if (!looksLikeF0MoebiusFunctionalMcq(t)) return t
  if (!stemNeedsCanonicalRepair(t)) return t
  const optBlock = F0_MOEBIUS_FUNCTIONAL_OPTIONS.map(
    (o, i) => `(${String.fromCharCode(65 + i)}) ${o}`,
  ).join('\n')
  return `${F0_MOEBIUS_FUNCTIONAL_STEM}\n${optBlock}`
}

/**
 * @param {{ text?: string, options?: string[], optionsFound?: number, _ocrSource?: string }} parsed
 */
export function repairF0MoebiusFunctionalMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}\n${parsed._ocrSource ?? ''}`
  if (!looksLikeF0MoebiusFunctionalMcq(blob)) return parsed

  let text = stripOcrHlineTableArtifact(parsed.text ?? '')
  let opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  const norm = normalizeOptionMarkersInText(blob)
  const reparsed = parseQuestionText(norm)
  if (
    (reparsed.optionsFound ?? 0) >= 3 &&
    !f0MoebiusOptionsNeedHeal(reparsed.options) &&
    !stemNeedsCanonicalRepair(reparsed.text)
  ) {
    text = stripOcrHlineTableArtifact(reparsed.text ?? text)
    opts = [...reparsed.options]
  } else if (stemNeedsCanonicalRepair(blob) || f0MoebiusOptionsNeedHeal(opts)) {
    text = F0_MOEBIUS_FUNCTIONAL_STEM
    opts = [...F0_MOEBIUS_FUNCTIONAL_OPTIONS]
  }

  return {
    ...parsed,
    text,
    options: opts.slice(0, 4),
    optionsFound: opts.filter((o) => String(o ?? '').trim()).length,
    complete: opts.filter((o) => String(o ?? '').trim()).length >= 4,
  }
}
