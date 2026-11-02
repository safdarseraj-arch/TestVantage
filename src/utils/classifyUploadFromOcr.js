/**
 * Unified upload type detection + quality gate (Physics, Chemistry, Math, Biology).
 * Used by QuestionBank, uploadPipeline, and regression tests.
 */
import { detectBrokenBankStem } from './stemBankGuard.js'
import { countRealMcqOptions, countMcqAnswerSlots, shouldAttemptDiagramAutoCrop, looksLikeIntegerValueQuestion, countFilledMcqOptionsForPublish } from './stemDiagramDetect.js'
import {
  countGraphOptionsNeedingImage,
  shouldAttemptOptionsAutoCrop,
} from './graphOptionOcr.js'
import {
  countFilledMatrixRowsNormalized,
  looksLikeMatchColumnUpload,
  looksLikeMatrixAlgebraQuestion,
  parseMatchColumnUpload,
} from './parseMatchColumnUpload.js'
import { looksLikePassageMultiMcq, resolvePassageUpload } from './parsePassageUpload.js'
import { parseBulkQuestions } from './parseBulkQuestions.js'
import { parseSingleQuestionUpload } from './parseSingleQuestionUpload.js'
import { looksLikeDeterminantQuestion } from './repairDeterminantOcr.js'
import { looksLikeDeterminantMcq } from './repairDeterminantMcqOcr.js'
import { looksLikeF0MoebiusFunctionalMcq } from './repairF0MoebiusFunctionalMcqOcr.js'
import { looksLikeCoplanarVectorsUnitMcq } from './repairCoplanarVectorsUnitMcqOcr.js'
import { looksLikeCoplanarAlphaBetaRatioMcq } from './repairCoplanarAlphaBetaRatioMcqOcr.js'
import { looksLikePlaneCentroidAxesMcq } from './repairPlaneCentroidAxesMcqOcr.js'
import { looksLikeParallelPlanesAngleMcq } from './repairParallelPlanesAngleMcqOcr.js'
import { looksLikePqrsPerpVectorMcq } from './repairPqrsPerpVectorMcqOcr.js'
import { looksLikeAngleBisectorMag36Mcq } from './repairAngleBisectorMag36McqOcr.js'
import {
  looksLikeGarbledMcqOptionBand,
  looksLikeMcqMisreadAsInteger,
  looksLikeMcqPromptNotInteger,
  normalizeGarbledMcqOptionMarkers,
} from './repairMcqMisreadAsInteger.js'
import { polishExtractedText } from './ocrExtractPolish.js'
import { cleanStemMergedOptionGarbage } from './optionStemLeak.js'
import { mcqLaterOptionsLookTruncated } from './mcqOptionCompleteness.js'

export { cleanStemMergedOptionGarbage }

/** @typedef {'single_correct'|'multiple_correct'|'matrix_match'|'integer'|'numerical'|'passage_integer'|'passage_scq'|'bulk'|'unknown'} UploadTypeId */

/**
 * Strip semiperimeter / determinant cell notation so (s-a) is not counted as option (A).
 * @param {string} text
 */
function scrubNonMcqParenLabels(text) {
  return String(text ?? '').replace(/\(\s*s\s*-\s*[abc]\s*\)/gi, '')
}

/**
 * Count (A)…(D) option labels in OCR text (tolerates garbled OCR).
 * @param {string} text
 */
export function countMcqOptionLabelsInText(text) {
  const t = scrubNonMcqParenLabels(text)
  let count = 0
  for (const letter of ['A', 'B', 'C', 'D']) {
    if (new RegExp(`\\(\\s*${letter}\\s*\\)`, 'i').test(t)) count += 1
    else if (letter === 'B' && /(?<![a-z-])\bB\s*\)/i.test(t)) count += 1
    else if (letter === 'C' && /(?<![a-z-])\bC\s*\)/i.test(t)) count += 1
    else if (letter === 'D' && /(?<![a-z-])\bD\s*[a-z]{0,2}\s*$/im.test(t)) count += 1
  }
  return count
}

/** @param {string} blob stem + raw OCR */
export function looksLikeMcqOptionsInBlob(blob) {
  const t = scrubNonMcqParenLabels(normalizeGarbledMcqOptionMarkers(blob))
  if (countMcqOptionLabelsInText(t) >= 2) return true
  const labelHits = (t.match(/\(\s*[A-D]\s*\)/gi) ?? []).length
  if (labelHits >= 2) return true
  /** Single (D) + graph-style √ options still means SCQ with image options. */
  if (labelHits >= 1 && /\\sqrt|√|\bell\b|tetrahedron|regular\s+tetrahedron/i.test(t)) return true
  if (looksLikeGarbledMcqOptionBand(t)) return true
  return false
}

/**
 * OCR parse failed but screenshot is clearly a graph MCQ (A–D crops, garbled tail, etc.).
 * @param {{
 *   stem?: string
 *   options?: string[]
 *   rawOcr?: string
 *   optionsAutoCropped?: number
 *   optionImages?: (string|null)[]
 * }} ctx
 */
export function isMcqLikeFromOcr(ctx = {}) {
  const stem = String(ctx.stem ?? '').trim()
  const rawOcr = String(ctx.rawOcr ?? '').trim()
  const blob = `${stem}\n${rawOcr}`
  const opts = ctx.options ?? []

  if (looksLikeMcqOptionsInBlob(blob)) return true
  if (looksLikeMcqMisreadAsInteger(blob)) return true
  if (looksLikeMcqPromptNotInteger(stem)) return true
  if ((ctx.optionsAutoCropped ?? 0) >= 2) return true
  if ((ctx.optionImages ?? []).filter((img) => !!String(img ?? '').trim()).length >= 2) return true
  if (
    /\b(?:minimum|maximum|distance|length|value|equal)\b[\s\S]{0,100}\b(?:is|are)\s*[-–—:]/i.test(
      stem,
    )
  ) {
    return true
  }
  if (/[®©@]|[-/]{2,}/.test(stem) && (/\(\s*[A-D]\s*\)/i.test(blob) || /[®©@]\s*\)/.test(blob))) {
    return true
  }
  if (opts.some((o) => /[®©@]|[-/]{2,}/.test(String(o ?? ''))) && /\(\s*[A-D]\s*\)|[®©@]\s*\)/i.test(blob)) {
    return true
  }
  if (/\bell\b|tetrahedron|regular\s+tetrahedron/i.test(blob) && /\(\s*[A-D]\s*\)/i.test(blob)) {
    return true
  }
  if (/coplanar/i.test(blob) && /vector/i.test(blob) && /5\s*\/\s*\d|[®©@]/.test(blob)) {
    return true
  }
  return false
}

/**
 * Fix integer/numerical mis-detect when OCR clearly has MCQ options.
 * @param {UploadTypeId | string} type
 * @param {Parameters<typeof isMcqLikeFromOcr>[0]} ctx
 */
export function correctUploadTypeForOcr(type, ctx = {}) {
  if (type === 'matrix_match' || String(type).startsWith('passage')) return type
  if (
    (type === 'integer' || type === 'numerical' || type === 'unknown') &&
    isMcqLikeFromOcr(ctx)
  ) {
    return 'single_correct'
  }
  return type
}

/** Calculus MCQ: f(x), g(f(x)), "Then g(2) is" with A–D in OCR. */
export function looksLikeCalculusMcqStem(blob) {
  const t = String(blob ?? '')
  if (!looksLikeMcqOptionsInBlob(t)) return false
  if (
    /\b(?:let|if)\s+[a-z]\s*\([^)]*\)\s*=/i.test(t) &&
    /\bg\s*\(\s*f\s*\(/i.test(t) &&
    /\bthen\s+[a-z]\s*\([^)]*\)\s+is\b/i.test(t)
  ) {
    return true
  }
  if (/\\ln\s*\(|\\ln\\left/i.test(t) && /\bthen\s+g\s*\(/i.test(t)) return true
  return false
}

/**
 * @param {string} text
 * @param {string[]} [options]
 */
export function looksLikeNumericalValueQuestion(text, options = []) {
  const stem = String(text ?? '').trim()
  if (!stem || countRealMcqOptions(stem, options) >= 2) return false
  if (/\bnumerical\s+(?:type|value)\b/i.test(stem)) return true
  if (/\b(?:upto|up\s+to)\s+(?:two|2)\s+decimal/i.test(stem)) return true
  if (/\bround(?:ed)?\s+(?:off|to)\s+(?:the\s+)?(?:nearest|two)/i.test(stem)) return true
  if (/\b(?:NVQ|numerical\s+answer)\b/i.test(stem)) return true
  if (/\bdecimal\s+places?\b/i.test(stem) && /\b(?:find|value|calculate)\b/i.test(stem)) return true
  return false
}

/**
 * Infer question type from parsed OCR (no expected type required).
 * @param {{
 *   suggestedQuestionType?: string
 *   found?: number
 *   stem?: string
 *   options?: string[]
 *   rawOcr?: string
 * }} ctx
 * @returns {UploadTypeId}
 */
export function inferUploadQuestionType(ctx = {}) {
  const stem = String(ctx.stem ?? '').trim()
  const opts = ctx.options ?? []
  const found = ctx.found ?? countRealMcqOptions(stem, opts)
  const rawOcr = String(ctx.rawOcr ?? '')
  const blob = `${stem}\n${rawOcr}`

  if (ctx.suggestedQuestionType === 'multiple_correct' && found >= 2) return 'multiple_correct'
  if (found >= 4) {
    return ctx.suggestedQuestionType === 'multiple_correct' ? 'multiple_correct' : 'single_correct'
  }
  if (found >= 2) {
    return ctx.suggestedQuestionType === 'multiple_correct' ? 'multiple_correct' : 'single_correct'
  }
  if (looksLikeNumericalValueQuestion(stem, opts) || /\bnumerical\b/i.test(blob)) return 'numerical'
  if (looksLikeDeterminantMcq(blob)) return 'single_correct'
  if (looksLikeF0MoebiusFunctionalMcq(blob)) return 'single_correct'
  if (looksLikeCoplanarVectorsUnitMcq(blob)) return 'single_correct'
  if (looksLikeCoplanarAlphaBetaRatioMcq(blob)) return 'single_correct'
  if (looksLikePlaneCentroidAxesMcq(blob)) return 'single_correct'
  if (looksLikeParallelPlanesAngleMcq(blob)) return 'single_correct'
  if (looksLikePqrsPerpVectorMcq(blob)) return 'multiple_correct'
  if (looksLikeAngleBisectorMag36Mcq(blob)) return 'single_correct'
  if (looksLikeMcqMisreadAsInteger(blob) || looksLikeMcqPromptNotInteger(stem)) return 'single_correct'
  if (isMcqLikeFromOcr({ stem, options: opts, rawOcr })) return 'single_correct'
  if (looksLikeIntegerValueQuestion(stem, opts)) return 'integer'
  if (looksLikeDeterminantQuestion(blob)) return 'integer'
  if (looksLikeMatrixAlgebraQuestion(blob)) return 'integer'
  if (/\(\s*[a-z]\s*-\s*[a-z]\s*\)\s+is\b/i.test(stem)) return 'integer'
  if (/\(\s*210d\s*\)\s+is\b/i.test(stem)) return 'integer'
  if (/\bthen\s+\(?[a-z]\s*-\s*[a-z]\)?\s+is\b/i.test(stem)) return 'integer'
  if (/\bis\s+equal\s+to\s*$/i.test(stem)) return 'integer'
  if (found < 2 && /\b(?:find|value|calculate|determine)\b/i.test(stem) && !/\(\s*[A-D]\s*\)/i.test(blob)) {
    return 'integer'
  }
  if (looksLikeMcqOptionsInBlob(blob) || looksLikeCalculusMcqStem(blob)) {
    return ctx.suggestedQuestionType === 'multiple_correct' ? 'multiple_correct' : 'single_correct'
  }
  if (isMcqLikeFromOcr({ stem, options: opts, rawOcr })) return 'single_correct'
  return found >= 2 ? 'single_correct' : 'integer'
}

/**
 * Full upload routing: type + parsed payloads.
 * @param {string} rawOcr
 * @param {{ engine?: string }} [opts]
 */
export function classifyUploadFromOcr(rawOcr, { engine = 'builtin' } = {}) {
  const raw = String(rawOcr ?? '').replace(/\r\n/g, '\n').trim()
  const polished = polishExtractedText(raw, engine)
  /** @type {Record<string, unknown>} */
  const details = { textLen: raw.length }

  if (!raw || raw.length < 12) {
    return { detectedType: 'unknown', polished, details, ok: false }
  }

  const bulk = parseBulkQuestions(polished)
  if (bulk.length > 1 && !looksLikePassageMultiMcq(raw)) {
    details.bulkCount = bulk.length
    return { detectedType: 'bulk', polished, details, ok: true, bulk }
  }

  if (looksLikeMatchColumnUpload(raw) && !looksLikeMatrixAlgebraQuestion(raw)) {
    const mtx = parseMatchColumnUpload(raw, polished)
    const rows = countFilledMatrixRowsNormalized(mtx ?? { matrixRows: [] })
    const cols = (mtx?.matrixCols ?? []).filter((c) => String(c ?? '').trim()).length
    details.rows = rows
    details.cols = cols
    return {
      detectedType: 'matrix_match',
      polished,
      details,
      ok: rows >= 2,
      matrixParsed: mtx,
    }
  }

  // Known single-vector SCQs — never route as passage.
  if (looksLikeAngleBisectorMag36Mcq(raw) || looksLikeAngleBisectorMag36Mcq(polished)) {
    const parsed = parseSingleQuestionUpload(polished, raw)
    const found =
      parsed.optionsFound ?? (parsed.options ?? []).filter((o) => String(o ?? '').trim()).length
    details.found = found
    return {
      detectedType: 'single_correct',
      polished,
      details,
      ok: true,
      parsed,
    }
  }

  // Passage only with a real 2+ sub-question split. A lone "Passage:" / cue + one A–D set is MCQ.
  const looksPassage = looksLikePassageMultiMcq(raw)
  const passageHeader = /\b(?:Passage|Comprehension|Paragraph)\s*:/i.test(raw)
  if (looksPassage || passageHeader) {
    const passage = resolvePassageUpload(raw, polished, { allowOptionless: true })
    const subCount = passage?.subQuestions?.length ?? 0
    if (subCount >= 2) {
      const hasOpts = passage?.subQuestions?.some((sq) =>
        (sq.options ?? []).some((o) => String(o ?? '').trim()),
      )
      details.subCount = subCount
      return {
        detectedType: hasOpts ? 'passage_scq' : 'passage_integer',
        polished,
        details,
        ok: true,
        passageParsed: passage,
      }
    }
    // Strong multi-stem detector but split failed, and no A–D options → keep as passage (Needs review).
    if (looksPassage && !/\(\s*[A-D]\s*\)/i.test(raw)) {
      details.subCount = 0
      return {
        detectedType: 'passage_integer',
        polished,
        details,
        ok: false,
        passageParsed: passage,
      }
    }
    // Fall through: single MCQ / integer parse (e.g. Passage: + one SCQ).
  }

  const parsed = parseSingleQuestionUpload(polished, raw)
  const found =
    parsed.optionsFound ?? (parsed.options ?? []).filter((o) => String(o ?? '').trim()).length
  const stem = String(parsed.text ?? '').trim()
  details.found = found
  details.stemLen = stem.length

  const detectedType = inferUploadQuestionType({
    suggestedQuestionType: parsed.suggestedQuestionType,
    found,
    stem,
    options: parsed.options,
    rawOcr: raw,
  })

  return {
    detectedType,
    polished,
    details,
    ok: stem.length >= 15 || found >= 2,
    parsed,
  }
}

/**
 * Six-dimension upload quality check before Save.
 * @param {{
 *   detectedType?: UploadTypeId
 *   rawOcr?: string
 *   polished?: string
 *   stem?: string
 *   options?: string[]
 *   matrixParsed?: import('./parseMatchColumnUpload.js').MatchColumnParse | null
 *   passageParsed?: import('./parsePassageUpload.js').PassageParse | null
 *   hasSourceImage?: boolean
 *   questionType?: string
 *   optionsAutoCropped?: number
 *   diagramAutoCropped?: boolean
 * }} ctx
 */
export function assessUploadQuality(ctx = {}) {
  const stem = cleanStemMergedOptionGarbage(String(ctx.stem ?? '').trim())
  const options = ctx.options ?? []
  const optionImages = ctx.optionImages ?? []
  const rawOcr = String(ctx.rawOcr ?? '')
  const polished = String(ctx.polished ?? ctx.rawOcr ?? '')
  const detectedType = ctx.detectedType ?? ctx.questionType ?? 'unknown'
  const found = Math.max(
    countRealMcqOptions(stem, options),
    countMcqAnswerSlots(stem, options, optionImages),
    countFilledMcqOptionsForPublish(options, optionImages),
  )
  /** @type {{ id: string, severity: 'error'|'warn'|'info', message: string }[]} */
  const issues = []

  const brokenStem = detectBrokenBankStem(stem)
  if (brokenStem.length) {
    issues.push({
      id: 'latex-broken',
      severity: 'error',
      message: `LaTeX needs fix: ${brokenStem.slice(0, 2).join('; ')}`,
    })
  } else if (/[%\\](?:\s*2\b)|\bAABC\b|a'\s*\(\s*s-a/i.test(stem)) {
    issues.push({
      id: 'latex-garbled',
      severity: 'warn',
      message: 'LaTeX may be garbled — click **Parse question & options** or edit the stem.',
    })
  } else if (stem.length > 20 && !/\$|\\frac|\\begin|\\ce|\\sqrt|\\Delta/i.test(stem) && /[=^+\-*/0-9]/.test(stem)) {
    issues.push({
      id: 'latex-missing',
      severity: 'info',
      message: 'Math may need $…$ delimiters — use the symbol bar if preview looks wrong.',
    })
  }

  if (detectedType === 'integer' || detectedType === 'numerical') {
    if (looksLikeMcqOptionsInBlob(`${stem}\n${rawOcr}`)) {
      issues.push({
        id: 'type-mcq-not-integer',
        severity: 'error',
        message: 'Options (A)–(D) detected in OCR — change Type to **SCQ**, not integer.',
      })
    }
  }

  if (detectedType === 'single_correct' || detectedType === 'multiple_correct') {
    if (found < 4) {
      issues.push({
        id: 'options-incomplete',
        severity: 'error',
        message: `Options ${found}/4 — complete all A–D before Save.`,
      })
    } else if (mcqLaterOptionsLookTruncated(options, `${stem}\n${rawOcr}\n${options.join('\n')}`)) {
      issues.push({
        id: 'options-cd-truncated',
        severity: 'error',
        message: 'Options C/D look incomplete — re-parse or restore full text (e.g. “does not exist”).',
      })
    }
    if (options.some((o) => /^\|\s*\(\s*s-|\*?\|=\s*bp/i.test(String(o ?? '')))) {
      issues.push({
        id: 'options-false-split',
        severity: 'error',
        message: 'Options look like garbled math — click **Parse question & options** again.',
      })
    }
  }

  if (ctx.hasSourceImage) {
    const needsDiagram = shouldAttemptDiagramAutoCrop(stem, polished, options, detectedType)
    if (needsDiagram && !ctx.diagramAutoCropped && !ctx.questionImage) {
      issues.push({
        id: 'graph-stem',
        severity: 'warn',
        message: 'Diagram/graph detected — use **Crop graph / diagram** or wait for auto-crop.',
      })
    }
    if (
      (detectedType === 'single_correct' || detectedType === 'multiple_correct') &&
      (shouldAttemptOptionsAutoCrop(stem, options) || countGraphOptionsNeedingImage(options, [], stem) >= 2) &&
      (ctx.optionsAutoCropped ?? 0) < 2
    ) {
      issues.push({
        id: 'graph-options',
        severity: 'warn',
        message:
          'Graph options (A–D) — auto-crop runs automatically (Cloud vision when ready); use **Auto-crop A–D** to retry if previews are empty.',
      })
    }
  }

  if (detectedType === 'matrix_match') {
    const mtx = ctx.matrixParsed
    const rows = mtx ? countFilledMatrixRowsNormalized(mtx) : 0
    const cols = (mtx?.matrixCols ?? []).filter((c) => String(c ?? '').trim()).length
    if (rows < 3) {
      issues.push({
        id: 'mtc-rows',
        severity: rows < 2 ? 'error' : 'warn',
        message: `Match-the-Column rows ${rows}/4 — edit Column I or re-upload.`,
      })
    }
    if (cols < 4) {
      issues.push({
        id: 'mtc-cols',
        severity: cols < 2 ? 'error' : 'error',
        message: `Column II ${cols}/4 — all P–S entries required before Save.`,
      })
    }
    if ((mtx?.matrixRows ?? []).some((r) => /\(\s*[P-T]\s*\)/i.test(String(r ?? '')))) {
      issues.push({
        id: 'mtc-bleed',
        severity: 'warn',
        message: 'Column II text leaked into a row — edit that row in Column I.',
      })
    }
  }

  if (detectedType === 'passage_integer' || detectedType === 'passage_scq') {
    const subCount = ctx.passageParsed?.subQuestions?.length ?? 0
    if (subCount < 2) {
      issues.push({
        id: 'passage-split',
        severity: 'error',
        message: 'Passage split failed — use **Split passage (2+ Q)** or add line breaks between questions.',
      })
    }
  }

  const inferred = inferUploadQuestionType({
    stem,
    options,
    found,
    rawOcr,
    suggestedQuestionType:
      detectedType === 'multiple_correct' ? 'multiple_correct' : undefined,
  })
  if (
    ctx.questionType &&
    ctx.questionType !== detectedType &&
    ctx.questionType !== inferred &&
    !['passage_integer', 'passage_scq'].includes(String(ctx.questionType))
  ) {
    issues.push({
      id: 'type-mismatch',
      severity: 'warn',
      message: `Type may be **${labelForUploadType(inferred)}** — check the Type dropdown.`,
    })
  }

  const scores = {
    latex: issues.some((i) => i.id.startsWith('latex-') && i.severity === 'error') ? 0 : issues.some((i) => i.id.startsWith('latex-')) ? 60 : 100,
    optionSplit: issues.some((i) => i.id === 'options-incomplete' && i.severity === 'error') ? 0 : issues.some((i) => i.id.startsWith('options-')) ? 50 : found >= 4 || !['single_correct', 'multiple_correct'].includes(detectedType) ? 100 : 70,
    graphSplit: issues.some((i) => i.id.startsWith('graph-')) ? 55 : 100,
    mtcColumns: issues.some((i) => i.id === 'mtc-rows' && i.severity === 'error') ? 0 : issues.some((i) => i.id.startsWith('mtc-')) ? 60 : 100,
    passageSplit: issues.some((i) => i.id === 'passage-split') ? 0 : 100,
    typeId: issues.some((i) => i.id === 'type-mismatch') ? 65 : 100,
  }
  const confidence = Math.round(
    (scores.latex + scores.optionSplit + scores.graphSplit + scores.mtcColumns + scores.passageSplit + scores.typeId) / 6,
  )
  const blocking = issues.filter((i) => i.severity === 'error')
  const imageSlots = countMcqAnswerSlots(stem, options, optionImages)
  const optionsCropped = ctx.optionsAutoCropped ?? 0
  const readyByImages =
    (detectedType === 'single_correct' || detectedType === 'multiple_correct') &&
    (imageSlots >= 4 || (imageSlots >= 2 && optionsCropped >= 2) || ctx.imageFallbackApplied)

  const mcqReady =
    (detectedType === 'single_correct' || detectedType === 'multiple_correct') &&
    found >= 4 &&
    blocking.length === 0

  return {
    confidence: mcqReady ? Math.max(confidence, 78) : confidence,
    readyToSave: mcqReady || (blocking.length === 0 && confidence >= 68) || readyByImages,
    detectedType,
    inferredType: inferred,
    issues,
    scores,
  }
}

/** @param {UploadTypeId | string} typeId */
export function labelForUploadType(typeId) {
  const map = {
    single_correct: 'SCQ',
    true_false: 'T/F',
    multiple_correct: 'MCQ (multi-correct)',
    matrix_match: 'MTC',
    integer: 'IVQ (integer)',
    numerical: 'NVQ (numerical)',
    passage_integer: 'PIVQ (passage integer)',
    passage_scq: 'PSCQ (passage SCQ)',
    bulk: 'Bulk (multiple questions)',
    unknown: 'Unknown',
  }
  return map[typeId] ?? typeId
}

/**
 * Short user-facing summary for QuestionBank banner.
 * @param {ReturnType<typeof assessUploadQuality>} quality
 */
export function formatUploadQualityMessage(quality) {
  if (!quality?.issues?.length) {
    return quality?.readyToSave
      ? 'Upload looks good — review preview, then Save.'
      : 'Review the preview, then Save.'
  }
  const top = quality.issues.filter((i) => i.severity !== 'info').slice(0, 3)
  const parts = top.map((i) => i.message)
  if (quality.readyToSave) {
    return `${parts.join(' ')} You can still Save after a quick review.`
  }
  return `Before Save: ${parts.join(' ')}`
}
