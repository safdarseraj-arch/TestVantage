import { throwIfAborted, yieldToMain } from './ocrAbort.js'
import { deskewCanvas } from './deskewImage.js'

/** @typedef {'standard' | 'high-contrast' | 'sharp' | 'watermark-suppress'} OcrPreprocessMode */

/** Max edge for fast Tesseract layout — large phone screenshots otherwise stall at ~25%. */
export const TESSERACT_LAYOUT_MAX_DIM = 1600

/**
 * Shrink only (never upscale). Speeds Tesseract on 3k–8k phone screenshots.
 * @param {File | Blob} file
 * @param {{ signal?: AbortSignal, maxDim?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function downscaleImageForOcr(file, opts = {}) {
  const { signal, maxDim = TESSERACT_LAYOUT_MAX_DIM } = opts
  throwIfAborted(signal)

  const bitmap = await createImageBitmap(file)
  throwIfAborted(signal)
  try {
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= maxDim) {
      // Already small — return original (avoid re-encode cost)
      return file instanceof Blob ? file : new Blob([file])
    }
    const scale = maxDim / longest
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, w, h)
    await yieldToMain()
    throwIfAborted(signal)
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (signal?.aborted) {
            reject(new DOMException('OCR cancelled', 'AbortError'))
            return
          }
          if (blob) resolve(blob)
          else reject(new Error('Image downscale failed'))
        },
        'image/jpeg',
        0.92,
      )
    })
  } finally {
    bitmap.close?.()
  }
}

/**
 * Upscale small scans + boost contrast before OCR so symbols like √ ∫ θ are clearer.
 * Large images are downscaled (never blown up past targetMax — that made OCR crawl).
 * @param {File | Blob} file
 * @param {{ signal?: AbortSignal, mode?: OcrPreprocessMode, targetMax?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function preprocessImageForOcr(file, opts = {}) {
  const { signal, mode = 'standard', targetMax = 2800 } = opts
  throwIfAborted(signal)

  const bitmap = await createImageBitmap(file)
  throwIfAborted(signal)

  const maxDim = Math.max(bitmap.width, bitmap.height)
  // Small images: mild upscale for clarity. Large: shrink to targetMax (was always ≥1.5×).
  let scale = targetMax / maxDim
  if (maxDim < targetMax) scale = Math.min(2.2, Math.max(1, scale))
  else scale = Math.min(1, scale)

  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas not supported')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  await yieldToMain()
  throwIfAborted(signal)

  // Deskew phone photos of exam papers before contrast (small angles only).
  try {
    deskewCanvas(ctx, w, h, { maxAbsDeg: 12 })
  } catch {
    /* deskew is best-effort */
  }

  await yieldToMain()
  throwIfAborted(signal)

  const imageData = ctx.getImageData(0, 0, w, h)
  const d = imageData.data
  const contrast = mode === 'high-contrast' ? 1.55 : mode === 'sharp' ? 1.38 : 1.28
  const threshold = mode === 'sharp' ? 175 : null
  const suppressWatermark = mode === 'watermark-suppress' || mode === 'high-contrast'
  const rowBytes = w * 4

  // Adaptive contrast: darken midtones when page is washed out (photo glare).
  let sumGray = 0
  const sampleStep = Math.max(1, Math.floor((w * h) / 8000))
  let samples = 0
  for (let i = 0; i < d.length; i += 4 * sampleStep) {
    sumGray += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    samples += 1
  }
  const meanGray = samples ? sumGray / samples : 180
  const glareBoost = meanGray > 200 ? 1.12 : meanGray > 185 ? 1.06 : 1
  const effectiveContrast = contrast * glareBoost

  for (let row = 0; row < h; row++) {
    if (row % 24 === 0) {
      throwIfAborted(signal)
      await yieldToMain()
    }
    for (let col = 0; col < w; col++) {
      const i = row * rowBytes + col * 4
      let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      if (suppressWatermark && gray >= 135 && gray <= 235) {
        const fade = Math.min(1, Math.max(0, (gray - 135) / 95))
        gray = gray + fade * (255 - gray) * 0.88
      }
      let v = (gray - 128) * effectiveContrast + 128
      if (threshold != null) v = v >= threshold ? 255 : 0
      // Mild edge emphasis for faint print (not full binarize unless sharp mode)
      if (threshold == null && v < 140 && v > 90) v = v * 0.92
      v = Math.max(0, Math.min(255, v))
      d[i] = d[i + 1] = d[i + 2] = v
    }
  }
  ctx.putImageData(imageData, 0, 0)

  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (signal?.aborted) {
        reject(new DOMException('OCR cancelled', 'AbortError'))
        return
      }
      if (blob) resolve(blob)
      else reject(new Error('Image preprocessing failed'))
    }, 'image/png')
  })
}
