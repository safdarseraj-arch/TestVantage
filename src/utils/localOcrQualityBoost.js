/**
 * Local quality boost — second Hybrid OCR + LaTeX pass when first pass scores low.
 * Replaces external Mathpix fallback; runs fully on-device (laptop or your server).
 */

import { recognizeWithEnhancedTesseract, recognizeTesseractLayout } from './enhancedTesseract.js'
import { pickHybridFinalResult } from './hybridOcrFinalize.js'
import { mergeHybridOcrText } from './hybridOcrMerge.js'
import { buildStemBandRegion, resolveMathRegions } from './mathRegionDetect.js'
import { blobToDataUrl, loadMathOcrPipeline, recognizeEquationImage } from './onnxMathOcr.js'
import { cropLoadedImage, loadImageForCrop } from './cropImageRegion.js'
import { MATH_OCR_MODEL_LOAD_MS, MATH_OCR_REGION_CONCURRENCY } from './mathOcrConfig.js'
import { mapConcurrent } from './ocrConcurrency.js'
import { pickBestOcrCandidate, scoreOcrCandidate } from './pickBestOcrCandidate.js'
import { finalizeOcrText } from './inferMathFromPlainOcr.js'
import { normalizeMathText } from './normalizeMathText.js'
import { throwIfAborted, isAbortError } from './ocrAbort.js'
import { withOcrTimeout } from './ocrTimeout.js'
import { shouldRunLocalOcrBoost } from './localOcrBoostDetect.js'
import { stemSaysOptionsAreFigures } from './stemDiagramDetect.js'

export { LOCAL_OCR_BOOST_MIN_SCORE, shouldRunLocalOcrBoost } from './localOcrBoostDetect.js'

/** Max regions on boost pass (more than normal hybrid). */
const BOOST_MAX_REGIONS = 12

/** Hard cap — never block upload longer than this on a second pass. */
const BOOST_TOTAL_MS = 55_000

/** Tesseract layout during boost — abort if it stalls. */
const BOOST_TESSERACT_LAYOUT_MS = 35_000

/**
 * @param {Promise<T>} promise
 * @param {(pct: number) => void} [onProgress]
 * @param {{ from?: number, to?: number, everyMs?: number }} [opts]
 * @returns {Promise<T>}
 * @template T
 */
function waitWithProgressHeartbeat(promise, onProgress, { from = 55, to = 61, everyMs = 1500 } = {}) {
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

/**
 * @param {number} width
 * @param {number} height
 */
function optionBandRegion(width, height) {
  const y = Math.floor(height * 0.52)
  return {
    x: Math.floor(width * 0.04),
    y,
    width: Math.floor(width * 0.92),
    height: Math.max(40, height - y - Math.floor(height * 0.04)),
    source: 'boost:options-band',
  }
}

/** True when A–D are likely graphs — skip option-band OCR (axis ticks leak into stem). */
function looksLikeGraphOptionPage(text) {
  const t = String(text ?? '')
  if (stemSaysOptionsAreFigures(t)) return true
  return (
    /\b(?:graphs?|curves?|figures?|diagrams?|plots?|sketches?)\b/i.test(t) &&
    /\b(?:option|choice|below|following|shown|given)\b/i.test(t)
  )
}

/**
 * @param {HTMLImageElement} img
 * @param {string} srcUrl
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {AbortSignal} [signal]
 */
async function recognizeCrop(img, srcUrl, rect, signal) {
  throwIfAborted(signal)
  const cropUrl = cropLoadedImage(img, rect, { maxWidth: 1800, quality: 0.93, srcHint: srcUrl })
  const latex = await recognizeEquationImage(cropUrl, signal)
  return latex?.trim() ? latex.trim() : ''
}

/**
 * Aggressive second pass: more ONNX crops + enhanced Tesseract, pick best locally.
 * @param {File | Blob} input
 * @param {string} initialText first hybrid pass output
 * @param {(pct: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
export async function boostLocalOcrQuality(input, initialText, onProgress, signal) {
  throwIfAborted(signal)
  const initial = String(initialText ?? '').trim()
  if (!shouldRunLocalOcrBoost(initial)) {
    return { text: initial, boosted: false, score: scoreOcrCandidate(initial, { source: 'hybrid:merged' }) }
  }

  try {
    return await withOcrTimeout(
      runBoostLocalOcrQuality(input, initial, onProgress, signal),
      BOOST_TOTAL_MS,
      'Quality boost timed out',
    )
  } catch (err) {
    if (isAbortError(err)) throw err
    console.warn('[TestVantages] Local OCR quality boost skipped:', err?.message ?? err)
    return { text: initial, boosted: false, score: scoreOcrCandidate(initial, { source: 'hybrid:merged' }) }
  }
}

/**
 * @param {File | Blob} input
 * @param {string} initial
 * @param {(pct: number) => void} [onProgress]
 * @param {AbortSignal} [signal]
 */
async function runBoostLocalOcrQuality(input, initial, onProgress, signal) {
  onProgress?.(55)
  /** @type {Array<{ text: string, source?: string }>} */
  const candidates = [{ text: initial, source: 'hybrid:merged' }]

  try {
    await waitWithProgressHeartbeat(
      withOcrTimeout(
        loadMathOcrPipeline((pct) => onProgress?.(62 + Math.round(pct * 0.08)), signal),
        MATH_OCR_MODEL_LOAD_MS,
        'LaTeX model load timed out',
      ),
      onProgress,
      { from: 55, to: 61 },
    )

    const layout = await withOcrTimeout(
      recognizeTesseractLayout(input, (pct) => onProgress?.(64 + Math.round(pct * 0.06)), signal),
      BOOST_TESSERACT_LAYOUT_MS,
      'Layout OCR timed out during boost',
    )
    const srcUrl = await blobToDataUrl(input)
    const loadedImg = await loadImageForCrop(srcUrl)
    const w = loadedImg.naturalWidth || loadedImg.width
    const h = loadedImg.naturalHeight || loadedImg.height

    const regions = await resolveMathRegions(layout, input, {
      signal,
      maxRegions: BOOST_MAX_REGIONS,
    })

    /** @type {import('./hybridOcrMerge.js').RegionOcrResult[]} */
    const ocrResults = []
    const stemRect = buildStemBandRegion(w, h)
    // Graph option panels — do not OCR the option band (axis ticks leak into stem text).
    const skipOptionBand = looksLikeGraphOptionPage(initial)
    const optsRect = skipOptionBand ? null : optionBandRegion(w, h)
    const rects = [
      stemRect,
      ...(optsRect ? [optsRect] : []),
      ...regions.filter((r) => r.source !== 'stem:band'),
    ]

    const uniqueRects = []
    for (const r of rects) {
      if (uniqueRects.length >= BOOST_MAX_REGIONS) break
      if (uniqueRects.some((u) => Math.abs(u.y - r.y) < 8 && Math.abs(u.x - r.x) < 8)) continue
      uniqueRects.push(r)
    }

    onProgress?.(72)
    const batch = await mapConcurrent(uniqueRects, MATH_OCR_REGION_CONCURRENCY, async (rect, i) => {
      const latex = await recognizeCrop(loadedImg, srcUrl, rect, signal)
      onProgress?.(72 + Math.round(((i + 1) / uniqueRects.length) * 18))
      return latex ? { rect, latex, lineText: rect.lineText ?? '' } : null
    })
    ocrResults.push(...batch.filter(Boolean))

    if (ocrResults.length) {
      const merged = mergeHybridOcrText(initial, ocrResults)
      const finalized = pickHybridFinalResult(initial, merged, layout)
      candidates.push({ text: finalized, source: 'hybrid:boost-pass' })
    }
  } catch (err) {
    if (isAbortError(err)) throw err
    console.warn('[TestVantages] Local OCR boost (ONNX) partial:', err)
  }

  const onnxHelped = candidates.some((c) => c.source === 'hybrid:boost-pass')
  if (!onnxHelped) {
    try {
      onProgress?.(92)
      const enhanced = await recognizeWithEnhancedTesseract(input, () => {}, {
        signal,
        bookMode: false,
        fastMode: false,
        skipPreprocess: false,
      })
      if (enhanced?.trim()) {
        candidates.push({
          text: normalizeMathText(finalizeOcrText(enhanced)),
          source: 'builtin:boost-tesseract',
        })
      }
    } catch (err) {
      if (isAbortError(err)) throw err
      console.warn('[TestVantages] Local OCR boost (Tesseract) skipped:', err)
    }
  }

  const best = pickBestOcrCandidate(candidates)
  const boosted = best.source !== 'hybrid:merged'
  if (boosted) {
    console.info('[TestVantages] Local OCR quality boost improved extraction', best.source)
  }
  onProgress?.(100)
  return {
    text: best.text || initial,
    boosted,
    score: best.score,
    source: best.source,
  }
}
