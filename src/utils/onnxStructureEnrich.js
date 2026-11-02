/**
 * ONNX LaTeX enrichment for cached OCR structure (local Nougat/Texify — no Mathpix cloud).
 */

import { getLastOcrLayout, setLastOcrLineData } from './ocrLineDataCache.js'
import { segmentLineDataIntoStructure } from './documentStructure.js'
import { refineLineDataDiagramTypes } from './diagramClassifier.js'
import { enrichLineDataWithOnnx } from './mathpixStyleLineOcr.js'
import { blobToDataUrl, loadMathOcrPipeline } from './onnxMathOcr.js'
import { loadImageForCrop } from './cropImageRegion.js'
import { linesNeedingRetry } from './wordGeometryOnnx.js'
import { throwIfAborted, isAbortError } from './ocrAbort.js'
import { isLocalMathOcrEnabled } from './ocrSettings.js'

/**
 * Re-run ONNX LaTeX on math lines in cached layout, then rebuild document structure.
 * @param {File | Blob} sourceFile
 * @param {File | Blob} [imageBlob]
 * @param {AbortSignal} [signal]
 */
export async function buildOnnxEnrichedStructure(sourceFile, imageBlob, signal) {
  if (!sourceFile || !isLocalMathOcrEnabled()) return null
  const layout = getLastOcrLayout(sourceFile)
  if (!layout?.lineData?.length) return null

  let lineData = layout.lineData
  const imageSize = layout.imageSize ?? {}

  if (imageBlob && layout.page) {
    try {
      throwIfAborted(signal)
      await loadMathOcrPipeline(() => {}, signal)
      const srcUrl = await blobToDataUrl(imageBlob)
      const img = await loadImageForCrop(srcUrl)

      const retryLines = linesNeedingRetry(lineData)
      if (retryLines.length) {
        await enrichLineDataWithOnnx(retryLines, img, srcUrl, signal)
      } else {
        await enrichLineDataWithOnnx(
          lineData.filter((l) => l.type === 'math' || l.type === 'mcq_option'),
          img,
          srcUrl,
          signal,
        )
      }

      lineData = refineLineDataDiagramTypes(lineData, imageSize)
      setLastOcrLineData(imageBlob, lineData, {
        page: layout.page,
        imageSize,
      })
    } catch (err) {
      if (isAbortError(err)) throw err
      console.warn('[TestVantages] ONNX structure enrich skipped:', err)
    }
  }

  lineData = refineLineDataDiagramTypes(lineData, imageSize)
  return segmentLineDataIntoStructure(lineData, imageSize)
}

/**
 * @param {import('./documentStructure.js').DocumentStructure} structure
 */
export function structureHasOnnxMath(structure) {
  return (structure?.zones ?? []).some((z) =>
    z.lines.some((t) => /\\frac|\\int|\\sum|\\left|\\sqrt/i.test(t)),
  )
}
