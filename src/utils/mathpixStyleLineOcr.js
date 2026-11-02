/**
 * Mathpix-style line OCR pipeline (local).
 * 1. Build line_data from Tesseract layout
 * 2. ONNX LaTeX per math/garbled line (word-level routing like Mathpix word_data)
 * 3. Confidence filter (conversion_output)
 * 4. Geometry-based MCQ split from line bands
 */

import { recognizeTesseractLayout } from './enhancedTesseract.js'
import { buildLineDataFromTesseractPage, lineDataToDocumentText } from './ocrLineData.js'
import { parseMcqFromTesseractPage } from './ocrWordData.js'
import { setLastOcrLineData, linkOcrLayoutSource } from './ocrLineDataCache.js'
import { looksLikeGarbledMathLine, normalizeTexifyLatex } from './hybridOcrMerge.js'
import { bboxToRect } from './tesseractMathRegions.js'
import { cropLoadedImage, loadImageForCrop } from './cropImageRegion.js'
import { blobToDataUrl, loadMathOcrPipeline, recognizeEquationImage } from './onnxMathOcr.js'
import { finalizeOcrText } from './inferMathFromPlainOcr.js'
import { normalizeMathText } from './normalizeMathText.js'
import { throwIfAborted, isAbortError } from './ocrAbort.js'
import { mapConcurrent } from './ocrConcurrency.js'
import { inferSubscriptsOnTesseractPage, enrichPageWordsWithOnnx, linesNeedingRetry } from './wordGeometryOnnx.js'
import { MATH_OCR_REGION_CONCURRENCY } from './mathOcrConfig.js'

/**
 * @param {import('./ocrLineData.js').OcrLineData[]} lineData
 * @param {HTMLImageElement} img
 * @param {string} srcUrl
 * @param {AbortSignal} [signal]
 */
export async function enrichLineDataWithOnnx(lineData, img, srcUrl, signal) {
  const mathLines = lineData.filter(
    (l) =>
      l.included &&
      (l.type === 'math' || l.type === 'mcq_option' || looksLikeGarbledMathLine(l.text)),
  )
  if (!mathLines.length) return lineData

  await mapConcurrent(mathLines, MATH_OCR_REGION_CONCURRENCY, async (line) => {
    throwIfAborted(signal)
    try {
      const rect = bboxToRect(line.bbox, 10)
      const cropUrl = cropLoadedImage(img, rect, { maxWidth: 1600, quality: 0.92, srcHint: srcUrl })
      const latex = await recognizeEquationImage(cropUrl, signal)
      if (latex?.trim()) {
        line.text = normalizeTexifyLatex(latex)
        line.type = 'math'
        line.confidenceRate = Math.max(line.confidenceRate, 0.78)
        line.conversionOutput = true
        line.included = true
      }
    } catch {
      /* keep Tesseract line */
    }
  })

  return lineData
}

/**
 * @param {{
 *   layout: import('tesseract.js').Page
 *   input: File | Blob
 *   imageSize?: { width: number, height: number }
 *   signal?: AbortSignal
 *   useOnnx?: boolean
 *   wordOnnx?: boolean
 *   sourceFile?: File | Blob
 *   onProgress?: (pct: number) => void
 * }} ctx
 * wordOnnx: per-word crops are slow; hybrid uses region crops instead (default false).
 */
export async function runMathpixStyleLinePipeline(ctx) {
  const {
    layout: layoutIn,
    input,
    imageSize,
    signal,
    useOnnx = true,
    wordOnnx = false,
    sourceFile,
    onProgress,
  } = ctx
  throwIfAborted(signal)

  let layout = layoutIn
  inferSubscriptsOnTesseractPage(layout)

  let lineData = buildLineDataFromTesseractPage(layout, imageSize)
  if (!lineData.length) {
    onProgress?.(100)
    return { text: '', lineData, mcq: null, layout }
  }

  onProgress?.(12)

  if (useOnnx) {
    try {
      onProgress?.(18)
      await loadMathOcrPipeline((p) => onProgress?.(18 + Math.round((Number(p) || 0) * 0.2)), signal)
      onProgress?.(42)
      const srcUrl = await blobToDataUrl(input)
      const img = await loadImageForCrop(srcUrl)

      if (wordOnnx) {
        await enrichPageWordsWithOnnx(layout, img, srcUrl, signal)
        lineData = buildLineDataFromTesseractPage(layout, imageSize)
        onProgress?.(58)
      }

      const retryLines = linesNeedingRetry(lineData)
      const targets = retryLines.length ? retryLines : lineData.filter(
        (l) =>
          l.included &&
          (l.type === 'math' || l.type === 'mcq_option' || looksLikeGarbledMathLine(l.text)),
      )
      const cap = Math.min(targets.length, 8)
      if (cap) {
        await mapConcurrent(targets.slice(0, cap), MATH_OCR_REGION_CONCURRENCY, async (line, i) => {
          throwIfAborted(signal)
          try {
            const rect = bboxToRect(line.bbox, 10)
            const cropUrl = cropLoadedImage(img, rect, {
              maxWidth: 1600,
              quality: 0.92,
              srcHint: srcUrl,
            })
            const latex = await recognizeEquationImage(cropUrl, signal)
            if (latex?.trim()) {
              line.text = normalizeTexifyLatex(latex)
              line.type = 'math'
              line.confidenceRate = Math.max(line.confidenceRate, 0.78)
              line.conversionOutput = true
              line.included = true
            }
          } catch {
            /* keep Tesseract line */
          }
          onProgress?.(58 + Math.round(((i + 1) / cap) * 35))
        })
      } else {
        onProgress?.(90)
      }
    } catch (err) {
      if (isAbortError(err)) throw err
      console.warn('[TestVantages] Word/line ONNX enrich skipped:', err)
    }
  }

  onProgress?.(92)
  setLastOcrLineData(input, lineData, { page: layout, imageSize })
  if (sourceFile && sourceFile !== input) linkOcrLayoutSource(sourceFile, input)

  const doc = lineDataToDocumentText(lineData)
  const polished = normalizeMathText(finalizeOcrText(doc))
  const mcq = parseMcqFromTesseractPage(layout, imageSize)

  let text = polished
  if (mcq && mcq.optionsFound >= 2) {
    const optBlock = mcq.options
      .map((o, i) => (o?.trim() ? `(${String.fromCharCode(65 + i)}) ${o.trim()}` : ''))
      .filter(Boolean)
      .join('\n')
    text = `${mcq.text}\n${optBlock}`
  }

  onProgress?.(100)
  return { text, lineData, mcq, layout }
}

/**
 * @param {File | Blob} input
 * @param {{ signal?: AbortSignal, useOnnx?: boolean, onProgress?: (n: number) => void }} [opts]
 */
export async function recognizeWithMathpixStyleLines(input, opts = {}) {
  const { signal, useOnnx = true, onProgress } = opts
  onProgress?.(5)
  const layout = await recognizeTesseractLayout(input, (p) => onProgress?.(5 + Math.round(p * 0.2)), signal)
  onProgress?.(28)

  const bitmap = await createImageBitmap(input)
  const imageSize = { width: bitmap.width, height: bitmap.height }
  bitmap.close?.()

  const { text, lineData, mcq } = await runMathpixStyleLinePipeline({
    layout,
    input,
    imageSize,
    signal,
    useOnnx,
    wordOnnx: useOnnx,
    onProgress: (p) => onProgress?.(28 + Math.round((Number(p) || 0) * 0.65)),
  })
  onProgress?.(95)

  const candidate = {
    text,
    raw: text,
    source: 'mathpix-style:lines',
    confidence: lineData.reduce((s, l) => s + l.confidenceRate, 0) / Math.max(1, lineData.length) }

  if (mcq?.optionsFound >= 3) {
    candidate.source =
      mcq.source === 'mathpix-word-geometry' ? 'mathpix-style:word-mcq' : 'mathpix-style:mcq-lines'
  }

  onProgress?.(100)
  return { text, lineData, mcq, candidate }
}
