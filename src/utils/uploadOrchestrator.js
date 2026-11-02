/**
 * Upload orchestrator — iterative AI heal, fix actions, and bulk scale helpers.
 * No cloud API; uses existing OCR + repair stack.
 */

import {
  assessUploadQuality,
  inferUploadQuestionType,
  labelForUploadType,
} from './classifyUploadFromOcr.js'
import { enhanceMcqFromOcr, runAiUploadAssist } from './aiUploadAssist.js'
import { countRealMcqOptions } from './stemDiagramDetect.js'
import { planUploadImageActions, processMcqUploadExtract, reparseMcqUpload } from './uploadPipeline.js'
import { healStoredMcqQuestion } from './healStoredMcq.js'
import { resolvePassageUpload, looksLikePassageMultiMcq } from './parsePassageUpload.js'
import { validateQuestionReadiness } from './questionReadiness.js'
import { autoRectifyUpload, assessUploadQualityFull, detectUploadErrors } from './uploadErrorBrain.js'
import { uploadRepairUrgency } from './uploadIssueDetectors.js'
import { assessPostRepairStatus } from './uploadRepairEscalation.js'

const MAX_HEAL_PASSES = 2

/**
 * Multi-pass extraction heal until quality stops improving or max passes.
 * @param {{
 *   rawOcr: string
 *   stem?: string
 *   options?: string[]
 *   engine?: string
 *   questionType?: string
 *   maxPasses?: number
 * }} ctx
 */
export function iterativeUploadHeal(ctx = {}) {
  let rawOcr = String(ctx.rawOcr ?? '').replace(/\r\n/g, '\n').trim()
  /** @type {string[]} */
  const steps = []
  /** @type {{ fixId: string, improved: boolean, step?: string, errorsBefore: number, errorsAfter: number }[]} */
  const repairAttempts = []
  let stem = String(ctx.stem ?? '').trim()
  let options = [...(ctx.options ?? ['', '', '', ''])]
  while (options.length < 4) options.push('')
  let questionType = ctx.questionType ?? 'single_correct'
  const initialStem = stem
  const initialOptions = [...options]
  const initialErrors = detectUploadErrors({ stem, options, rawOcr, questionType })
  const urgency = uploadRepairUrgency({ stem, options, rawOcr, questionType })
  const maxPasses = ctx.maxPasses ?? (urgency > 45 ? 3 : MAX_HEAL_PASSES)

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const beforeConf = scoreHealState(rawOcr, stem, options, questionType).confidence

    const rectified = autoRectifyUpload({
      stem,
      options,
      rawOcr,
      questionType,
      engine: ctx.engine ?? 'builtin',
      maxPasses: 1,
    })
    if (rectified.improved) {
      stem = rectified.stem || stem
      options = [...rectified.options]
      while (options.length < 4) options.push('')
      rawOcr = rectified.rawOcr || rawOcr
      questionType = rectified.questionType || questionType
      steps.push(...rectified.steps)
      repairAttempts.push(...(rectified.repairAttempts ?? []))
    }

    const mcq = enhanceMcqFromOcr({
      stem,
      options,
      rawOcr,
      engine: ctx.engine ?? 'builtin',
      questionType,
    })
    if (mcq.improved) {
      stem = mcq.stem || stem
      options = [...mcq.options]
      while (options.length < 4) options.push('')
      steps.push(...mcq.steps)
    }

    const healed = healStoredMcqQuestion({
      questionType,
      text: stem,
      options,
      ocrRawText: rawOcr,
      extractedRaw: rawOcr,
    })
    const afterHeal = countRealMcqOptions(healed.text, healed.options)
    if (afterHeal > countRealMcqOptions(stem, options) || (healed.text && healed.text !== stem)) {
      stem = String(healed.text ?? stem).trim() || stem
      options = [...(healed.options ?? options)]
      while (options.length < 4) options.push('')
      if (afterHeal > countRealMcqOptions(stem, options)) {
        steps.push('AI healed stem/options from OCR patterns')
      }
    }

    const found = countRealMcqOptions(stem, options)
    questionType = inferUploadQuestionType({ stem, options, found, rawOcr })
    const afterConf = scoreHealState(rawOcr, stem, options, questionType).confidence
    const filled = options.filter((o) => String(o ?? '').trim()).length
    if (afterConf >= 72 && found >= 4 && filled >= 4) break
    if (pass > 0 && afterConf <= beforeConf && !mcq.improved) break
  }

  const escalation = assessPostRepairStatus({
    stem,
    options,
    rawOcr,
    questionType,
    repairSteps: steps,
    repairAttempts,
    initialStem,
    initialOptions,
    initialErrors,
  })

  return {
    stem,
    options: options.slice(0, 6),
    found: countRealMcqOptions(stem, options),
    questionType,
    steps: [...new Set(steps)],
    improved: steps.length > 0,
    repairAttempts,
    initialStem,
    initialOptions,
    initialErrors,
    quality: scoreHealState(rawOcr, stem, options, questionType),
    escalation,
  }
}

function scoreHealState(rawOcr, stem, options, questionType) {
  return assessUploadQualityFull({
    detectedType: questionType,
    questionType,
    rawOcr,
    stem,
    options,
    hasSourceImage: true,
  })
}

export function retryPassageSplitAfterHeal(rawOcr, _engine = 'builtin') {
  if (!looksLikePassageMultiMcq(rawOcr)) return null
  const norm = String(rawOcr).replace(/\r\n/g, '\n').trim()
  let parsed = resolvePassageUpload(norm, norm, { allowOptionless: true })
  if (parsed?.subQuestions?.length >= 2) return { raw: norm, parsed }

  const relined = norm
    .replace(/([.!?])\s+(\d{1,2})[.)]\s+/g, '$1\n$2) ')
    .replace(/(\n|^)\s*Q\s*(\d+)\s*[:.)]/gi, '\nQ$2. ')
    .replace(/(\d+)\.\s*(?=[A-Za-z(])/g, '\n$1. ')
  parsed = resolvePassageUpload(relined, relined, { allowOptionless: true })
  if (parsed?.subQuestions?.length >= 2) return { raw: relined, parsed }
  return null
}

export function needsAutoReExtract(quality) {
  if (!quality) return false
  if (quality.readyToSave && quality.confidence >= 72) return false
  if (quality.confidence < 58) return true
  const ids = new Set((quality.issues ?? []).map((i) => i.id))
  if (ids.has('options-false-split') || ids.has('latex-garbled') || ids.has('latex-broken')) return true
  if (ids.has('option-embedded-marker') || ids.has('options-horizontal-ocr') || ids.has('stem-ocr-garble')) return true
  if (ids.has('options-incomplete') && quality.confidence < 72) return true
  return false
}

export function buildUploadFixActions(quality, imagePlan = null) {
  /** @type {{ id: string, label: string, auto?: boolean }[]} */
  const actions = []
  if (!quality) return actions

  for (const issue of quality.issues ?? []) {
    if (
      issue.id === 'options-incomplete' ||
      issue.id === 'options-false-split' ||
      issue.id === 'option-embedded-marker' ||
      issue.id === 'options-horizontal-ocr' ||
      issue.id === 'option-placeholder' ||
      issue.id === 'stem-ocr-garble'
    ) {
      actions.push({ id: 'reparse', label: 'Re-parse stem and A–D options', auto: true })
    }
    if (issue.id === 'graph-stem') {
      actions.push({ id: 'crop-diagram', label: 'Auto-crop graph / diagram', auto: true })
    }
    if (issue.id === 'graph-options') {
      actions.push({ id: 'crop-options', label: 'Auto-crop graph options A–D', auto: true })
    }
    if (issue.id === 'latex-garbled' || issue.id === 'latex-broken') {
      actions.push({ id: 'reextract', label: 'Re-extract OCR (local LaTeX boost)', auto: true })
    }
    if (issue.id === 'type-mcq-not-integer' || issue.id === 'type-mismatch') {
      actions.push({ id: 'fix-type', label: 'Fix question type', auto: true })
    }
    if (issue.id === 'passage-split' || issue.id === 'passage-false-positive') {
      actions.push({ id: 'split-passage', label: 'Split passage (2+ Q)', auto: false })
    }
    if (issue.id === 'mtc-rows' || issue.id === 'mtc-cols') {
      actions.push({ id: 'heal-matrix', label: 'Re-parse match-the-column', auto: true })
    }
  }

  if (imagePlan?.attemptDiagramAutoCrop && !actions.some((a) => a.id === 'crop-diagram')) {
    actions.push({ id: 'crop-diagram', label: 'Crop diagram', auto: true })
  }
  if (imagePlan?.attemptOptionsAutoCrop && !actions.some((a) => a.id === 'crop-options')) {
    actions.push({ id: 'crop-options', label: 'Crop options', auto: true })
  }

  const seen = new Set()
  return actions.filter((a) => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })
}

export function runFullUploadAssist(rawOcr, opts = {}) {
  try {
    return runFullUploadAssistInner(rawOcr, opts)
  } catch (err) {
    console.warn('[upload] full assist failed', err)
    const stem = String(opts.preHealed?.stem ?? opts.stem ?? '')
    const options = [...(opts.preHealed?.options ?? opts.options ?? ['', '', '', ''])]
    while (options.length < 4) options.push('')
    return {
      stem,
      options,
      quality: null,
      steps: [
        {
          id: 'assist-error',
          message: err instanceof Error ? err.message : String(err),
        },
      ],
      escalation: null,
      healed: opts.preHealed ?? null,
      imagePlan: null,
      needsReExtract: false,
      fixActions: [],
      detectedType: opts.questionType ?? 'single_correct',
    }
  }
}

function runFullUploadAssistInner(rawOcr, opts = {}) {
  const initialStem = String(opts.stem ?? '').trim()
  const initialOptions = [...(opts.options ?? ['', '', '', ''])]
  const healed =
    opts.preHealed ??
    (opts.stem != null
      ? iterativeUploadHeal({
          rawOcr,
          stem: opts.stem,
          options: opts.options,
          engine: opts.engine,
          questionType: opts.questionType,
        })
      : null)

  const stem = healed?.stem ?? opts.stem ?? ''
  const options = healed?.options ?? opts.options ?? ['', '', '', '']
  const questionType = healed?.questionType ?? opts.questionType ?? 'single_correct'

  const assist = runAiUploadAssist(rawOcr, {
    engine: opts.engine,
    hasSourceImage: opts.hasSourceImage,
    questionType,
    diagramAutoCropped: opts.diagramAutoCropped,
    optionsAutoCropped: opts.optionsAutoCropped,
    stem,
    options,
    skipEnhanceHeal: !!healed,
  })

  assist.stem = stem
  assist.options = options
  assist.quality = assessUploadQualityFull({
    detectedType: assist.detectedType ?? questionType,
    questionType: assist.detectedType ?? questionType,
    rawOcr,
    stem,
    options,
    hasSourceImage: !!opts.hasSourceImage,
    diagramAutoCropped: !!opts.diagramAutoCropped,
    optionsAutoCropped: opts.optionsAutoCropped ?? 0,
  })

  if (healed?.steps?.length) {
    assist.steps = [...healed.steps, ...(assist.steps ?? [])]
  }

  const imagePlan = planUploadImageActions({
    stem,
    options,
    extractedRaw: rawOcr,
    questionType: assist.detectedType ?? questionType,
  })

  assist.fixActions = buildUploadFixActions(assist.quality, imagePlan)
  assist.needsReExtract =
    !!opts.hasSourceImage && !opts.qualityBoosted && needsAutoReExtract(assist.quality)

  const escalation =
    healed?.escalation ??
    assessPostRepairStatus({
      stem,
      options,
      rawOcr,
      questionType: assist.detectedType ?? questionType,
      repairSteps: assist.steps ?? [],
      repairAttempts: healed?.repairAttempts ?? [],
      initialStem,
      initialOptions,
      initialErrors: healed?.initialErrors,
    })
  assist.escalation = escalation
  if (escalation.needsAgentRepair && escalation.escalationSummary) {
    assist.steps = [...(assist.steps ?? []), escalation.escalationSummary]
  }

  return { ...assist, healed, imagePlan }
}

export function scoreBulkQuestionRow(q) {
  const stem = String(q.text ?? '').trim()
  const options = q.options ?? []
  const type = q.questionType ?? 'single_correct'
  const quality = assessUploadQuality({
    detectedType: type,
    questionType: type,
    stem,
    options,
    rawOcr: stem,
  })
  const readiness = validateQuestionReadiness({
    text: stem,
    questionType: type,
    options,
    correctIndex: q.correctIndex,
    correctInteger: q.correctInteger,
  })
  return {
    confidence: quality.confidence,
    ready: quality.readyToSave && readiness.ok,
    issues: [...(quality.issues ?? []), ...(readiness.issues ?? [])],
    quality,
  }
}

export function filterBulkImportRows(rows, opts = {}) {
  const min = opts.minConfidence ?? 0
  const skipBlocking = opts.skipBlocking !== false
  const ok = []
  const skipped = []
  for (const row of rows) {
    const score = scoreBulkQuestionRow(row)
    const emptyStem = !String(row.text ?? '').trim()
    const qualityBlocking = (score.quality?.issues ?? []).filter((i) => i.severity === 'error')
    if (emptyStem || score.confidence < min || (skipBlocking && qualityBlocking.length)) {
      skipped.push(row)
    } else {
      ok.push(row)
    }
  }
  return { ok, skipped }
}

export function chunkArray(arr, size = 50) {
  const out = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}

export { labelForUploadType, processMcqUploadExtract, reparseMcqUpload }
