import { looksLikeGarbledMathLine } from './hybridOcrMerge.js'
import { looksLikeMatchColumnUpload } from './parseMatchColumnUpload.js'
import { looksLikeDeterminantMcq } from './repairDeterminantMcqOcr.js'
import { looksLikeDeterminantQuestion } from './repairDeterminantOcr.js'
import { looksLikeBinomialLog495Question } from './repairBinomialLog495StemOcr.js'
import { looksLikeChemistryContent } from './repairChemistryOcr.js'
import { looksLikeLimIntersectionCalculusQuestion } from './repairLimIntersectionStemOcr.js'
import { looksLikeRhombusScalarTripleMcq } from './repairRhombusScalarTripleMcqOcr.js'

/** LaTeX already looks complete — ONNX boost usually not needed. */
function hasGoodLatexStem(t) {
  if (/\\times\s*\^|ax2b|\[a\s+b\s+a/i.test(t)) return false
  if (/rhombus/i.test(t) && /diagonal/i.test(t) && !/\\vec\{d\}_[1-4].*\\times\s*2\\vec/i.test(t)) {
    return false
  }
  return /\\frac|\\sqrt|\\begin\{|\\hat\{|\\vec\{/.test(t)
}

/** Vector / scalar-triple stems that still need equation OCR. */
function looksLikeBrokenVectorTriple(t) {
  if (looksLikeRhombusScalarTripleMcq(t)) return true
  return (
    /\\times\s*\^/i.test(t) ||
    (/\[.*\ba\b.*\bb\b.*(?:ax2b|x\s*2\s*b)/i.test(t) && /\\vec|vector/i.test(t))
  )
}

/** Graph / diagram — stem text OCR; figure saved as image crop separately. */
function looksLikeGraphOrDiagramQuestion(t) {
  return (
    /\bgraph of\b/i.test(t) ||
    /\b(shown (?:in|below)|as shown in (?:the )?figure|see (?:the )?figure|figure below|diagram below)\b/i.test(
      t,
    ) ||
    /y\s*=\s*f\s*\(\s*x\s*\)/i.test(t)
  )
}

/** Determinant / matrix notation in plain OCR. */
function looksLikeDeterminantOrMatrix(t) {
  return (
    /\bdet\s*\(|determinant|vmatrix|bmatrix|pmatrix|amatrix|\\begin\{(?:v|b|p)matrix\}/i.test(t) ||
    /\|\s*[a-z0-9+\-]+\s+[a-z0-9+\-]+\s*\|/i.test(t)
  )
}

/** Calculus: integral, limit, derivative — avoid false hits on normal English. */
function looksLikeCalculusStem(t) {
  return (
    /∫|\\int\b|integral/i.test(t) ||
    /\\lim\b|\blim\s*[_\{\\(]|limit\s+as|tends\s+to\s+0/i.test(t) ||
    /\bd\/dx|d\s*y\s*\/\s*d\s*x|derivative|differentiat|\\partial/i.test(t)
  )
}

/** Chemistry formulas / reactions — not plain prose mentioning ethanol etc. */
function looksLikeChemistryStem(t) {
  if (/\\ce\{|\\pu\{/.test(t)) return true
  if (/(?:->|<=>|⇌|\\rightleftharpoons|\\rightarrow)/i.test(t)) return true
  if (/\b(?:H2O|H2SO4|CH4|NH3|CO2|NaCl|Fe\^?\{?2\+|SO4|MnO4|Cr2O7|CuSO4)\b/i.test(t)) return true
  if (
    looksLikeChemistryContent(t) &&
    /\b(?:mol\s*L|pH|pKa|Kc|Kp|equilibrium|redox|oxidation|reduction|Nernst)\b/i.test(t)
  ) {
    return true
  }
  return false
}

/** True when page prose likely needs ONNX LaTeX boost (math or garbled equation lines). */
export function pageNeedsOnnxBoost(text) {
  const t = String(text ?? '')
  if (!t.trim()) return true
  if (looksLikeBrokenVectorTriple(t)) return true
  // Golden stem repairs handle these — ONNX often times out and makes output worse.
  if (looksLikeDeterminantMcq(t) || looksLikeDeterminantQuestion(t) || looksLikeDeterminantOrMatrix(t)) {
    return false
  }
  if (hasGoodLatexStem(t)) return false
  if (t.split(/\r?\n/).some(looksLikeGarbledMathLine)) return true
  if (looksLikeBinomialLog495Question(t)) return true
  if (looksLikeMatchColumnUpload(t)) return true
  if (looksLikeGraphOrDiagramQuestion(t)) return true
  if (looksLikeCalculusStem(t)) return true
  if (looksLikeChemistryStem(t)) return true
  return (
    /sqrt|m\/s|\^2|degrees?|velocity|bmatrix|matrix|frac|\bg\s*=\s*\d/i.test(t) ||
    /log\s*[_₂2]?|log_2|\(\s*&\s*\+|1\s*\/\s*x\s*\^?\s*2|Column\s*[-–]?\s*I/i.test(t) ||
    /\(\s*[a-z]\^2\s*[-+]\s*\d/i.test(t) ||
    looksLikeLimIntersectionCalculusQuestion(t) ||
    (/\\lim\b|\blim_\{/i.test(t) && /sin|cos|tan/i.test(t))
  )
}
