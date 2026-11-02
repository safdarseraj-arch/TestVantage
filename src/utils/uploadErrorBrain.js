/**
 * Unified local AI brain — detect upload OCR/parsing errors and auto-rectify.
 * Generic pattern checks + chained fixes (reparse, split, heal, type correction).
 * No cloud API.
 */

import {
  countMcqOptionLabelsInText,
  inferUploadQuestionType,
  looksLikeMcqOptionsInBlob,
  assessUploadQuality,
} from './classifyUploadFromOcr.js'
import { cleanStemMergedOptionGarbage } from './optionStemLeak.js'
import { looksLikeMcqMisreadAsInteger } from './repairMcqMisreadAsInteger.js'
import { detectBrokenBankStem } from './stemBankGuard.js'
import { countRealMcqOptions, countMcqAnswerSlots, countFilledMcqOptionsForPublish } from './stemDiagramDetect.js'
import { healStoredMcqQuestion } from './healStoredMcq.js'
import { normalizeOptionMarkersInText, splitEmbeddedMcqOptionMarkers } from './mcqOptionMarkers.js'
import { parseSingleQuestionUpload } from './parseSingleQuestionUpload.js'
import { reparseMcqUpload } from './uploadPipeline.js'
import { mcqLaterOptionsLookTruncated } from './mcqOptionCompleteness.js'
import { looksLikePassageMultiMcq, resolvePassageUpload } from './parsePassageUpload.js'
import { looksLikeTrigPeriodMcq } from './repairTrigPeriodMcqOcr.js'
import { looksLikeCompositionIdentityMcq } from './repairCompositionMcqOcr.js'
import { looksLikeFunctionPropertyMcq } from './repairFunctionPropertyMcqOcr.js'
import { looksLikeInverseFunctionMcq } from './repairInverseFunctionMcqOcr.js'
import { looksLikeMinSinAbsGiPeriodMcq } from './repairMinSinAbsGiPeriodMcqOcr.js'
import { looksLikeSinGiPiOneOneOntoMcq } from './repairSinGiPiOneOneOntoMcqOcr.js'
import { looksLikeAngleBisectorMag36Mcq } from './repairAngleBisectorMag36McqOcr.js'
import { looksLikeLineUnitDistanceMcq } from './repairLineUnitDistanceMcqOcr.js'
import { runUploadIssueDetectors } from './uploadIssueDetectors.js'
import { applyMcqParseRepairs } from './repairRegistry.js'

/** @typedef {{ id: string, severity: 'error'|'warn'|'info', message: string, fixId?: string, autoFixable?: boolean }} UploadError */

const STEM_GARBLE_RE =
  /\bgfl\s*\(|sin\s*\?\s*x|cos\s*\*\s*x|jlasamea|Wx\s*\+\s*x|a'\s*\(\s*s-a|\bAABC\b/i

/**
 * @param {{
 *   stem?: string
 *   options?: string[]
 *   rawOcr?: string
 *   questionType?: string
 *   detectedType?: string
 *   passageParsed?: { subQuestions?: unknown[] } | null
 * }} ctx
 * @returns {UploadError[]}
 */
export function detectUploadErrors(ctx = {}) {
  const stem = cleanStemMergedOptionGarbage(String(ctx.stem ?? '').trim())
  const options = [...(ctx.options ?? ['', '', '', ''])]
  while (options.length < 4) options.push('')
  const rawOcr = String(ctx.rawOcr ?? '')
  const blob = `${stem}\n${rawOcr}`
  const questionType = ctx.questionType ?? ctx.detectedType ?? 'single_correct'
  const found = Math.max(
    countRealMcqOptions(stem, options),
    countMcqAnswerSlots(stem, options, ctx.optionImages),
    countFilledMcqOptionsForPublish(options, ctx.optionImages),
  )
  const filled = options.filter((o) => String(o ?? '').trim()).length
  /** @type {UploadError[]} */
  const issues = []

  for (const label of detectBrokenBankStem(stem)) {
    issues.push({
      id: 'latex-broken',
      severity: 'error',
      message: `LaTeX needs fix: ${label}`,
      fixId: 'reparse-heal',
      autoFixable: true,
    })
  }

  if (!issues.some((i) => i.id === 'latex-broken') && STEM_GARBLE_RE.test(`${stem}\n${options.join('\n')}`)) {
    issues.push({
      id: 'stem-ocr-garble',
      severity: 'warn',
      message: 'Stem OCR looks garbled — AI will re-parse math.',
      fixId: 'reparse-heal',
      autoFixable: true,
    })
  }

  for (let i = 0; i < 4; i += 1) {
    const t = String(options[i] ?? '')
    if (!t.trim()) continue
    if (/^Option\s+[A-D]$/i.test(t.trim())) {
      issues.push({
        id: 'option-placeholder',
        severity: 'error',
        message: `Option ${String.fromCharCode(65 + i)} is a placeholder — fill from OCR.`,
        fixId: 'reparse-heal',
        autoFixable: true,
      })
    }
    for (let j = i + 1; j <= 3; j += 1) {
      const L = String.fromCharCode(65 + j)
      if (new RegExp(`\\(\\s*${L}\\s*\\)`, 'i').test(t)) {
        issues.push({
          id: 'option-embedded-marker',
          severity: 'error',
          message: `Option ${String.fromCharCode(65 + i)} contains option ${L} — split needed.`,
          fixId: 'split-embedded-options',
          autoFixable: true,
        })
        break
      }
    }
  }

  const ocrLines = rawOcr.split('\n')
  for (const line of ocrLines) {
    const hits = (line.match(/\(\s*[A-D]\s*\)/gi) ?? []).length
    if (hits >= 3 && line.length < 500 && !line.includes('\n')) {
      issues.push({
        id: 'options-horizontal-ocr',
        severity: found >= 4 ? 'warn' : 'error',
        message: 'Options (A)–(D) on one line — splitting markers.',
        fixId: 'normalize-reparse',
        autoFixable: true,
      })
      break
    }
  }

  if (
    (questionType === 'single_correct' || questionType === 'multiple_correct') &&
    found < 4
  ) {
    const labelsInOcr = countMcqOptionLabelsInText(blob)
    if (labelsInOcr >= 3 || looksLikeMcqOptionsInBlob(blob)) {
      issues.push({
        id: 'options-incomplete',
        severity: 'error',
        message: `Options ${found}/4 — AI will recover from OCR.`,
        fixId: 'repair-registry',
        autoFixable: true,
      })
    }
  } else if (
    (questionType === 'single_correct' || questionType === 'multiple_correct') &&
    mcqLaterOptionsLookTruncated(options, blob)
  ) {
    issues.push({
      id: 'options-cd-truncated',
      severity: 'error',
      message: 'Options C/D look incomplete — AI will restore full text lines.',
      fixId: 'repair-registry',
      autoFixable: true,
    })
  }

  if (options.some((o) => /^\|\s*\(\s*s-|\*?\|=\s*bp/i.test(String(o ?? '')))) {
    issues.push({
      id: 'options-false-split',
      severity: 'error',
      message: 'Options look like garbled math — re-parsing.',
      fixId: 'normalize-reparse',
      autoFixable: true,
    })
  }

  if (
    (questionType === 'integer' || questionType === 'numerical' || ctx.detectedType === 'integer') &&
    (looksLikeMcqOptionsInBlob(blob) || looksLikeMcqMisreadAsInteger(blob))
  ) {
    issues.push({
      id: 'type-integer-vs-mcq',
      severity: 'error',
      message: 'A–D / MCQ prompt in OCR — type should be SCQ, not integer.',
      fixId: 'fix-type',
      autoFixable: true,
    })
  }

  if (looksLikeSingleScqNotPassage(blob)) {
    issues.push({
      id: 'passage-false-positive',
      severity: found >= 4 ? 'warn' : 'error',
      message: 'Single MCQ misread as passage — switching to SCQ.',
      fixId: 'single-scq-fallback',
      autoFixable: true,
    })
  }

  if (
    (questionType === 'passage_integer' || questionType === 'passage_scq' || ctx.detectedType?.startsWith?.('passage')) &&
    (ctx.passageParsed?.subQuestions?.length ?? 0) < 2 &&
    looksLikePassageMultiMcq(rawOcr)
  ) {
    issues.push({
      id: 'passage-split',
      severity: 'error',
      message: 'Passage split failed — retrying line breaks.',
      fixId: 'reline-passage',
      autoFixable: true,
    })
  }

  const smartIssues = runUploadIssueDetectors(blob, { stem, options, rawOcr, questionType })
  for (const si of smartIssues) {
    if (!issues.some((i) => i.id === si.id)) issues.push(si)
  }

  const seen = new Set()
  return issues.filter((i) => {
    if (seen.has(i.id)) return false
    seen.add(i.id)
    return true
  })
}

/** @param {string} blob */
function looksLikeSingleScqNotPassage(blob) {
  if (!looksLikePassageMultiMcq(blob)) return false
  if (looksLikeTrigPeriodMcq(blob)) return true
  if (looksLikeCompositionIdentityMcq(blob)) return true
  if (looksLikeFunctionPropertyMcq(blob)) return true
  if (looksLikeInverseFunctionMcq(blob)) return true
  if (looksLikeMinSinAbsGiPeriodMcq(blob) && countMcqOptionLabelsInText(blob) >= 2) return true
  if (looksLikeSinGiPiOneOneOntoMcq(blob) && countMcqOptionLabelsInText(blob) >= 2) return true
  if (looksLikeAngleBisectorMag36Mcq(blob)) return true
  if (looksLikeLineUnitDistanceMcq(blob)) return true
  const labels = countMcqOptionLabelsInText(blob)
  const letCount = (blob.match(/\blet\s+[a-z]\s*\(/gi) ?? []).length
  if (labels >= 4 && letCount <= 2) return true
  return false
}

/**
 * @param {string} fixId
 * @param {{
 *   stem?: string
 *   options?: string[]
 *   rawOcr?: string
 *   questionType?: string
 *   engine?: string
 * }} ctx
 */
export function rectifyUploadError(fixId, ctx = {}) {
  const beforeFound = countRealMcqOptions(ctx.stem, ctx.options)
  /** @type {{ stem?: string, options?: string[], rawOcr?: string, questionType?: string, step?: string, improved?: boolean }} */
  let out = {}

  switch (fixId) {
    case 'split-embedded-options': {
      const options = splitEmbeddedMcqOptionMarkers(ctx.options ?? [])
      const after = countRealMcqOptions(ctx.stem, options)
      out = {
        options,
        step: 'Split merged option labels (B+C, etc.)',
        improved: after > beforeFound || options.some((o, i) => o !== (ctx.options ?? [])[i]),
      }
      break
    }
    case 'repair-registry': {
      const raw = String(ctx.rawOcr ?? '').trim()
      const repaired = applyMcqParseRepairs(
        {
          text: String(ctx.stem ?? ''),
          options: [...(ctx.options ?? ['', '', '', ''])],
          optionsFound: beforeFound,
          complete: beforeFound >= 4,
        },
        raw || `${ctx.stem ?? ''}\n${(ctx.options ?? []).join('\n')}`,
      )
      const after = countRealMcqOptions(repaired.text, repaired.options)
      const stemChanged = String(repaired.text ?? '').trim() !== String(ctx.stem ?? '').trim()
      const optsChanged = JSON.stringify(repaired.options ?? []) !== JSON.stringify(ctx.options ?? [])
      if (after > beforeFound || stemChanged || optsChanged) {
        out = {
          stem: String(repaired.text ?? ctx.stem ?? '').trim(),
          options: [...(repaired.options ?? ctx.options ?? [])],
          step: 'AI repair plugin scan (20+ local patterns)',
          improved: true,
        }
      }
      break
    }
    case 'normalize-reparse': {
      const norm = normalizeOptionMarkersInText(ctx.rawOcr ?? '')
      const parsed = parseSingleQuestionUpload(norm, ctx.rawOcr ?? norm)
      const after = countRealMcqOptions(parsed.text, parsed.options)
      if (after >= beforeFound || String(parsed.text ?? '').trim().length > String(ctx.stem ?? '').length) {
        out = {
          stem: String(parsed.text ?? ctx.stem ?? '').trim(),
          options: [...(parsed.options ?? ctx.options ?? [])],
          step: 'Normalized option markers and re-parsed',
          improved: true,
        }
      }
      break
    }
    case 'reparse-heal': {
      const raw = String(ctx.rawOcr ?? '').trim()
      if (raw) {
        const reparsed = reparseMcqUpload(raw, { engine: ctx.engine ?? 'builtin', minFound: beforeFound })
        let stem = String(reparsed.parsed?.text ?? ctx.stem ?? '').trim()
        let options = [...(reparsed.parsed?.options ?? ctx.options ?? [])]
        while (options.length < 4) options.push('')
        options = splitEmbeddedMcqOptionMarkers(options)
        const healed = healStoredMcqQuestion({
          questionType: ctx.questionType ?? 'single_correct',
          text: stem,
          options,
          ocrRawText: raw,
          extractedRaw: raw,
        })
        const after = countRealMcqOptions(healed.text, healed.options)
        if (
          after > beforeFound ||
          String(healed.text ?? '').trim() !== String(ctx.stem ?? '').trim() ||
          JSON.stringify(healed.options) !== JSON.stringify(ctx.options)
        ) {
          out = {
            stem: String(healed.text ?? stem).trim() || stem,
            options: [...(healed.options ?? options)],
            step: reparsed.recovered ? 'AI recovered stem/options (2nd pass)' : 'AI re-parsed and healed stem/options',
            improved: true,
          }
        }
      }
      break
    }
    case 'single-scq-fallback': {
      const norm = normalizeOptionMarkersInText(ctx.rawOcr ?? '')
      const parsed = parseSingleQuestionUpload(norm, ctx.rawOcr ?? norm)
      const healed = healStoredMcqQuestion({
        questionType: 'single_correct',
        text: parsed.text,
        options: parsed.options,
        ocrRawText: ctx.rawOcr,
        extractedRaw: ctx.rawOcr,
      })
      const after = countRealMcqOptions(healed.text, healed.options)
      if (after >= 2 || String(healed.text ?? '').trim()) {
        out = {
          stem: String(healed.text ?? parsed.text ?? '').trim(),
          options: splitEmbeddedMcqOptionMarkers(healed.options ?? parsed.options ?? []),
          questionType: 'single_correct',
          step: 'Corrected passage misread → single SCQ',
          improved: true,
        }
      }
      break
    }
    case 'fix-type': {
      const stem = String(ctx.stem ?? '').trim()
      const options = ctx.options ?? []
      const found = countRealMcqOptions(stem, options)
      const inferred = inferUploadQuestionType({ stem, options, found, rawOcr: ctx.rawOcr })
      if (inferred !== ctx.questionType) {
        out = {
          questionType: inferred,
          step: `Corrected type → ${inferred}`,
          improved: true,
        }
      }
      break
    }
    case 'reline-passage': {
      const norm = String(ctx.rawOcr ?? '').replace(/\r\n/g, '\n').trim()
      const relined = norm
        .replace(/([.!?])\s+(\d{1,2})[.)]\s+/g, '$1\n$2) ')
        .replace(/(\n|^)\s*Q\s*(\d+)\s*[:.)]/gi, '\nQ$2. ')
        .replace(/(\d+)\.\s*(?=[A-Za-z(])/g, '\n$1. ')
      const parsed = resolvePassageUpload(relined, relined, { allowOptionless: true })
      if ((parsed?.subQuestions?.length ?? 0) >= 2) {
        out = {
          rawOcr: relined,
          step: 'Re-lined passage text for split',
          improved: true,
        }
      }
      break
    }
    default:
      break
  }

  out.improved = out.improved ?? false
  return out
}

/**
 * Iterative detect → fix until stable or max passes.
 * @param {{
 *   stem?: string
 *   options?: string[]
 *   rawOcr?: string
 *   questionType?: string
 *   engine?: string
 *   maxPasses?: number
 * }} ctx
 */
export function autoRectifyUpload(ctx = {}) {
  let stem = String(ctx.stem ?? '').trim()
  let options = [...(ctx.options ?? ['', '', '', ''])]
  while (options.length < 4) options.push('')
  let rawOcr = String(ctx.rawOcr ?? '').replace(/\r\n/g, '\n').trim()
  let questionType = ctx.questionType ?? 'single_correct'
  /** @type {string[]} */
  const steps = []
  /** @type {{ fixId: string, improved: boolean, step?: string, errorsBefore: number, errorsAfter: number }[]} */
  const repairAttempts = []
  const maxPasses = ctx.maxPasses ?? 4
  const initialErrors = detectUploadErrors({ stem, options, rawOcr, questionType })

  const fixOrder = [
    'single-scq-fallback',
    'repair-registry',
    'normalize-reparse',
    'split-embedded-options',
    'reparse-heal',
    'fix-type',
    'reline-passage',
  ]

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const errors = detectUploadErrors({ stem, options, rawOcr, questionType })
    const fixable = errors.filter((e) => e.autoFixable && e.fixId)
    if (!fixable.length) break

    const beforeFound = countRealMcqOptions(stem, options)
    let passImproved = false

    for (const fixId of fixOrder) {
      if (!fixable.some((e) => e.fixId === fixId)) continue
      const errorsBefore = detectUploadErrors({ stem, options, rawOcr, questionType }).filter(
        (e) => e.severity === 'error',
      ).length
      const result = rectifyUploadError(fixId, { stem, options, rawOcr, questionType, engine: ctx.engine })
      const errorsAfter = detectUploadErrors({
        stem: result.stem != null ? String(result.stem).trim() || stem : stem,
        options: result.options ?? options,
        rawOcr: result.rawOcr ?? rawOcr,
        questionType: result.questionType ?? questionType,
      }).filter((e) => e.severity === 'error').length
      repairAttempts.push({
        fixId,
        improved: !!result.improved,
        step: result.step,
        errorsBefore,
        errorsAfter,
      })
      if (!result.improved) continue
      if (result.stem != null) stem = String(result.stem).trim() || stem
      if (result.options) {
        options = [...result.options]
        while (options.length < 4) options.push('')
      }
      if (result.rawOcr) rawOcr = result.rawOcr
      if (result.questionType) questionType = result.questionType
      if (result.step) steps.push(result.step)
      passImproved = true
    }

    const afterFound = countRealMcqOptions(stem, options)
    if (!passImproved) break
    if (afterFound >= 4 && !detectUploadErrors({ stem, options, rawOcr, questionType }).some((e) => e.severity === 'error')) {
      break
    }
    if (pass > 0 && afterFound <= beforeFound && !passImproved) break
  }

  return {
    stem,
    options: options.slice(0, 6),
    rawOcr,
    questionType,
    found: countRealMcqOptions(stem, options),
    steps: [...new Set(steps)],
    improved: steps.length > 0,
    repairAttempts,
    initialErrors,
    errors: detectUploadErrors({ stem, options, rawOcr, questionType }),
  }
}

/**
 * Drop auto-fixable flags that no longer apply after stem/options were repaired.
 * @param {UploadError[]} issues
 * @param {{ stem?: string, options?: string[] }} ctx
 */
function scrubResolvedUploadIssues(issues, ctx = {}) {
  const stem = cleanStemMergedOptionGarbage(String(ctx.stem ?? '').trim())
  const options = [...(ctx.options ?? ['', '', '', ''])]
  const found = Math.max(
    countRealMcqOptions(stem, options),
    countMcqAnswerSlots(stem, options, ctx.optionImages),
    countFilledMcqOptionsForPublish(options, ctx.optionImages),
  )
  const filled = options.filter((o) => String(o ?? '').trim()).length
  const display = `${stem}\n${options.join('\n')}`
  const stemBroken = detectBrokenBankStem(stem).length > 0
  const optionsOk = found >= 4 || filled >= 4
  const laterTruncated = mcqLaterOptionsLookTruncated(options, display)

  return issues.filter((issue) => {
    if (issue.severity !== 'error' && issue.severity !== 'warn') return true
    if (issue.id === 'options-incomplete' && optionsOk && !laterTruncated) return false
    if (issue.id === 'options-cd-truncated' && !laterTruncated) return false
    if (
      (issue.id === 'passage-false-positive' ||
        issue.id === 'options-horizontal-ocr' ||
        issue.id === 'type-integer-vs-mcq' ||
        issue.id === 'type-mcq-not-integer') &&
      optionsOk
    ) {
      return false
    }
    if (
      (issue.id === 'stem-ocr-garble' || issue.id === 'stem-ocr-garble-smart') &&
      !STEM_GARBLE_RE.test(display)
    ) {
      return false
    }
    if (issue.id === 'stem-tabular-garbage' && !/\\begin\{tabular\}|\\text\{begin\}/i.test(display)) {
      return false
    }
    if (
      (issue.id === 'latex-broken' || issue.id === 'latex-broken-smart') &&
      !stemBroken
    ) {
      return false
    }
    if (
      issue.autoFixable &&
      issue.fixId === 'repair-registry' &&
      optionsOk &&
      !stemBroken &&
      !laterTruncated &&
      issue.id !== 'options-cd-truncated'
    ) {
      if (!STEM_GARBLE_RE.test(display)) return false
    }
    // Plugin "needs repair" banners: drop once options + stem look bank-ready
    if (
      optionsOk &&
      !stemBroken &&
      /^(determinant-integer|limit-gx|inverse-function|trig-period|composition|function-property|f0-moebius|min-sin|domain-gi|odd-fn)/i.test(
        issue.id,
      )
    ) {
      return false
    }
    return true
  })
}

/**
 * Quality gate + generic brain error detection (merged issue list).
 * @param {Parameters<typeof assessUploadQuality>[0]} ctx
 */
export function assessUploadQualityFull(ctx = {}) {
  const stem = cleanStemMergedOptionGarbage(String(ctx.stem ?? '').trim())
  const quality = assessUploadQuality({ ...ctx, stem })
  const brainErrors = detectUploadErrors({
    stem,
    options: ctx.options,
    optionImages: ctx.optionImages,
    rawOcr: ctx.rawOcr,
    questionType: ctx.questionType ?? ctx.detectedType,
    detectedType: ctx.detectedType ?? quality.detectedType,
    passageParsed: ctx.passageParsed,
  })
  const issues = scrubResolvedUploadIssues(
    [...(quality.issues ?? []), ...brainErrors.filter((be) => !(quality.issues ?? []).some((i) => i.id === be.id))],
    { stem, options: ctx.options, optionImages: ctx.optionImages },
  )
  const blocking = issues.filter((i) => i.severity === 'error')
  const found = Math.max(
    countRealMcqOptions(stem, ctx.options),
    countMcqAnswerSlots(stem, ctx.options, ctx.optionImages),
    countFilledMcqOptionsForPublish(ctx.options, ctx.optionImages),
  )
  const imageSlots = countMcqAnswerSlots(stem, ctx.options ?? [], ctx.optionImages ?? [])
  const readyByImages =
    (ctx.hasSourceImage || (ctx.optionsAutoCropped ?? 0) >= 2 || ctx.imageFallbackApplied) &&
    imageSlots >= 4 &&
    !detectBrokenBankStem(stem).length
  // Recompute confidence AFTER scrub — pre-scrub errors were crushing scores even when fixed
  const confBase = quality.confidence ?? 0
  const conf =
    blocking.length === 0 && found >= 4
      ? Math.max(confBase, 78)
      : blocking.length === 0
        ? Math.max(confBase, 70)
        : confBase
  const healedBonus =
    found >= 4 && blocking.length === 0 ? Math.min(100, conf + 8) : conf
  const mcqReady =
    (ctx.questionType === 'single_correct' ||
      ctx.questionType === 'multiple_correct' ||
      ctx.detectedType === 'single_correct' ||
      ctx.detectedType === 'multiple_correct' ||
      quality.detectedType === 'single_correct' ||
      quality.detectedType === 'multiple_correct') &&
    found >= 4 &&
    blocking.length === 0 &&
    !detectBrokenBankStem(stem).length
  return {
    ...quality,
    issues,
    confidence: healedBonus,
    readyToSave: mcqReady || (blocking.length === 0 && healedBonus >= 68) || readyByImages,
  }
}
