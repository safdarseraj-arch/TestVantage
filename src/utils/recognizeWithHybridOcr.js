import { recognizeWithEnhancedTesseract, recognizeTesseractLayout } from './enhancedTesseract.js'
import { layoutTextFromTesseractPage } from './tesseractLayoutText.js'
import { pickHybridFinalResult } from './hybridOcrFinalize.js'
import { canSkipOnnxForBookPage, tryFastHybridTesseractResult } from './hybridOcrFastPath.js'
import { pageNeedsOnnxBoost } from './hybridOcrNeeds.js'
import { buildStemBandRegion, resolveMathRegions } from './mathRegionDetect.js'
import { mergeHybridOcrText } from './hybridOcrMerge.js'
import { blobToDataUrl, loadMathOcrPipeline, recognizeEquationImage } from './onnxMathOcr.js'
import { cropLoadedImage, loadImageForCrop } from './cropImageRegion.js'
import { isLocalMathOcrEnabled, isMathpixStyleLineOcrEnabled } from './ocrSettings.js'
import {
  HYBRID_LAYOUT_MIN_CHARS,
  HYBRID_LAYOUT_MIN_CONFIDENCE,
  LOCAL_MATH_OCR_BOOK_MODE,
  LOCAL_MATH_OCR_BOOK_SELECTIVE,
  MATH_OCR_MODEL_LOAD_MS,
  MATH_OCR_REGION_CONCURRENCY,
  MAX_MATH_REGIONS_PER_PAGE } from './mathOcrConfig.js'
import { withOcrTimeout } from './ocrTimeout.js'
import { isAbortError, throwIfAborted } from './ocrAbort.js'
import { mapConcurrent } from './ocrConcurrency.js'
import { pickBestOcrCandidate } from './pickBestOcrCandidate.js'
import { runMathpixStyleLinePipeline } from './mathpixStyleLineOcr.js'
import { finalizeOcrText } from './inferMathFromPlainOcr.js'
import { normalizeMathText } from './normalizeMathText.js'

/** Slow heartbeat while LaTeX model finishes loading. */
function waitWithProgressHeartbeat(promise, onProgress, { from = 80, to = 86, everyMs = 1800 } = {}) {
  let pct = from
  onProgress?.(pct)
  const timer = setInterval(() => {
    if (pct < to) {
      pct += 1
      onProgress?.(pct)
    }
  }, everyMs)
  return promise.finally(() => clearInterval(timer))
}

/** @param {string} text */
function needsStemLatexBoost(text) {
  return pageNeedsOnnxBoost(text)
}

/**
 * @param {File | Blob} blob
 * @returns {Promise<{ width: number, height: number }>}
 */
async function imageNaturalSize(blob) {
  const bitmap = await createImageBitmap(blob)
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close?.()
  }
}

/**
 * Layout pass is usually enough; run enhanced Tesseract only when prose is thin or low-confidence.
 * @param {File | Blob} input
 * @param {import('tesseract.js').Page} layout
 * @param {(pct: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
async function resolveTesseractProse(input, layout, onProgress, signal) {
  const layoutRaw = layoutTextFromTesseractPage(layout) || layout.text?.trim() || ''
  const layoutConf = layout.confidence ?? 0

  if (
    layoutRaw.length >= HYBRID_LAYOUT_MIN_CHARS &&
    layoutConf >= HYBRID_LAYOUT_MIN_CONFIDENCE
  ) {
    return layoutRaw
  }

  const boosted = await recognizeWithEnhancedTesseract(
    input,
    (pct) => onProgress?.(56 + Math.round(pct * 0.08)),
    { signal, bookMode: false, fastMode: true, skipPreprocess: true },
  )
  const boostedRaw = boosted?.trim() ?? ''
  if (!boostedRaw) return layoutRaw

  if (!layoutRaw) return boostedRaw

  const best = pickBestOcrCandidate([
    {
      text: normalizeMathText(finalizeOcrText(layoutRaw)),
      raw: layoutRaw,
      source: 'tesseract:layout',
      confidence: layoutConf },
    {
      text: normalizeMathText(finalizeOcrText(boostedRaw)),
      raw: boostedRaw,
      source: 'builtin:original',
      confidence: 0 },
  ])
  return best.raw ?? best.text ?? layoutRaw
}

/**
 * @param {HTMLImageElement} img
 * @param {string} srcUrl
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {AbortSignal} [signal]
 */
async function recognizeStemCropLoaded(img, srcUrl, rect, signal) {
  const cropUrl = cropLoadedImage(img, rect, { maxWidth: 1600, quality: 0.92, srcHint: srcUrl })
  const latex = await recognizeEquationImage(cropUrl, signal)
  return latex?.trim() ? latex.trim() : ''
}

/**
 * Hybrid OCR + LaTeX: layout-first Tesseract + ONNX equation crops + LaTeX synthesis.
 * Falls back to Tesseract-only when model unavailable or book mode.
 *
 * @param {File | Blob} input
 * @param {(pct: number) => void} [onProgress]
 * @param {{ signal?: AbortSignal, bookMode?: boolean }} [opts]
 */
export async function recognizeWithHybridOcr(input, onProgress, opts = {}) {
  const { signal, bookMode = false, sourceFile: _sourceFile = null } = opts
  throwIfAborted(signal)

  const bookOnnxDisabled = bookMode && !LOCAL_MATH_OCR_BOOK_MODE && !LOCAL_MATH_OCR_BOOK_SELECTIVE
  const useMath = isLocalMathOcrEnabled() && !bookOnnxDisabled

  if (!useMath) {
    const raw = await recognizeWithEnhancedTesseract(input, onProgress, { signal, bookMode })
    return pickHybridFinalResult(raw, raw, null)
  }

  onProgress?.(1)

  // Layout pass owns ~5–55% of the bar (was 8–28% — looked stuck at 25%).
  const layout = await recognizeTesseractLayout(
    input,
    (pct) => onProgress?.(5 + Math.round((Number(pct) || 0) * 0.5)),
    signal,
  )
  throwIfAborted(signal)
  onProgress?.(56)

  const tesseractRaw = await resolveTesseractProse(
    input,
    layout,
    onProgress,
    signal,
  )
  onProgress?.(64)
  if (!tesseractRaw?.trim()) {
    onProgress?.(100)
    return ''
  }

  // Geometry-only line pass (no ONNX) — fast MCQ split; never block the bar at ~25%.
  let linePipelineText = ''
  if (isMathpixStyleLineOcrEnabled()) {
    try {
      const dims = await imageNaturalSize(input)
      const lineResult = await runMathpixStyleLinePipeline({
        layout,
        input,
        imageSize: dims,
        signal,
        useOnnx: false,
        wordOnnx: false,
        sourceFile: opts.sourceFile ?? input,
        onProgress: (p) => onProgress?.(64 + Math.round((Number(p) || 0) * 0.06)),
      })
      linePipelineText = lineResult.text?.trim() ?? ''
    } catch (err) {
      if (isAbortError(err)) throw err
      console.warn('[TestVantages] Mathpix-style line pipeline partial:', err)
    }
  }
  onProgress?.(70)

  const fast = tryFastHybridTesseractResult(tesseractRaw, layout)
  if (fast) {
    if (linePipelineText) {
      const best = pickBestOcrCandidate([
        { text: fast, source: 'hybrid:fast' },
        { text: linePipelineText, source: 'mathpix-style:lines' },
      ])
      onProgress?.(100)
      return best.text || fast
    }
    onProgress?.(100)
    return fast
  }

  if (!pageNeedsOnnxBoost(tesseractRaw)) {
    onProgress?.(100)
    const plain = pickHybridFinalResult(tesseractRaw, tesseractRaw, layout)
    if (!linePipelineText) return plain
    const best = pickBestOcrCandidate([
      { text: plain, source: 'hybrid:merged' },
      { text: linePipelineText, source: 'mathpix-style:lines' },
    ])
    return best.text || plain
  }

  if (bookMode && !LOCAL_MATH_OCR_BOOK_MODE && LOCAL_MATH_OCR_BOOK_SELECTIVE) {
    if (canSkipOnnxForBookPage(tesseractRaw, layout)) {
      onProgress?.(100)
      return pickHybridFinalResult(tesseractRaw, tesseractRaw, layout)
    }
  }

  onProgress?.(72)
  const modelLoadPromise = loadMathOcrPipeline(
    (pct) => onProgress?.(72 + Math.round((Number(pct) || 0) * 0.08)),
    signal,
  )
  const regions = await resolveMathRegions(layout, input, {
    signal,
    maxRegions: MAX_MATH_REGIONS_PER_PAGE })
  onProgress?.(80)

  try {
    await withOcrTimeout(
      waitWithProgressHeartbeat(modelLoadPromise, onProgress),
      MATH_OCR_MODEL_LOAD_MS,
      'LaTeX model load timed out',
    )

    const srcUrl = await blobToDataUrl(input)
    const [dims, loadedImg] = await Promise.all([
      imageNaturalSize(input),
      loadImageForCrop(srcUrl),
    ])
    onProgress?.(86)

    /** @type {import('./hybridOcrMerge.js').RegionOcrResult[]} */
    let results = []

    if (!regions.length && needsStemLatexBoost(tesseractRaw)) {
      const stemRect = buildStemBandRegion(dims.width, dims.height)
      const latex = await recognizeStemCropLoaded(loadedImg, srcUrl, stemRect, signal)
      if (latex) results.push({ rect: stemRect, latex, lineText: '' })
      onProgress?.(96)
    } else {
      const cap = Math.min(regions.length, MAX_MATH_REGIONS_PER_PAGE)
      const slice = regions.slice(0, cap)
      const batch = await mapConcurrent(
        slice,
        MATH_OCR_REGION_CONCURRENCY,
        async (rect, i) => {
          throwIfAborted(signal)
          const latex = await recognizeStemCropLoaded(loadedImg, srcUrl, rect, signal)
          onProgress?.(86 + Math.round(((i + 1) / Math.max(1, cap)) * 12))
          return latex ? { rect, latex, lineText: rect.lineText } : null
        },
      )
      results = batch.filter(Boolean)
    }

    let merged = results.length ? mergeHybridOcrText(tesseractRaw, results) : tesseractRaw

    if (needsStemLatexBoost(merged) && results.length < 2) {
      const stemRect = buildStemBandRegion(dims.width, dims.height)
      const alreadyStem = results.some((r) => r.rect?.source === 'stem:band')
      if (!alreadyStem) {
        const latex = await recognizeStemCropLoaded(loadedImg, srcUrl, stemRect, signal)
        if (latex) merged = mergeHybridOcrText(merged, [{ rect: stemRect, latex, lineText: '' }])
      }
    }

    onProgress?.(100)
    const mergedResult = pickHybridFinalResult(tesseractRaw, merged || tesseractRaw, layout)
    if (!linePipelineText) return mergedResult
    const best = pickBestOcrCandidate([
      { text: mergedResult, raw: merged || tesseractRaw, source: 'hybrid:merged' },
      { text: linePipelineText, source: 'mathpix-style:lines' },
    ])
    return best.text || mergedResult
  } catch (err) {
    if (isAbortError(err)) throw err
    console.warn('[TestVantages] Local math OCR failed — Tesseract only:', err)
    onProgress?.(100)
    return pickHybridFinalResult(tesseractRaw, tesseractRaw, layout)
  }
}
