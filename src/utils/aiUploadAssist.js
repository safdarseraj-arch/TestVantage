/**
 * AI Upload Assist — smart multi-pass upload pipeline.
 * Classifies OCR, splits stem/options/columns/passage, heals gaps, and scores readiness.
 * Runs locally (no cloud API) using the existing OCR + repair stack.
 */

import {
  classifyUploadFromOcr,
  inferUploadQuestionType,
  labelForUploadType,
  looksLikeMcqOptionsInBlob } from './classifyUploadFromOcr.js'
import { looksLikeInverseFunctionMcq } from './repairInverseFunctionMcqOcr.js'
import { looksLikeFunctionPropertyMcq } from './repairFunctionPropertyMcqOcr.js'
import { healStoredMcqQuestion } from './healStoredMcq.js'
import { autoRectifyUpload, assessUploadQualityFull } from './uploadErrorBrain.js'
import { assessPostRepairStatus } from './uploadRepairEscalation.js'
import { uploadNeedsReview, resolveUploadBannerTone } from './uploadStatus.js'
import {
  countFilledMatrixRowsNormalized,
  healMatrixQuestion,
  parseMatchColumnUpload,
  resolveMatchColumnUpload } from './parseMatchColumnUpload.js'
import { resolvePassageUpload } from './parsePassageUpload.js'
import { countRealMcqOptions } from './stemDiagramDetect.js'
import { reparseMcqUpload, planUploadImageActions } from './uploadPipeline.js'
import { validateQuestionReadiness } from './questionReadiness.js'
import { pageNeedsOnnxBoost } from './hybridOcrNeeds.js'
import { looksLikeGarbledMathLine } from './hybridOcrMerge.js'
import { shouldUseLocalOcrQualityBoost } from './ocrSettings.js'
import { enrichParsedWithAnswerProvenance } from './answerProvenance.js'
import { scoreUploadFieldConfidence } from './uploadFieldConfidence.js'

/**
 * @param {import('./parseMatchColumnUpload.js').MatchColumnParse | null | undefined} parsed
 * @param {string} rawOcr
 */
export function enhanceMatrixParse(parsed, rawOcr) {
  /** @type {string[]} */
  const steps = []
  if (!parsed?.matrixRows?.length) {
    return { parsed, improved: false, steps }
  }

  let best = parsed
  const countCols = (p) => (p?.matrixCols ?? []).filter((c) => String(c ?? '').trim()).length
  const beforeCols = countCols(best)

  const tryHeal = (candidate) => {
    const healed = healMatrixQuestion({
      questionType: 'matrix_match',
      text: candidate.stem ?? 'Match the Column',
      matrixRows: candidate.matrixRows,
      matrixCols: candidate.matrixCols,
      matrixColLabels: candidate.matrixColLabels,
      ocrRawText: rawOcr,
      extractedRaw: rawOcr })
    return {
      ...candidate,
      matrixRows: healed.matrixRows ?? candidate.matrixRows,
      matrixCols: healed.matrixCols ?? candidate.matrixCols,
      matrixColLabels: healed.matrixColLabels ?? candidate.matrixColLabels }
  }

  best = tryHeal(best)
  if (countCols(best) > beforeCols) {
    steps.push(`Column II filled (${beforeCols}→${countCols(best)} entries)`)
  }

  const reparsed = resolveMatchColumnUpload(rawOcr) ?? parseMatchColumnUpload(rawOcr)
  if (reparsed) {
    const rowsBefore = countFilledMatrixRowsNormalized(best)
    const rowsAfter = countFilledMatrixRowsNormalized(reparsed)
    const colsAfter = countCols(reparsed)
    if (rowsAfter > rowsBefore || colsAfter > countCols(best)) {
      best = tryHeal(reparsed)
      steps.push('Re-parsed match-the-column layout from OCR')
    }
  }

  const improved = countCols(best) > beforeCols || countFilledMatrixRowsNormalized(best) > countFilledMatrixRowsNormalized(parsed)
  if (improved && !steps.length) steps.push('Matrix layout optimized')

  return { parsed: best, improved, steps }
}

/**
 * @param {{ stem?: string, options?: string[], rawOcr?: string, engine?: string, questionType?: string }} ctx
 */
export function enhanceMcqFromOcr(ctx = {}) {
  /** @type {string[]} */
  const steps = []
  const rawOcr = String(ctx.rawOcr ?? '').trim()
  let stem = String(ctx.stem ?? '').trim()
  let options = [...(ctx.options ?? ['', '', '', ''])]
  while (options.length < 4) options.push('')

  const beforeFound = countRealMcqOptions(stem, options)
  const beforeFilled = options.filter((o) => String(o ?? '').trim()).length
  const beforeComplete = beforeFilled >= 4 && beforeFound >= 4

  const rectified = autoRectifyUpload({
    stem,
    options,
    rawOcr,
    questionType: ctx.questionType ?? 'single_correct',
    engine: ctx.engine ?? 'builtin',
    maxPasses: 2 })
  /** @type {{ fixId: string, improved: boolean, step?: string, errorsBefore: number, errorsAfter: number }[]} */
  const repairAttempts = [...(rectified.repairAttempts ?? [])]
  if (rectified.improved) {
    stem = rectified.stem || stem
    options = [...rectified.options]
    while (options.length < 4) options.push('')
    steps.push(...rectified.steps)
  }

  if (rawOcr) {
    const reparsed = reparseMcqUpload(rawOcr, { engine: ctx.engine ?? 'builtin', minFound: beforeFound })
    if (!reparsed.parsed?.multi) {
      const repFound = reparsed.found ?? countRealMcqOptions(reparsed.parsed?.text, reparsed.parsed?.options)
      const repFilled = (reparsed.parsed?.options ?? []).filter((o) => String(o ?? '').trim()).length
      const better =
        repFound > beforeFound ||
        repFilled > beforeFilled ||
        (!beforeComplete && repFilled >= 4) ||
        (!stem && String(reparsed.parsed?.text ?? '').trim())
      if (better) {
        stem = String(reparsed.parsed?.text ?? stem).trim() || stem
        options = [...(reparsed.parsed?.options ?? options)]
        while (options.length < 4) options.push('')
        steps.push(reparsed.recovered ? 'AI recovered stem/options (2nd pass)' : 'AI re-parsed stem and A–D options')
      }
    }
  }

  const healed = healStoredMcqQuestion({
    questionType: ctx.questionType ?? 'single_correct',
    text: stem,
    options,
    ocrRawText: rawOcr,
    extractedRaw: rawOcr })
  const afterHeal = countRealMcqOptions(healed.text, healed.options)
  if (afterHeal > countRealMcqOptions(stem, options)) {
    stem = String(healed.text ?? stem).trim() || stem
    options = [...(healed.options ?? options)]
    while (options.length < 4) options.push('')
    steps.push('AI filled missing MCQ options from OCR')
  }

  const found = countRealMcqOptions(stem, options)
  const filled = options.filter((o) => String(o ?? '').trim()).length
  const improved =
    found > beforeFound ||
    filled > beforeFilled ||
    (!beforeComplete && filled >= 4) ||
    steps.length > 0
  return {
    stem,
    options: options.slice(0, 6),
    steps,
    found,
    improved,
    repairAttempts,
    initialErrors: rectified.initialErrors ?? [] }
}

/**
 * Full AI assist pass on raw OCR (classification + quality + image plan).
 * @param {string} rawOcr
 * @param {{ engine?: string, hasSourceImage?: boolean, questionType?: string }} [opts]
 */
export function runAiUploadAssist(rawOcr, opts = {}) {
  const raw = String(rawOcr ?? '').replace(/\r\n/g, '\n').trim()
  /** @type {string[]} */
  const steps = []

  if (!raw || raw.length < 12) {
    return {
      ok: false,
      detectedType: 'unknown',
      steps: ['OCR text too short — upload a clearer image or paste text.'],
      quality: null,
      imagePlan: null }
  }

  const classified = classifyUploadFromOcr(raw, { engine: opts.engine ?? 'builtin' })
  steps.push(`Detected type: ${labelForUploadType(classified.detectedType)}`)

  /** @type {import('./parseMatchColumnUpload.js').MatchColumnParse | null} */
  let matrixParsed = classified.matrixParsed ?? null
  if (classified.detectedType === 'matrix_match' && matrixParsed) {
    const enhanced = enhanceMatrixParse(matrixParsed, raw)
    matrixParsed = enhanced.parsed
    steps.push(...enhanced.steps)
  }

  let stem = ''
  let options = ['', '', '', '']
  let passageParsed = classified.passageParsed ?? null
  /** @type {{ fixId: string, improved: boolean, step?: string, errorsBefore: number, errorsAfter: number }[]} */
  let repairAttempts = []
  /** @type {ReturnType<typeof detectUploadErrors>} */
  let initialErrors = []
  const initialStem = classified.parsed?.text ?? opts.stem ?? ''
  const initialOptions = [...(classified.parsed?.options ?? opts.options ?? ['', '', '', ''])]

  if (opts.skipEnhanceHeal && String(opts.stem ?? '').trim()) {
    stem = String(opts.stem).trim()
    options = [...(opts.options ?? ['', '', '', ''])]
    while (options.length < 4) options.push('')
  } else if (classified.parsed && !classified.parsed.multi) {
    const mcq = enhanceMcqFromOcr({
      stem: classified.parsed.text,
      options: classified.parsed.options,
      rawOcr: raw,
      engine: opts.engine,
      questionType: classified.detectedType })
    stem = mcq.stem
    options = mcq.options
    steps.push(...mcq.steps)
    repairAttempts.push(...(mcq.repairAttempts ?? []))
    initialErrors = mcq.initialErrors ?? []
  }

  if (classified.detectedType === 'passage_integer' || classified.detectedType === 'passage_scq') {
    passageParsed = resolvePassageUpload(raw, classified.polished, { allowOptionless: true })
    const subCount = passageParsed?.subQuestions?.length ?? 0
    steps.push(`Passage split: ${subCount} sub-question(s)`)
    for (const sq of passageParsed?.subQuestions ?? []) {
      if (!(sq.options ?? []).some((o) => String(o ?? '').trim())) continue
      const sub = enhanceMcqFromOcr({
        stem: sq.text,
        options: sq.options,
        rawOcr: raw,
        engine: opts.engine,
        questionType: 'passage_scq' })
      sq.text = sub.stem
      sq.options = sub.options
      if (sub.steps.length) steps.push(`Sub-question options improved`)
    }
  }

  const found = countRealMcqOptions(stem, options)
  let detectedType = classified.detectedType
  const reinferred = inferUploadQuestionType({
    stem,
    options,
    found,
    rawOcr: raw,
    suggestedQuestionType: classified.parsed?.suggestedQuestionType })
  if (
    (reinferred === 'single_correct' || reinferred === 'multiple_correct') &&
    (detectedType === 'integer' || detectedType === 'unknown')
  ) {
    detectedType = reinferred
    steps.push(`AI corrected type → ${labelForUploadType(detectedType)}`)
  }
  if (looksLikeMcqOptionsInBlob(`${stem}\n${raw}`) && detectedType === 'integer') {
    detectedType = 'single_correct'
    steps.push('AI corrected type → SCQ (A–D labels in OCR)')
  }
  if (looksLikeInverseFunctionMcq(`${stem}\n${raw}`) && detectedType === 'integer') {
    detectedType = 'single_correct'
    steps.push('AI corrected type → SCQ (inverse function MCQ)')
  }
  if (looksLikeFunctionPropertyMcq(`${stem}\n${raw}`) && detectedType === 'integer') {
    detectedType = 'single_correct'
    steps.push('AI corrected type → SCQ (function property MCQ)')
  }
  const imagePlan = planUploadImageActions({
    stem,
    options,
    extractedRaw: classified.polished ?? raw,
    questionType: opts.questionType ?? detectedType })

  if (imagePlan.attemptDiagramAutoCrop) steps.push('Diagram/graph detected — auto-crop recommended')
  if (imagePlan.attemptOptionsAutoCrop)
    steps.push('Graph options detected — auto-crop A–D runs automatically (Cloud vision when ready)')

  const quality = assessUploadQualityFull({
    detectedType,
    questionType: opts.questionType ?? detectedType,
    rawOcr: raw,
    polished: classified.polished,
    stem,
    options,
    matrixParsed,
    passageParsed,
    hasSourceImage: !!opts.hasSourceImage,
    diagramAutoCropped: !!opts.diagramAutoCropped,
    optionsAutoCropped: opts.optionsAutoCropped ?? 0 })

  if (quality.readyToSave) steps.push('Upload quality check passed')
  else if (quality.issues.length) {
    steps.push(`Review: ${quality.issues.filter((i) => i.severity === 'error').length} issue(s) before Save`)
  }

  const conf = quality.confidence ?? 0
  const garbled =
    pageNeedsOnnxBoost(raw) ||
    raw.split('\n').some((line) => looksLikeGarbledMathLine(line))
  if (opts.hasSourceImage && garbled && conf < 72) {
    steps.push('Local LaTeX boost recommended — click **Re-extract OCR** for a second hybrid pass')
  }
  if (shouldUseLocalOcrQualityBoost() && opts.hasSourceImage && conf < 80) {
    steps.push('Auto quality boost will run extra ONNX crops on Re-extract if needed (no cloud API)')
  }

  const escalation = assessPostRepairStatus({
    stem,
    options,
    rawOcr: raw,
    questionType: opts.questionType ?? detectedType,
    repairSteps: steps,
    repairAttempts,
    initialStem,
    initialOptions,
    initialErrors })
  if (escalation.needsAgentRepair && escalation.escalationSummary) {
    steps.push(escalation.escalationSummary)
  }

  const provenance = enrichParsedWithAnswerProvenance(
    {
      text: stem,
      options,
      correctIndex: classified.parsed?.correctIndex,
      correctIndices: classified.parsed?.correctIndices,
      solution: classified.parsed?.solution,
      answerSource: classified.parsed?.answerSource,
      solutionSource: classified.parsed?.solutionSource,
    },
    raw,
  )
  if (provenance.answerSource === 'from_paper') {
    steps.push('Answer key detected from paper')
  } else if (provenance.answerSource === 'ai_generated') {
    steps.push('Answer suggested by local AI — verify before save')
  }
  if (provenance.solution && provenance.solutionSource === 'from_paper') {
    steps.push('Solution text found on paper')
  } else if (provenance.solution && provenance.solutionSource === 'draft') {
    steps.push('Step-by-step solution draft ready — use Regenerate for deeper AI solution')
  } else if (provenance.solution && provenance.solutionSource === 'ai_generated') {
    steps.push('AI solution generated — review carefully')
  }

  if (opts.ocrEngine === 'cloud-vision') {
    steps.unshift('Read with Cloud vision (handwriting / dense page assist)')
  } else if (opts.ocrEngine && opts.ocrEngine !== 'word' && opts.ocrEngine !== 'pptx') {
    steps.unshift('Read with Local OCR')
  }

  const fieldConfidence = scoreUploadFieldConfidence({
    text: stem,
    options,
    correctIndex: provenance.correctIndex,
    correctIndices: provenance.correctIndices,
    correctInteger: provenance.correctInteger,
    correctNumerical: provenance.correctNumerical,
    solution: provenance.solution,
    answerSource: provenance.answerSource,
    answerConfidence: provenance.answerConfidence,
    solutionConfidence: provenance.solutionConfidence,
    uploadQualityScore: quality.confidence,
    _ocrSource: raw,
  })
  if (fieldConfidence.needsManualCheck) {
    steps.push(
      `Flagged for manual check: ${fieldConfidence.lowConfidenceFields.join(', ') || 'overall'}`,
    )
  }

  return {
    ok: classified.ok,
    detectedType,
    inferredType: quality.inferredType,
    classified,
    matrixParsed,
    passageParsed,
    stem,
    options,
    rawOcr: raw,
    quality,
    imagePlan,
    steps: [...new Set(steps.filter(Boolean))],
    escalation,
    repairAttempts,
    initialStem,
    initialOptions,
    initialErrors,
    answerSource: provenance.answerSource,
    solutionSource: provenance.solutionSource,
    correctIndex: provenance.correctIndex,
    correctIndices: provenance.correctIndices,
    solution: provenance.solution,
    fieldConfidence,
    ocrEngine: opts.ocrEngine || opts.engine || 'builtin',
  }
}

/**
 * @param {{
 *   detectedType?: string
 *   quality?: ReturnType<typeof assessUploadQuality> | null
 *   steps?: string[]
 *   confidence?: number
 * }} report
 */
export function formatAiUploadSummary(report) {
  if (!report) return ''
  const conf = report.quality?.confidence ?? report.confidence
  const type = labelForUploadType(report.detectedType ?? 'unknown')
  const head =
    conf != null
      ? `AI Upload Assist — ${type} · quality ${conf}/100`
      : `AI Upload Assist — ${type}`
  const tips = report.quality?.issues
    ?.filter((i) => i.severity !== 'info')
    .slice(0, 2)
    .map((i) => i.message)
  return [head, ...(tips ?? [])].filter(Boolean).join(' · ')
}

/**
 * @param {import('../data/tests').Question} draft
 */
export function aiReadinessCheck(draft) {
  const { ok, issues } = validateQuestionReadiness(draft)
  const errors = issues.filter((i) => i.severity === 'error')
  const warns = issues.filter((i) => i.severity === 'warn')
  return {
    ok,
    blockSave: errors.length > 0,
    issues: issues.map((i) => i.message),
    errors: errors.map((i) => i.message),
    warns: warns.map((i) => i.message) }
}

/**
 * @param {ReturnType<typeof runAiUploadAssist>} assist
 */
export function buildAiUploadReport(assist) {
  if (!assist) return null
  const escalation =
    assist.escalation ??
    assessPostRepairStatus({
      stem: assist.stem,
      options: assist.options,
      rawOcr: assist.rawOcr,
      questionType: assist.detectedType,
      repairSteps: assist.steps ?? [],
      repairAttempts: assist.repairAttempts ?? assist.healed?.repairAttempts ?? [],
      initialStem: assist.initialStem ?? assist.healed?.initialStem,
      initialOptions: assist.initialOptions ?? assist.healed?.initialOptions,
      initialErrors: assist.initialErrors ?? assist.healed?.initialErrors })
  return {
    detectedType: assist.detectedType,
    confidence: assist.quality?.confidence ?? escalation.confidence ?? 0,
    readyToSave: (assist.quality?.readyToSave ?? false) && !escalation.needsAgentRepair,
    needsReview: uploadNeedsReview(assist.quality, escalation),
    bannerTone: resolveUploadBannerTone(assist.quality, escalation),
    steps: assist.steps ?? [],
    issues: assist.quality?.issues ?? [],
    fixActions: assist.fixActions ?? [],
    needsReExtract: !!assist.needsReExtract,
    needsAgentRepair: escalation.needsAgentRepair,
    repairTicket: escalation.repairTicket,
    repairTicketText: escalation.repairTicketText,
    escalationSummary: escalation.escalationSummary,
    answerSource: assist.answerSource,
    solutionSource: assist.solutionSource,
    ocrEngine: assist.ocrEngine,
    fieldConfidence: assist.fieldConfidence,
    summary: formatAiUploadSummary({
      detectedType: assist.detectedType,
      quality: assist.quality,
      steps: assist.steps }) }
}
