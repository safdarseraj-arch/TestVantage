import { isPassageLinkedQuestion } from './passage.js'
import { looksLikeMatrixAlgebraQuestion } from './parseMatchColumnUpload.js'
import { looksLikeDeterminantQuestion } from './repairDeterminantOcr.js'
import { looksLikeSurjectiveNotInjectiveMcq } from './repairSurjectiveNotInjectiveMcqOcr.js'
import { looksLikeFxPlusOneTimesEightMcq } from './repairFxPlusOneTimesEightMcqOcr.js'
import { looksLikeFRplusPowFunctionMcq } from './repairFRplusPowFunctionMcqOcr.js'
import { looksLikeMinSinAbsGiPeriodMcq } from './repairMinSinAbsGiPeriodMcqOcr.js'

/**
 * Detect when the question stem likely includes a figure OCR cannot reproduce
 * (piecewise graphs, diagrams, geometry, etc.).
 */

/** Match-the-column OCR â€” matrix LaTeX is answer notation, not a figure to crop. */
export function looksLikeMatrixMatchText(text) {
  const blob = `${text ?? ''}`
  if (!blob.trim()) return false
  return (
    /match\s+(?:the\s+)?columns?|matrix\s+match|column\s*[-â€“]?\s*i\b.*column\s*[-â€“]?\s*ii\b/is.test(
      blob,
    ) ||
    (/\(\s*[A-D]\s*\)/i.test(blob) &&
      /\(\s*[P-T]\s*\)/i.test(blob) &&
      /unit\s+vectors?|progression|column/i.test(blob))
  )
}

/**
 * True visual figure (graph / circuit / sketch) — NOT LaTeX math that KaTeX can render.
 * \\begin{cases} / "piecewise" / brace defs are text stems; do not treat them as diagrams.
 */
export function hasStrongFigureCue(blob) {
  if (!blob?.trim()) return false
  if (/\\begin\{tikzpicture\}/i.test(blob)) return true
  if (
    /\b(?:as\s+shown(?:\s+(?:above|below|in\s+(?:the\s+)?(?:figure|diagram|graph)))?|shown\s+above|shown\s+below|see\s+(?:the\s+)?(?:graph|figure|diagram))\b/i.test(
      blob,
    )
  ) {
    return true
  }
  if (/\b(?:the\s+)?plot\s+of\b/i.test(blob)) return true
  if (
    /\b(?:plot|graph|diagram|figure)\b/i.test(blob) &&
    /\b(?:shown\s+below|shown\s+above|is\s+shown|are\s+shown)\b/i.test(blob)
  ) {
    return true
  }
  if (
    /\b(?:density|pressure|temperature|volume)\s+vs\.?\s+(?:density|pressure|temperature|volume)\b/i.test(
      blob,
    )
  ) {
    return true
  }
  if (/\b(?:in\s+the\s+)?circuit\s+shown\b/i.test(blob)) return true
  if (/\b(?:in\s+the\s+)?(?:figure|diagram|circuit)\s+(?:shown|below|above)\b/i.test(blob)) {
    return true
  }
  if (/\bgraph\s+of\b/i.test(blob)) return true
  if (/\bprojectile\b/i.test(blob) && /\b(?:platform|horizontal|thrown|angle|velocity)\b/i.test(blob)) {
    return true
  }
  if (/\blands?\s+on\s+(?:a\s+)?platform\b/i.test(blob)) return true
  return false
}

/**
 * Complete text MCQ stem — hide / clear redundant questionImage crop (no dedicated figure).
 * @param {Object} [q]
 * @param {string} [q.text]
 * @param {string[]} [q.options]
 * @param {(string|null|undefined)[]} [q.optionImages]
 * @param {string} [q.questionType]
 * @param {string} [extractedRaw]
 */
export function stemTextCompleteWithoutVisualFigure(q = {}, extractedRaw = '') {
  const text = String(q.text ?? '').trim()
  if (text.length < 40) return false
  const type = q.questionType ?? 'single_correct'
  if (type !== 'single_correct' && type !== 'multiple_correct') return false
  if (stemLikelyNeedsDiagramImage(text, extractedRaw, { questionType: type })) return false
  if (hasSeparateStemFigureCue(`${text}\n${extractedRaw}`)) return false
  const optImgs = (q.optionImages ?? []).filter((u) => !!String(u ?? '').trim()).length
  /** Option-graph questions may still keep a stem figure; only gate text+text here. */
  if (optImgs >= 2 && stemSaysOptionsAreFigures(text)) return false
  const mcqOpts = (q.options ?? []).filter((o) => looksLikeRealMcqOptionLine(o))
  const filledOpts = (q.options ?? []).filter((o) => String(o ?? '').trim().length > 8)
  return mcqOpts.length >= 3 || filledOpts.length >= 4
}

/**
 * OCR looks like match-the-column â€” skip matrix auto-parse when a figure is clearly needed.
 * @param {string} [stem]
 * @param {string} [extractedRaw]
 * @param {string[]} [options]
 */
export function shouldPreferDiagramOverMatrixParse(stem = '', extractedRaw = '', options = []) {
  const blob = `${stem ?? ''}\n${extractedRaw ?? ''}`
  if (looksLikeMatrixMatchText(blob)) return false
  if (hasStrongFigureCue(blob)) return true
  return shouldUseDiagramSplitWorkflow(stem, extractedRaw, options)
}

/**
 * Stem says A–D choices are graphs/figures (not a separate stem-only diagram).
 * Kept here (not graphOptionOcr) so diagram detect can gate without circular imports.
 */
export function stemSaysOptionsAreFigures(stem) {
  const s = String(stem ?? '').trim()
  if (!s) return false
  return (
    /\b(?:graphs?|diagrams?|figures?|sketches?)\s+(?:are\s+)?(?:given\s+)?below\b/i.test(s) ||
    /\b(?:graphs?|diagrams?|figures?)\s+(?:for\s+)?(?:options?|choices?)\b/i.test(s) ||
    /\boptions?\s+(?:are\s+)?(?:graphs?|diagrams?|figures?|sketches?)\b/i.test(s) ||
    /\bfollowing\s+(?:graphs?|diagrams?|figures?)\b/i.test(s) ||
    /\b(?:which|select)\s+(?:of\s+the\s+following\s+)?(?:graphs?|diagrams?|figures?|curves?|plots?)\b/i.test(
      s,
    ) ||
    /\bcorrect\s+(?:graph|diagram|figure|curve|plot)\b/i.test(s) ||
    /\b(?:graph|diagram|figure|sketch)\s+(?:is\s+)?(?:shown|given)\s+(?:for\s+)?(?:each\s+)?option/i.test(
      s,
    )
  )
}

/** Stem has its own figure (circuit / “as shown”) separate from A–D option graphs. */
export function hasSeparateStemFigureCue(stem = '') {
  const blob = String(stem ?? '')
  if (!blob.trim()) return false
  return (
    /\bas\s+shown\b/i.test(blob) ||
    /\bin\s+the\s+(?:figure|diagram|circuit)\s+(?:shown|below|above)\b/i.test(blob) ||
    /\b(?:figure|diagram|circuit)\s+shows?\b/i.test(blob) ||
    /\bcircuit\s+shown\b/i.test(blob)
  )
}

/**
 * Whether to run auto diagram crop after OCR / on attach (content-first; form type MTC alone must not block graphs).
 * @param {string} [stem]
 * @param {string} [extractedRaw]
 * @param {string[]} [options]
 * @param {string} [questionType]
 */
export function shouldAttemptDiagramAutoCrop(stem = '', extractedRaw = '', options = [], questionType = '') {
  const blob = `${stem ?? ''}\n${extractedRaw ?? ''}`
  if (!blob.trim()) return false
  if (questionType === 'matrix_match' && looksLikeMatrixMatchText(blob)) return false
  // Options ARE the four graphs — stem stays text; A–D come from option auto-crop.
  if (stemSaysOptionsAreFigures(blob) && !hasSeparateStemFigureCue(blob)) return false
  return (
    shouldUseDiagramSplitWorkflow(stem, extractedRaw, options) ||
    stemLikelyNeedsDiagramImage(stem, extractedRaw, { questionType: 'single_correct' })
  )
}

/** @param {string} text @param {string} [extra] @param {{ questionType?: string }} [opts] */
export function stemLikelyNeedsDiagramImage(text, extra = '', opts = {}) {
  const blob = `${text ?? ''}\n${extra ?? ''}`
  if (!blob.trim()) return false
  if (opts.questionType === 'matrix_match') return false
  if (looksLikeMatrixAlgebraQuestion(blob)) return false
  if (hasStrongFigureCue(blob)) return true
  if (looksLikeMatrixMatchText(blob)) return false

  // LaTeX cases / piecewise / matrices render as text — not diagram crops.
  if (/\\begin\{tikzpicture\}/i.test(blob)) return true
  if (/\bcircuit\s+(?:diagram|below|above)\b/i.test(blob)) {
    return true
  }
  // "The figure shows…", "graph shows…", "diagram depicts…", "plot represents…"
  if (
    /\b(?:figure|graph|diagram|plot|sketch|fig\.?)\s+(?:shows?|showing|shown|depicts?|represents?|illustrates?|gives?|below|above)\b/i.test(
      blob,
    )
  ) {
    return true
  }
  // "shows a graph / figure / plot of …"
  if (/\bshows?\b[^.]{0,40}\b(?:graph|figure|diagram|plot)\b/i.test(blob)) {
    return true
  }
  if (/\b[a-z]\s*[-–—]\s*[a-z]\s+(?:graph|curve|plot)\b/i.test(blob)) {
    return true
  }
  if (
    /\b(?:graph|diagram|figure|sketch|plot|shown\s+below|as\s+shown|see\s+fig)/i.test(blob) &&
    /\b(?:triangle|circle|parabola|hyperbola|ellipse|coordinate|axes|function)\b/i.test(blob)
  ) {
    return true
  }
  if (/\barea\s+of\s+(?:triangle|parallelogram|circle)|medians?\s+respectively/i.test(blob)) {
    return true
  }
  if (/\\includegraphics|\\begin\{picture\}/i.test(blob)) {
    return true
  }
  if (/\btrajectory\b|\bparabolic\s+(?:path|motion)\b/i.test(blob)) {
    return true
  }

  return false
}

/**
 * Full-page OCR screenshots duplicate options already shown as text â€” hide unless
 * the stem needs a figure or options were not extracted.
 * @param {Object} q
 * @param {string} [q.text]
 * @param {string} [q.questionImage]
 * @param {string[]} [q.options]
 * @param {string} [q.optionsImage]
 * @param {(string|null)[]} [q.optionImages]
 * @param {string} [q.questionType]
 * @param {string} [q.contentMode]
 */
/** @param {string} t */
function stripMcqOptionLabel(t) {
  return String(t ?? '')
    .trim()
    .replace(/^\(\s*[A-D]\s*\)\s*/i, '')
    .replace(/^[A-D][\)\.\:]\s+/i, '')
    .trim()
}

/** @param {string} t */
export function looksLikeRealMcqOptionLine(t) {
  const s = stripMcqOptionLabel(t)
  if (!s || s.length > 320) return false
  if (/^Option\s+[A-D]$/i.test(s)) return false
  if (/\(Graph\/diagram\s*[—\-]\s*attach image/i.test(s) || /^Graph\/diagram\b/i.test(s)) {
    return false
  }
  // Invented vision descriptions are not real MCQ answers.
  if (
    /^\[?\s*Graph\s*[A-D]\s*[:\]]/i.test(s) ||
    /^\(\s*Graph\s*[A-D]\s*\)/i.test(s) ||
    /^Graph\s*[A-D]\s*[:\-–—]/i.test(s)
  ) {
    return false
  }
  if (
    /^(?:then|another|is\s*[-â€“:]|forall|such\s+that|defined|function|value\s+of)\b/i.test(s)
  ) {
    return false
  }
  // A mere "(A)" / "A)" prefix is not an answer — keep checking the body.
  if (
    /^[\d\s\$\\frac\\sqrt\\ln\\logf\(]|^\\(?:frac|sqrt|log|ln|sin|cos|tan|sec|csc|cot)\b/i.test(
      s,
    )
  ) {
    return true
  }
  if (/^\$?\d+(?:\.\d+)?\$?$/.test(s)) return true
  if (/^[-−]?\d{1,8}$/.test(s)) return true
  // e^2, e^{-2}, π/2, x^2+1, bare LaTeX-ish math (not English prose)
  if (/^\$?[a-zπΠ](?:\^\{[^}]+\}|\^[+-]?\d+|_\{[^}]+\}|_\d)?\$?$/i.test(s)) return true
  if (/^\$?[a-zπΠ][\w^_{}\\+\-*/()]+\$?$/i.test(s) && s.length <= 48 && !/\s{2,}/.test(s)) {
    return true
  }
  if (/^[\[\(]/.test(s) && /\\sqrt|√|∪|\\cup|\d/.test(s)) return true
  if (/\\log\b|\\frac\b|\\sqrt\b/i.test(s)) return true
  if (/^(?:A\.P\.|G\.P\.|H\.P\.|A\.G\.P\.|AP|GP|HP|AGP)$/i.test(s)) return true
  if (/^[A-D][\)\.\:]\s*(?:A\.P\.|G\.P\.|H\.P\.|A\.G\.P\.)/i.test(String(t ?? '').trim())) {
    return true
  }
  if (
    /\b(?:integer|irrational|rational|natural|prime|real|whole)\s+(?:numbers?|greater|less)\b/i.test(
      s,
    ) ||
    /\b(?:a|an)\s+(?:fraction|integer|irrational|rational|natural|prime|real)\b/i.test(s) ||
    /\b(?:only|both|none|all)\s+of\s+the\s+above\b/i.test(s) ||
    /\bexactly\s+(?:one|two|three|four|no)\b/i.test(s) ||
    /\b(?:no|all)\s+(?:non[\-\s]?zero\s+)?real\s+numbers?\b/i.test(s)
  ) {
    return true
  }
  if (/\bf\s*\(\s*x\s*\)\s*is\s+(?:odd|even|neither)\b/i.test(s)) return true
  // "b is a perfect square", "x is irrational" — single-letter vars not in \frac/\sqrt char classes
  if (/^[a-z]\s+is\s+/i.test(s)) return true
  if (/\bperfect\s+square\b/i.test(s)) return true
  return false
}

/** Figure questions must be a deliberate diagram crop, not a full OCR screenshot. */
export function isValidDiagramStemImage(q) {
  if (!q?.questionImage?.trim()) return false
  if (!q.stemImageCrop) return false
  if (q.stemTextInImage === true) return false
  return true
}

export function shouldShowQuestionStemImage(q) {
  if (!q?.questionImage) return false
  /** Passage diagram is shown once with the passage, not on each sub-question. */
  if (isPassageLinkedQuestion(q)) return false

  const text = String(q.text ?? '').trim()
  const optImgCount = (q.optionImages ?? []).filter((u) => !!String(u ?? '').trim()).length

  /**
   * A–D option graph crops exist: never show a non-cropped full composite (options would
   * appear twice — once in the stem screenshot, again as option images).
   */
  if (optImgCount >= 2 && !isValidDiagramStemImage(q)) return false
  /** Options ARE the graphs — prefer extracted stem text; keep only a separate stem figure. */
  if (
    optImgCount >= 2 &&
    text.length >= 30 &&
    stemSaysOptionsAreFigures(text) &&
    !hasSeparateStemFigureCue(text)
  ) {
    return false
  }

  /** Complete text extract (e.g. piecewise \\begin{cases}) — never show redundant stem crop. */
  if (stemTextCompleteWithoutVisualFigure(q)) return false

  const needsFig = stemLikelyNeedsDiagramImage(text)

  if (needsFig) {
    if (isValidDiagramStemImage(q)) return true
    const mcq = countRealMcqOptions(text, q.options ?? [])
    const type = q.questionType ?? 'single_correct'
    if (mcq < 2 || type === 'integer' || type === 'numerical') return true
    if (mcq >= 4 && !q.stemImageCrop && q.stemTextInImage !== true) return false
    /** Option placeholders ("Option A") + crops — hide composite even when needsFig. */
    if (optImgCount >= 2 && !q.stemImageCrop) return false
    return true
  }

  if (q.contentMode === 'hybrid') {
    /** Hybrid with OCR text — hide duplicate full-page screenshot. */
    if (text.length > 50 && q.stemTextInImage !== true && !q.stemImageCrop) return false
    if (text.length > 50 && q.stemTextInImage !== true) return false
    return !!q.questionImage
  }

  const type = q.questionType ?? 'single_correct'
  if (type === 'integer' || type === 'numerical') {
    if (q.stemTextInImage === true) return !!q.questionImage
    if (isValidDiagramStemImage(q)) return true
    if (text.length > 50 && !q.stemImageCrop) return false
    return !!q.questionImage && !text
  }
  if (type !== 'single_correct' && type !== 'multiple_correct') return true

  /** Cropped stem (split tool) — show only when a real figure is needed. */
  if (q.stemImageCrop) {
    if (text.length > 40) {
      const mcqOpts = (q.options ?? []).filter((o) => looksLikeRealMcqOptionLine(o))
      const filledOpts = (q.options ?? []).filter((o) => String(o ?? '').trim().length > 8)
      if (mcqOpts.length >= 3 || filledOpts.length >= 4) return false
    }
    return true
  }

  if (q.optionsImage || optImgCount >= 1) return false

  const mcqOpts = (q.options ?? []).filter((o) => looksLikeRealMcqOptionLine(o))
  const filledOpts = (q.options ?? []).filter((o) => String(o ?? '').trim().length > 8)
  /** Full-page screenshot when all four options are already extracted as text — hide duplicate. */
  if (!q.stemImageCrop && text.length > 40) {
    if (mcqOpts.length >= 4 && q.stemTextInImage !== false) return false
    if (filledOpts.length >= 4 && mcqOpts.length >= 3 && q.stemTextInImage !== true) return false
  }
  if (mcqOpts.length >= 4 && q.stemTextInImage !== false) return false

  return true
}

/** @param {string} stem @param {string[]} [options] */
export function countRealMcqOptions(stem, options = []) {
  return (options ?? []).filter((o) => looksLikeRealMcqOptionLine(o)).length
}

/**
 * Cloud/builtin OCR soup that must never lock Convert (skip heal / preserve vision).
 * Examples: "241 | 1 QInx + 1)dx", graph placeholders on +C options.
 * @param {string} [stem]
 * @param {string[]} [options]
 */
export function looksLikeUnusableOcrSoup(stem = '', options = []) {
  const opts = (options ?? []).map((o) => String(o ?? ''))
  const blob = `${stem}\n${opts.join('\n')}`
  if (!blob.trim()) return false
  if (/QInx/i.test(blob) && /\bdx\b/i.test(blob)) return true
  if (/241\s*\|/.test(blob) && (/\bdx\b|\+ 1\)dx/i.test(blob) || /QInx/i.test(blob))) return true
  if (/LU\s*I\s*ne/i.test(blob) && /\bdx\b/i.test(blob)) return true
  if (/xX\s*1\s*\)/i.test(blob) && /\bdx\b/i.test(blob)) return true
  if (/\\times\s*\$\$?\s*3/i.test(blob) && /\bne\b/i.test(blob) && /\bdx\b/i.test(blob)) return true
  if (/\[e\s*\[2\s*cose/i.test(blob) && /g\s*\(\s*x\s*\)\s*\+\s*K/i.test(blob)) return true
  if (/oC\s*XX\s*A\s*AL/i.test(blob) && /\(x\s*-1\)/i.test(blob)) return true
  if (/eT\s*ax/i.test(blob) && /Fel\s*\+C/i.test(blob)) return true
  // Screenshot 202333: e^{x sin x + cos x} soup ("dr" for dx, gsmx / egrsmx).
  if (
    /gsmx\s*\+\s*cosx|egrsmxteosx|grsmatcosx|xsinx\s*\+\s*cos\s*x/i.test(blob) &&
    (/\+\s*[Cc]\b|\bdr\b|\bdx\b/i.test(blob))
  ) {
    return true
  }
  const labeledPlaceholder = opts.filter((o) => {
    const t = o.trim()
    return /^Option\s+[A-D]$/i.test(t) || /^\(\s*[A-D]\s*\)\s*Option\s+[A-D]$/i.test(t)
  }).length
  if (labeledPlaceholder >= 2) return true
  // Graph placeholder on a typed +C / ln / dx MCQ is a false graph, not a real figure question.
  if (
    /Graph\/diagram\s*[—\-]\s*attach image/i.test(blob) &&
    (/\bdx\b|\\int|QInx|\+\s*[Cc]\b|Lhx\s*\+\s*C|\(FY\s*\+\s*C/i.test(blob))
  ) {
    return true
  }
  if (/\bdx\b/i.test(blob) && !/\\int/.test(blob) && (blob.match(/[|Il]/g) ?? []).length >= 3) {
    return true
  }
  return false
}

/**
 * MCQ slots ready for save — real text options plus image-only A–D crops.
 * @param {string} stem
 * @param {string[]} [options]
 * @param {(string|null|undefined)[]} [optionImages]
 */
export function countMcqAnswerSlots(stem, options = [], optionImages = []) {
  let n = 0
  for (let i = 0; i < 4; i++) {
    if (String(optionImages?.[i] ?? '').trim()) {
      n += 1
      continue
    }
    const opt = String(options?.[i] ?? '').trim()
    if (looksLikeRealMcqOptionLine(opt)) n += 1
    else if (/^Option\s+[A-D]$/i.test(opt)) n += 1
  }
  return n
}

/**
 * User-facing MCQ option count for publish — any filled A–D slot counts (not OCR heuristics).
 * @param {string[]} [options]
 * @param {(string|null|undefined)[]} [optionImages]
 */
export function countFilledMcqOptionsForPublish(options = [], optionImages = []) {
  let n = 0
  for (let i = 0; i < 4; i++) {
    if (String(optionImages?.[i] ?? '').trim()) {
      n += 1
      continue
    }
    const opt = stripMcqOptionLabel(String(options?.[i] ?? '').trim())
    if (!opt || /^Option\s+[A-D]$/i.test(opt)) continue
    // Verbal invent / attach-graph placeholder is not a publishable answer.
    if (
      /^\[?\s*Graph\s*[A-D]\s*[:\]]/i.test(opt) ||
      /^\(\s*Graph\s*[A-D]\s*\)/i.test(opt) ||
      /^Graph\s*[A-D]\s*[:\-–—]/i.test(opt) ||
      /\(Graph\/diagram\s*[—\-]\s*attach image/i.test(opt)
    ) {
      continue
    }
    n += 1
  }
  return n
}

/** @param {string} [type] */
export function isFixedAnswerQuestionType(type) {
  return type === 'integer' || type === 'numerical' || type === 'matrix_match'
}

/**
 * Stem with no real Aâ€“D options â€” student enters an integer (JEE integer type).
 * @param {string} text
 * @param {string[]} [options]
 */
/**
 * Stem wording is baked into the uploaded/cropped image â€” hide separate text in UI.
 * @param {Object} [q]
 * @param {string} [q.questionImage]
 * @param {boolean} [q.stemTextInImage]
 * @param {boolean} [q.stemImageCrop]
 */
export function shouldHideStemTextWithImage(q) {
  if (!q?.questionImage?.trim()) return false
  /** Diagram-only crop (split tool) — show OCR text below the figure. */
  return q.stemTextInImage === true
}

export function looksLikeIntegerValueQuestion(text, options = []) {
  const stem = String(text ?? '').trim()
  if (!stem) return false
  if (countRealMcqOptions(stem, options) >= 2) return false
  // Generic SCQ prompts — never IVQ (any subject / any future question)
  if (/\bis\s+equal\s+to\s*[-–—:]\s*$/i.test(stem)) return false
  if (/\bequals?\s*[:-–—]\s*$/i.test(stem)) return false
  if (/\b(?:is|are)\s*[-–—:]\s*$/i.test(stem)) return false
  if (
    /[®©@]\s*\)/.test(stem) ||
    (/\b\d+\s*\/\s*\d+/.test(stem) && /\bis\s+equal\s+to/i.test(stem))
  ) {
    return false
  }
  if (/coplanar/i.test(stem) && /vector/i.test(stem)) return false
  if (/\binteger\s+(?:type|value)\b/i.test(stem)) return true
  if (/\b(?:is\s+equal\s+to|equals?)\s*$/i.test(stem)) return true
  if (/\bnumber\s+of\s+.+\s+is\s+equal\s+to\b/i.test(stem)) return true
  if (/\bfind\s+the\s+(?:value|number|number\s+of)\b/i.test(stem) && !/\(\s*[A-D]\s*\)/i.test(stem)) {
    return true
  }
  if (/\bthen\s+absolute\s+value\s+of\b/i.test(stem) && /\bis\s*$/i.test(stem)) return true
  if (
    /\babsolute\s+value\s+of\b/i.test(stem) &&
    (/\|\s*\([^)]*A[^)]*\)/i.test(stem) || /\\frac\{\|/i.test(stem))
  ) {
    return true
  }
  return false
}

export function shouldAutoAttachUploadScreenshot(stem, extractedRaw = '', optionsFound = 0, options = []) {
  /** Graph questions: crop diagram separately; do not attach full-page screenshot. */
  if (stemLikelyNeedsDiagramImage(stem, extractedRaw)) return false
  if (countRealMcqOptions(stem, options) >= 4) return false
  const blob = `${stem}\n${extractedRaw}`
  if (looksLikeDeterminantQuestion(blob) && countRealMcqOptions(stem, options) >= 2) return false
  if (looksLikeSurjectiveNotInjectiveMcq(blob)) return false
  if (looksLikeFxPlusOneTimesEightMcq(blob)) return false
  if (looksLikeFRplusPowFunctionMcq(blob)) return false
  if (looksLikeMinSinAbsGiPeriodMcq(blob) && countRealMcqOptions(stem, options) >= 4) return false
  if (/\\begin\{vmatrix\}/i.test(stem) && String(stem).trim().length > 60) return false
  return optionsFound < 4 || countRealMcqOptions(stem, options) < 4
}

/**
 * OCR already captured stem as LaTeX (+ numeric options) — hide full-page upload in stem preview.
 * @param {string} stem
 * @param {string[]} [options]
 * @param {string} [extractedRaw]
 */
export function shouldHideUploadScreenshotInStemPreview(stem = '', options = [], extractedRaw = '') {
  const s = String(stem ?? '').trim()
  if (!s || s.length < 35) return false
  const blob = `${s}\n${extractedRaw ?? ''}`
  const mcq = countRealMcqOptions(s, options)
  if (looksLikeDeterminantQuestion(blob)) {
    if (/\\begin\{vmatrix\}/i.test(s)) return true
    if (mcq >= 2) return true
  }
  if (looksLikeMatrixAlgebraQuestion(blob) && /\\begin\{vmatrix\}/i.test(s) && mcq >= 2) {
    return true
  }
  if (looksLikeSurjectiveNotInjectiveMcq(blob) && mcq >= 4) return true
  if (looksLikeFxPlusOneTimesEightMcq(blob) && mcq >= 4) return true
  if (looksLikeFRplusPowFunctionMcq(blob) && mcq >= 4) return true
  if (stemSaysOptionsAreFigures(s) && s.length >= 35) return true
  if (mcq >= 4) return true
  if (mcq >= 2 && s.length > 100) return true
  return false
}

/**
 * OCR should fill question text, then open split tool for graph-only crop.
 * @param {string} stem
 * @param {string} [extractedRaw]
 * @param {string[]} [options]
 */
/**
 * After OCR, open split tool to crop diagram only (text + MCQ options stay from OCR).
 * Applies to integer/numerical and to SCQ/MSQ with a circuit, graph, or figure.
 */
export function shouldUseDiagramSplitWorkflow(stem, extractedRaw = '', options = []) {
  if (stemLikelyNeedsDiagramImage(stem, extractedRaw)) return true
  const blob = `${stem ?? ''}\n${extractedRaw ?? ''}`
  const mcq = countRealMcqOptions(stem, options)
  if (mcq >= 2 && /\b(?:projectile|platform|horizontal|thrown|lands?\s+on)\b/i.test(blob)) {
    return true
  }
  if (mcq < 2 && looksLikeIntegerValueQuestion(stem, options)) {
    if (/\b(?:as\s+shown|figure|graph|diagram|plot|sketch|shown\s+below)\b/i.test(blob)) {
      return true
    }
  }
  return false
}
