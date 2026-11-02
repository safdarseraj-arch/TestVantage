/**
 * Central registry for MCQ OCR repair plugins (local — no cloud API).
 * parseSingleQuestionUpload and uploadErrorBrain use this list.
 */

import { repairLnFractionIdenticalMcqParse,
  repairNestedFracDollars,
  stripLnFractionStemOptionLeak,
} from './repairLnFractionIdenticalMcqOcr.js'
import { repairTriangleLocusMcqParse } from './repairTriangleLocusMcqOcr.js'
import { repairRhombusScalarTripleMcqParse } from './repairRhombusScalarTripleMcqOcr.js'
import { repairCoplanarVectorsUnitMcqParse } from './repairCoplanarVectorsUnitMcqOcr.js'
import { repairCoplanarAlphaBetaRatioMcqParse } from './repairCoplanarAlphaBetaRatioMcqOcr.js'
import { repairPlaneCentroidAxesMcqParse } from './repairPlaneCentroidAxesMcqOcr.js'
import { repairParallelPlanesAngleMcqParse } from './repairParallelPlanesAngleMcqOcr.js'
import { repairPqrsPerpVectorMcqParse } from './repairPqrsPerpVectorMcqOcr.js'
import { repairAngleBisectorMag36McqParse } from './repairAngleBisectorMag36McqOcr.js'
import { repairLineUnitDistanceMcqParse } from './repairLineUnitDistanceMcqOcr.js'
import { repairMcqMisreadAsIntegerParse } from './repairMcqMisreadAsInteger.js'
import { repairAlphaBetaRootsDeterminantMcqParse } from './repairAlphaBetaRootsDeterminantMcqOcr.js'
import { repairZ5ImaginaryRootsExpDeterminantMcqParse } from './repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import { repairLimitGxMcqParse } from './repairLimitGxStemOcr.js'
import { repairT10LimitMcqParse } from './repairT10LimitStemOcr.js'
import { repairFgGraphPointDMcqParse } from './repairFgGraphPointDMcqOcr.js'
import { repairSurjectiveNotInjectiveMcqParse } from './repairSurjectiveNotInjectiveMcqOcr.js'
import { repairFxPlusOneTimesEightMcqParse } from './repairFxPlusOneTimesEightMcqOcr.js'
import { repairInverseFunctionMcqParse } from './repairInverseFunctionMcqOcr.js'
import { repairFunctionPropertyMcqParse } from './repairFunctionPropertyMcqOcr.js'
import { repairCompositionMcqParse } from './repairCompositionMcqOcr.js'
import { repairTrigPeriodMcqParse } from './repairTrigPeriodMcqOcr.js'
import { repairF0MoebiusFunctionalMcqParse } from './repairF0MoebiusFunctionalMcqOcr.js'
import { repairFxIntegralMaxMinMcqParse } from './repairFxIntegralMaxMinMcqOcr.js'
import { repairLambdaSinCubicExtremaMcqParse } from './repairLambdaSinCubicExtremaMcqOcr.js'
import { repairDomainGreatestIntegerMcqParse } from './repairDomainGreatestIntegerMcqOcr.js'
import { repairFRplusPowFunctionMcqParse } from './repairFRplusPowFunctionMcqOcr.js'
import { repairDeterminantIntegerParse } from './repairDeterminantOcr.js'
import { repairMinSinAbsGiPeriodMcqParse } from './repairMinSinAbsGiPeriodMcqOcr.js'
import { repairSinGiPiOneOneOntoMcqParse } from './repairSinGiPiOneOneOntoMcqOcr.js'
import { repairOddFunctionAlphaGiMcqParse } from './repairOddFunctionAlphaGiMcqOcr.js'
import { repairAbsPiSinOneSidedLimitMcqParse } from './repairAbsPiSinOneSidedLimitMcqOcr.js'
import { repairPiecewiseSgnDiffMcqParse } from './repairPiecewiseSgnDiffMcqOcr.js'
import { repairFxLimitFiniteMcqParse } from './repairFxLimitFiniteMcqOcr.js'
import { repairTanInverseKIntegralParse } from './repairTanInverseKIntegralOcr.js'
import { repairExpRationalIntegralMcqParse } from './repairExpRationalIntegralMcqOcr.js'
import { repairEcosxIntegralMcqParse } from './repairEcosxIntegralMcqOcr.js'
import { repairGxIntegralOriginMcqParse } from './repairGxIntegralOriginMcqOcr.js'
import { repairXxPowerLnIntegralMcqParse } from './repairXxPowerLnIntegralMcqOcr.js'
import { repairExSinxCosxIntegralMcqParse } from './repairExSinxCosxIntegralMcqOcr.js'
import { repairTanCscGxIntegralMcqParse } from './repairTanCscGxIntegralMcqOcr.js'
import { repairExpXPlusInvXIntegralMcqParse } from './repairExpXPlusInvXIntegralMcqOcr.js'
import {
  repairGarbledStemOptionsParse,
  stripLeakedOptionBandFromStem,
} from './splitStemAndGarbledOptions.js'
import { finalizeStemForBank } from './persistUpload.js'
import { polishCloudVisionText, polishOcrText } from './ocrExtractPolish.js'
import { stemLooksHighQualityLatex } from './stemBankGuard.js'
import { repairCasesLatex } from './repairCasesLatex.js'

/** Prefer light Gemini polish when stem already looks like AI/LaTeX (incl. near-miss cases). */
function preferLightCloudPolish(text) {
  const t = String(text ?? '')
  if (stemLooksHighQualityLatex(t)) return true
  // Near-miss Gemini: cases/operatorname present — heal lightly, never run Tesseract stack.
  if (/\\begin\{cases\}/i.test(t) && /\\operatorname|\\cos|\\le|differentiab/i.test(t)) return true
  if (/\\begin\{(?:vmatrix|bmatrix|pmatrix)\}/.test(t) && /\\frac|\\operatorname|\$\$/.test(t)) return true
  return false
}

/** @typedef {{ id: string, needsOcrSource?: boolean, apply: (parsed: object) => object }} McqRepairPlugin */

/** @type {McqRepairPlugin[]} */
export const MCQ_PARSE_REPAIR_PLUGINS = [
  // Generic first: any SCQ OCR misread as IVQ (not question-specific)
  { id: 'mcq-misread-as-integer', apply: repairMcqMisreadAsIntegerParse },
  // Generic: ® © Ww soup in the stem still fills A–D slots
  { id: 'garbled-stem-options', needsOcrSource: true, apply: repairGarbledStemOptionsParse },
  { id: 'tan-inverse-k-integral', needsOcrSource: true, apply: repairTanInverseKIntegralParse },
  { id: 'exp-rational-integral', needsOcrSource: true, apply: repairExpRationalIntegralMcqParse },
  { id: 'ecosx-integral', needsOcrSource: true, apply: repairEcosxIntegralMcqParse },
  { id: 'gx-integral-origin', needsOcrSource: true, apply: repairGxIntegralOriginMcqParse },
  { id: 'xx-power-ln-integral', needsOcrSource: true, apply: repairXxPowerLnIntegralMcqParse },
  { id: 'ex-sinx-cosx-integral', needsOcrSource: true, apply: repairExSinxCosxIntegralMcqParse },
  { id: 'tan-csc-gx-integral', needsOcrSource: true, apply: repairTanCscGxIntegralMcqParse },
  { id: 'exp-x-plus-inv-x-integral', needsOcrSource: true, apply: repairExpXPlusInvXIntegralMcqParse },
  { id: 'ln-fraction', apply: repairLnFractionIdenticalMcqParse },
  { id: 'triangle-locus', apply: repairTriangleLocusMcqParse },
  { id: 'rhombus-scalar-triple', apply: repairRhombusScalarTripleMcqParse },
  { id: 'coplanar-vectors-unit', apply: repairCoplanarVectorsUnitMcqParse },
  { id: 'coplanar-alpha-beta-ratio', apply: repairCoplanarAlphaBetaRatioMcqParse },
  { id: 'plane-centroid-axes', apply: repairPlaneCentroidAxesMcqParse },
  { id: 'parallel-planes-angle', apply: repairParallelPlanesAngleMcqParse },
  { id: 'pqrs-perp-vector', apply: repairPqrsPerpVectorMcqParse },
  { id: 'angle-bisector-mag36', apply: repairAngleBisectorMag36McqParse },
  { id: 'line-unit-distance', apply: repairLineUnitDistanceMcqParse },
  { id: 'determinant-integer', needsOcrSource: true, apply: repairDeterminantIntegerParse },
  { id: 'alpha-beta-det', apply: repairAlphaBetaRootsDeterminantMcqParse },
  { id: 'z5-imag-det', apply: repairZ5ImaginaryRootsExpDeterminantMcqParse },
  { id: 'limit-gx', needsOcrSource: true, apply: repairLimitGxMcqParse },
  { id: 't10-limit', needsOcrSource: true, apply: repairT10LimitMcqParse },
  { id: 'fg-graph-d', needsOcrSource: true, apply: repairFgGraphPointDMcqParse },
  { id: 'surjective', needsOcrSource: true, apply: repairSurjectiveNotInjectiveMcqParse },
  { id: 'fr-plus-pow', needsOcrSource: true, apply: repairFRplusPowFunctionMcqParse },
  { id: 'fx-plus-eight', needsOcrSource: true, apply: repairFxPlusOneTimesEightMcqParse },
  { id: 'inverse-fn', needsOcrSource: true, apply: repairInverseFunctionMcqParse },
  { id: 'fn-property', needsOcrSource: true, apply: repairFunctionPropertyMcqParse },
  { id: 'composition', needsOcrSource: true, apply: repairCompositionMcqParse },
  { id: 'trig-period', needsOcrSource: true, apply: repairTrigPeriodMcqParse },
  { id: 'domain-gi', needsOcrSource: true, apply: repairDomainGreatestIntegerMcqParse },
  { id: 'f0-moebius', needsOcrSource: true, apply: repairF0MoebiusFunctionalMcqParse },
  { id: 'fx-integral', needsOcrSource: true, apply: repairFxIntegralMaxMinMcqParse },
  { id: 'lambda-sin', needsOcrSource: true, apply: repairLambdaSinCubicExtremaMcqParse },
  { id: 'min-sin-abs-gi-period', needsOcrSource: true, apply: repairMinSinAbsGiPeriodMcqParse },
  { id: 'sin-gi-pi-one-one-onto', needsOcrSource: true, apply: repairSinGiPiOneOneOntoMcqParse },
  { id: 'odd-fn-alpha-gi', needsOcrSource: true, apply: repairOddFunctionAlphaGiMcqParse },
  {
    id: 'abs-pi-sin-one-sided-limit',
    needsOcrSource: true,
    apply: repairAbsPiSinOneSidedLimitMcqParse,
  },
  {
    id: 'fx-limit-finite',
    needsOcrSource: true,
    apply: repairFxLimitFiniteMcqParse,
  },
  {
    id: 'piecewise-sgn-diff',
    needsOcrSource: true,
    apply: repairPiecewiseSgnDiffMcqParse,
  },
]

/**
 * One repair plugin must never abort Convert. Unknown screenshots hit plugins that
 * don't apply — a throw in any of them used to wipe a successful OCR fill.
 * @param {McqRepairPlugin} plugin
 * @param {object} parsed
 * @param {string} [ocrSource]
 */
export function runPluginSafely(plugin, parsed, ocrSource = '') {
  try {
    const next = plugin.needsOcrSource
      ? plugin.apply({ ...parsed, _ocrSource: ocrSource })
      : plugin.apply(parsed)
    if (!next || typeof next !== 'object') return parsed
    return next
  } catch (err) {
    console.warn(`[repair] plugin ${plugin.id} failed`, err)
    return parsed
  }
}

function runNamedRepairSafely(id, parsed, fn) {
  return runPluginSafely({ id, apply: fn }, parsed)
}

/**
 * @param {ReturnType<import('./parseSingleQuestionUpload.js').parseSingleQuestionUpload>} parsed
 * @param {string} [ocrSource]
 * @param {{ passes?: number }} [opts]
 */
export function applyMcqParseRepairs(parsed, ocrSource = '', opts = {}) {
  const passes = opts.passes ?? 2
  let result = { ...parsed }

  for (let pass = 0; pass < passes; pass += 1) {
    for (const plugin of MCQ_PARSE_REPAIR_PLUGINS) {
      result = runPluginSafely(plugin, result, ocrSource)
    }

    if (pass === 0 && result.text?.trim()) {
      result = runNamedRepairSafely('garbled-stem-options-pass', result, (p) =>
        repairGarbledStemOptionsParse({ ...p, _ocrSource: ocrSource }),
      )
      try {
        result.text = stripLeakedOptionBandFromStem(result.text)
        result.text = stripLnFractionStemOptionLeak(result.text, result.options ?? [])
        // Heal cases/sgn first so missing \\\\ does not force the heavy OCR stack.
        const preHealed = repairCasesLatex(result.text)
        // Do NOT run the full Tesseract rewrite stack on clean Gemini/OpenAI LaTeX
        // (that was overwriting good \\begin{cases} stems with garbage).
        const stemPolish = preferLightCloudPolish(preHealed)
          ? polishCloudVisionText(preHealed)
          : polishOcrText(preHealed)
        result.text = repairNestedFracDollars(
          finalizeStemForBank(stemPolish, result.options ?? []),
        )
      } catch (err) {
        console.warn('[repair] stem polish pass failed', err)
      }
      result = runNamedRepairSafely('exp-rational-integral', result, (p) =>
        repairExpRationalIntegralMcqParse({ ...p, _ocrSource: ocrSource }),
      )
      result = runNamedRepairSafely('ecosx-integral', result, (p) =>
        repairEcosxIntegralMcqParse({ ...p, _ocrSource: ocrSource }),
      )
      result = runNamedRepairSafely('gx-integral-origin', result, (p) =>
        repairGxIntegralOriginMcqParse({ ...p, _ocrSource: ocrSource }),
      )
      result = runNamedRepairSafely('xx-power-ln-integral', result, (p) =>
        repairXxPowerLnIntegralMcqParse({ ...p, _ocrSource: ocrSource }),
      )
      result = runNamedRepairSafely('ex-sinx-cosx-integral', result, (p) =>
        repairExSinxCosxIntegralMcqParse({ ...p, _ocrSource: ocrSource }),
      )
      result = runNamedRepairSafely('tan-csc-gx-integral', result, (p) =>
        repairTanCscGxIntegralMcqParse({ ...p, _ocrSource: ocrSource }),
      )
      result = runNamedRepairSafely('exp-x-plus-inv-x-integral', result, (p) =>
        repairExpXPlusInvXIntegralMcqParse({ ...p, _ocrSource: ocrSource }),
      )
    }
  }

  delete result._ocrSource
  return result
}

/**
 * Run repair plugins and report which ones changed the parse.
 * @param {object} parsed
 * @param {string} [ocrSource]
 */
export function runRepairPluginScan(parsed, ocrSource = '') {
  const before = JSON.stringify({
    text: parsed.text ?? '',
    options: parsed.options ?? [],
    optionsFound: parsed.optionsFound ?? 0,
  })
  const repaired = applyMcqParseRepairs(parsed, ocrSource, { passes: 2 })
  const after = JSON.stringify({
    text: repaired.text ?? '',
    options: repaired.options ?? [],
    optionsFound: repaired.optionsFound ?? 0,
  })
  return {
    parsed: repaired,
    improved: before !== after,
  }
}
