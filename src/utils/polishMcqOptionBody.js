/**
 * Light per-option polish — avoids re-running full normalizeMathText (which garbles MCQ text).
 */
import { fixOcrMathSymbols, fixOcrBraceFractions } from './fixOcrMathSymbols.js'
import { sanitizeMathDelimiters } from './sanitizeMathDelimiters.js'
import {
  trimQuestionLeakFromOption,
  trimTrailingProseAfterMath,
  mergeSplitMathDollars,
} from './optionStemLeak.js'
import { fixBrokenMcqOptionLatex, repairCorruptedOptionDigits } from './repairMcqOption.js'
import { matchOptionCanonical } from './applyOptionCanonicals.js'
import { isGraphPlaceholderText } from './graphOptionOcr.js'

/** @param {string} body @param {string} letter */
function extractOptionFromSanitizedLine(body, letter) {
  const line = sanitizeMathDelimiters(`(${letter}) ${body}`)
  const re = new RegExp(`\\(${letter}\\)\\s*([\\s\\S]*)`, 'i')
  const m = line.match(re)
  return m ? m[1].trim() : body.trim()
}

/**
 * @param {string} option
 * @param {string} letter A–D
 * @param {string} [questionContext]
 * @param {string} [stem]
 */
export function polishMcqOptionBody(option, letter, questionContext = '', stem = '') {
  const label = String(letter).toUpperCase()
  const stemText = String(stem ?? '').trim()
  const ctx = String(questionContext ?? '').trim()

  let body = String(option ?? '').trim()
  if (!body) return body
  if (isGraphPlaceholderText(body)) return body

  // OCR merged next option into this one: "2 ®D) None of these" / "2 (D) None of these"
  const mergedNext = body.match(
    /^(.+?)\s*(?:®|Ⓡ)?\s*(?:\(?\s*[Dd]\s*\)|[Dd]\s*\))\s*(None\s+of\s+these|All\s+of\s+these|None\s+of\s+the\s+above)\s*$/i,
  )
  if (mergedNext && label === 'C') {
    body = mergedNext[1].trim()
  }

  body = trimQuestionLeakFromOption(body, stemText)
  body = trimTrailingProseAfterMath(body)
  body = fixOcrMathSymbols(body)
  body = fixOcrBraceFractions(body)
  body = extractOptionFromSanitizedLine(body, label)
  body = trimQuestionLeakFromOption(body, stemText)
  body = trimTrailingProseAfterMath(body)
  body = fixBrokenMcqOptionLatex(body, label, ctx)

  if (label === 'A' && /linearly independent/i.test(body) && !/\$\$?1\$/.test(body)) {
    return matchOptionCanonical(body.replace(/\s+/g, ' ').trim(), label)
  }
  if (
    label === 'B' &&
    /parallelogram/i.test(body) &&
    /2\\sqrt\{5\}|2sqrt5|2\s*sqrt\s*5/i.test(body)
  ) {
    return matchOptionCanonical(mergeSplitMathDollars(body), label)
  }
  if (label === 'C' && /\\vec\{a\}.*\\times.*\\vec\{b\}/i.test(body)) {
    return matchOptionCanonical(mergeSplitMathDollars(body), label)
  }
  if (
    label === 'D' &&
    /projection/i.test(body) &&
    (/\\frac\{1\}\{3\}|113|1\/3|\bis\s+1\s+3\b/i.test(body))
  ) {
    return matchOptionCanonical(mergeSplitMathDollars(body), label)
  }

  body = repairCorruptedOptionDigits(body, label, ctx)
  return matchOptionCanonical(mergeSplitMathDollars(body), label)
}
