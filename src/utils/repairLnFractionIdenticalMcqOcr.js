/** JEE MCQ: f(x)=x/ln x, g(x)=ln x/x, identical-function options. */
import { finalizeStemForBank } from './stemBankGuard.js'

export const LN_FRACTION_IDENTICAL_STEM =
  '$f(x) = \\frac{x}{\\ln x}$ and $g(x) = \\frac{\\ln x}{x}$. Then identify the CORRECT statement'

export const LN_FRACTION_IDENTICAL_OPTIONS = [
  '$\\frac{1}{g(x)}$ and $f(x)$ are identical functions',
  '$\\frac{1}{f(x)}$ and $g(x)$ are identical functions',
  '$f(x) \\cdot g(x) = 1 \\quad \\forall x > 0$',
  '$\\frac{1}{f(x) \\cdot g(x)} = 1 \\quad \\forall x > 0$',
]

/** @param {string} t */
export function looksLikeLnFractionIdenticalMcq(t) {
  const s = String(t ?? '')
  if (!/identical\s+function/i.test(s)) return false
  if (!/\bf\b/i.test(s) || !/\bg\s*\(\s*x\s*\)/i.test(s)) return false
  return (
    /CORRECT\s+statement/i.test(s) ||
    /identify\s+the/i.test(s) ||
    /ln\s*x|\\ln\s*x|lnx/i.test(s)
  )
}

/** @param {string} t */
function stemLooksGarbled(t) {
  return (
    /\bf\s*fix\s*\)/i.test(t) ||
    /=\s*\.\s*and\s+g/i.test(t) ||
    /g\s*\(\s*x\s*\)\s*=\s*[-–—.]+\s/i.test(t) ||
    !/\\frac|\\ln|ln\s*x|lnx/i.test(t)
  )
}

/**
 * Repair garbled OCR for f(x)=x/ln x, g(x)=ln x/x identical-function MCQ.
 * @param {string} text
 */
export function repairLnFractionIdenticalMcqOcr(text) {
  let t = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (!t || !looksLikeLnFractionIdenticalMcq(t)) return t

  t = t.replace(
    /\(\s*A\s*\)\s*7\s*\)\s+and\s+f\s*\(\s*x\s*\)/gi,
    '(A) $\\frac{1}{g(x)}$ and $f(x)$',
  )
  t = t.replace(
    /\(\s*B\s*\)\s*T\s*\(\s*x\s*\)\s+and\s+g\s*\(\s*x\s*\)/gi,
    '(B) $\\frac{1}{f(x)}$ and $g(x)$',
  )
  t = t.replace(
    /\(\s*A\s*\)\s*1\s*\/\s*g\s*\(\s*x\s*\)\s+and\s+f\s*\(\s*x\s*\)/gi,
    '(A) $\\frac{1}{g(x)}$ and $f(x)$',
  )
  t = t.replace(
    /\(\s*B\s*\)\s*1\s*\/\s*f\s*\(\s*x\s*\)\s+and\s+g\s*\(\s*x\s*\)/gi,
    '(B) $\\frac{1}{f(x)}$ and $g(x)$',
  )
  t = t.replace(
    /\(\s*C\s*\)\s*f\s*\(\s*x\s*\)\s*[\.\·]?\s*g\s*\(\s*x\s*\)\s*=\s*1\b/gi,
    '(C) $f(x) \\cdot g(x) = 1$',
  )
  t = t.replace(
    /\(\s*D\s*\)\s*1\s*\/\s*\(?\s*f\s*\(\s*x\s*\)\s*[\.\·]?\s*g\s*\(\s*x\s*\)\s*\)?\s*=\s*1\b/gi,
    '(D) $\\frac{1}{f(x) \\cdot g(x)} = 1$',
  )

  if (stemLooksGarbled(t)) {
    t = t.replace(
      /^[\s\S]*?(?=\(\s*A\s*\)|\n\s*\(\s*A\s*\))/i,
      `${LN_FRACTION_IDENTICAL_STEM}\n`,
    )
  } else {
    t = t.replace(
      /\bf\s*\(\s*x\s*\)\s*=\s*(?:\$?\s*)?x\s*\/\s*(?:\\ln|ln)\s*x\b/gi,
      '$f(x) = \\frac{x}{\\ln x}$',
    )
    t = t.replace(
      /\bg\s*\(\s*x\s*\)\s*=\s*(?:\\ln|ln)\s*x\s*\/\s*x\b/gi,
      '$g(x) = \\frac{\\ln x}{x}$',
    )
    t = t.replace(
      /\bf\s*\(\s*x\s*\)\s*=\s*x\s*\/\s*lnx\b/gi,
      '$f(x) = \\frac{x}{\\ln x}$',
    )
    t = t.replace(
      /\bg\s*\(\s*x\s*\)\s*=\s*lnx\s*\/\s*x\b/gi,
      '$g(x) = \\frac{\\ln x}{x}$',
    )
  }

  if (!/\(\s*D\s*\)/i.test(t) && /\(\s*C\s*\)/i.test(t)) {
    t = t.replace(
      /(\(\s*C\s*\)[^\n]*(?:\n|$))/i,
      `$1(D) ${LN_FRACTION_IDENTICAL_OPTIONS[3]}\n`,
    )
  }

  return t
}

/** @param {string} text */
export function repairNestedFracDollars(text) {
  return String(text ?? '').replace(
    /(\$\s*[fg]\s*\(\s*x\s*\)\s*=\s*)\$(\\frac\{[^}]+\}\{[^}]+\})\$/gi,
    '$1$2$',
  )
}

/**
 * Fill stem + A–D when parse recovered this question type but OCR was partial.
 * @param {{ text?: string, options?: string[], optionsFound?: number }} parsed
 */
export function repairLnFractionIdenticalMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`
  if (!looksLikeLnFractionIdenticalMcq(blob)) return parsed

  const opts = [...(parsed.options ?? ['', '', '', ''])]
  while (opts.length < 4) opts.push('')

  parsed.text = repairNestedFracDollars(
    finalizeStemForBank(LN_FRACTION_IDENTICAL_STEM, opts),
  )
  for (let i = 0; i < 4; i++) {
    opts[i] = finalizeStemForBank(LN_FRACTION_IDENTICAL_OPTIONS[i])
  }

  parsed.options = opts
  parsed.optionsFound = 4
  parsed.complete = true
  return parsed
}

/** Strip (A) 1 tail leaked into stem when options start with 1/g or \\frac{1}. */
export function stripLnFractionStemOptionLeak(stem, options = []) {
  let t = String(stem ?? '').trim()
  if (!t) return t
  const first = String(options[0] ?? '').trim()
  if (!/^1\s*\/\s*g|\\frac\s*\{\s*1\s*\}\s*\{\s*g/i.test(first)) return t
  return t.replace(/\s*\(\s*A\s*\)\s*1\s*$/i, '').trim()
}
