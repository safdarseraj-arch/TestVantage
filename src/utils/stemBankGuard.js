/**

 * Final gate before any question stem is stored or shown from the bank.

 * All save / load / migrate paths must use finalizeStemForBank().

 */

import { normalizeStemForStorage } from './stemStorage.js'
import { cleanStemMergedOptionGarbage } from './optionStemLeak.js'

import { repairMatrixDeterminantStem } from './repairMatrixStem.js'
import { looksLikeDeterminantQuestion, vmatrixLooksBroken } from './repairDeterminantOcr.js'
import { looksLikeSmashedProseVmatrix, repairSmashedProseVmatrixOcr } from './repairSmashedProseVmatrixOcr.js'
import {
  looksLikePolynomialCoeffVmatrix,
  repairPolynomialCoeffVmatrixOcr,
  POLY_COEFF_VMATRIX_STEM,
} from './repairPolynomialCoeffVmatrixOcr.js'
import {
  looksLikeZ5ImaginaryRootsExpDeterminantMcq,
  repairZ5ImaginaryRootsExpDeterminantMcqOcr,
  Z5_IMAGINARY_ROOTS_DET_STEM,
} from './repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import {
  hasGoodLimitGxStem,
  looksLikeLimitGxQuestion,
  LIMIT_GX_STEM,
  repairLimitGxStemOcr,
} from './repairLimitGxStemOcr.js'
import {
  looksLikeRhombusScalarTripleMcq,
  repairRhombusScalarTripleMcqOcr,
  rhombusScalarTripleStemNeedsCanonical,
  RHOMBUS_SCALAR_TRIPLE_STEM,
} from './repairRhombusScalarTripleMcqOcr.js'
import {
  looksLikeCoplanarVectorsUnitMcq,
  repairCoplanarVectorsUnitMcqOcr,
  coplanarVectorsUnitStemNeedsCanonical,
  COPLANAR_VECTORS_UNIT_STEM,
} from './repairCoplanarVectorsUnitMcqOcr.js'
import {
  looksLikeCoplanarAlphaBetaRatioMcq,
  repairCoplanarAlphaBetaRatioMcqOcr,
  coplanarAlphaBetaRatioStemNeedsCanonical,
  COPLANAR_ALPHA_BETA_RATIO_STEM,
  polishGarbledVectorStemOcr,
} from './repairCoplanarAlphaBetaRatioMcqOcr.js'
import {
  looksLikePlaneCentroidAxesMcq,
  repairPlaneCentroidAxesMcqOcr,
  planeCentroidAxesStemNeedsCanonical,
  PLANE_CENTROID_AXES_STEM,
  polishPlaneCentroidStemOcr,
} from './repairPlaneCentroidAxesMcqOcr.js'
import {
  looksLikeParallelPlanesAngleMcq,
  repairParallelPlanesAngleMcqOcr,
  parallelPlanesAngleStemNeedsCanonical,
  PARALLEL_PLANES_ANGLE_STEM,
  polishParallelPlanesAngleStemOcr,
} from './repairParallelPlanesAngleMcqOcr.js'
import {
  looksLikePqrsPerpVectorMcq,
  repairPqrsPerpVectorMcqOcr,
  pqrsPerpVectorStemNeedsCanonical,
  PQRS_PERP_VECTOR_STEM,
  polishPqrsPerpVectorStemOcr,
} from './repairPqrsPerpVectorMcqOcr.js'
import {
  looksLikeAngleBisectorMag36Mcq,
  repairAngleBisectorMag36McqOcr,
  angleBisectorMag36StemNeedsCanonical,
  ANGLE_BISECTOR_MAG36_STEM,
  polishAngleBisectorMag36StemOcr,
} from './repairAngleBisectorMag36McqOcr.js'
import {
  looksLikeLineUnitDistanceMcq,
  repairLineUnitDistanceMcqOcr,
  lineUnitDistanceStemNeedsCanonical,
  LINE_UNIT_DISTANCE_STEM,
  polishLineUnitDistanceStemOcr,
} from './repairLineUnitDistanceMcqOcr.js'
import {
  looksLikeCurveDerivativeGraphMcq,
  curveDerivativeStemLooksMangled,
  repairDerivativePrimeStemOcr,
  CURVE_FP_POS_FPP_NEG_STEM,
} from './repairDerivativePrimeStemOcr.js'
import {
  looksLikePiecewiseSgnDiffMcq,
  piecewiseSgnDiffStemNeedsCanonical,
  repairPiecewiseSgnDiffStemOcr,
} from './repairPiecewiseSgnDiffMcqOcr.js'



/** Patterns that must never appear in stored matrix stems. */

const BROKEN_PATTERNS = [

  { re: /\\begin\s+\{/, label: 'spaced \\begin {' },

  { re: /\bbmatri\s+x\^2/i, label: 'corrupt bmatri x^2' },

  { re: /\\begin\s*\$\s*\{/i, label: 'broken \\begin $ {' },

  { re: /[\uE000\uE001]/, label: 'internal row-break marker leaked' },

  { re: /\\operatorname\s*\{\s*operatorname/i, label: 'doubled \\operatorname OCR' },

  { re: /\\operatorname\s*\\\{\s*Tr/i, label: 'garbled \\operatorname\\{Tr' },

  { re: /(?<!\\)operatorname\s*\{/i, label: 'missing backslash before operatorname' },

  { re: /\doperatorname/i, label: 'digit glued to operatorname' },

  { re: /(?:\\\\\s*){2,}/, label: 'runaway backslash row noise' },

  { re: /\[\s*\d+(?:\s*\\quad\s*\d+){2,}/, label: 'flat \\quad bracket matrix' },

  { re: /\[\s*\d+(?:\s*\\\s+\d+){2,}/, label: 'flat backslash-spaced bracket matrix' },

  { re: /\[\s*\d+(?:\s+\d+){5,}\s*\]/, label: 'flat spaced-digit bracket matrix' },

  { re: /M\s*(?:\^{-1}|[−-]\s*1)\s*=\s*\$\$A=/i, label: 'broken M^{-1} matrix dollars' },

  { re: /M\s*[−-]\s*1\s*=\s*A\s*=\s*\[\s*\d/i, label: 'bare M^{-1} flat bracket matrix' },

  { re: /\[\s*begin\{bmatrix\}/i, label: 'bracket-wrapped begin{bmatrix} without backslash' },

  { re: /(?<!\\)begin\{bmatrix\}[\s\S]*?(?<!\\)end\{bmatrix\}/i, label: 'bmatrix missing leading backslash' },

  { re: /\$\$\$+A\s*=/, label: 'broken matrix $$ delimiters' },

  { re: /\bA\s*=\s*\[\s*\d[\d\s\\quad]{6,}\s*\]/i, label: 'flat A=[digits] matrix' },

  { re: /\\begin\{vmatrix\}(?![\s\S]*\\\\)/i, label: 'vmatrix missing row breaks' },

  { re: /\\begin\{cases\}(?![\s\S]*\\\\)/i, label: 'cases missing row breaks' },

]



/**

 * @param {string} text

 * @returns {string[]}

 */

/** Each \\begin{bmatrix}…\\end{bmatrix} block must have \\\\ row breaks when it has 2+ cells. */
function flatBmatrixBodiesWithoutRowBreaks(text) {
  const re = /\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}/gi
  let m
  while ((m = re.exec(String(text ?? ''))) !== null) {
    const inner = m[1]
    if (/\\\\/.test(inner)) continue
    if ((inner.match(/&/g) || []).length >= 1) return true
  }
  return false
}

export function detectBrokenBankStem(text) {

  const t = String(text ?? '')

  const issues = []

  // Mask cases/matrix bodies so healthy \\\\ row breaks are never flagged as runaway noise.
  const maskedBlocks = []
  const masked = t.replace(
    /\\begin\{(?:cases|array|vmatrix|pmatrix|matrix|bmatrix)\}[\s\S]*?\\end\{(?:cases|array|vmatrix|pmatrix|matrix|bmatrix)\}/gi,
    (m) => {
      maskedBlocks.push(m)
      return `\uE010${maskedBlocks.length - 1}\uE011`
    },
  )

  for (const { re, label } of BROKEN_PATTERNS) {
    if (label === 'runaway backslash row noise') {
      if (re.test(masked)) issues.push(label)
      continue
    }
    if (label === 'cases missing row breaks') {
      // Check original (unmasked) — pattern needs real cases body
      if (re.test(t)) issues.push(label)
      continue
    }
    if (re.test(t)) issues.push(label)
  }

  if (flatBmatrixBodiesWithoutRowBreaks(t)) {
    issues.push('bmatrix missing row breaks')
  }

  if (/\\end\{vmatrix\}/i.test(t) && !/\\begin\{vmatrix\}/i.test(t)) {
    issues.push('orphan vmatrix end')
  }

  if (/\\begin\{vmatrix\}/i.test(t) && vmatrixLooksBroken(t)) {
    issues.push('vmatrix row breaks broken')
  }

  if (looksLikeSmashedProseVmatrix(t)) {
    issues.push('English prose smashed into vmatrix')
  }

  if (/^\s*\|/m.test(t) && /then\s+value\s+of\s+a|192x|2x\s*-\s*37|\\end\{vmatrix\}/i.test(t)) {
    issues.push('pipe matrix OCR rows')
  }

  if (/\\begin\{bmatrix\}/i.test(t) && /Let\s/i.test(t)) {

    if (!/\$\$[\s\S]*\\begin\{bmatrix\}/i.test(t)) {

      issues.push('matrix missing $$ display delimiters')

    }

  }

  return issues

}



/**
 * True when stem already looks like clean AI/LaTeX (not Tesseract garbage).
 * Used by tests / light polish — do NOT use alone to skip OCR template heals
 * (garbled OCR often still contains \\begin / $\\vec$ fragments).
 * @param {string} text
 */
export function stemLooksHighQualityLatex(text) {
  const t = String(text ?? '').trim()
  if (t.length < 25) return false
  if (
    /~~|\|{3,}|\?{3,}|¢|Van\s*g|bmatri\s|\\begin\s+\{|¹\+|het,|qual\s*¢|i\+\]|\\times\s*\^\s*2|×\s*\^/i.test(
      t,
    )
  ) {
    return false
  }
  if (detectBrokenBankStem(t).length > 0) return false
  // Known OCR templates that still need heal — never treat as “already good”
  if (looksLikePqrsPerpVectorMcq(t) && pqrsPerpVectorStemNeedsCanonical(t)) return false
  if (looksLikeRhombusScalarTripleMcq(t) && rhombusScalarTripleStemNeedsCanonical(t)) return false
  if (looksLikeParallelPlanesAngleMcq(t) && parallelPlanesAngleStemNeedsCanonical(t)) return false
  if (looksLikeAngleBisectorMag36Mcq(t) && angleBisectorMag36StemNeedsCanonical(t)) return false
  if (looksLikeLineUnitDistanceMcq(t) && lineUnitDistanceStemNeedsCanonical(t)) return false
  if (looksLikeCoplanarVectorsUnitMcq(t) && coplanarVectorsUnitStemNeedsCanonical(t)) return false
  if (looksLikeCoplanarAlphaBetaRatioMcq(t) && coplanarAlphaBetaRatioStemNeedsCanonical(t)) {
    return false
  }
  if (looksLikePlaneCentroidAxesMcq(t) && planeCentroidAxesStemNeedsCanonical(t)) return false
  if (looksLikePiecewiseSgnDiffMcq(t) && piecewiseSgnDiffStemNeedsCanonical(t)) return false
  let score = 0
  if ((t.match(/\$[^$\n]{2,80}\$/g) ?? []).length >= 1) score += 2
  if (/\\frac|\\dfrac|\\sqrt|\\pi|\\sin|\\lim|\\neq|\\leq|\\geq/i.test(t)) score += 2
  if (/f'|f''|\\prime/.test(t)) score += 1
  if (/\\dfrac|\\frac\{/.test(t) && /\\pi/.test(t)) score += 1
  if (/\\begin\{cases\}/.test(t) && /\\operatorname\{\s*sgn\s*\}|e\^\{2\(x-1\)\}/.test(t)) score += 3
  // Coherent opening words (AI extracts), not mid-sentence OCR scraps
  if (/^(?:Let|If|The|Find|Consider|Given|A\s|An\s)/i.test(t)) score += 1
  return score >= 4
}

/**

 * @param {string} text

 * @param {string[]} [options]

 * @returns {string}

 */

export function finalizeStemForBank(text, options = []) {

  const raw = String(text ?? '').trim()

  if (!raw) return text ?? ''

  // Vector MCQ collapsed into bogus 2×3 vmatrix — restore before matrix "repairs" mangle it.
  if (looksLikePqrsPerpVectorMcq(raw)) {
    return PQRS_PERP_VECTOR_STEM
  }
  if (looksLikeAngleBisectorMag36Mcq(raw)) {
    return ANGLE_BISECTOR_MAG36_STEM
  }
  if (looksLikeLineUnitDistanceMcq(raw)) {
    return LINE_UNIT_DISTANCE_STEM
  }

  let out = normalizeStemForStorage(raw, options)

  for (let pass = 0; pass < 8; pass++) {

    const repaired = repairMatrixDeterminantStem(out)

    const normalized = normalizeStemForStorage(repaired, options)

    if (normalized === out) break

    out = normalized

    if (detectBrokenBankStem(out).length === 0) break

  }



  if (looksLikePolynomialCoeffVmatrix(out) && out !== POLY_COEFF_VMATRIX_STEM) {
    const polyFixed = repairPolynomialCoeffVmatrixOcr(out)
    if (polyFixed && polyFixed !== out) out = polyFixed
  }
  if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(out) && out !== Z5_IMAGINARY_ROOTS_DET_STEM) {
    const z5Fixed = repairZ5ImaginaryRootsExpDeterminantMcqOcr(out)
    if (z5Fixed && z5Fixed !== out) out = z5Fixed
  }
  if (looksLikeLimitGxQuestion(out) && !hasGoodLimitGxStem(out)) {
    const gxFixed = repairLimitGxStemOcr(out)
    if (gxFixed && gxFixed !== out) out = gxFixed.split(/\(\s*A\s*\)/i)[0].trim() || LIMIT_GX_STEM
  }
  if (looksLikeRhombusScalarTripleMcq(out) && rhombusScalarTripleStemNeedsCanonical(out)) {
    const rhombusFixed = repairRhombusScalarTripleMcqOcr(out)
    out = rhombusFixed && rhombusFixed !== out ? rhombusFixed : RHOMBUS_SCALAR_TRIPLE_STEM
  }
  if (looksLikeCoplanarVectorsUnitMcq(out) && coplanarVectorsUnitStemNeedsCanonical(out)) {
    const coplanarFixed = repairCoplanarVectorsUnitMcqOcr(out)
    out = coplanarFixed && coplanarFixed !== out ? coplanarFixed : COPLANAR_VECTORS_UNIT_STEM
  }
  if (looksLikeCoplanarAlphaBetaRatioMcq(out) && coplanarAlphaBetaRatioStemNeedsCanonical(out)) {
    const abFixed = repairCoplanarAlphaBetaRatioMcqOcr(out)
    out = abFixed && abFixed !== out ? abFixed : COPLANAR_ALPHA_BETA_RATIO_STEM
  } else if (/coplanar|\\vec|\\hat\{[ijk]\}/i.test(out)) {
    const polished = polishGarbledVectorStemOcr(out)
    if (polished && polished !== out) out = polished
  }
  if (looksLikePlaneCentroidAxesMcq(out) && planeCentroidAxesStemNeedsCanonical(out)) {
    const planeFixed = repairPlaneCentroidAxesMcqOcr(out)
    out = planeFixed && planeFixed !== out ? planeFixed : PLANE_CENTROID_AXES_STEM
  } else if (/centroid|coordinate\s+axes/i.test(out)) {
    const planePolished = polishPlaneCentroidStemOcr(out)
    if (planePolished && planePolished !== out) out = planePolished
  }
  if (looksLikeParallelPlanesAngleMcq(out) && parallelPlanesAngleStemNeedsCanonical(out)) {
    const angleFixed = repairParallelPlanesAngleMcqOcr(out)
    out = angleFixed && angleFixed !== out ? angleFixed : PARALLEL_PLANES_ANGLE_STEM
  } else if (/line\s+of\s+intersection|determined\s+by\s+the\s+vectors/i.test(out)) {
    const anglePolished = polishParallelPlanesAngleStemOcr(out)
    if (anglePolished && anglePolished !== out) out = anglePolished
  }
  if (looksLikePqrsPerpVectorMcq(out) && pqrsPerpVectorStemNeedsCanonical(out)) {
    const pqrsFixed = repairPqrsPerpVectorMcqOcr(out)
    out = pqrsFixed && pqrsFixed !== out ? pqrsFixed : PQRS_PERP_VECTOR_STEM
  } else if (/\\begin\{vmatrix\}|4\\vec\{r\}|\\vec\{p\}\s*=\s*3/i.test(out)) {
    const pqrsPolished = polishPqrsPerpVectorStemOcr(out)
    if (pqrsPolished && pqrsPolished !== out) out = pqrsPolished
  }
  if (looksLikeAngleBisectorMag36Mcq(out) && angleBisectorMag36StemNeedsCanonical(out)) {
    const bisFixed = repairAngleBisectorMag36McqOcr(out)
    out = bisFixed && bisFixed !== out ? bisFixed : ANGLE_BISECTOR_MAG36_STEM
  } else if (/bisector|magnitude\s+36|¥/i.test(out)) {
    const bisPolished = polishAngleBisectorMag36StemOcr(out)
    if (bisPolished && bisPolished !== out) out = bisPolished
  }
  if (looksLikeLineUnitDistanceMcq(out) && lineUnitDistanceStemNeedsCanonical(out)) {
    const lineFixed = repairLineUnitDistanceMcqOcr(out)
    out = lineFixed && lineFixed !== out ? lineFixed : LINE_UNIT_DISTANCE_STEM
  } else if (/unit\s+distance\s+from\s+the\s+point\s+A|line\s+passes\s+through\s+two\s+points/i.test(out)) {
    const linePolished = polishLineUnitDistanceStemOcr(out)
    if (linePolished && linePolished !== out) out = linePolished
  }
  if (looksLikeCurveDerivativeGraphMcq(out) && curveDerivativeStemLooksMangled(out)) {
    const derFixed = repairDerivativePrimeStemOcr(out)
    out = derFixed && derFixed !== out ? derFixed : CURVE_FP_POS_FPP_NEG_STEM
  } else if (looksLikeCurveDerivativeGraphMcq(out)) {
    const derPolished = repairDerivativePrimeStemOcr(out)
    if (derPolished && derPolished !== out) out = derPolished
  }
  if (looksLikePiecewiseSgnDiffMcq(out)) {
    const pwFixed = repairPiecewiseSgnDiffStemOcr(out)
    if (pwFixed && pwFixed !== out) out = pwFixed
  }
  if (
    /3x\^2\s*\+\s*19[\s\S]*2x\s*-\s*37[\s\S]*(?:then\s+value|\\text\{|value\s+of\s+a|\$then value\$)/i.test(
      out,
    )
  ) {
    out = POLY_COEFF_VMATRIX_STEM
  }

  out = repairSmashedProseVmatrixOcr(out)

  const remaining = detectBrokenBankStem(out)

  if (remaining.length && typeof console !== 'undefined') {

    console.warn('[finalizeStemForBank] stem still has issues:', remaining.join(', '))

  }

  return cleanStemMergedOptionGarbage(out, options)

}



/** True when source should be rewritten to match bank-safe preview. */

export function stemNeedsSourceRepair(text, _options = []) {

  const raw = String(text ?? '').trim()

  if (!raw) return false

  if (detectBrokenBankStem(raw).length > 0) return true

  if (/2f\s*2\s*\)/i.test(raw)) return true

  if (/\bThe\s+X\s+equation\b/i.test(raw)) return true

  if (looksLikeDeterminantQuestion(raw)) {
    if (/\\end\{vmatrix\}/i.test(raw) && vmatrixLooksBroken(raw)) return true
    if (/^\s*\|/m.test(raw) && /then\s+value\s+of\s+a|value\s+of\s+ai|\\end\{vmatrix\}/i.test(raw)) {
      return true
    }
    if (vmatrixLooksBroken(raw)) return true
    if (!/\\begin\{vmatrix\}/i.test(raw) && /192x|2x\s*-\s*37|ax\s*\^?\s*3/i.test(raw)) return true
  }

  return false
}



/** Live editor / preview — same repair as bank storage. */

export function stemForLivePreview(text, options = []) {

  const raw = String(text ?? '').trim()

  if (!raw) return text ?? ''

  return finalizeStemForBank(raw, options)

}



/** @returns {string[]} issues remaining after finalize (empty = safe to save) */

export function stemSaveBlockers(text, options = []) {

  return detectBrokenBankStem(finalizeStemForBank(text, options))

}


