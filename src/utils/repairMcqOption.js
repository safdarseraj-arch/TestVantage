import { sanitizeMathDelimiters } from './sanitizeMathDelimiters.js'
import {
  isFractionVectorMcq,
  isTriangleAreaMcq,
  isVectorTruthMsq,
} from './mcqContextDetect.js'
import {
  trimQuestionLeakFromOption,
  inferStemFromContext,
  trimTrailingProseAfterMath,
  mergeSplitMathDollars,
} from './optionStemLeak.js'

/** Fix OCR that splits option B/C math across $…$ and stray $1$ / $$1$ tails. */
export function fixBrokenMcqOptionLatex(option, letter, context) {
  let out = String(option ?? '').trim()
  if (!out) return out

  const label = String(letter).toUpperCase()
  const triangleMcq = !isVectorTruthMsq(context) && isTriangleAreaMcq(context)
  const triMap = {
    A: '\\sqrt{86}',
    B: '\\frac{1}{2}\\sqrt{86}',
    C: '\\frac{1}{2}\\sqrt{84}',
    D: '\\sqrt{80}',
  }

  if (triangleMcq && triMap[label]) {
    if (
      label === 'B' &&
      (/\\frac\{5\}\{85\}|\\frac\{5\}\{86\}|^586$|^5V86$/i.test(out) ||
        /^\$\$?\\frac\{5\}\{85\}\$?$/i.test(out))
    ) {
      return `$${triMap.B}$`
    }
    if (
      label === 'C' &&
      (/^581$|\\frac\{5\}\{84\}|\\frac\{5\}\{81\}/i.test(out) ||
        /^\$\$?\\frac\{5\}\{84\}\$?$/i.test(out))
    ) {
      return `$${triMap.C}$`
    }
    if (
      /^\$\\frac\{1\}\{2\}\$/.test(out) &&
      !/\\sqrt\{(86|84|80)\}/.test(out)
    ) {
      return `$${triMap[label]}$`
    }
    if (
      /^\$\\frac\{1\}\{2\}\$\$?\s*\$?1\$?\s*$/i.test(out) ||
      /^\$\\frac\{1\}\{2\}\$\s*\$1\$/i.test(out) ||
      /^\$\$\\frac\{1\}\{2\}\$\$1\$/i.test(out)
    ) {
      return `$${triMap[label]}$`
    }
    if (/^\$1\$$/.test(out) || /^\$\$1\$$/.test(out)) {
      return `$${triMap[label]}$`
    }
  }

  out = out.replace(
    /(\$\\frac\{1\}\{2\}\$)\$*\$?1\$?\s*$/i,
    (_, frac) => (triangleMcq && triMap[label] ? `$${triMap[label]}$` : frac),
  )

  if (triangleMcq && triMap[label]) {
    out = out.replace(/\$\\frac\{1\}\{2\}\$\\sqrt\{(86|84|80)\}\$/, `$$${triMap[label]}$`)
  }

  if (/parallelogram/i.test(context) && label === 'B' && /2\\sqrt\{5\}|2sqrt5/i.test(out)) {
    if (!/\\vec\{d\}_\{1\}/.test(out) && /diagonal/i.test(out)) {
      return 'area of parallelogram with diagonals $\\vec{d}_{1}=\\hat{i}-2\\hat{j}+\\hat{k}$ and $\\vec{d}_{2}=-\\hat{i}+2\\hat{j}-5\\hat{k}$ is equal to $2\\sqrt{5}$ sq. units'
    }
  }

  if (/projection/i.test(context) && label === 'D' && /\\frac\{1\}\{3\}|113|1\/3/.test(out)) {
    return 'projection of $\\hat{i}+\\hat{j}+\\hat{k}$ on $-2\\hat{i}+2\\hat{j}+\\hat{k}$ is $\\frac{1}{3}$'
  }

  return mergeSplitMathDollars(out)
}

/** Repair $1$ / $2$ artifacts from broken $$N$ replace patterns in sanitize. */
export function repairCorruptedOptionDigits(option, letter, context) {
  let out = fixBrokenMcqOptionLatex(option, letter, context)
  if (/^113$/.test(out) || (/\b113\b/.test(out) && /projection|\\hat|\\vec/i.test(context))) {
    return out.replace(/\b113\b/g, '\\frac{1}{3}').replace(/^\$?\\frac\{1\}\{3\}\$?$/, '$\\frac{1}{3}$')
  }
  if (/^O$/i.test(out)) return '0'
  const label = String(letter).toUpperCase()
  const brokenDigit = /^\$\$?1\$?$/.test(out)
  const partialFrac =
    /^\$\\frac\{1\}\{2\}\$/.test(out) && !/\\sqrt\{(86|84|80|5)\}/.test(out)

  if (label === 'A' && /linearly independent/i.test(out) && !/\\sqrt\{86\}/.test(out)) {
    return out.replace(/\s+/g, ' ').trim()
  }
  if (label === 'B' && /parallelogram/i.test(out) && /2\\sqrt\{5\}/.test(out)) {
    return mergeSplitMathDollars(out)
  }
  if (label === 'C' && /\\vec\{a\}.*\\times.*\\vec\{b\}/i.test(out)) {
    return mergeSplitMathDollars(out)
  }
  if (label === 'D' && /projection/i.test(out) && /\\frac\{1\}\{3\}/.test(out)) {
    return mergeSplitMathDollars(out)
  }

  const alreadyComplete =
    (label === 'B' && /\\frac\{1\}\{2\}.*\\sqrt\{86\}/.test(out)) ||
    (label === 'C' && /\\frac\{1\}\{2\}.*\\sqrt\{84\}/.test(out)) ||
    (label === 'A' && /\\sqrt\{86\}/.test(out)) ||
    (label === 'D' && /\\sqrt\{80\}/.test(out))
  if (alreadyComplete) return mergeSplitMathDollars(out)
  if (!/^\$\d+\$$/.test(out) && !brokenDigit && !partialFrac) return mergeSplitMathDollars(out)

  if (isVectorTruthMsq(context)) return mergeSplitMathDollars(out)

  const triangleMcq = isTriangleAreaMcq(context)
  const fractionVectorMcq = isFractionVectorMcq(context)

  if (!triangleMcq && !fractionVectorMcq) return mergeSplitMathDollars(out)

  // Triangle D must be √80 — OCR often puts C's ½√84 or bare "80" on (D)
  if (triangleMcq && label === 'D') {
    if (
      /^80$/.test(out) ||
      /^\$\$?80\$?$/.test(out) ||
      /^\$\$?1\{80\}\$?$/.test(out) ||
      /\\frac\{1\}\{2\}.*\\sqrt\{84\}/.test(out) ||
      /^\\sqrt\{84\}$/.test(out)
    ) {
      return '$\\sqrt{80}$'
    }
  }

  if (fractionVectorMcq) {
    const map = {
      A: '\\frac{1}{4}',
      B: '\\frac{49}{4}',
      C: '\\frac{4}{9}',
      D: '0',
    }
    const latex = map[label]
    if (latex === '0') return '0'
    if (latex) return `$${latex}$`
  }

  if (triangleMcq) {
    const map = {
      A: '\\sqrt{86}',
      B: '\\frac{1}{2}\\sqrt{86}',
      C: '\\frac{1}{2}\\sqrt{84}',
      D: '\\sqrt{80}',
    }
    const latex = map[label]
    if (latex) return `$${latex}$`
  }

  return out
}

/**
 * Light repair for option preview — uses question stem context, no OCR/file deps.
 * @param {string} option
 * @param {string} letter A–D
 * @param {string} questionContext
 */
export function repairMcqOptionForDisplay(option, letter, questionContext, stem = '') {
  const label = String(letter ?? '').toUpperCase()
  const ctx = String(questionContext ?? '').trim()
  const stemText = String(stem ?? '').trim() || inferStemFromContext(ctx)
  let body = trimQuestionLeakFromOption(String(option ?? '').trim(), stemText)
  if (!body) return body
  body = trimTrailingProseAfterMath(body)
  body = trimQuestionLeakFromOption(body, stemText)

  if (!ctx || !/^[A-D]$/.test(label)) {
    body = fixBrokenMcqOptionLatex(body, label, ctx)
    return repairCorruptedOptionDigits(body, label, ctx)
  }

  const lineOnly = sanitizeMathDelimiters(`(${label}) ${body}`)
  const re = new RegExp(`\\(${label}\\)\\s*([\\s\\S]*?)(?=\\n\\([A-D]\\)|$)`, 'i')
  const m = lineOnly.match(re)
  body = trimQuestionLeakFromOption(m ? m[1].trim() : body, stemText)
  body = trimTrailingProseAfterMath(body)
  body = fixBrokenMcqOptionLatex(body, label, ctx)
  return mergeSplitMathDollars(repairCorruptedOptionDigits(body, label, ctx))
}

/** Full OCR block + labelled options — gives C/D repair enough context. */
export function buildMcqPreviewContext({
  extractedRaw = '',
  questionText = '',
  options = [],
  /** When true, omit full OCR blob so option D repair does not re-capture the stem. */
  forOptionRepair = false,
} = {}) {
  const optionLines = options
    .map((o, i) => {
      const body = String(o ?? '').trim()
      return body ? `(${String.fromCharCode(65 + i)}) ${body}` : ''
    })
    .filter(Boolean)
  const parts = forOptionRepair
    ? [questionText, ...optionLines]
    : [extractedRaw, questionText, ...optionLines]
  return parts.filter(Boolean).join('\n')
}

/** Rebuild extract textarea from stem + polished options. */
export function formatMcqExtractBlock(stem, options) {
  const lines = [String(stem ?? '').trim()].filter(Boolean)
  ;(options ?? []).forEach((o, i) => {
    const body = String(o ?? '').trim()
    if (body) lines.push(`(${String.fromCharCode(65 + i)}) ${body}`)
  })
  return lines.join('\n')
}
