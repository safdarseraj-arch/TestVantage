/**
 * Generic determinant MCQ repair — interval/numeric options, pipe |det|, f(x)=|…|.
 */
import {
  repairTrigRangeDeterminantMcqOcr,
  repairTrigRangeDeterminantMcqParse,
  looksLikeTrigRangeDeterminantMcq,
} from './repairTrigRangeDeterminantMcqOcr.js'
import {
  looksLikeAlphaBetaRootsDeterminantMcq,
  repairAlphaBetaRootsDeterminantMcqParse,
} from './repairAlphaBetaRootsDeterminantMcqOcr.js'
import {
  looksLikeZ5ImaginaryRootsExpDeterminantMcq,
  repairZ5ImaginaryRootsExpDeterminantMcqParse,
} from './repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import {
  looksLikePolynomialCoeffVmatrix,
  repairPolynomialCoeffVmatrixParse,
} from './repairPolynomialCoeffVmatrixOcr.js'
import { repairFlatVmatrixParse } from './repairFlatVmatrixOcr.js'

function vmatrixLooksBrokenLocal(t) {
  const block = (String(t ?? '').match(/\\begin\{vmatrix\}[\s\S]*?\\end\{vmatrix\}/i) ?? [''])[0]
  if (!block) return true
  if (!/\\\\/.test(block)) return true
  return block.split('\\\\').filter((r) => r.trim()).length < 2
}

/** @param {string} s */
export function hasIntervalMcqOptions(s) {
  return (
    (String(s ?? '').match(/\(\s*[A-D]\s*\)\s*[\[(]?[\s\d,\-–]/gi) ?? []).length >= 2 ||
    (String(s ?? '').match(/\(\s*[A-D]\s*\)\s*\(\s*[-–]?\d/gi) ?? []).length >= 2
  )
}

/** @param {string} s */
export function hasNumericMcqOptions(s) {
  return (String(s ?? '').match(/\(\s*[A-D]\s*\)\s*\d{1,4}/gi) ?? []).length >= 2
}

/** Determinant question with A–D (not integer-only). */
export function looksLikeDeterminantMcq(t) {
  const s = String(t ?? '')
  if (looksLikeTrigRangeDeterminantMcq(s)) return true
  if (looksLikeAlphaBetaRootsDeterminantMcq(s)) return true
  if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(s)) return true
  if (looksLikePolynomialCoeffVmatrix(s)) return true
  if (hasIntervalMcqOptions(s) && looksLikeDeterminantStem(s)) return true
  if (hasNumericMcqOptions(s) && looksLikeDeterminantStem(s)) return true
  return looksLikeDeterminantStem(s) && (hasIntervalMcqOptions(s) || hasNumericMcqOptions(s))
}

/** @param {string} s */
export function looksLikeDeterminantStem(s) {
  const t = String(s ?? '')
  return (
    /\\begin\{vmatrix\}/i.test(t) ||
    /\bdeterminant\b|\\det\s*\(/i.test(t) ||
    /f\s*\(\s*x\s*\)\s*=\s*\|/i.test(t) ||
    /value\s+of\s+determinant/i.test(t) ||
    /\[l\s*q\s*q|a'\s*\(\s*s-a/i.test(t) ||
    (/range\s+of\s+f\s*\(\s*x\s*\)/i.test(t) && /sec|cos|cosec|cot|csc/i.test(t)) ||
    (/roots?\s+of/i.test(t) && /x\s*\^?\s*2\s*-\s*4x/i.test(t) && /determinant|2Jap|2a\s*\\?\s*l/i.test(t)) ||
    looksLikePolynomialCoeffVmatrix(t)
  )
}

/** Try to wrap pipe-style f(x) = | … | as vmatrix when trig cells are recognizable. */
export function repairPipeFxDeterminantOcr(text) {
  let t = String(text ?? '').trim()
  if (!/f\s*\(\s*x\s*\)\s*=\s*\|/i.test(t)) return t
  if (/\\begin\{vmatrix\}/i.test(t)) return t
  if (looksLikeTrigRangeDeterminantMcq(t)) return repairTrigRangeDeterminantMcqOcr(t)
  return t
}

/** @param {{ text?: string, options?: string[], optionsFound?: number }} parsed */
export function repairDeterminantMcqParse(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed
  const blob = `${parsed.text ?? ''}\n${(parsed.options ?? []).join('\n')}`

  parsed = repairTrigRangeDeterminantMcqParse(parsed)
  if (looksLikeTrigRangeDeterminantMcq(blob)) return parsed

  parsed = repairPolynomialCoeffVmatrixParse(parsed)
  if (looksLikePolynomialCoeffVmatrix(blob)) return parsed

  parsed = repairAlphaBetaRootsDeterminantMcqParse(parsed)
  if (looksLikeAlphaBetaRootsDeterminantMcq(blob)) return parsed

  parsed = repairZ5ImaginaryRootsExpDeterminantMcqParse(parsed)
  if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(blob)) return parsed

  if (!looksLikeDeterminantMcq(blob)) return parsed

  const stem = String(parsed.text ?? '').trim()
  const needsVmatrix =
    !/\\begin\{vmatrix\}/i.test(stem) || vmatrixLooksBrokenLocal(stem) || /\|\s*\\?cos/i.test(stem)

  if (!needsVmatrix && (parsed.optionsFound ?? 0) >= 4) return parsed

  let text = repairPipeFxDeterminantOcr(stem || blob)
  if (needsVmatrix && !/\\begin\{vmatrix\}/i.test(text)) {
    text = repairTrigRangeDeterminantMcqOcr(blob)
  }

  if (/\\begin\{vmatrix\}/i.test(text)) {
    parsed.text = text
  }

  parsed = repairFlatVmatrixParse(parsed)
  return parsed
}
