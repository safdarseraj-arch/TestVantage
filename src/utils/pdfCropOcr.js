/**
 * Mathpix OCR for PDF/image crop regions. Local AI and Gemini never read the crop.
 */

import { dataUrlToFile } from './dataUrlToFile.js'
import { polishExtractedText, polishOcrText } from './ocrExtractPolish.js'
import { parseSingleQuestionUpload } from './parseSingleQuestionUpload.js'
import { assessUploadQualityFull } from './uploadErrorBrain.js'
import { looksLikeGarbledMathLine } from './hybridOcrMerge.js'
import {
  resolveMatchColumnUpload,
  countFilledMatrixRowsNormalized,
} from './parseMatchColumnUpload.js'

/** @typedef {'running' | 'done' | 'failed'} PdfCropOcrStatus */

/**
 * @typedef {Object} PdfCropOcrResult
 * @property {string} text
 * @property {string[]} [options]
 * @property {string} rawOcr
 * @property {number} confidence
 * @property {boolean} trusted
 * @property {boolean} readyToSave
 * @property {{ id: string, severity: string, message: string }[]} issues
 * @property {PdfCropOcrStatus} [status]
 * @property {boolean} [userEdited]
 * @property {boolean | null} [useText]
 * @property {import('./parseMatchColumnUpload.js').MatchColumnParse | null} [matrixParsed]
 */

const TRUSTED_MIN_CONFIDENCE = 90

/** @param {string} stepKey */
function normalizeCropStepKey(stepKey) {
  return stepKey === 'full' ? 'stem' : stepKey
}

/** @param {string} stepKey */
function stepWantsOptionsParse(stepKey) {
  const k = normalizeCropStepKey(stepKey)
  return (
    k === 'options_block' ||
    k === 'sub_options_block' ||
    k.startsWith('option_')
  )
}

/** @param {string} stepKey @param {string} questionType */
function detectedTypeForStep(stepKey, questionType) {
  if (questionType === 'matrix_match' || stepKey === 'column_I' || stepKey === 'column_II') {
    return 'matrix_match'
  }
  if (questionType === 'multiple_correct') return 'multiple_correct'
  if (questionType === 'passage_scq' || questionType === 'passage_integer') {
    return questionType
  }
  if (stepWantsOptionsParse(stepKey)) return 'single_correct'
  return questionType === 'integer' || questionType === 'numerical' ? questionType : 'single_correct'
}

/**
 * @param {string} polished
 * @param {string} rawOcr
 * @param {string} stepKey
 */
function parseCropText(polished, rawOcr, stepKey) {
  let text = polished.trim()
  /** @type {string[]} */
  let options = ['', '', '', '']
  /** @type {import('./parseMatchColumnUpload.js').MatchColumnParse | null} */
  let matrixParsed = null

  if (stepKey === 'column_I' || stepKey === 'column_II') {
    matrixParsed = resolveMatchColumnUpload(polished) ?? resolveMatchColumnUpload(rawOcr)
    if (matrixParsed && countFilledMatrixRowsNormalized(matrixParsed) >= 2) {
      return { text: matrixParsed.stem || text, matrixParsed, options }
    }
  }

  const parsed = parseSingleQuestionUpload(polished, rawOcr)
  if (parsed?.text?.trim()) text = parsed.text.trim()

  if (stepWantsOptionsParse(stepKey)) {
    if (parsed?.options?.length) {
      options = [...parsed.options]
      while (options.length < 4) options.push('')
    } else if (stepKey.startsWith('option_')) {
      const idx = Number(stepKey.replace('option_', ''))
      const optionText = polished.trim() || rawOcr.trim()
      if (Number.isFinite(idx) && idx >= 0 && idx < 4) {
        options[idx] = optionText
        text = optionText
      }
    }
  }

  return { text, options, matrixParsed }
}

/**
 * @param {string} polished
 * @param {string} rawOcr
 * @param {string} stepKey
 * @param {string} questionType
 * @param {number} layoutConf
 */
export function assessCropOcrTrust(polished, rawOcr, stepKey, questionType, _layoutConf = 0) {
  const normKey = normalizeCropStepKey(stepKey)
  const { text, options, matrixParsed } = parseCropText(polished, rawOcr, normKey)
  const detectedType = detectedTypeForStep(normKey, questionType)

  const quality = assessUploadQualityFull({
    stem: text,
    options,
    rawOcr,
    polished,
    detectedType,
    questionType: detectedType,
    matrixParsed: matrixParsed ?? null,
  })

  const blocking = (quality.issues ?? []).filter((i) => i.severity === 'error')
  const minLen = normKey.startsWith('option_') || normKey === 'solution' ? 1 : 8
  const trusted =
    quality.confidence >= TRUSTED_MIN_CONFIDENCE &&
    blocking.length === 0 &&
    text.trim().length >= minLen &&
    !text.split(/\n/).some(looksLikeGarbledMathLine)

  return {
    text,
    options,
    rawOcr,
    confidence: quality.confidence,
    trusted,
    readyToSave: quality.readyToSave,
    issues: quality.issues ?? [],
    matrixParsed: matrixParsed ?? null,
  }
}

/**
 * OCR a single PDF/image crop with Mathpix (never local Tesseract or Gemini vision).
 * @param {string} dataUrl
 * @param {string} stepKey
 * @param {string} questionType
 * @param {{ signal?: AbortSignal, fast?: boolean }} [opts]
 * @returns {Promise<PdfCropOcrResult>}
 */
export async function ocrPdfCropRegion(dataUrl, stepKey, questionType, opts = {}) {
  void opts.fast
  const file = await dataUrlToFile(dataUrl, 'pdf-crop.png')
  let polished = ''
  let raw = ''
  try {
    const { recognizeWithMathpix } = await import('./mathpixOcr.js')
    polished = await recognizeWithMathpix(file, () => {}, { signal: opts.signal })
    raw = polished
  } catch (err) {
    const { isAbortError } = await import('./ocrAbort.js')
    if (isAbortError(err)) throw err
    const msg = err instanceof Error ? err.message : 'Mathpix OCR failed.'
    const assessed = assessCropOcrTrust('', '', stepKey, questionType, 0)
    return {
      ...assessed,
      rawOcr: '',
      status: 'failed',
      issues: [{ id: 'mathpix-ocr', severity: 'error', message: msg }],
    }
  }

  polished = polishExtractedText(polishOcrText(polished), 'mathpix')
  const assessed = assessCropOcrTrust(polished, raw, stepKey, questionType, 0)
  return {
    ...assessed,
    status: 'done',
    useText: assessed.trusted
      ? null
      : assessed.text.trim().length >= 1
        ? null
        : false,
  }
}

/**
 * Apply save defaults for PDF crop OCR — unset choice always keeps the crop image.
 * Saved image questions can be converted to text later from Saved questions.
 * @param {Record<string, PdfCropOcrResult>} [ocrMeta]
 */
export function resolvePdfCropOcrForSave(ocrMeta) {
  /** @type {Record<string, PdfCropOcrResult>} */
  const out = { ...(ocrMeta ?? {}) }
  for (const [key, ocr] of Object.entries(out)) {
    if (!ocr) continue
    if (ocr.status === 'running') {
      out[key] = { ...ocr, status: 'failed', useText: false }
      continue
    }
    if (ocr.status !== 'done') continue
    if (ocr.useText == null) {
      out[key] = { ...ocr, useText: false }
    }
  }
  return out
}
