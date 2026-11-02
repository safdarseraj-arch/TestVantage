/**
 * OCR cannot read graphs/diagrams in MCQ options — detect garbage text and use image slots.
 */

import { isMcqLikeFromOcr } from './classifyUploadFromOcr.js'
import { cleanStemMergedOptionGarbage } from './optionStemLeak.js'
import { countRealMcqOptions, stemSaysOptionsAreFigures } from './stemDiagramDetect.js'
import { looksLikeDeterminantIntegerStem } from './repairDeterminantOcr.js'
import { looksLikePqrsPerpVectorMcq } from './repairPqrsPerpVectorMcqOcr.js'
import { looksLikeZ5ImaginaryRootsExpDeterminantMcq } from './repairZ5ImaginaryRootsExpDeterminantMcqOcr.js'
import { looksLikeLimitGxQuestion } from './repairLimitGxStemOcr.js'
import { looksLikeFgGraphPointDQuestion, looksLikeCoordinatePairOption } from './repairFgGraphPointDMcqOcr.js'
import { looksLikeSurjectiveNotInjectiveMcq } from './repairSurjectiveNotInjectiveMcqOcr.js'
import { looksLikeFxPlusOneTimesEightMcq } from './repairFxPlusOneTimesEightMcqOcr.js'
import { looksLikeF0MoebiusFunctionalMcq } from './repairF0MoebiusFunctionalMcqOcr.js'
import { looksLikeFxIntegralMaxMinMcq } from './repairFxIntegralMaxMinMcqOcr.js'
import { looksLikeLambdaSinCubicExtremaMcq } from './repairLambdaSinCubicExtremaMcqOcr.js'
import { looksLikeFRplusPowFunctionMcq } from './repairFRplusPowFunctionMcqOcr.js'
import { looksLikeInverseFunctionMcq } from './repairInverseFunctionMcqOcr.js'
import { looksLikeTrigPeriodMcq } from './repairTrigPeriodMcqOcr.js'
import { looksLikeDomainGreatestIntegerMcq } from './repairDomainGreatestIntegerMcqOcr.js'
import { looksLikeSinGiPiOneOneOntoMcq } from './repairSinGiPiOneOneOntoMcqOcr.js'
import { looksLikeOddFunctionAlphaGiMcq } from './repairOddFunctionAlphaGiMcqOcr.js'
import { looksLikeAbsPiSinOneSidedLimitMcq } from './repairAbsPiSinOneSidedLimitMcqOcr.js'
import { looksLikeXxPowerLnIntegralMcq } from './repairXxPowerLnIntegralMcqOcr.js'
import { looksLikeExSinxCosxIntegralMcq } from './repairExSinxCosxIntegralMcqOcr.js'
import { looksLikeTanCscGxIntegralMcq } from './repairTanCscGxIntegralMcqOcr.js'
import { looksLikeExpXPlusInvXIntegralMcq } from './repairExpXPlusInvXIntegralMcqOcr.js'

export { stemSaysOptionsAreFigures }

export const GRAPH_OPTION_PLACEHOLDER =
  '(Graph/diagram — attach image for this option below)'

/** Dedicated integral MCQs whose A–D are typed math, never graph crops. */
function looksLikeDedicatedIntegralTextMcq(blob) {
  const b = String(blob ?? '')
  return (
    looksLikeXxPowerLnIntegralMcq(b) ||
    looksLikeExSinxCosxIntegralMcq(b) ||
    looksLikeTanCscGxIntegralMcq(b) ||
    looksLikeExpXPlusInvXIntegralMcq(b)
  )
}

/** Count (A)…(D) labels in OCR — avoids circular import from classifyUploadFromOcr. */
export function countParenMcqLabelsInText(text) {
  const t = String(text ?? '').replace(/\(\s*s\s*-\s*[abc]\s*\)/gi, '')
  let count = 0
  for (const letter of ['A', 'B', 'C', 'D']) {
    if (new RegExp(`\\(\\s*${letter}\\s*\\)`, 'i').test(t)) count += 1
  }
  return count
}

/**
 * Continuity / discontinuity prose SCQs (piecewise log, one-sided limits) — always text A–D.
 * @param {string} [blob]
 */
export function looksLikeContinuityDiscontinuityTextMcq(blob = '') {
  const t = String(blob ?? '')
  if (!t.trim()) return false
  const hasCont =
    /\b(?:dis)?continuit(?:y|ies|ous)\b/i.test(t) ||
    /\bcontinuous\s+at\b/i.test(t) ||
    /\bdiscontinuous\s+(?:at|since)\b/i.test(t)
  if (!hasCont) return false
  // One-sided limits / f(1±) language is almost always typed options, not graphs.
  if (/f\s*\(\s*1\s*[\^\+−\-]|f\s*\(\s*1\s*[\+\-]|f\(1\^|f\(1[\+\-]\)/i.test(t)) return true
  if (/\b(?:neither|does\s+not\s+exist|exists)\b/i.test(t) && countParenMcqLabelsInText(t) >= 2) {
    return true
  }
  if (countParenMcqLabelsInText(t) >= 3 && /\b(?:is\s+continuous|is\s+discontinuous)\b/i.test(t)) {
    return true
  }
  return false
}

/**
 * OCR blob has (A)–(D) followed by real typed option bodies (prose or math) — not bare graph labels.
 * @param {string} [blob]
 */
export function blobHasTypedTextMcqOptions(blob = '') {
  const t = String(blob ?? '')
  if (!t.trim()) return false
  if (looksLikeContinuityDiscontinuityTextMcq(t)) return true
  let filled = 0
  for (const letter of ['A', 'B', 'C', 'D']) {
    const m = t.match(
      new RegExp(
        `\\(\\s*${letter}\\s*\\)\\s*([^\\n]{0,220})`,
        'i',
      ),
    )
    if (!m) continue
    const body = String(m[1] ?? '')
      .replace(/^\s*[-–—:.]+\s*/, '')
      .trim()
    if (!body || body.length < 3) continue
    // Bare "(A)" under a figure / next label only — not typed text.
    if (/^\(\s*[A-D]\s*\)/i.test(body)) continue
    if (
      looksLikeRealOptionText(body) ||
      /\\frac|\\sqrt|√|\$[^$\n]{2,}\$/.test(body) ||
      /\b(?:is|are|continuous|discontinuous|equal|correct|incorrect|true|false|exists|neither)\b/i.test(
        body,
      ) ||
      body.split(/\s+/).filter((w) => /[a-zA-Z]{2,}/.test(w)).length >= 2
    ) {
      filled += 1
    }
  }
  return filled >= 3
}

/**
 * Vertical list of text/math options (fractions, ℓ, √, prose) — not graph plots.
 * Auto-crop must use label row bands or OCR text, never a 2×2 graph grid.
 * @param {string} [stem]
 * @param {string[]} [options]
 * @param {string} [rawOcr]
 */
export function looksLikeVerticalTextOptionsMcq(stem = '', options = [], rawOcr = '') {
  const blob = `${stem}\n${(options ?? []).join('\n')}\n${rawOcr}`.trim()
  if (stemSaysOptionsAreFigures(stem) || blobMentionsGraphOptions(blob)) return false
  if (looksLikeContinuityDiscontinuityTextMcq(blob)) return true
  if (optionsAreTextOnlyMcq(options)) return true
  if (countRealMcqOptions(stem, options) >= 3) return true
  const labels = countParenMcqLabelsInText(blob)
  // (A)–(D) markers alone are common under graph options — need real option text.
  if (labels >= 4 && countRealMcqOptions(stem, options) < 2) {
    // Typed bodies after labels (math OR prose) without graph language → text MCQ
    if (blobHasTypedTextMcqOptions(blob)) return true
    if (
      /\(\s*[A-D]\s*\)\s*.{0,120}(?:\\frac|\\sqrt|\\ell|√|\$[^$\n]{2,}\$)/i.test(blob) ||
      (/\b(?:minimum|maximum)\s+distance\b/i.test(blob) && /\bell\b|tetrahedron|\\ell/i.test(blob))
    ) {
      return true
    }
    return false
  }
  if (labels >= 4) return true
  const hasMathOpts = /\\frac|\\sqrt|√|\bell\b|\\ell\b/i.test(blob)
  if (labels >= 2 && hasMathOpts) return true
  if (labels >= 2 && blobHasTypedTextMcqOptions(blob)) return true
  if (
    labels >= 1 &&
    /\b(?:minimum|maximum)\s+distance\b/i.test(blob) &&
    /\bell\b|tetrahedron/i.test(blob)
  ) {
    return true
  }
  if (labels >= 2 && /\b(?:is|are)\s*[-–—]\s*$/im.test(stem)) return true
  return false
}

/** @param {string} t */
export function stripMcqOptionLabel(t) {
  return String(t ?? '')
    .trim()
    .replace(/^\(\s*[A-D]\s*\)\s*/i, '')
    .replace(/^[A-D][\)\.\:]\s+/i, '')
    .trim()
}

/**
 * Garbled OCR of typed calculus/math options (+C, ln, x^) — never a graph crop.
 * @param {string} text
 */
export function looksLikeTypedAntiderivativeOption(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return false
  if (raw === GRAPH_OPTION_PLACEHOLDER || /\(Graph\/diagram\s*[—\-]\s*attach image/i.test(raw)) {
    return false
  }
  const t = stripMcqOptionLabel(raw)
  if (!t) return false
  if (/\+\s*[Cc]\b|\+C\b/.test(t)) return true
  if (/\bln\b|\\ln|lnx|QInx|\bInx\b/i.test(t)) return true
  if (/x\s*\^|x\^\{|x²|\(x\s*\^\s*x\)/i.test(t)) return true
  if (/\\int|\bdx\b/i.test(t) && /x|ln|log/i.test(t)) return true
  return false
}

/**
 * Stem + A–D look like an indefinite-integral text MCQ, not graph options.
 * @param {string} [stem]
 * @param {string[]} [options]
 */
export function blobLooksLikeAntiderivativeTextMcq(stem = '', options = []) {
  const opts = (options ?? []).map((o) => stripMcqOptionLabel(String(o ?? '')))
  const plusC = opts.filter((o) => /\+\s*[Cc]\b|\+C\b/.test(o)).length
  if (plusC >= 2) return true
  const blob = `${stem}\n${opts.join('\n')}`
  if (/QInx/i.test(blob) && /\bdx\b/i.test(blob)) return true
  if (/\bdx\b|\\int/i.test(blob) && plusC >= 1 && /ln|QInx|log|x\s*\^/i.test(blob)) return true
  if (/\\int/.test(blob) && /2\\ln|2\s*\\ln\s*x/.test(blob)) return true
  if (looksLikeDedicatedIntegralTextMcq(blob)) return true
  return false
}

/**
 * Gemini / cloud extract invented a verbal graph description instead of a crop.
 * e.g. `[Graph A: Curve with local maximum and minimum]`, `Graph B: Decreasing…`
 * @param {string} text
 */
export function looksLikeVerbalGraphOptionDescription(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return false
  if (raw === GRAPH_OPTION_PLACEHOLDER) return false
  if (/\(Graph\/diagram\s*[—\-]\s*attach image/i.test(raw)) return false
  const t = stripMcqOptionLabel(raw)
  // Bracket / labeled invent: [Graph A: …], (Graph B) …, Graph C: …
  if (
    /^\[?\s*Graph\s*[A-D]\s*[:\]]/i.test(t) ||
    /^\(\s*Graph\s*[A-D]\s*\)/i.test(t) ||
    /^Graph\s*[A-D]\s*[:\-–—]/i.test(t) ||
    /^\[?\s*(?:Option\s*)?[A-D]\s*:\s*(?:a\s+)?(?:graph|curve|plot|figure|sketch)\b/i.test(t)
  ) {
    return true
  }
  // Prose about a curve/plot with no real MCQ answer math (concave, local max, axes…)
  if (
    /\b(?:graph|curve|plot|figure|sketch)\b/i.test(t) &&
    /\b(?:local\s+(?:max|min)|maximum|minimum|concave|increasing|decreasing|asymptote|parabola|sinusoid|axes?|origin|intercept)\b/i.test(
      t,
    ) &&
    !looksLikeCoordinatePairOption(t) &&
    !/\\frac|\\sqrt|\$[^$]{2,}\$|^-?\d+$/.test(t)
  ) {
    return true
  }
  return false
}

/** Optional alt text from a verbal graph description (for <img alt>). */
export function verbalGraphOptionAltText(text) {
  if (!looksLikeVerbalGraphOptionDescription(text)) return ''
  const t = stripMcqOptionLabel(String(text ?? '').trim())
  const m =
    t.match(/^\[?\s*Graph\s*[A-D]\s*[:\]]\s*(.+?)\]?$/i) ||
    t.match(/^Graph\s*[A-D]\s*[:\-–—]\s*(.+)$/i) ||
    t.match(/^\(\s*Graph\s*[A-D]\s*\)\s*(.+)$/i)
  const body = (m?.[1] ?? t).replace(/^\[|\]$/g, '').trim()
  if (!body || body === GRAPH_OPTION_PLACEHOLDER) return ''
  return body.slice(0, 160)
}

/** @param {string} text */
export function isGraphPlaceholderText(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  if (t === GRAPH_OPTION_PLACEHOLDER) return true
  if (/\(Graph\/diagram\s*[—\-]\s*attach image/i.test(t)) return true
  // Invented Gemini descriptions are not real option answers — treat as placeholder.
  return looksLikeVerbalGraphOptionDescription(t)
}

/** Default label saved when an option is image-only (no OCR text). */
export function isImageOnlyOptionLabel(text) {
  return /^Option\s+[A-D]$/i.test(String(text ?? '').trim())
}

/**
 * Text to render in UI — omit placeholder / verbal invent; graph options show as images.
 * @param {string} text
 * @param {boolean} [hasOptionImage]
 */
export function optionTextForDisplay(text, hasOptionImage = false, stem = '') {
  const t = String(text ?? '').trim()
  void stem
  // Never show invented "[Graph A: …]" / attach-graph placeholders as the option body.
  if (isGraphPlaceholderText(t) || looksLikeVerbalGraphOptionDescription(t)) return ''
  if (!t) return ''
  if (!hasOptionImage) return t
  if (isImageOnlyOptionLabel(t)) return ''
  return t
}

/** Value for option text inputs — hide attach-graph / verbal invent placeholders. */
export function optionInputValue(text, hasImage = false, stem = '') {
  const raw = String(text ?? '')
  const t = raw.trim()
  void hasImage
  void stem
  if (looksLikeVerbalGraphOptionDescription(t) || isGraphPlaceholderText(t)) return ''
  return raw
}

/** Clear wrongly applied graph placeholder on text-only options (e.g. after re-parse). */
export function sanitizeStoredOptions(options, optionImages = [], stem = '') {
  const family = blobLooksLikeAntiderivativeTextMcq(stem, options)
  return (options ?? []).map((o, i) => {
    let t = String(o ?? '').trim()
    const cleaned = cleanOptionCropOcrText(t)
    if (cleaned !== t && looksLikeRealOptionText(cleaned)) return cleaned
    t = cleaned
    if (family && (isGraphPlaceholderText(t) || looksLikeVerbalGraphOptionDescription(t))) {
      const hasImg = !!(optionImages[i]?.trim?.() || optionImages[i])
      if (!hasImg) return ''
    }
    if (!isGraphPlaceholderText(t) && !looksLikeVerbalGraphOptionDescription(t)) return t || o
    const hasImg = !!(optionImages[i]?.trim?.() || optionImages[i])
    if (hasImg) return isImageOnlyOptionLabel(t) || isGraphPlaceholderText(t) ? '' : o
    if (shouldUseGraphPlaceholder(t, stem, false)) {
      // Normalize invented "[Graph A: …]" to the standard placeholder (crop still required).
      return GRAPH_OPTION_PLACEHOLDER
    }
    return ''
  })
}

/** @param {string} text */
export function looksLikeRealOptionText(text) {
  const raw = String(text ?? '').trim()
  if (!raw || isGraphPlaceholderText(raw)) return false
  if (looksLikeVerbalGraphOptionDescription(raw)) return false
  const t = stripMcqOptionLabel(raw)
  if (!t) return false
  if (/^-?\d+$/.test(t)) return true
  if (looksLikeTypedAntiderivativeOption(t)) return true
  if (/^(?:none|all)\s+of\s+(?:these|the\s+above)$/i.test(t)) return true
  if (/^(\d+\s*\/\s*\d+|\$?\\frac\{[^}]+\}\{[^}]+\}\$?)$/.test(t)) return true
  if (/^\$[^$]{1,12}\$$/.test(t)) return true
  if (looksLikeCoordinatePairOption(t)) return true
  if (t.length >= 22) return true
  if (/\\frac|\\sqrt|\\vec|\\hat|\\times|\\pi|\\int|\\left|\\right/i.test(t)) return true
  if (/\$[^$]{2,}\$/.test(t)) return true
  if (
    /\b(is equal to|linearly|parallelogram|projection|vectors?|triangle|medians?|diagonal|sq\.?\s*unit|units?|equal|correct|incorrect|true|false)\b/i.test(
      t,
    )
  ) {
    return true
  }
  if (/\bf\s*\(\s*x\s*\)\s*is\s+(?:odd|even|neither)\b/i.test(t)) return true
  const words = t.split(/\s+/).filter((w) => /[a-zA-Z]{2,}/.test(w))
  if (words.length >= 3) return true
  return false
}

/** OCR blob mentions graph/curve options (even when stem OCR is weak). */
export function blobMentionsGraphOptions(blob) {
  const t = String(blob ?? '')
  if (!t.trim()) return false
  if (stemSaysOptionsAreFigures(t)) return true
  return (
    /\b(?:graphs?|curves?|figures?|diagrams?|plots?|sketches?)\b/i.test(t) &&
    (/\b(?:option|choice|below|following|shown|given)\b/i.test(t) ||
      countParenMcqLabelsInText(t) >= 2)
  )
}

/** Strip narrow-crop OCR junk (e.g. `-147 |`, `|$\sqrt{13}$,415 |`). */
export function cleanOptionCropOcrText(text) {
  let t = String(text ?? '').trim()
  if (!t) return t
  t = t.replace(/^(-?\d{1,10})\s*\|\s*$/i, '$1')
  t = t.replace(/^\|\s*(-?\d{1,10})\s*\|$/i, '$1')
  t = t.replace(/©/g, 'C')
  return t.trim()
}

/** Vertical 2×2 strip OCR glued onto the stem (e.g. `-147 | [3.1] U[…`). */
export function looksLikeMistakenCropStemTail(text) {
  const s = String(text ?? '').trim()
  if (!s) return false
  return (
    /-\d{1,6}\s*\|/.test(s) &&
    (/U\[|V\^|\^\{|©|\\sqrt|\.7\]|U\s*\[/.test(s) || (s.match(/\|/g) ?? []).length >= 2)
  )
}

/** Remove mistaken auto-crop / graph-label OCR garbage appended to the question stem. */
export function stripMistakenCropLeakFromStem(stem, options = []) {
  let s = cleanStemMergedOptionGarbage(String(stem ?? '').trim(), options)
  if (!s || !looksLikeMistakenCropStemTail(s)) return s
  const gi = s.match(/^(.*?\bgreatest\s+integer\s+function\s*\)?)/is)
  if (gi?.[1] && gi[1].trim().length >= 40) {
    return gi[1].replace(/\s*[-–—]\s*$/, '').trim()
  }
  const cut = s.match(/^(.*?)(?:\s*[-–—]\s*)?-?\d{1,6}\s*\|/is)
  if (cut?.[1]?.trim().length >= 35) return cut[1].replace(/\s*[-–—]\s*$/, '').trim()
  return s
}

/**
 * Garbled text from mistaken per-option auto-crop (not real graph placeholders).
 * @param {string} text
 */
export function looksLikeMistakenOptionCropText(text) {
  const raw = String(text ?? '').trim()
  if (!raw) return false
  if (/U\[\s*V|\^\{?\d/.test(raw) && /[\[\]©]/.test(raw)) return true
  if (/\$\s*\\sqrt\{/.test(raw) && /[|,]/.test(raw)) return true
  if (/\]\s*-\s*\(\s*-/.test(raw)) return true
  const t = cleanOptionCropOcrText(raw)
  if (!t) return false
  if (looksLikeRealOptionText(t)) return false
  if (/^\s*[\|\[\(].{0,36}[\|\]\)]\s*$/.test(t) && !looksLikeCoordinatePairOption(t)) return true
  return looksLikeFailedGraphOcr(t)
}

/**
 * Option images + garbled/empty crop OCR — auto-crop split a horizontal text row.
 * Also flags "Option A" labels + images when OCR clearly had typed A–D text.
 * @param {string[]} options
 * @param {(string|null|undefined)[]} [optionImages]
 * @param {string} [rawOcr]
 */
export function looksLikeMistakenOptionCropSet(options = [], optionImages = [], rawOcr = '') {
  const opts = (options ?? []).slice(0, 4)
  const imgs = (optionImages ?? []).slice(0, 4)
  const imgCount = imgs.filter((img) => !!(img && String(img).trim())).length
  if (imgCount < 2) return false
  const garbled = opts.filter((o, i) => imgs[i] && looksLikeMistakenOptionCropText(o)).length
  const emptyWithImg = opts.filter((o, i) => imgs[i] && !String(o ?? '').trim()).length
  const labelOnlyWithImg = opts.filter(
    (o, i) => imgs[i] && (isImageOnlyOptionLabel(o) || isGraphPlaceholderText(o)),
  ).length
  if (garbled >= 2) return true
  if (garbled >= 1 && emptyWithImg >= 1) return true
  // Empty / "Option A" slots + crops while OCR has typed (A)–(D) prose/math → bad strips.
  const blob = String(rawOcr ?? '')
  if (
    imgCount >= 2 &&
    emptyWithImg + labelOnlyWithImg >= 2 &&
    (blobHasTypedTextMcqOptions(blob) || looksLikeContinuityDiscontinuityTextMcq(blob))
  ) {
    return true
  }
  // Real typed options already filled — crops are redundant/wrong for text MCQs.
  const realWithImg = opts.filter((o, i) => imgs[i] && looksLikeRealOptionText(o)).length
  if (realWithImg >= 2 && !stemSaysOptionsAreFigures(blob) && !blobMentionsGraphOptions(blob)) {
    return true
  }
  return false
}

/** @param {string} text */
export function looksLikeFailedGraphOcr(text) {
  const t = String(text ?? '').trim()
  if (!t) return false
  if (looksLikeVerbalGraphOptionDescription(t)) return true
  if (t === GRAPH_OPTION_PLACEHOLDER || /\(Graph\/diagram\s*[—\-]\s*attach image/i.test(t)) {
    return false
  }
  if (looksLikeTypedAntiderivativeOption(t)) return false
  if (looksLikeRealOptionText(t)) return false

  if (/^(axes?|x[\s-]?axis|y[\s-]?axis|origin|grid|scale)$/i.test(t)) return true

  // OCR noise (| I l O) — not numeric MCQ answers like 0, 1, 2
  if (/^\d+$/.test(t)) return false
  if (t.length <= 8 && /^[|IlO\s\-+.,:;]+$/.test(t) && /[|IlO]/.test(t)) return true

  if (
    t.length < 22 &&
    (t.match(/[|Il1O0]/g) ?? []).length >= 4 &&
    !/\\frac|\\sqrt|\\vec|\\hat|\\times|[a-z]{4,}/i.test(t)
  ) {
    return true
  }

  if (
    /^(graph|diagram|figure|sketch|plot|curve)\s*$/i.test(t) ||
    /^(see|as)\s+(fig|graph|diagram)\.?\s*$/i.test(t)
  ) {
    return true
  }

  return false
}

/**
 * @param {string} optionText
 * @param {string} [stem]
 * @param {boolean} [hasImage]
 */
export function shouldUseGraphPlaceholder(optionText, stem = '', hasImage = false) {
  if (hasImage) return false
  const t = String(optionText ?? '').trim()

  // Invented "[Graph A: …]" or attach-graph placeholder → still need a crop.
  if (looksLikeVerbalGraphOptionDescription(t)) return true
  if (t === GRAPH_OPTION_PLACEHOLDER || /\(Graph\/diagram\s*[—\-]\s*attach image/i.test(t)) {
    if (blobLooksLikeAntiderivativeTextMcq(stem, [t]) || looksLikeDedicatedIntegralTextMcq(stem)) {
      return false
    }
    return true
  }

  // Typed MCQ answers (numbers, "None of these", short math) are never graph slots.
  if (looksLikeTypedAntiderivativeOption(t)) return false
  if (looksLikeRealOptionText(t)) return false
  if (/^(?:none|all)\s+of\s+(?:these|the\s+above)$/i.test(stripMcqOptionLabel(t))) return false
  if (blobLooksLikeAntiderivativeTextMcq(stem, [t]) || looksLikeDedicatedIntegralTextMcq(stem)) {
    return false
  }
  if (looksLikeFailedGraphOcr(t)) return true

  if (!t && stemSaysOptionsAreFigures(stem)) return true

  return false
}

/**
 * @param {string} stem
 * @param {string[]} options
 * @param {(string|null|undefined)[]} [optionImages]
 */
export function applyGraphOptionPlaceholders(stem, options, optionImages = []) {
  const opts = options ?? []
  const keepText =
    blobLooksLikeAntiderivativeTextMcq(stem, opts) || looksLikeDedicatedIntegralTextMcq(`${stem}\n${opts.join('\n')}`)
  return opts.map((o, i) => {
    const hasImg = !!(optionImages[i]?.trim?.() || optionImages[i])
    const text = String(o ?? '').trim()

    if (keepText) {
      if (hasImg && (isGraphPlaceholderText(text) || shouldUseGraphPlaceholder(text, stem, false))) {
        return isImageOnlyOptionLabel(text) || isGraphPlaceholderText(text) ? '' : text
      }
      if (isGraphPlaceholderText(text) && !hasImg) return ''
      return o
    }

    if (hasImg && (isGraphPlaceholderText(text) || shouldUseGraphPlaceholder(text, stem, false))) {
      return isImageOnlyOptionLabel(text) || isGraphPlaceholderText(text) ? '' : text
    }
    if (shouldUseGraphPlaceholder(text, stem, hasImg)) {
      return GRAPH_OPTION_PLACEHOLDER
    }
    return o
  })
}

/** @param {string[]} options @param {(string|null)[]} [optionImages] @param {string} [stem] */
export function countGraphOptionsNeedingImage(options, optionImages = [], stem = '') {
  let n = 0
  ;(options ?? []).forEach((o, i) => {
    if (shouldUseGraphPlaceholder(o, stem, !!optionImages[i])) n++
  })
  return n
}

/** Four A–D slots already hold numeric / fraction / LaTeX answers — not graph crops. */
export function optionsAreTextOnlyMcq(options = []) {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  const real = opts.filter((o) => looksLikeRealOptionText(o))
  return real.length >= 4
}

/** Text MCQ: f(x) is odd/even and periodic/aperiodic — not graph crops. */
export function looksLikeFunctionPropertyTextMcq(blob) {
  const t = String(blob ?? '')
  if (!t.trim()) return false
  const hasFn = /\bf\s*\(\s*x\s*\)\s*is\b/i.test(t)
  const hasProp = /\b(?:odd|even|neither)\b/i.test(t) && /\b(?:periodic|aperiodic)\b/i.test(t)
  if (hasFn && hasProp) return true
  if (
    /\bwhich\s+of\s+the\s+following\s+statements?\s+is\s+true\b/i.test(t) &&
    hasProp
  ) {
    return true
  }
  return false
}

/**
 * Determinant stems must never auto-crop (row 3 often sits above option A).
 * @param {string} stem
 * @param {string[]} options
 * @param {string} [rawOcr]
 */
export function shouldSkipOptionsAutoCrop(stem, options = [], rawOcr = '') {
  const blob = `${stem}\n${(options ?? []).join('\n')}\n${rawOcr}`.trim()

  // Known text MCQs / filled A–D text — even when the stem mentions "graph" / "figure".
  if (optionsAreTextOnlyMcq(options)) return true
  if (countRealMcqOptions(stem, options) >= 3) return true
  if (looksLikeContinuityDiscontinuityTextMcq(blob)) return true
  if (blobHasTypedTextMcqOptions(blob)) return true
  if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(blob)) return true
  if (looksLikeLimitGxQuestion(blob)) return true
  if (looksLikeFgGraphPointDQuestion(blob)) return true
  if (looksLikeSurjectiveNotInjectiveMcq(blob)) return true
  if (looksLikeFxPlusOneTimesEightMcq(blob)) return true
  if (looksLikeFRplusPowFunctionMcq(blob)) return true
  if (looksLikeInverseFunctionMcq(blob)) return true
  if (looksLikeFunctionPropertyTextMcq(blob)) return true
  if (looksLikeTrigPeriodMcq(blob)) return true
  if (looksLikeDomainGreatestIntegerMcq(blob)) return true
  if (looksLikeSinGiPiOneOneOntoMcq(blob)) return true
  if (looksLikeOddFunctionAlphaGiMcq(blob)) return true
  if (looksLikeAbsPiSinOneSidedLimitMcq(blob)) return true
  if (looksLikeDedicatedIntegralTextMcq(blob)) return true
  if (blobLooksLikeAntiderivativeTextMcq(stem, options)) return true
  if (looksLikeF0MoebiusFunctionalMcq(blob)) return true
  if (looksLikeFxIntegralMaxMinMcq(blob)) return true
  if (looksLikeLambdaSinCubicExtremaMcq(blob)) return true
  if (looksLikeDeterminantIntegerStem(stem)) return true
  if (looksLikeDeterminantIntegerStem(blob)) return true

  // Graph / figure option panels — allow auto-crop.
  if (stemSaysOptionsAreFigures(stem) || blobMentionsGraphOptions(blob)) return false
  if (countGraphOptionsNeedingImage(options, [], stem) >= 1) return false

  if (looksLikeVerticalTextOptionsMcq(stem, options, rawOcr) && countParenMcqLabelsInText(blob) >= 2) {
    return true
  }
  if (looksLikePqrsPerpVectorMcq(stem) || looksLikePqrsPerpVectorMcq(blob)) return false
  // Four (A)–(D) markers with real option text → text MCQ.
  if (countParenMcqLabelsInText(blob) >= 4 && countRealMcqOptions(stem, options) >= 3) return true
  return false
}

/**
 * Manual split / attach-graph: image-only slots (no real OCR answer text on imaged rows).
 * @param {string[]} options
 * @param {(string|null|undefined)[]} [optionImages]
 * @param {string} [rawOcr]
 */
export function isDeliberateGraphOptionSplit(options = [], optionImages = [], rawOcr = '') {
  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  const imgs = (optionImages ?? []).slice(0, 4)
  const imgCount = imgs.filter((img) => !!(img && String(img).trim())).length
  if (imgCount < 1) return false
  if (looksLikeMistakenOptionCropSet(options, optionImages, rawOcr)) return false
  const blob = `${(options ?? []).join('\n')}\n${rawOcr}`.trim()
  // OCR already has typed A–D — empty/"Option A" + crops are mistaken strips, not deliberate.
  if (blobHasTypedTextMcqOptions(blob) || looksLikeContinuityDiscontinuityTextMcq(blob)) {
    return false
  }
  return opts.every(
    (o, i) =>
      !imgs[i] ||
      !o ||
      isImageOnlyOptionLabel(o) ||
      isGraphPlaceholderText(o) ||
      !looksLikeRealOptionText(o),
  )
}

/**
 * Drop mistaken auto-crops on text MCQs — never remove deliberate manual-split / graph option images.
 * @param {string} stem
 * @param {string[]} options
 * @param {(string|null|undefined)[]} [optionImages]
 * @param {string} [rawOcr]
 */
export function shouldStripMistakenOptionCrops(stem, options = [], optionImages = [], rawOcr = '') {
  const imgs = (optionImages ?? []).map((img) => String(img ?? '').trim()).filter(Boolean)
  if (!imgs.length) return false

  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  const blob = `${stem}\n${opts.join('\n')}\n${rawOcr}`.trim()

  if (isDeliberateGraphOptionSplit(options, optionImages, rawOcr)) return false

  // Typed continuity / prose A–D in OCR → always strip bad option strips.
  if (looksLikeContinuityDiscontinuityTextMcq(blob) || blobHasTypedTextMcqOptions(blob)) {
    return true
  }

  const textOnlyMcq =
    optionsAreTextOnlyMcq(opts) && countRealMcqOptions(stem, options) >= 3
  if (
    !textOnlyMcq &&
    !looksLikeMistakenOptionCropSet(options, optionImages, rawOcr) &&
    isMcqLikeFromOcr({ stem, options, rawOcr, optionImages })
  ) {
    return false
  }

  if (looksLikeOddFunctionAlphaGiMcq(blob)) return true
  if (looksLikeAbsPiSinOneSidedLimitMcq(blob)) return true
  if (looksLikeDedicatedIntegralTextMcq(blob)) return true
  if (blobLooksLikeAntiderivativeTextMcq(stem, options)) return true

  if (looksLikeFunctionPropertyTextMcq(blob)) return true
  if (looksLikeTrigPeriodMcq(blob)) return true
  if (looksLikeDomainGreatestIntegerMcq(blob)) return true
  if (looksLikeF0MoebiusFunctionalMcq(blob)) return true
  if (looksLikeFxIntegralMaxMinMcq(blob)) return true
  if (looksLikeLambdaSinCubicExtremaMcq(blob)) return true
  if (looksLikeMistakenOptionCropSet(options, optionImages, rawOcr)) return true
  if (looksLikeMistakenCropStemTail(stem)) return true

  if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(blob)) return true
  if (looksLikeLimitGxQuestion(blob)) return true
  if (looksLikeFgGraphPointDQuestion(blob)) return true
  if (looksLikeSurjectiveNotInjectiveMcq(blob)) return true
  if (looksLikeFxPlusOneTimesEightMcq(blob)) return true
  if (looksLikeFRplusPowFunctionMcq(blob)) return true
  if (looksLikeInverseFunctionMcq(blob)) return true

  if (optionsAreTextOnlyMcq(opts)) return true
  if (countRealMcqOptions(stem, options) >= 3) return true
  if (looksLikePqrsPerpVectorMcq(stem) || looksLikePqrsPerpVectorMcq(blob)) return true
  if (looksLikeDeterminantIntegerStem(blob)) return true
  return false
}

/**
 * Bank migration — drop mistaken option crops on text MCQs (fractions, numbers).
 * @param {import('../data/tests').Question} q
 */
export function stripWrongTextMcqOptionImages(q) {
  if (!q || typeof q !== 'object') return q
  const imgs = q.optionImages ?? []
  if (!imgs.some((img) => !!(img && String(img).trim()))) return q
  const type = q.questionType ?? 'single_correct'
  if (type !== 'single_correct' && type !== 'multiple_correct') return q
  const raw = String(q.ocrRawText ?? q.extractedRaw ?? q._ocrSource ?? '')
  if (!shouldStripMistakenOptionCrops(q.text ?? '', q.options ?? [], imgs, raw)) return q
  const next = { ...q }
  delete next.optionImages
  return next
}

/**
 * True when a screenshot likely contains graph options A–D worth auto-cropping.
 * @param {string} stem
 * @param {string[]} options
 * @param {(string|null|undefined)[]} [optionImages]
 * @param {string} [rawOcr]
 */
export function shouldAttemptOptionsAutoCrop(stem, options = [], optionImages = [], rawOcr = '') {
  const blob = `${stem}\n${(options ?? []).join('\n')}\n${rawOcr}`.trim()
  const hasOcrContext = String(stem ?? '').trim().length >= 20 || String(rawOcr ?? '').trim().length >= 20
  if (!hasOcrContext) return false
  if (shouldSkipOptionsAutoCrop(stem, options, rawOcr)) return false
  if (looksLikeVerticalTextOptionsMcq(stem, options, rawOcr)) return false
  if (looksLikeContinuityDiscontinuityTextMcq(blob)) return false
  if (blobHasTypedTextMcqOptions(blob)) return false
  if (looksLikeZ5ImaginaryRootsExpDeterminantMcq(blob)) return false
  if (looksLikeLimitGxQuestion(blob)) return false
  if (looksLikeFgGraphPointDQuestion(blob)) return false
  if (looksLikeSurjectiveNotInjectiveMcq(blob)) return false
  if (looksLikeFxPlusOneTimesEightMcq(blob)) return false
  if (looksLikeFRplusPowFunctionMcq(blob)) return false
  if (looksLikeInverseFunctionMcq(blob)) return false
  if (looksLikeFunctionPropertyTextMcq(blob)) return false
  if (looksLikeTrigPeriodMcq(blob)) return false
  if (looksLikeDomainGreatestIntegerMcq(blob)) return false
  if (looksLikeOddFunctionAlphaGiMcq(blob)) return false
  if (looksLikeAbsPiSinOneSidedLimitMcq(blob)) return false
  if (looksLikeDedicatedIntegralTextMcq(blob)) return false
  if (blobLooksLikeAntiderivativeTextMcq(stem, options)) return false
  if (looksLikeF0MoebiusFunctionalMcq(blob)) return false
  if (looksLikeFxIntegralMaxMinMcq(blob)) return false
  if (looksLikeLambdaSinCubicExtremaMcq(blob)) return false
  if ((optionImages ?? []).some((img) => !!(img && String(img).trim()))) return false
  if (countGraphOptionsNeedingImage(options, optionImages, stem) >= 1) return true
  if (stemSaysOptionsAreFigures(stem) || blobMentionsGraphOptions(blob)) return true

  const opts = (options ?? []).slice(0, 4).map((o) => String(o ?? '').trim())
  const empty = opts.filter((o) => !o).length
  // Empty slots alone must NOT trigger crop when OCR already has typed (A)–(D) bodies.
  if (empty >= 3 && !blobHasTypedTextMcqOptions(blob) && countParenMcqLabelsInText(blob) < 4) {
    return true
  }

  const failed = opts.filter((o) => o && looksLikeFailedGraphOcr(o)).length
  if (failed >= 2) return true

  if (
    empty >= 1 &&
    /\b(?:graphs?|diagrams?|figures?|sketches?|curves?|plots?)\b/i.test(String(stem ?? ''))
  ) {
    return true
  }

  if (
    empty >= 2 &&
    String(stem ?? '').trim().length > 50 &&
    !blobHasTypedTextMcqOptions(blob) &&
    countParenMcqLabelsInText(blob) < 4
  ) {
    return true
  }

  return false
}
