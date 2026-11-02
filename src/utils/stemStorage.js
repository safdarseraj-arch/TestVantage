/**
 * Stem text normalization for localStorage (no bank/migrate imports — safe to load early).
 * Display prep (prepareTextForMathTextDisplay) runs only in MathText — not here — to avoid double-processing corruption.
 */

import { normalizeQuestionStemText } from './normalizeMathText.js'
import { splitGluedChemDisplayEquations } from './healTruncatedLatex.js'
import { repairChemistryOcr } from './repairChemistryOcr.js'
import { repairIntegralStemOcr } from './repairIntegralStemOcr.js'
import { repairTanInverseKIntegralOcr } from './repairTanInverseKIntegralOcr.js'
import { repairExpRationalIntegralStemOcr } from './repairExpRationalIntegralMcqOcr.js'
import { repairEcosxIntegralStemOcr } from './repairEcosxIntegralMcqOcr.js'
import { repairGxIntegralOriginStemOcr } from './repairGxIntegralOriginMcqOcr.js'
import { repairXxPowerLnIntegralStemOcr } from './repairXxPowerLnIntegralMcqOcr.js'
import { repairExSinxCosxIntegralStemOcr } from './repairExSinxCosxIntegralMcqOcr.js'
import { repairTanCscGxIntegralStemOcr } from './repairTanCscGxIntegralMcqOcr.js'
import { repairExpXPlusInvXIntegralStemOcr } from './repairExpXPlusInvXIntegralMcqOcr.js'
import { repairLimIntersectionStemOcr } from './repairLimIntersectionStemOcr.js'
import {
  repairEvaluateSumMathBlock,
  repairPrematureDollarBeforeLeft,
} from './fixRunawayInlineMath.js'
import { ensureMatrixStemDelimiters, stripInternalStemMarkers } from './repairMatrixStem.js'
import { repairOperatornameOcr } from './repairOperatorname.js'
import { repairFunctionalEquationStemOcr } from './repairFunctionalEquationStemOcr.js'
import { repairLnFractionIdenticalMcqOcr } from './repairLnFractionIdenticalMcqOcr.js'
import { repairTriangleLocusMcqOcr } from './repairTriangleLocusMcqOcr.js'
import { repairDeterminantOcr, ensureVmatrixStemDelimiters } from './repairDeterminantOcr.js'
import { repairDerivativePrimeStemOcr } from './repairDerivativePrimeStemOcr.js'
import { repairCasesLatex } from './repairCasesLatex.js'
import { repairNpSpPassageArray } from './repairNpSpPassageArray.js'
import { stripLeakedOptionsFromStem } from './stripLeakedOptionsFromStem.js'
import { stripTrailingOptionMarkerFromStem } from './optionStemLeak.js'
import { sanitizeStemForDisplay } from './sanitizeStemForDisplay.js'
import { wrapOrDropLeftoverArray } from './wrapBareLatexRuns.js'

/**
 * @param {string} text
 * @param {string[]} [options]
 */
export function normalizeStemForStorage(text, options = []) {
  const raw = stripInternalStemMarkers(String(text ?? '').trim())
  if (!raw) return text ?? ''
  const deLeaked = options.length ? stripLeakedOptionsFromStem(raw, options) : raw
  const noMarker = stripTrailingOptionMarkerFromStem(deLeaked, options)
  let out = sanitizeStemForDisplay(noMarker, options)
  out = repairOperatornameOcr(stripInternalStemMarkers(normalizeQuestionStemText(out)))
  out = repairCasesLatex(out)
  out = repairPrematureDollarBeforeLeft(out)
  out = repairEvaluateSumMathBlock(out)
  out = ensureMatrixStemDelimiters(out)
  out = repairOperatornameOcr(out)
  out = repairNpSpPassageArray(out)
  out = repairTanInverseKIntegralOcr(out)
  out = repairIntegralStemOcr(out)
  out = repairExpRationalIntegralStemOcr(out)
  out = repairEcosxIntegralStemOcr(out)
  out = repairGxIntegralOriginStemOcr(out)
  out = repairXxPowerLnIntegralStemOcr(out)
  out = repairTanCscGxIntegralStemOcr(out)
  out = repairExpXPlusInvXIntegralStemOcr(out)
  out = repairExSinxCosxIntegralStemOcr(out)
  out = repairLimIntersectionStemOcr(out)
  out = repairFunctionalEquationStemOcr(out)
  out = repairDerivativePrimeStemOcr(out)
  out = repairLnFractionIdenticalMcqOcr(out)
  out = repairTriangleLocusMcqOcr(out)
  out = repairDeterminantOcr(out)
  out = ensureVmatrixStemDelimiters(out)
  out = repairChemistryOcr(out)
  out = splitGluedChemDisplayEquations(wrapOrDropLeftoverArray(out))
  return out
}

