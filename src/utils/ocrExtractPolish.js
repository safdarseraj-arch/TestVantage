import { finalizeOcrText } from './inferMathFromPlainOcr.js'
import { normalizeMathText } from './normalizeMathText.js'
import { repairBinomialLog495StemOcr } from './repairBinomialLog495StemOcr.js'
import { repairChemistryOcr, looksLikeChemistryContent } from './repairChemistryOcr.js'
import { repairIntegralStemOcr } from './repairIntegralStemOcr.js'
import { repairTanInverseKIntegralOcr } from './repairTanInverseKIntegralOcr.js'
import { repairExpRationalIntegralStemOcr } from './repairExpRationalIntegralMcqOcr.js'
import { repairEcosxIntegralStemOcr } from './repairEcosxIntegralMcqOcr.js'
import { repairGxIntegralOriginStemOcr } from './repairGxIntegralOriginMcqOcr.js'
import { repairXxPowerLnIntegralStemOcr } from './repairXxPowerLnIntegralMcqOcr.js'
import { repairExSinxCosxIntegralStemOcr } from './repairExSinxCosxIntegralMcqOcr.js'
import { repairTanCscGxIntegralStemOcr } from './repairTanCscGxIntegralMcqOcr.js'
import { repairExpXPlusInvXIntegralStemOcr } from './repairExpXPlusInvXIntegralMcqOcr.js'
import { stripLeakedOptionBandFromStem } from './splitStemAndGarbledOptions.js'
import { repairFxIntegralMaxMinStemOcr } from './repairFxIntegralMaxMinMcqOcr.js'
import { repairLambdaSinCubicExtremaStemOcr } from './repairLambdaSinCubicExtremaMcqOcr.js'
import { repairMinSinAbsGiPeriodStemOcr } from './repairMinSinAbsGiPeriodMcqOcr.js'
import { fixBrokenMcqLatex } from './fixBrokenMcqLatex.js'
import { repairLimitGxStemOcr } from './repairLimitGxStemOcr.js'
import { repairLimIntersectionStemOcr } from './repairLimIntersectionStemOcr.js'
import { repairT10LimitStemOcr } from './repairT10LimitStemOcr.js'
import { repairFxLimitFiniteStemOcr } from './repairFxLimitFiniteMcqOcr.js'
import { repairFgGraphPointDMcqOcr } from './repairFgGraphPointDMcqOcr.js'
import {
  normalizeDerivativePrimeChars,
  repairDerivativePrimeStemOcr,
} from './repairDerivativePrimeStemOcr.js'
import { repairMsqGraphOcr } from './repairMsqGraphOcr.js'
import { repairTowerPassageOcr } from './repairTowerPassageOcr.js'
import { repairFunctionalEquationStemOcr } from './repairFunctionalEquationStemOcr.js'
import { repairLnFractionIdenticalMcqOcr } from './repairLnFractionIdenticalMcqOcr.js'
import { repairTriangleLocusMcqOcr } from './repairTriangleLocusMcqOcr.js'
import { repairRhombusScalarTripleMcqOcr } from './repairRhombusScalarTripleMcqOcr.js'
import { repairCoplanarVectorsUnitMcqOcr } from './repairCoplanarVectorsUnitMcqOcr.js'
import {
  polishGarbledVectorStemOcr,
  repairCoplanarAlphaBetaRatioMcqOcr,
} from './repairCoplanarAlphaBetaRatioMcqOcr.js'
import {
  polishPlaneCentroidStemOcr,
  repairPlaneCentroidAxesMcqOcr,
} from './repairPlaneCentroidAxesMcqOcr.js'
import {
  polishParallelPlanesAngleStemOcr,
  repairParallelPlanesAngleMcqOcr,
} from './repairParallelPlanesAngleMcqOcr.js'
import {
  polishPqrsPerpVectorStemOcr,
  repairPqrsPerpVectorMcqOcr,
} from './repairPqrsPerpVectorMcqOcr.js'
import {
  polishAngleBisectorMag36StemOcr,
  repairAngleBisectorMag36McqOcr,
} from './repairAngleBisectorMag36McqOcr.js'
import {
  polishLineUnitDistanceStemOcr,
  repairLineUnitDistanceMcqOcr,
} from './repairLineUnitDistanceMcqOcr.js'
import { normalizeGarbledMcqOptionMarkers } from './repairMcqMisreadAsInteger.js'
import { repairDeterminantOcr } from './repairDeterminantOcr.js'
import { stripOcrHlineTableArtifact } from './repairF0MoebiusFunctionalMcqOcr.js'
import { applyLocalAiLearnedCorrections } from './localAiLearningStore.js'
import { prepareMathForRender, repairBarePiConstant } from './prepareMathForRender.js'
import { repairPiecewiseSgnDiffStemOcr } from './repairPiecewiseSgnDiffMcqOcr.js'
import { repairCasesLatex } from './repairCasesLatex.js'
import { repairLatexForUpload } from './latexValidateRepair.js'

/** Apply math inference + normalization to built-in (Tesseract / hybrid) OCR output. */
export function polishOcrText(text) {
  if (!text?.trim()) return ''
  // Learned Cloud→local corrections first (when toggle is on)
  const learned = applyLocalAiLearnedCorrections(text)
  const hlineStripped = polishLineUnitDistanceStemOcr(
    polishAngleBisectorMag36StemOcr(
      polishPqrsPerpVectorStemOcr(
        polishParallelPlanesAngleStemOcr(
          polishPlaneCentroidStemOcr(
            polishGarbledVectorStemOcr(
              normalizeGarbledMcqOptionMarkers(stripOcrHlineTableArtifact(learned)),
            ),
          ),
        ),
      ),
    ),
  )
  const pre = fixBrokenMcqLatex(
    repairChemistryOcr(
      repairBinomialLog495StemOcr(
        repairLimitGxStemOcr(
          repairTanInverseKIntegralOcr(
          repairT10LimitStemOcr(
            repairFxLimitFiniteStemOcr(
              repairFgGraphPointDMcqOcr(
              repairLimIntersectionStemOcr(
                repairEcosxIntegralStemOcr(
                repairExpRationalIntegralStemOcr(
                repairIntegralStemOcr(
                  repairFxIntegralMaxMinStemOcr(
                    repairLambdaSinCubicExtremaStemOcr(
                      repairMinSinAbsGiPeriodStemOcr(
                        repairMsqGraphOcr(
                          repairTowerPassageOcr(
                            repairLineUnitDistanceMcqOcr(
                              repairAngleBisectorMag36McqOcr(
                                repairPqrsPerpVectorMcqOcr(
                                  repairDeterminantOcr(
                                    repairParallelPlanesAngleMcqOcr(
                                      repairPlaneCentroidAxesMcqOcr(
                                        repairCoplanarAlphaBetaRatioMcqOcr(
                                          repairCoplanarVectorsUnitMcqOcr(
                                            repairRhombusScalarTripleMcqOcr(
                                              repairTriangleLocusMcqOcr(
                                                repairLnFractionIdenticalMcqOcr(
                                                  repairDerivativePrimeStemOcr(
                                                    repairPiecewiseSgnDiffStemOcr(
                                                      repairFunctionalEquationStemOcr(hlineStripped),
                                                    ),
                                                  ),
                                                ),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                ),
                ),
              ),
              ),
            ),
          ),
          ),
        ),
      ),
    ),
  )
  const inferred = finalizeOcrText(
    repairExSinxCosxIntegralStemOcr(
      repairExpXPlusInvXIntegralStemOcr(
        repairTanCscGxIntegralStemOcr(repairXxPowerLnIntegralStemOcr(pre)),
      ),
    ),
  )
  const normalized = normalizeMathText(inferred)
  const result = stripOcrHlineTableArtifact(
    repairLineUnitDistanceMcqOcr(
      repairAngleBisectorMag36McqOcr(
        repairFgGraphPointDMcqOcr(
          repairPqrsPerpVectorMcqOcr(
            repairDeterminantOcr(
              repairParallelPlanesAngleMcqOcr(
                repairPlaneCentroidAxesMcqOcr(
                  repairCoplanarAlphaBetaRatioMcqOcr(
                    repairCoplanarVectorsUnitMcqOcr(
                      repairRhombusScalarTripleMcqOcr(
                        repairTriangleLocusMcqOcr(
                          repairLnFractionIdenticalMcqOcr(
                            repairDerivativePrimeStemOcr(
                              repairPiecewiseSgnDiffStemOcr(
                                repairFunctionalEquationStemOcr(
                                  fixBrokenMcqLatex(
                                    repairChemistryOcr(
                                      repairBinomialLog495StemOcr(
                                        repairLimitGxStemOcr(
                                          repairTanInverseKIntegralOcr(
                                          repairT10LimitStemOcr(
                                            repairFxLimitFiniteStemOcr(
                                            repairFgGraphPointDMcqOcr(
                                              repairLimIntersectionStemOcr(
                                                repairEcosxIntegralStemOcr(
                                                repairExpRationalIntegralStemOcr(
                                                repairIntegralStemOcr(
                                                  repairFxIntegralMaxMinStemOcr(
                                                    repairLambdaSinCubicExtremaStemOcr(
                                                      repairMinSinAbsGiPeriodStemOcr(
                                                        repairMsqGraphOcr(
                                                          repairLnFractionIdenticalMcqOcr(
                                                            repairDerivativePrimeStemOcr(
                                                              repairFunctionalEquationStemOcr(normalized),
                                                            ),
                                                          ),
                                                        ),
                                                      ),
                                                    ),
                                                  ),
                                                  ),
                                                  ),
                                                ),
                                              ),
                                            ),
                                            ),
                                          ),
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  )
  return repairExSinxCosxIntegralStemOcr(
    repairExpXPlusInvXIntegralStemOcr(
      repairTanCscGxIntegralStemOcr(repairXxPowerLnIntegralStemOcr(result)),
    ),
  )
}

/**
 * Light, idempotent polish for Gemini/OpenAI structured extract.
 * Preserves good LaTeX — does NOT run the Tesseract template-rewrite stack
 * (those can overwrite every stem with a wrong “canonical” question).
 * @param {string} text
 */
export function polishCloudVisionText(text) {
  if (!text?.trim()) return ''
  let s = normalizeDerivativePrimeChars(String(text))
  // Only rewrites when the classic curve MCQ primes are clearly mangled.
  s = repairDerivativePrimeStemOcr(s)
  // Cases / sgn light heal BEFORE piecewise canonical — preserve Gemini wording.
  s = repairCasesLatex(s)
  // Piecewise sgn / e^{2(x-1)} — heal only when OCR soup still leaked through AI.
  s = repairPiecewiseSgnDiffStemOcr(s)
  s = repairTanInverseKIntegralOcr(s)
  s = repairExpRationalIntegralStemOcr(s)
  s = repairEcosxIntegralStemOcr(s)
  s = repairGxIntegralOriginStemOcr(s)
  s = repairXxPowerLnIntegralStemOcr(s)
  s = repairTanCscGxIntegralStemOcr(s)
  s = repairExpXPlusInvXIntegralStemOcr(s)
  s = repairExSinxCosxIntegralStemOcr(s)
  s = stripLeakedOptionBandFromStem(s)
  s = repairBarePiConstant(s)
  // Light chem \ce{} wrap when formulas are present — skip pure math stems.
  if (looksLikeChemistryContent(s)) {
    s = repairChemistryOcr(s)
  }
  s = String(s)
    .replace(/\\\[/g, '\n$$')
    .replace(/\\\]/g, '$$\n')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$')
    .trim()
  return prepareMathForRender(s).replace(/\$\s+\$/g, '').trim()
}

/**
 * Post-process OCR — Hybrid gets full polish; Mathpix / cloud-vision get light paths.
 * @param {string} text
 * @param {'mathpix' | 'builtin' | 'word' | 'hybrid-ocr-latex' | 'cloud-vision'} [engine]
 */
export function polishExtractedText(text, engine = 'builtin') {
  if (!text?.trim()) return ''
  let out
  // Word path also runs normalizeMathText so Symbol-font + OMML leftovers get cleaned.
  if (engine === 'word') out = normalizeMathText(text.trim())
  else if (engine === 'cloud-vision' || engine === 'pix2text') out = polishCloudVisionText(text)
  else if (engine === 'mathpix') {
    out = normalizeMathText(
      String(text)
        .replace(/\\\[/g, '\n$$')
        .replace(/\\\]/g, '$$\n')
        .replace(/\\\(/g, '$')
        .replace(/\\\)/g, '$')
        .trim(),
    )
  } else out = polishOcrText(text)
  out = repairGxIntegralOriginStemOcr(out)
  out = repairXxPowerLnIntegralStemOcr(out)
  out = repairTanCscGxIntegralStemOcr(out)
  out = repairExpXPlusInvXIntegralStemOcr(out)
  out = repairExSinxCosxIntegralStemOcr(out)
  out = stripLeakedOptionBandFromStem(out)
  return repairLatexForUpload(out)
}

/**
 * LaTeX polish for passage body + sub-question stems after OCR split.
 * @param {{ passageText?: string, subQuestions?: { text?: string, options?: string[] }[] }} bundle
 */
export function polishPassageBundle(bundle) {
  if (!bundle) return bundle
  return {
    ...bundle,
    passageText: polishExtractedText(bundle.passageText ?? '', 'builtin'),
    subQuestions: (bundle.subQuestions ?? []).map((sq) => ({
      ...sq,
      text: polishExtractedText(sq.text ?? '', 'builtin'),
      options: (sq.options ?? []).map((o) =>
        String(o ?? '').trim() ? polishExtractedText(String(o), 'builtin') : o,
      ),
    })),
  }
}
