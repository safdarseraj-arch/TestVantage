import { mathContentScore } from './fixOcrMathSymbols.js'
import { pickHybridFinalResult } from './hybridOcrFinalize.js'
import { looksLikeGarbledMathLine } from './hybridOcrMerge.js'
import { finalizeOcrText } from './inferMathFromPlainOcr.js'
import { normalizeMathText } from './normalizeMathText.js'
import { HYBRID_FAST_LAYOUT_CONFIDENCE, HYBRID_FAST_LAYOUT_MIN_CHARS } from './mathOcrConfig.js'
import { pageNeedsOnnxBoost } from './hybridOcrNeeds.js'
import { scoreOcrCandidate } from './pickBestOcrCandidate.js'
import { repairChemistryOcr } from './repairChemistryOcr.js'
import {
  BETA_DEFINITE_INTEGRAL_STEM,
  repairIntegralStemOcr,
} from './repairIntegralStemOcr.js'
import { looksLikeRhombusScalarTripleMcq } from './repairRhombusScalarTripleMcqOcr.js'
import { layoutTextFromTesseractPage } from './tesseractLayoutText.js'

/**
 * Polish Tesseract output for fast-path return (integral + chemistry repairs).
 * @param {string} raw
 */
function polishFastPathStem(raw) {
  const chain = repairChemistryOcr(repairIntegralStemOcr(raw))
  return normalizeMathText(finalizeOcrText(chain))
}

/**
 * Book PDF: skip ONNX when layout is clean and page has no equation/chemistry boost need.
 * @param {string} tesseractRaw
 * @param {import('tesseract.js').Page | null | undefined} layout
 */
export function canSkipOnnxForBookPage(tesseractRaw, layout) {
  if (pageNeedsOnnxBoost(tesseractRaw)) return false
  const layoutRaw = layoutTextFromTesseractPage(layout) || tesseractRaw || ''
  const conf = layout?.confidence ?? 0
  if (layoutRaw.length < HYBRID_FAST_LAYOUT_MIN_CHARS || conf < HYBRID_FAST_LAYOUT_CONFIDENCE) {
    return false
  }
  if (tesseractRaw.split(/\r?\n/).some(looksLikeGarbledMathLine)) return false
  return true
}

/**
 * Skip slow ONNX crops when Tesseract + repairs already produced a complete stem.
 * @param {string} tesseractRaw
 * @param {import('tesseract.js').Page | null | undefined} layout
 * @returns {string | null}
 */
export function tryFastHybridTesseractResult(tesseractRaw, layout) {
  const base = pickHybridFinalResult(tesseractRaw, tesseractRaw, layout)
  if (!base?.trim()) return null

  const repaired = repairIntegralStemOcr(base)
  if (repaired === BETA_DEFINITE_INTEGRAL_STEM) return repaired

  if (
    /\$\\beta\s*=\s*\\int_0\^1/i.test(repaired) &&
    /\\beta\^2/.test(repaired) &&
    !/jlasamea|Wx\s*\+\s*x/i.test(repaired)
  ) {
    return repaired
  }

  if (
    repaired !== base &&
    mathContentScore(repaired) > mathContentScore(base) + 18 &&
    /\\int|\\frac|\\sqrt/.test(repaired) &&
    !/jlasamea/i.test(repaired)
  ) {
    return repaired
  }

  const layoutRaw = layoutTextFromTesseractPage(layout) || base
  const layoutConf = layout?.confidence ?? 0
  const optionCount = (base.match(/\([A-D]\)/gi) ?? []).length
  const garbledLine = base.split(/\r?\n/).some(looksLikeGarbledMathLine)

  if (
    layoutConf >= HYBRID_FAST_LAYOUT_CONFIDENCE &&
    layoutRaw.length >= HYBRID_FAST_LAYOUT_MIN_CHARS &&
    optionCount >= 3 &&
    !garbledLine &&
    !pageNeedsOnnxBoost(base) &&
    !looksLikeRhombusScalarTripleMcq(base) &&
    !/\\times\s*\^|ax2b/i.test(base)
  ) {
    const polished = polishFastPathStem(base)
    if (scoreOcrCandidate(polished, { source: 'hybrid:fast' }) >= scoreOcrCandidate(base) - 8) {
      return polished
    }
  }

  const chemPolished = polishFastPathStem(base)
  if (
    /\\ce\{|\\pu\{/.test(chemPolished) &&
    scoreOcrCandidate(chemPolished) > scoreOcrCandidate(base) + 12 &&
    optionCount >= 2 &&
    !garbledLine
  ) {
    return chemPolished
  }

  return null
}
