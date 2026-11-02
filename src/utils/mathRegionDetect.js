import {
  MAX_MATH_REGIONS_PER_PAGE,
  MIN_MATH_REGION_PX,
  MATH_REGION_MAX_BOTTOM_FRAC,
} from './mathOcrConfig.js'

import {
  mathOptionRegionsFromTesseractPage,
  mathRegionsFromTesseractPage,
} from './tesseractMathRegions.js'

/**
 * @typedef {{ x: number, y: number, width: number, height: number, score?: number, lineText?: string, source?: string }} MathRegion
 */

function isDarkPixel(r, g, b, a) {
  if (a < 40) return false
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  return lum < 175
}

/**
 * Scan row ink profile and return horizontal bands likely to be display/inline math.
 * Pure function — testable without canvas.
 * @param {Uint8ClampedArray} rgba width×height×4
 * @param {number} width
 * @param {number} height
 * @param {{ maxRegions?: number, maxBottomFrac?: number }} [opts]
 * @returns {MathRegion[]}
 */
export function detectMathRegionsFromPixels(rgba, width, height, opts = {}) {
  if (!rgba?.length || width < 8 || height < 8) return []

  const maxRegions = opts.maxRegions ?? MAX_MATH_REGIONS_PER_PAGE
  const maxBottom = Math.floor(height * (opts.maxBottomFrac ?? MATH_REGION_MAX_BOTTOM_FRAC))
  const rowInk = new Float32Array(height)
  const colInk = new Float32Array(width)

  for (let y = 0; y < height; y++) {
    let count = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (isDarkPixel(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) {
        count++
        colInk[x]++
      }
    }
    rowInk[y] = count / width
  }

  const smoothRow = new Float32Array(height)
  for (let y = 0; y < height; y++) {
    let sum = 0
    let n = 0
    for (let k = -2; k <= 2; k++) {
      const yy = y + k
      if (yy >= 0 && yy < height) {
        sum += rowInk[yy]
        n++
      }
    }
    smoothRow[y] = n ? sum / n : 0
  }

  /** @type {MathRegion[]} */
  const bands = []
  let y = 0
  while (y < maxBottom) {
    while (y < maxBottom && smoothRow[y] < 0.01) y++
    if (y >= maxBottom) break
    const y0 = y
    while (y < maxBottom && smoothRow[y] >= 0.01) y++
    const y1 = y
    const bandH = y1 - y0
    if (bandH < MIN_MATH_REGION_PX || bandH > Math.min(280, height * 0.45)) continue

    let x0 = width
    let x1 = 0
    let inkCells = 0
    for (let yy = y0; yy < y1; yy++) {
      for (let x = 0; x < width; x++) {
        const i = (yy * width + x) * 4
        if (!isDarkPixel(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) continue
        inkCells++
        if (x < x0) x0 = x
        if (x > x1) x1 = x
      }
    }
    if (inkCells < 24) continue

    const regionW = x1 - x0 + 1
    const regionH = bandH
    if (regionW < MIN_MATH_REGION_PX || regionH < MIN_MATH_REGION_PX) continue

    const inkRatio = inkCells / (regionW * regionH)
    const widthFrac = regionW / width
    if (inkRatio < 0.04 || inkRatio > 0.9) continue
    if (widthFrac > 0.96 && regionH < 40) continue

    let score = 0
    score += inkRatio * 40
    if (widthFrac > 0.2 && widthFrac < 0.88) score += 12
    if (regionH >= 28 && regionH <= 160) score += 10
    if (bandH >= 35 && bandH <= 120) score += 8

    bands.push({
      x: Math.max(0, x0 - 4),
      y: Math.max(0, y0 - 3),
      width: Math.min(width - x0, regionW + 8),
      height: Math.min(maxBottom - y0, regionH + 6),
      score,
    })
  }

  bands.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const picked = []
  for (const band of bands) {
    if (picked.length >= maxRegions) break
    const overlaps = picked.some((p) => regionIoU(p, band) > 0.35)
    if (!overlaps) picked.push(band)
  }

  return picked.sort((a, b) => a.y - b.y)
}

export function regionIoU(a, b) {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.width, b.x + b.width)
  const y1 = Math.min(a.y + a.height, b.y + b.height)
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  const union = a.width * a.height + b.width * b.height - inter
  return union > 0 ? inter / union : 0
}

/**
 * Prefer tight Tesseract boxes; fill gaps with ink-band fallback.
 * @param {MathRegion[]} tesseractRegions
 * @param {MathRegion[]} pixelRegions
 * @param {number} [maxRegions]
 */
export function mergeRegionSources(tesseractRegions, pixelRegions, maxRegions = MAX_MATH_REGIONS_PER_PAGE) {
  /** @type {MathRegion[]} */
  const out = [...(tesseractRegions ?? [])]

  for (const px of pixelRegions ?? []) {
    if (out.length >= maxRegions) break
    const overlapped = out.some((t) => regionIoU(t, px) > 0.25)
    if (!overlapped) out.push({ ...px, source: px.source ?? 'pixel:band' })
  }

  const sorted = out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  /** @type {MathRegion[]} */
  const picked = []
  for (const r of sorted) {
    if (picked.length >= maxRegions) break
    if (picked.some((p) => regionIoU(p, r) > 0.45)) continue
    picked.push(r)
  }
  return picked.sort((a, b) => a.y - b.y)
}

/**
 * @param {import('tesseract.js').Page | null | undefined} tesseractPage
 * @param {Blob} blob
 * @param {{ signal?: AbortSignal, maxRegions?: number }} [opts]
 */
export async function resolveMathRegions(tesseractPage, blob, opts = {}) {
  const maxRegions = opts.maxRegions ?? MAX_MATH_REGIONS_PER_PAGE
  const optionSlots = Math.min(4, Math.max(2, Math.floor(maxRegions * 0.35)))
  const stemSlots = Math.max(4, maxRegions - optionSlots)
  const fromTess = mathRegionsFromTesseractPage(tesseractPage, { maxRegions: stemSlots })
  const fromOpts = mathOptionRegionsFromTesseractPage(tesseractPage, { maxRegions: optionSlots })
  const fromPixels = await detectMathRegionsFromImage(blob, { ...opts, maxRegions })
  const merged = mergeRegionSources(fromTess, fromOpts, maxRegions)
  return mergeRegionSources(merged, fromPixels, maxRegions)
}

/**
 * Detect equation crops from an upload blob (browser only).
 * @param {Blob} blob
 * @param {{ signal?: AbortSignal, maxRegions?: number }} [opts]
 * @returns {Promise<MathRegion[]>}
 */
/**
 * Full question-stem band (excludes bottom MCQ option rows) for whole-stem LaTeX ONNX pass.
 * @param {number} width natural pixels
 * @param {number} height natural pixels
 */
export function buildStemBandRegion(width, height) {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  return {
    x: Math.round(w * 0.03),
    y: Math.round(h * 0.02),
    width: Math.round(w * 0.94),
    height: Math.round(h * MATH_REGION_MAX_BOTTOM_FRAC),
    lineText: '',
    source: 'stem:band',
  }
}

export async function detectMathRegionsFromImage(blob, opts = {}) {
  if (typeof document === 'undefined' || !blob?.size) return []
  const bitmap = await createImageBitmap(blob)
  try {
    const maxDim = 2200
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    let regions = detectMathRegionsFromPixels(data, w, h, opts)
    if (scale < 1) {
      const inv = 1 / scale
      regions = regions.map((r) => ({
        ...r,
        x: Math.round(r.x * inv),
        y: Math.round(r.y * inv),
        width: Math.round(r.width * inv),
        height: Math.round(r.height * inv),
      }))
    }
    return regions
  } finally {
    bitmap.close?.()
  }
}
