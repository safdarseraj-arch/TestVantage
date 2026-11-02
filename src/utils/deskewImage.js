/**
 * Estimate small-angle skew (phone photos of exam papers) and deskew for OCR.
 * Pure canvas — no extra deps. Safe no-op when skew is tiny or image is tiny.
 */

/**
 * Projection-profile variance: text lines create high variance when upright.
 * @param {Uint8ClampedArray} data
 * @param {number} w
 * @param {number} h
 * @param {number} angleDeg
 */
function projectionVarianceAtAngle(data, w, h, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const bins = new Float64Array(h)
  const counts = new Float64Array(h)
  const cx = w / 2
  const cy = h / 2
  const step = Math.max(1, Math.floor(Math.min(w, h) / 180))

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (gray > 210) continue // skip paper background
      const dx = x - cx
      const dy = y - cy
      const ry = Math.round(cx * sin + dy * cos + cy)
      if (ry < 0 || ry >= h) continue
      bins[ry] += 255 - gray
      counts[ry] += 1
    }
  }

  let sum = 0
  let n = 0
  for (let i = 0; i < h; i++) {
    if (counts[i] < 1) continue
    const v = bins[i] / counts[i]
    sum += v
    n += 1
  }
  if (n < 8) return 0
  const mean = sum / n
  let varSum = 0
  for (let i = 0; i < h; i++) {
    if (counts[i] < 1) continue
    const v = bins[i] / counts[i] - mean
    varSum += v * v
  }
  return varSum / n
}

/**
 * @param {ImageData} imageData
 * @param {{ maxAbsDeg?: number, step?: number }} [opts]
 * @returns {number} best skew angle in degrees (negative = clockwise in canvas rotate)
 */
export function estimateSkewAngleDegrees(imageData, opts = {}) {
  const { maxAbsDeg = 12, step = 1 } = opts
  const { data, width: w, height: h } = imageData
  if (w < 80 || h < 80) return 0

  let bestAngle = 0
  let bestVar = -1
  for (let a = -maxAbsDeg; a <= maxAbsDeg; a += step) {
    const v = projectionVarianceAtAngle(data, w, h, a)
    if (v > bestVar) {
      bestVar = v
      bestAngle = a
    }
  }
  // Fine pass around best
  if (step > 0.5) {
    for (let a = bestAngle - step + 0.5; a <= bestAngle + step - 0.5; a += 0.5) {
      if (Math.abs(a) > maxAbsDeg) continue
      const v = projectionVarianceAtAngle(data, w, h, a)
      if (v > bestVar) {
        bestVar = v
        bestAngle = a
      }
    }
  }
  if (Math.abs(bestAngle) < 0.4) return 0
  return bestAngle
}

/**
 * Rotate image data about center; fill with white.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ImageData} imageData
 * @param {number} angleDeg
 * @returns {ImageData}
 */
export function rotateImageData(ctx, imageData, angleDeg) {
  if (!angleDeg || Math.abs(angleDeg) < 0.4) return imageData
  const { width: w, height: h } = imageData
  const src = document.createElement('canvas')
  src.width = w
  src.height = h
  const sctx = src.getContext('2d')
  if (!sctx) return imageData
  sctx.putImageData(imageData, 0, 0)

  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  ctx.translate(w / 2, h / 2)
  ctx.rotate((-angleDeg * Math.PI) / 180)
  ctx.drawImage(src, -w / 2, -h / 2)
  ctx.restore()
  return ctx.getImageData(0, 0, w, h)
}

/**
 * Deskew in-place on an existing canvas context that already has the image drawn.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {{ maxAbsDeg?: number }} [opts]
 * @returns {{ angle: number, applied: boolean }}
 */
export function deskewCanvas(ctx, w, h, opts = {}) {
  const imageData = ctx.getImageData(0, 0, w, h)
  const angle = estimateSkewAngleDegrees(imageData, opts)
  if (!angle) return { angle: 0, applied: false }
  rotateImageData(ctx, imageData, angle)
  return { angle, applied: true }
}
