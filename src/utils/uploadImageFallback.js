/**
 * When OCR / parse fails, crop stem + options (and diagram band) from the screenshot and proceed.
 */

import { cropImageDataUrl, loadImageForCrop } from './cropImageRegion.js'
import { autoCropMcqOptions } from './autoDetectOptions.js'
import { tryAutoCropStemDiagramFromSource, shouldDropCompositeStemForOptionGraphs } from './figureQuestionImage.js'
import { countRealMcqOptions, hasSeparateStemFigureCue } from './stemDiagramDetect.js'
import {
  GRAPH_OPTION_PLACEHOLDER,
  blobHasTypedTextMcqOptions,
  blobMentionsGraphOptions,
  countGraphOptionsNeedingImage,
  looksLikeContinuityDiscontinuityTextMcq,
  looksLikeMistakenOptionCropText,
  looksLikeRealOptionText,
  looksLikeTypedAntiderivativeOption,
  blobLooksLikeAntiderivativeTextMcq,
  looksLikeVerticalTextOptionsMcq,
  stemSaysOptionsAreFigures,
} from './graphOptionOcr.js'
import { recoverTextMcqFromFullOcr } from './uploadPipeline.js'
import {
  assessUploadQuality,
  isMcqLikeFromOcr,
  correctUploadTypeForOcr,
} from './classifyUploadFromOcr.js'
import { cleanStemMergedOptionGarbage } from './optionStemLeak.js'

const IMAGE_OPTION_LABELS = ['Option A', 'Option B', 'Option C', 'Option D']

/** @param {string} text */
function looksGarbledOcrSymbols(text) {
  const t = String(text ?? '')
  if (!t) return false
  if (/[®©@]/.test(t)) return true
  if (/-\/\s*-\/|=\s*\/\s*-/.test(t)) return true
  if (/\(\s*[A-D]\s*\)\s*[^\s(]{0,3}\s*[-/\\|]{2,}/i.test(t)) return true
  return false
}

/**
 * @param {string[]} options
 * @param {(string|null)[]} [optionImages]
 */
export function countGarbledMcqOptions(options = [], optionImages = []) {
  let n = 0
  for (let i = 0; i < 4; i++) {
    const t = String(options[i] ?? '').trim()
    if (!t) continue
    if (optionImages[i]) continue
    if (looksLikeMistakenOptionCropText(t) || looksGarbledOcrSymbols(t)) n += 1
    else if (!looksLikeRealOptionText(t) && t.length < 18) n += 1
  }
  return n
}

/**
 * True when image-only fallback should run (OCR unreliable but screenshot available).
 * @param {{
 *   sourceUrl?: string
 *   stem?: string
 *   options?: string[]
 *   rawOcr?: string
 *   questionType?: string
 *   optionImages?: (string|null)[]
 *   quality?: ReturnType<typeof assessUploadQuality> | null
 *   optionsAutoCropped?: number
 *   force?: boolean
 * }} ctx
 */
export function shouldUseUploadImageFallback(ctx = {}) {
  if (!String(ctx.sourceUrl ?? '').trim()) return false
  if (ctx.force) return true

  const qType = String(ctx.questionType ?? 'single_correct')
  if (qType === 'matrix_match' || qType.startsWith('passage')) return false
  const mcqLike = isMcqLikeFromOcr(ctx)
  if ((qType === 'integer' || qType === 'numerical') && !mcqLike) return false

  const stem = String(ctx.stem ?? '').trim()
  const options = ctx.options ?? []
  const rawOcr = String(ctx.rawOcr ?? '').trim()
  const optionImages = ctx.optionImages ?? []
  const found = countRealMcqOptions(stem, options)
  const garbledOpts = countGarbledMcqOptions(options, optionImages)
  const graphNeed = countGraphOptionsNeedingImage(options, optionImages, stem)
  const imgCount = optionImages.filter(Boolean).length
  const optionsCropped = ctx.optionsAutoCropped ?? 0
  const typedTextBlob = `${stem}\n${rawOcr}`

  // Typed prose/math A–D already in OCR — recover text, do not force option-image strips.
  if (
    (blobHasTypedTextMcqOptions(typedTextBlob) || looksLikeContinuityDiscontinuityTextMcq(typedTextBlob)) &&
    !stemSaysOptionsAreFigures(stem) &&
    !blobMentionsGraphOptions(typedTextBlob) &&
    graphNeed < 1 &&
    imgCount < 2
  ) {
    // Still allow fallback only to recover text options (attemptUploadImageFallback prefers text).
    // Skip when OCR already filled 4 good options.
    if (found >= 4 && garbledOpts === 0) return false
  }

  if (optionsCropped >= 2 && !ctx.questionImage) return true
  if (mcqLike && (garbledOpts >= 1 || optionsCropped >= 2 || graphNeed >= 2)) return true

  const quality =
    ctx.quality ??
    assessUploadQuality({
      detectedType: qType,
      questionType: qType,
      stem,
      options,
      rawOcr,
      polished: rawOcr,
      hasSourceImage: true,
      optionsAutoCropped: ctx.optionsAutoCropped ?? 0,
    })

  const blockingIds = new Set(
    (quality.issues ?? []).filter((i) => i.severity === 'error').map((i) => i.id),
  )
  const ocrFailed =
    !rawOcr ||
    rawOcr.length < 12 ||
    blockingIds.has('options-false-split') ||
    blockingIds.has('options-incomplete') ||
    blockingIds.has('latex-broken') ||
    (quality.confidence ?? 0) < 58

  if (!ocrFailed && found >= 4 && garbledOpts === 0) return false

  if (stemSaysOptionsAreFigures(stem) && (garbledOpts >= 1 || graphNeed >= 2 || imgCount >= 2)) {
    return true
  }

  if (garbledOpts >= 2) return true
  if (found < 2 && rawOcr.length < 40) return true
  if (blockingIds.has('options-false-split')) return true
  if (found < 4 && garbledOpts >= 1 && /\(\s*[A-D]\s*\)/i.test(rawOcr)) return true
  if ((ctx.optionsAutoCropped ?? 0) >= 2 && garbledOpts >= 1) return true
  if (imgCount >= 2 && garbledOpts >= 1) return true

  return ocrFailed && (found < 4 || garbledOpts >= 1 || graphNeed >= 2)
}

/**
 * Crop top band of screenshot as stem (question + inline diagram).
 * @param {string} sourceUrl
 * @param {{ topRatio?: number }} [opts]
 */
export async function cropStemBandFromSource(sourceUrl, { topRatio = 0.48 } = {}) {
  const img = await loadImageForCrop(sourceUrl)
  const h = img.naturalHeight
  const w = img.naturalWidth
  const splitY = Math.max(48, Math.round(h * Math.min(0.62, Math.max(0.34, topRatio))))
  if (splitY < 40 || w < 40) return null
  return cropImageDataUrl(
    sourceUrl,
    { x: 0, y: 0, width: w, height: splitY },
    { maxWidth: 920, quality: 0.78 },
  )
}

/**
 * Auto-crop stem, diagram, and options when OCR fails — proceed with images.
 * @param {{
 *   sourceUrl: string
 *   stem?: string
 *   options?: string[]
 *   rawOcr?: string
 *   questionType?: string
 *   optionImages?: (string|null)[]
 *   quality?: ReturnType<typeof assessUploadQuality> | null
 *   optionsAutoCropped?: number
 *   diagramAutoCropped?: boolean
 *   questionImage?: string | null
 *   force?: boolean
 *   excludeTopForOptions?: number
 * }} ctx
 */
export async function attemptUploadImageFallback(ctx) {
  const sourceUrl = String(ctx.sourceUrl ?? '').trim()
  if (!sourceUrl) return { applied: false, reason: 'no_source' }

  if (!shouldUseUploadImageFallback(ctx)) {
    return { applied: false, reason: 'not_needed' }
  }

  const stem = String(ctx.stem ?? '').trim()
  const options = (ctx.options ?? []).slice(0, 4)
  while (options.length < 4) options.push('')
  const rawOcr = String(ctx.rawOcr ?? '')
  let questionType = correctUploadTypeForOcr(ctx.questionType ?? 'single_correct', {
    stem,
    options,
    rawOcr,
    optionsAutoCropped: ctx.optionsAutoCropped,
    optionImages: ctx.optionImages,
  })
  const excludeTop = ctx.excludeTopForOptions ?? 0.48

  let questionImage = String(ctx.questionImage ?? '').trim() || null
  let stemImageCrop = true
  let stemTextInImage = false

  if (!questionImage || !ctx.diagramAutoCropped) {
    const diagramCrop = await tryAutoCropStemDiagramFromSource({
      sourceUrl,
      stem,
      extractedRaw: rawOcr,
      questionType,
      options,
      mcqOptionCount: countRealMcqOptions(stem, options),
    }).catch(() => null)

    if (diagramCrop?.url) {
      questionImage = diagramCrop.url
      stemImageCrop = diagramCrop.stemImageCrop
      stemTextInImage = diagramCrop.stemTextInImage
    } else if (
      stemSaysOptionsAreFigures(stem) &&
      String(stem).trim().length >= 40 &&
      !hasSeparateStemFigureCue(`${stem}\n${rawOcr}`)
    ) {
      /** Options ARE the graphs + clean stem text — no composite / stem-band image. */
      questionImage = null
      stemImageCrop = false
      stemTextInImage = false
    } else {
      const band = await cropStemBandFromSource(sourceUrl, { topRatio: excludeTop }).catch(() => null)
      if (band) {
        questionImage = band
        stemImageCrop = true
        stemTextInImage = false
      }
    }
  }

  const optionCrops = [null, null, null, null]
  let recoveredTextOptions = null
  const preferTextOpts =
    looksLikeVerticalTextOptionsMcq(stem, options, rawOcr) ||
    blobHasTypedTextMcqOptions(`${stem}\n${rawOcr}`) ||
    looksLikeContinuityDiscontinuityTextMcq(`${stem}\n${rawOcr}`) ||
    blobLooksLikeAntiderivativeTextMcq(stem, options)
  if (preferTextOpts && rawOcr.trim()) {
    const recovered = recoverTextMcqFromFullOcr(stem, options, rawOcr)
    if (recovered.found >= 2) {
      recoveredTextOptions = (recovered.options ?? []).slice(0, 4)
      while (recoveredTextOptions.length < 4) recoveredTextOptions.push('')
    }
  }
  // Typed A–D in OCR — never fall through to misaligned graph/option crop strips.
  if (!recoveredTextOptions && !preferTextOpts) {
    const cropped = await autoCropMcqOptions(sourceUrl, {
      excludeTopRatio: excludeTop,
      excludeBottomRatio: 0.03,
      stemLength: stem.length,
      preferGraph: true,
      useVision: true,
    }).catch(() => [null, null, null, null])
    cropped.forEach((url, i) => {
      if (url) optionCrops[i] = url
    })
  }

  const nextOptionImages = (ctx.optionImages ?? []).slice(0, 4)
  while (nextOptionImages.length < 4) nextOptionImages.push(null)
  optionCrops.forEach((url, i) => {
    if (url) nextOptionImages[i] = url
  })

  const optionsCropped = nextOptionImages.filter(Boolean).length
  let nextStem = cleanStemMergedOptionGarbage(stem)
  const stemReadable = nextStem.length >= 15 && !looksGarbledOcrSymbols(nextStem)

  if (
    shouldDropCompositeStemForOptionGraphs({
      stem: nextStem,
      extractedRaw: rawOcr,
      optionImages: nextOptionImages,
      stemImageCrop,
    })
  ) {
    questionImage = null
    stemImageCrop = false
    stemTextInImage = false
  }

  const nextOptions = ['', '', '', '']
  for (let i = 0; i < 4; i++) {
    if (recoveredTextOptions?.[i]?.trim()) {
      nextOptions[i] = recoveredTextOptions[i]
      nextOptionImages[i] = null
      continue
    }
    if (nextOptionImages[i]) {
      nextOptions[i] = IMAGE_OPTION_LABELS[i]
      continue
    }
    const t = String(options[i] ?? '').trim()
    const keepTypedMath =
      blobLooksLikeAntiderivativeTextMcq(stem, options) || looksLikeTypedAntiderivativeOption(t)
    if (keepTypedMath) {
      nextOptions[i] = t
    } else if (t && looksLikeRealOptionText(t) && !looksGarbledOcrSymbols(t)) {
      nextOptions[i] = t
    } else {
      nextOptions[i] = GRAPH_OPTION_PLACEHOLDER
    }
  }

  const textOptsFound = recoveredTextOptions
    ? recoveredTextOptions.filter((o) => String(o ?? '').trim()).length
    : 0

  if (!stemReadable) {
    if (questionImage) {
      nextStem = stemTextInImage ? '' : nextStem.length >= 10 ? nextStem : '(See question image)'
      if (!stemTextInImage && nextStem.length < 10) stemTextInImage = false
    } else {
      nextStem = nextStem.length >= 10 ? nextStem : ''
    }
  }

  const applied = !!(questionImage || optionsCropped >= 2 || textOptsFound >= 2)
  if (!applied) return { applied: false, reason: 'crop_failed' }

  const parts = []
  if (questionImage) parts.push('question')
  if (textOptsFound >= 2) parts.push(`${textOptsFound} text options`)
  else if (optionsCropped >= 2) parts.push(`${optionsCropped} options`)

  return {
    applied: true,
    questionType,
    stem: nextStem,
    options: nextOptions,
    questionImage,
    stemImageCrop,
    stemTextInImage,
    optionImages: nextOptionImages.slice(0, 4),
    optionsCropped,
    stemCropped: !!questionImage,
    message: textOptsFound >= 2
      ? `OCR recovered ${textOptsFound}/4 text options (A–D). Review LaTeX, then Save.`
      : `OCR unreliable — auto-cropped ${parts.join(' + ')}. Type set to SCQ. Review previews, then Save (or wait for auto-save).`,
  }
}

/**
 * Soften blocking quality errors after image fallback succeeded.
 * @param {ReturnType<typeof assessUploadQuality>} quality
 * @param {{ optionImages?: (string|null)[], imageFallbackApplied?: boolean }} ctx
 */
export function adjustQualityAfterImageFallback(quality, ctx = {}) {
  if (!quality || !ctx.imageFallbackApplied) return quality
  const imgCount = (ctx.optionImages ?? []).filter(Boolean).length
  if (imgCount < 2 && !ctx.questionImage) return quality

  const issues = (quality.issues ?? []).map((issue) => {
    if (
      issue.severity === 'error' &&
      ['options-incomplete', 'options-false-split', 'latex-garbled', 'latex-broken'].includes(
        issue.id,
      )
    ) {
      return { ...issue, severity: 'info', message: `${issue.message} (using cropped images instead).` }
    }
    return issue
  })

  const hasInfo = issues.some((i) => i.id === 'image-fallback')
  if (!hasInfo) {
    issues.unshift({
      id: 'image-fallback',
      severity: 'info',
      message:
        'Text extraction failed — question saved using auto-cropped images from your upload. Review previews, then Save.',
    })
  }

  const blocking = issues.filter((i) => i.severity === 'error')
  const confidence = Math.max(quality.confidence ?? 0, imgCount >= 3 ? 76 : 72)
  const readyByImages = imgCount >= 4 || (imgCount >= 2 && !!String(ctx.questionImage ?? '').trim())

  return {
    ...quality,
    issues,
    confidence,
    readyToSave: (blocking.length === 0 && confidence >= 70) || readyByImages,
  }
}
