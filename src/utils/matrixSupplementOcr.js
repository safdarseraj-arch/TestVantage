import { recognizeWithEnhancedTesseract } from './enhancedTesseract.js'
import { blobToDataUrl } from './onnxMathOcr.js'
import { cropLoadedImage, loadImageForCrop } from './cropImageRegion.js'
import { buildMatrixSupplementCropRect } from './matrixSupplementCrop.js'

export { buildMatrixSupplementCropRect }

/**
 * Fast Tesseract-only crop for missing Column-I row C — no full hybrid re-extract.
 * @param {File | Blob} file
 * @param {AbortSignal} [signal]
 */
export async function extractMatrixRowSupplementOcr(file, signal) {
  const srcUrl = await blobToDataUrl(file)
  const img = await loadImageForCrop(srcUrl)
  const rect = buildMatrixSupplementCropRect(img.naturalWidth, img.naturalHeight)
  const cropUrl = cropLoadedImage(img, rect, {
    maxWidth: 1800,
    quality: 0.9,
    srcHint: srcUrl,
  })
  const blob = await fetch(cropUrl).then((r) => r.blob())
  return recognizeWithEnhancedTesseract(blob, undefined, {
    signal,
    fastMode: true,
    skipPreprocess: true,
  })
}
