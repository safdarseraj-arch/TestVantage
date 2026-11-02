/**
 * Word-level ONNX + subscript geometry — local Mathpix word_data parity.
 */

import { bboxToRect, looksLikeMathWord } from './tesseractMathRegions.js'
import { looksLikeGarbledMathLine, normalizeTexifyLatex } from './hybridOcrMerge.js'
import { cropLoadedImage } from './cropImageRegion.js'
import { recognizeEquationImage } from './onnxMathOcr.js'
import { mapConcurrent } from './ocrConcurrency.js'
import { MATH_OCR_REGION_CONCURRENCY } from './mathOcrConfig.js'
import { throwIfAborted } from './ocrAbort.js'
import { buildWordDataFromTesseractPage } from './ocrWordData.js'
import { inferSubscriptsOnTesseractPage } from './subscriptWordGeometry.js'

const MIN_WORD_ONNX_CONFIDENCE = 0.62
const MAX_WORD_ONNX_PER_PAGE = 24

/** @param {import('tesseract.js').Page} page */
export { inferSubscriptsOnTesseractPage }

/** @param {import('tesseract.js').Word} word */
function wordNeedsOnnx(word) {
  const conf = (word.confidence ?? 50) / 100
  const t = String(word.text ?? '').trim()
  if (!t || t.length > 48) return false
  if (conf >= MIN_WORD_ONNX_CONFIDENCE && !looksLikeMathWord(word) && !looksLikeGarbledMathLine(t)) {
    return false
  }
  return looksLikeMathWord(word) || looksLikeGarbledMathLine(t) || conf < MIN_WORD_ONNX_CONFIDENCE
}

/**
 * @param {import('tesseract.js').Page} page
 * @param {HTMLImageElement} img
 * @param {string} srcUrl
 * @param {AbortSignal} [signal]
 */
export async function enrichPageWordsWithOnnx(page, img, srcUrl, signal) {
  throwIfAborted(signal)
  const wordData = buildWordDataFromTesseractPage(page)
  /** @type {{ word: import('tesseract.js').Word }[]} */
  const targets = []

  for (const line of page?.lines ?? []) {
    for (const word of line.words ?? []) {
      if (wordNeedsOnnx(word)) targets.push({ word })
    }
  }

  const capped = targets.slice(0, MAX_WORD_ONNX_PER_PAGE)
  await mapConcurrent(capped, MATH_OCR_REGION_CONCURRENCY, async ({ word }) => {
    throwIfAborted(signal)
    if (!word.bbox) return
    try {
      const rect = bboxToRect(word.bbox, 5)
      const cropUrl = cropLoadedImage(img, rect, { maxWidth: 1200, quality: 0.92, srcHint: srcUrl })
      const latex = await recognizeEquationImage(cropUrl, signal)
      if (latex?.trim()) {
        word.text = normalizeTexifyLatex(latex)
        word.confidence = Math.max(word.confidence ?? 0, 78)
      }
    } catch {
      /* keep tesseract word */
    }
  })

  for (const line of page?.lines ?? []) {
    line.text = (line.words ?? [])
      .map((w) => String(w.text ?? '').trim())
      .filter(Boolean)
      .join(' ')
  }

  return { page, wordData, wordsEnriched: capped.length }
}

/**
 * @param {import('./ocrLineData.js').OcrLineData[]} lineData
 */
export function linesNeedingRetry(lineData) {
  return (lineData ?? []).filter(
    (l) =>
      l.included &&
      l.text.trim() &&
      (l.confidenceRate < 0.55 || looksLikeGarbledMathLine(l.text)),
  )
}
