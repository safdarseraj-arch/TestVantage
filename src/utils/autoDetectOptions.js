/**
 * Auto-crop MCQ option graphs (A–D) from a single question screenshot.
 * Typical JEE layouts: 2×2 grid, vertical 1×4 stack, or horizontal 1×4 side-by-side row.
 */

import { cropImageDataUrl } from './cropImageRegion.js'

/** @param {string} src */
function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image.'))
    img.src = src
  })
}

/**
 * @param {string} src
 * @param {{ inkThreshold?: number, excludeTopRatio?: number, excludeBottomRatio?: number }} [opts]
 * @returns {Promise<{
 *   W: number
 *   H: number
 *   scale: number
 *   natW: number
 *   natH: number
 *   ink: Uint8Array
 *   rowInk: Int32Array
 *   colInk: Int32Array
 * } | null>}
 */
async function buildInkAnalysis(src, { inkThreshold = 205, excludeTopRatio = 0, excludeBottomRatio = 0 } = {}) {
  let img
  try {
    img = await loadImageElement(src)
  } catch {
    return null
  }
  const natW = img.naturalWidth
  const natH = img.naturalHeight
  if (!natW || !natH) return null

  const scale = Math.min(1, 1000 / natW)
  const W = Math.max(1, Math.round(natW * scale))
  const H = Math.max(1, Math.round(natH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, W, H)

  let data
  try {
    data = ctx.getImageData(0, 0, W, H).data
  } catch {
    return null
  }

  const ink = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4
      const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
      ink[y * W + x] = data[o + 3] > 40 && lum < inkThreshold ? 1 : 0
    }
  }

  const rowInk = new Int32Array(H)
  const colInk = new Int32Array(W)
  for (let y = 0; y < H; y++) {
    let c = 0
    const base = y * W
    for (let x = 0; x < W; x++) if (ink[base + x]) c++
    rowInk[y] = c
  }
  for (let x = 0; x < W; x++) {
    let c = 0
    for (let y = 0; y < H; y++) if (ink[y * W + x]) c++
    colInk[x] = c
  }

  return { W, H, scale, natW, natH, ink, rowInk, colInk, excludeTopRatio, excludeBottomRatio }
}

/**
 * @param {Int32Array} rowInk
 * @param {number} H
 * @param {number} W
 * @param {number} excludeTopRatio
 */
function findOptionsZoneTop(rowInk, H, W, excludeTopRatio) {
  const yMin = Math.round(H * Math.min(0.55, Math.max(0.22, excludeTopRatio)))
  const blankLimit = Math.max(2, Math.round(W * 0.004))
  const minGap = Math.max(4, Math.round(H * 0.014))

  let bestGap = 0
  let gapEnd = yMin
  let run = 0
  for (let y = yMin; y < Math.round(H * 0.78); y++) {
    if (rowInk[y] <= blankLimit) {
      run++
      if (run >= minGap && run > bestGap) {
        bestGap = run
        gapEnd = y - run + 1
      }
    } else {
      run = 0
    }
  }
  if (bestGap >= minGap) return Math.min(H - Math.round(H * 0.18), gapEnd + Math.round(minGap / 2))

  const probeFrom = Math.round(H * 0.28)
  const probeTo = Math.round(H * 0.68)
  const band = Math.max(8, Math.round(H * 0.06))
  let bestY = Math.round(H * 0.44)
  let bestDelta = 0
  for (let y = probeFrom; y < probeTo; y++) {
    const above = avgRows(rowInk, Math.max(0, y - band), y)
    const below = avgRows(rowInk, y, Math.min(H, y + band))
    const delta = below - above
    if (delta > bestDelta && below > W * 0.02) {
      bestDelta = delta
      bestY = y
    }
  }
  return Math.max(yMin, bestY)
}

/** @param {Int32Array} arr @param {number} a @param {number} b */
function avgRows(arr, a, b) {
  if (b <= a) return 0
  let s = 0
  for (let i = a; i < b; i++) s += arr[i]
  return s / (b - a)
}

/**
 * @param {Uint8Array} ink
 * @param {number} W
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 */
function cellInkRatio(ink, W, x0, y0, x1, y1) {
  let count = 0
  let total = 0
  for (let y = y0; y < y1; y++) {
    const base = y * W
    for (let x = x0; x < x1; x++) {
      total++
      if (ink[base + x]) count++
    }
  }
  return total ? count / total : 0
}

/** Tall narrow ink bands = stacked text lines, not graph plots. */
function cellLooksLikeVerticalTextList(ink, W, x0, y0, x1, y1) {
  const cellH = y1 - y0
  const cellW = x1 - x0
  if (cellH < 24 || cellW < 6) return false
  let inkRows = 0
  for (let y = y0; y < y1; y++) {
    let rowInk = 0
    const base = y * W
    for (let x = x0; x < x1; x++) if (ink[base + x]) rowInk++
    if (rowInk >= Math.max(2, cellW * 0.06)) inkRows++
  }
  const aspect = cellH / Math.max(1, cellW)
  return aspect > 2.2 && inkRows >= 7
}

/** Single-line horizontal text strip (A–D on one row) — not graph cells. */
function cellLooksLikeHorizontalTextStrip(ink, W, x0, y0, x1, y1) {
  const cellH = y1 - y0
  const cellW = x1 - x0
  if (cellW < 40 || cellH < 4) return false
  if (cellH > cellW * 0.22) return false
  let inkRows = 0
  for (let y = y0; y < y1; y++) {
    let rowInk = 0
    const base = y * W
    for (let x = x0; x < x1; x++) if (ink[base + x]) rowInk++
    if (rowInk >= Math.max(3, cellW * 0.04)) inkRows++
  }
  return inkRows <= 3 && cellW > cellH * 5
}

/** @param {{ width?: number, height?: number }} rect natural px @param {number} [natH] */
function rectLooksLikeSliverCrop(rect, natH = 0) {
  const w = rect.width ?? 0
  const h = rect.height ?? 0
  if (w < 24 || h < 12) return true
  if (natH > 0 && h < natH * 0.032) return true
  const aspect = w / Math.max(1, h)
  return aspect > 10 && h < 56
}

/** Reject crops that are mostly prose / equation lines (stem text leaked into grid). */
function cellLooksLikeProseText(ink, W, x0, y0, x1, y1) {
  if (cellLooksLikeVerticalTextList(ink, W, x0, y0, x1, y1)) return true
  if (cellLooksLikeHorizontalTextStrip(ink, W, x0, y0, x1, y1)) return true
  const cellW = x1 - x0
  if (cellW < 8) return false
  let fullWidthRows = 0
  let inkRows = 0
  for (let y = y0; y < y1; y++) {
    let rowInk = 0
    const base = y * W
    for (let x = x0; x < x1; x++) if (ink[base + x]) rowInk++
    if (rowInk > 0) inkRows++
    if (rowInk >= cellW * 0.42) fullWidthRows++
  }
  if (fullWidthRows >= 4 && fullWidthRows / Math.max(1, inkRows) > 0.32) return true
  if (fullWidthRows >= 6) return true
  return false
}

/** Graph cells: scattered ink, not dense prose bands or nearly blank. */
function cellLooksLikeGraph(ink, W, raw, minInk) {
  const ratio = cellInkRatio(ink, W, raw.x, raw.y, raw.x + raw.w, raw.y + raw.h)
  if (ratio < minInk) return false
  // Axis ticks + curves can be denser than sparse plots; prose is caught separately.
  if (ratio > 0.58) return false
  if (cellLooksLikeProseText(ink, W, raw.x, raw.y, raw.x + raw.w, raw.y + raw.h)) return false
  return true
}

/**
 * @param {ReturnType<typeof buildInkAnalysis>} analysis
 * @param {{ x: number, y: number, width: number, height: number }[]} rects natural px
 */
function validateOptionRects(analysis, rects) {
  if (!analysis || !rects?.length) return null
  const { ink, W, scale, natH } = analysis
  const minInk = 0.007
  let good = 0
  for (const rect of rects) {
    if (rectLooksLikeSliverCrop(rect, natH)) continue
    const raw = {
      x: Math.round(rect.x * scale),
      y: Math.round(rect.y * scale),
      w: Math.round(rect.width * scale),
      h: Math.round(rect.height * scale),
    }
    if (cellLooksLikeGraph(ink, W, raw, minInk)) good++
  }
  if (good < 3 || rects.some((r) => rectLooksLikeSliverCrop(r, natH))) return null
  return rects
}

/**
 * Ink row bands separated by horizontal gaps — vertical text MCQ (A)…(D) lines.
 * @param {Int32Array} rowInk
 * @param {number} W
 * @param {number} y0
 * @param {number} y1
 */
function findInkRowBands(rowInk, W, y0, y1) {
  const blankLimit = Math.max(2, Math.round(W * 0.006))
  const minBandH = Math.max(6, Math.round((y1 - y0) * 0.055))
  /** @type {{ y0: number, y1: number }[]} */
  const bands = []
  let inBand = false
  let bandStart = y0

  for (let y = y0; y <= y1; y++) {
    const hasInk = rowInk[y] > blankLimit
    if (hasInk && !inBand) {
      inBand = true
      bandStart = y
    } else if (!hasInk && inBand) {
      const h = y - bandStart
      if (h >= minBandH) bands.push({ y0: bandStart, y1: y - 1 })
      inBand = false
    }
  }
  if (inBand) {
    const h = y1 - bandStart + 1
    if (h >= minBandH) bands.push({ y0: bandStart, y1: y1 })
  }
  return bands
}

/**
 * Four option rows from ink gaps (text MCQ with (A)–(D) on separate lines).
 * @param {ReturnType<typeof buildInkAnalysis>} analysis
 * @param {number} zoneTop
 */
function layoutLabelRowRects(analysis, zoneTop) {
  const { W, H, scale, natW, natH, rowInk } = analysis
  const marginX = Math.round(W * 0.02)
  const x0 = marginX
  const x1 = W - marginX
  const y0 = zoneTop + Math.round(H * 0.004)
  const y1 = H - Math.round(H * Math.min(0.04, analysis.excludeBottomRatio || 0.02))
  if (y1 - y0 < H * 0.1) return null

  const bands = findInkRowBands(rowInk, W, y0, y1)
  if (bands.length < 4) return null

  const pick = bands.length === 4 ? bands : bands.slice(-4)
  const minNatH = Math.max(32, Math.round(natH * 0.038))
  const padY = Math.max(4, Math.round(H * 0.01))
  const inv = 1 / scale

  const rects = pick.map((b) => {
    const top = Math.max(0, b.y0 - padY)
    const bottom = Math.min(H - 1, b.y1 + padY)
    return {
      x: Math.round(x0 * inv),
      y: Math.round(top * inv),
      width: Math.round((x1 - x0) * inv),
      height: Math.round((bottom - top + 1) * inv),
    }
  })

  if (rects.some((r) => rectLooksLikeSliverCrop(r, natH) || r.height < minNatH)) return null
  if (rects.some((r) => r.width < natW * 0.22)) return null
  // Require graph-like ink (reject thin label-only bands under (A)–(D)).
  return validateOptionRects(analysis, rects)
}

/**
 * @param {Int32Array} lineInk
 * @param {number} lo
 * @param {number} hi
 * @param {number} band
 */
function bestGutterSplit(lineInk, lo, hi, band) {
  const midLo = lo + Math.round((hi - lo) * 0.22)
  const midHi = lo + Math.round((hi - lo) * 0.78)
  let best = Math.round((lo + hi) / 2)
  let bestScore = Infinity
  for (let p = midLo; p < midHi; p++) {
    let score = 0
    const a0 = Math.max(lo, p - band)
    const a1 = Math.min(hi, p + band)
    for (let i = a0; i < a1; i++) score += lineInk[i]
    if (score < bestScore) {
      bestScore = score
      best = p
    }
  }
  return best
}

/**
 * True when the options zone looks like one wide row of graphs (1×4), not 2×2 / stacked.
 * @param {number} zoneW
 * @param {number} zoneH
 * @param {number} [bandCount] ink row bands in the zone
 */
export function looksLikeHorizontalGraphRowLayout(zoneW, zoneH, bandCount = 0) {
  if (!(zoneW > 0) || !(zoneH > 0)) return false
  const aspect = zoneW / zoneH
  // Tall stacked options → not a horizontal row.
  if (aspect < 1.55) return false
  // Four stacked ink bands → rows4, not cols4.
  if (bandCount >= 4) return false
  // Wide short zone (typical four side-by-side plots + labels under them).
  if (aspect >= 2.15) return true
  if (aspect >= 1.75 && bandCount > 0 && bandCount <= 2) return true
  return false
}

/**
 * Find three vertical gutters that divide [lo, hi] into four columns.
 * @param {Int32Array} colInk
 * @param {number} lo
 * @param {number} hi
 * @param {number} band
 * @returns {[number, number, number] | null}
 */
function bestThreeColSplits(colInk, lo, hi, band) {
  const span = hi - lo
  if (span < 40) return null
  /** @type {number[]} */
  const splits = []
  for (let k = 1; k <= 3; k++) {
    const segLo = lo + Math.round((span * (k - 0.35)) / 4)
    const segHi = lo + Math.round((span * (k + 0.35)) / 4)
    const a = Math.max(lo + Math.round(span * 0.08), segLo)
    const b = Math.min(hi - Math.round(span * 0.08), segHi)
    if (b <= a + 2) return null
    splits.push(bestGutterSplit(colInk, a, b, band))
  }
  if (splits[0] >= splits[1] - 4 || splits[1] >= splits[2] - 4) return null
  return /** @type {[number, number, number]} */ (splits)
}

/**
 * @param {ReturnType<typeof buildInkAnalysis>} analysis
 * @param {number} zoneTop
 * @param {'grid2x2' | 'rows4' | 'cols4'} layout
 * @param {{ relaxed?: boolean, preferGraph?: boolean }} [opts]
 * @returns {{ x: number, y: number, width: number, height: number }[] | null}
 */
function layoutOptionRects(analysis, zoneTop, layout, { relaxed = false, preferGraph = true } = {}) {
  const { W, H, scale, natW, natH, ink, rowInk, colInk } = analysis
  const marginX = Math.round(W * 0.03)
  const marginY = Math.round(H * 0.008)
  const x0 = marginX
  const x1 = W - marginX
  const y0 = zoneTop + marginY
  const y1 = H - Math.round(H * Math.min(0.04, analysis.excludeBottomRatio || 0.02))
  const minZoneH = layout === 'cols4' ? H * 0.1 : H * 0.12
  if (y1 - y0 < minZoneH || x1 - x0 < W * 0.3) return null

  const pad = (box) => {
    const inv = 1 / scale
    const px = Math.round(W * 0.02)
    const py = Math.round(H * 0.012)
    const left = Math.max(0, box.x - px)
    const top = Math.max(0, box.y - py)
    const right = Math.min(W - 1, box.x + box.w + px)
    const bottom = Math.min(H - 1, box.y + box.h + py)
    return {
      x: Math.round(left * inv),
      y: Math.round(top * inv),
      width: Math.round((right - left + 1) * inv),
      height: Math.round((bottom - top + 1) * inv),
    }
  }

  const minInk = relaxed ? 0.004 : 0.007
  const minH = Math.max(24, Math.round(natH * (relaxed ? 0.028 : 0.036)))
  const minW = Math.max(24, Math.round(natW * (relaxed ? 0.055 : 0.07)))

  if (layout === 'grid2x2') {
    const splitY = bestGutterSplit(rowInk, y0, y1, Math.max(3, Math.round(H * 0.012)))
    const splitX = bestGutterSplit(colInk, x0, x1, Math.max(3, Math.round(W * 0.012)))
    const raw = [
      { x: x0, y: y0, w: splitX - x0, h: splitY - y0 },
      { x: splitX, y: y0, w: x1 - splitX, h: splitY - y0 },
      { x: x0, y: splitY, w: splitX - x0, h: y1 - splitY },
      { x: splitX, y: splitY, w: x1 - splitX, h: y1 - splitY },
    ]
    const rects = raw.map(pad)
    const ok = raw.every((r, i) => {
      const ratio = cellInkRatio(ink, W, r.x, r.y, r.x + r.w, r.y + r.h)
      const graphOk =
        ratio >= minInk &&
        rects[i].width >= minW &&
        rects[i].height >= minH &&
        !cellLooksLikeProseText(ink, W, r.x, r.y, r.x + r.w, r.y + r.h)
      return graphOk
    })
    if (!ok) return null
    const validated = validateOptionRects(analysis, rects)
    if (!validated) return null
    // Reject 2×2 mis-split of a 1×4 horizontal graph row (A/B = half-row, C/D = labels).
    if (!optionGraphPanelRectsLookValid(validated, natW, natH)) return null
    return validated
  }

  if (layout === 'cols4') {
    const gutterBand = Math.max(2, Math.round(W * 0.01))
    const gutters = bestThreeColSplits(colInk, x0, x1, gutterBand)
    /** @type {{ x: number, y: number, w: number, h: number }[]} */
    let raw
    if (gutters) {
      const [s1, s2, s3] = gutters
      raw = [
        { x: x0, y: y0, w: s1 - x0, h: y1 - y0 },
        { x: s1, y: y0, w: s2 - s1, h: y1 - y0 },
        { x: s2, y: y0, w: s3 - s2, h: y1 - y0 },
        { x: s3, y: y0, w: x1 - s3, h: y1 - y0 },
      ]
    } else {
      // Equal vertical panels across the options row (common JEE 1×4).
      const w = (x1 - x0) / 4
      raw = [0, 1, 2, 3].map((i) => ({
        x: Math.round(x0 + i * w),
        y: y0,
        w: Math.round(i < 3 ? w : x1 - (x0 + i * w)),
        h: y1 - y0,
      }))
    }
    const rects = raw.map(pad)
    const ok = raw.every((r, i) => {
      const ratio = cellInkRatio(ink, W, r.x, r.y, r.x + r.w, r.y + r.h)
      return (
        ratio >= minInk &&
        rects[i].width >= minW &&
        rects[i].height >= minH &&
        !cellLooksLikeProseText(ink, W, r.x, r.y, r.x + r.w, r.y + r.h)
      )
    })
    if (ok) {
      const validated = validateOptionRects(analysis, rects)
      if (validated && optionGraphPanelRectsLookValid(validated, natW, natH)) return validated
    }
    if (preferGraph && relaxed) {
      const weakOk = raw.every((r, i) => {
        const ratio = cellInkRatio(ink, W, r.x, r.y, r.x + r.w, r.y + r.h)
        return (
          ratio >= 0.002 &&
          rects[i].width >= Math.max(20, Math.round(natW * 0.08)) &&
          rects[i].height >= Math.max(20, Math.round(natH * 0.05))
        )
      })
      if (weakOk && optionGraphPanelRectsLookValid(rects, natW, natH)) return rects
    }
    return null
  }

  const h = (y1 - y0) / 4
  const bands = findInkRowBands(rowInk, W, y0, y1)
  if (bands.length >= 4) {
    const labelRows = layoutLabelRowRects(analysis, zoneTop)
    if (labelRows) return labelRows
  }
  // Equal 1×4 split for stacked graph panels (A/B/C/D).
  const raw = [0, 1, 2, 3].map((i) => ({
    x: x0,
    y: Math.round(y0 + i * h),
    w: x1 - x0,
    h: Math.round(i < 3 ? h : y1 - (y0 + i * h)),
  }))
  const rects = raw.map(pad)
  const ok = raw.every((r, i) => {
    const ratio = cellInkRatio(ink, W, r.x, r.y, r.x + r.w, r.y + r.h)
    const graphOk =
      ratio >= minInk &&
      rects[i].width >= minW &&
      rects[i].height >= minH &&
      !cellLooksLikeProseText(ink, W, r.x, r.y, r.x + r.w, r.y + r.h)
    return graphOk
  })
  if (ok) return validateOptionRects(analysis, rects)
  // Graph preference: accept equal split when each band has some ink (weak gutters).
  if (preferGraph && relaxed) {
    const weakOk = raw.every((r, i) => {
      const ratio = cellInkRatio(ink, W, r.x, r.y, r.x + r.w, r.y + r.h)
      return (
        ratio >= 0.002 &&
        rects[i].width >= minW &&
        rects[i].height >= Math.max(20, Math.round(natH * 0.025))
      )
    })
    if (weakOk && optionRectsLookValid(rects, natH)) return rects
  }
  return null
}

/**
 * Last-resort 2×2 split of the lower portion (works when ink gutters are weak).
 * @param {number} natW
 * @param {number} natH
 * @param {number} excludeTopRatio
 */
export function geometricOptionGridRects(natW, natH, excludeTopRatio = 0.38) {
  if (!natW || !natH) return null
  const top = Math.round(natH * Math.min(0.58, Math.max(0.28, excludeTopRatio)))
  const bottom = Math.round(natH * 0.98)
  const left = Math.round(natW * 0.03)
  const right = Math.round(natW * 0.97)
  const zoneH = bottom - top
  const zoneW = right - left
  if (zoneH < natH * 0.18 || zoneW < natW * 0.28) return null

  const gapX = Math.round(natW * 0.012)
  const gapY = Math.round(natH * 0.01)
  const halfW = Math.floor((zoneW - gapX) / 2)
  const halfH = Math.floor((zoneH - gapY) / 2)

  return [
    { x: left, y: top, width: halfW, height: halfH },
    { x: left + halfW + gapX, y: top, width: halfW, height: halfH },
    { x: left, y: top + halfH + gapY, width: halfW, height: halfH },
    { x: left + halfW + gapX, y: top + halfH + gapY, width: halfW, height: halfH },
  ]
}

/**
 * Last-resort vertical 1×4 stack (A/B/C/D rows) for graph options.
 * @param {number} natW
 * @param {number} natH
 * @param {number} excludeTopRatio
 */
export function geometricOptionRowRects(natW, natH, excludeTopRatio = 0.38) {
  if (!natW || !natH) return null
  const top = Math.round(natH * Math.min(0.58, Math.max(0.22, excludeTopRatio)))
  const bottom = Math.round(natH * 0.98)
  const left = Math.round(natW * 0.03)
  const right = Math.round(natW * 0.97)
  const zoneH = bottom - top
  const zoneW = right - left
  if (zoneH < natH * 0.22 || zoneW < natW * 0.28) return null

  const gapY = Math.round(natH * 0.008)
  const rowH = Math.floor((zoneH - gapY * 3) / 4)
  if (rowH < Math.max(28, Math.round(natH * 0.04))) return null

  return [0, 1, 2, 3].map((i) => ({
    x: left,
    y: top + i * (rowH + gapY),
    width: zoneW,
    height: rowH,
  }))
}

/**
 * Last-resort horizontal 1×4 columns (A/B/C/D left→right) for side-by-side graph options.
 * @param {number} natW
 * @param {number} natH
 * @param {number} excludeTopRatio
 */
export function geometricOptionColRects(natW, natH, excludeTopRatio = 0.42) {
  if (!natW || !natH) return null
  const top = Math.round(natH * Math.min(0.72, Math.max(0.22, excludeTopRatio)))
  const bottom = Math.round(natH * 0.985)
  const left = Math.round(natW * 0.02)
  const right = Math.round(natW * 0.98)
  const zoneH = bottom - top
  const zoneW = right - left
  // Single row of four graphs — zone can be shorter than a stacked layout.
  if (zoneH < natH * 0.1 || zoneW < natW * 0.4) return null
  if (!looksLikeHorizontalGraphRowLayout(zoneW, zoneH) && zoneH > natH * 0.42) {
    // Tall leftover zone is more likely 2×2; still allow cols if very wide.
    if (zoneW / zoneH < 1.9) return null
  }

  const gapX = Math.round(natW * 0.008)
  const colW = Math.floor((zoneW - gapX * 3) / 4)
  if (colW < Math.max(40, Math.round(natW * 0.12))) return null

  return [0, 1, 2, 3].map((i) => ({
    x: left + i * (colW + gapX),
    y: top,
    width: colW,
    height: zoneH,
  }))
}

/**
 * True when auto-cropped option rects are tall enough (reject thin horizontal slivers).
 * @param {({ x: number, y: number, width: number, height: number } | null)[]} rects
 * @param {number} natH
 */
export function optionRectsLookValid(rects, natH) {
  if (!rects?.length || rects.length < 4) return false
  const minH = Math.max(28, Math.round(natH * 0.032))
  return rects.every((r) => r && r.width >= 40 && r.height >= minH && !rectLooksLikeSliverCrop(r, natH))
}

/**
 * Stronger graph-panel checks: reject label-only strips and boxes that span >1.5 graph widths.
 * Catches the classic bad 2×2 split of a 1×4 row (A/B = half graphs, C/D = "(A)(B)" / "(C)(D)" labels).
 * @param {({ x: number, y: number, width: number, height: number } | null)[]} rects
 * @param {number} natW
 * @param {number} natH
 */
export function optionGraphPanelRectsLookValid(rects, natW, natH) {
  if (!optionRectsLookValid(rects, natH)) return false
  if (!natW || !natH) return false
  const solid = /** @type {{ x: number, y: number, width: number, height: number }[]} */ (
    rects.filter(Boolean)
  )
  if (solid.length < 4) return false

  const widths = solid.map((r) => r.width).sort((a, b) => a - b)
  const heights = solid.map((r) => r.height).sort((a, b) => a - b)
  const medianW = (widths[1] + widths[2]) / 2
  const medianH = (heights[1] + heights[2]) / 2
  const maxH = heights[3]
  const minH = heights[0]

  // Any panel spanning more than ~1.5 typical graph widths (merged A+B or C+D).
  if (solid.some((r) => r.width > medianW * 1.5 + 12)) return false

  // Label-only strips: tiny height vs siblings / page (including equal short bands).
  if (minH < Math.max(32, natH * 0.06)) return false
  if (minH < maxH * 0.4 && minH < natH * 0.1) return false
  if (solid.some((r) => r.height < medianH * 0.38 && r.width > r.height * 4)) return false

  // Later options C/D must match A/B size (reject label scraps / half-panels).
  // Rect order is A,B,C,D for grid2x2 / cols4 / rows4.
  const [ra, rb, rc, rd] = solid
  const abH = Math.min(ra.height, rb.height)
  const cdH = Math.min(rc.height, rd.height)
  const abW = Math.min(ra.width, rb.width)
  const cdW = Math.min(rc.width, rd.width)
  if (cdH < abH * 0.45 || cdW < abW * 0.45) return false
  // Extreme aspect mismatch (wide label strip vs square graph panel).
  const abAspect = abW / Math.max(1, abH)
  const cdAspect = Math.max(rc.width / Math.max(1, rc.height), rd.width / Math.max(1, rd.height))
  if (abAspect < 2.2 && cdAspect > abAspect * 2.8 && cdH < abH * 0.55) return false

  // Classic messy 2×2-on-1×4: top pair much taller than bottom pair (label bands).
  const byY = [...solid].sort((a, b) => a.y - b.y || a.x - b.x)
  const topPair = byY.slice(0, 2)
  const botPair = byY.slice(2, 4)
  const topH = Math.min(topPair[0].height, topPair[1].height)
  const botH = Math.max(botPair[0].height, botPair[1].height)
  const topY = Math.min(topPair[0].y, topPair[1].y)
  const botY = Math.min(botPair[0].y, botPair[1].y)
  if (botY > topY + topH * 0.35 && botH < topH * 0.45 && botH < natH * 0.1) return false

  // Horizontal cols4: similar y/h, ordered left→right, each ~¼ page width.
  const ySpread = Math.max(...solid.map((r) => r.y)) - Math.min(...solid.map((r) => r.y))
  const hSpread = maxH - minH
  if (ySpread < natH * 0.08 && hSpread < medianH * 0.35) {
    const byX = [...solid].sort((a, b) => a.x - b.x)
    for (let i = 0; i < 3; i++) {
      if (byX[i + 1].x < byX[i].x + byX[i].width * 0.35) return false
    }
    if (solid.some((r) => r.width > natW * 0.42)) return false
    // Rightmost panels (C/D) must stay ~quarter-width, not leftover scraps.
    if (byX[2].width < byX[0].width * 0.45 || byX[3].width < byX[0].width * 0.45) return false
  }

  return true
}

/**
 * Detect four option regions in natural pixels (A=TL, B=TR, C=BL, D=BR for grid;
 * A–D left→right for cols4; A–D top→bottom for rows4).
 * @param {string} src
 * @param {{
 *   excludeTopRatio?: number
 *   excludeBottomRatio?: number
 *   stemLength?: number
 *   preferGraph?: boolean
 * }} [opts]
 * @returns {Promise<({ x: number, y: number, width: number, height: number } | null)[] | null>}
 */
export async function detectMcqOptionRegions(src, opts = {}) {
  const preferGraph = opts.preferGraph !== false
  const stemBoost = (opts.stemLength ?? 0) > 200 ? 0.08 : (opts.stemLength ?? 0) > 120 ? 0.04 : 0
  const baseTop = Math.min(0.62, (opts.excludeTopRatio ?? 0.4) + stemBoost)
  const topCandidates = [
    ...new Set(
      [baseTop, baseTop - 0.04, baseTop + 0.04, baseTop + 0.08, 0.32, 0.36, 0.42, 0.48, 0.52, 0.56, 0.6].map((v) =>
        Math.min(0.68, Math.max(0.26, v)),
      ),
    ),
  ]

  for (const excludeTopRatio of topCandidates) {
    const analysis = await buildInkAnalysis(src, { ...opts, excludeTopRatio })
    if (!analysis) continue

    const zoneTop = findOptionsZoneTop(
      analysis.rowInk,
      analysis.H,
      analysis.W,
      excludeTopRatio,
    )
    const y1 = analysis.H - Math.round(analysis.H * Math.min(0.04, analysis.excludeBottomRatio || 0.02))
    const zoneBands = findInkRowBands(analysis.rowInk, analysis.W, zoneTop, y1)
    const preferCols4 = looksLikeHorizontalGraphRowLayout(
      analysis.W * 0.94,
      Math.max(1, y1 - zoneTop),
      zoneBands.length,
    )

    for (const relaxed of [false, true]) {
      if (preferGraph) {
        // 1×4 side-by-side graphs: vertical columns before 2×2 (avoids A/B=half-row, C/D=labels).
        if (preferCols4) {
          const cols = layoutOptionRects(analysis, zoneTop, 'cols4', { relaxed, preferGraph })
          if (cols) return cols
        }
        const grid = layoutOptionRects(analysis, zoneTop, 'grid2x2', { relaxed, preferGraph })
        if (grid) return grid
        const cols = layoutOptionRects(analysis, zoneTop, 'cols4', { relaxed, preferGraph })
        if (cols) return cols
        const rows = layoutOptionRects(analysis, zoneTop, 'rows4', { relaxed, preferGraph })
        if (rows) return rows
        const labelRows = layoutLabelRowRects(analysis, zoneTop)
        if (labelRows) return labelRows
      } else {
        const labelRows = layoutLabelRowRects(analysis, zoneTop)
        if (labelRows) return labelRows
        const grid = layoutOptionRects(analysis, zoneTop, 'grid2x2', { relaxed, preferGraph: false })
        if (grid) return grid
        const cols = layoutOptionRects(analysis, zoneTop, 'cols4', { relaxed, preferGraph: false })
        if (cols) return cols
        const rows = layoutOptionRects(analysis, zoneTop, 'rows4', { relaxed, preferGraph: false })
        if (rows) return rows
      }
    }
  }

  try {
    const img = await loadImageElement(src)
    for (const excludeTopRatio of topCandidates) {
      const zoneTop = Math.round(img.naturalHeight * Math.min(0.72, Math.max(0.22, excludeTopRatio)))
      const zoneH = Math.round(img.naturalHeight * 0.985) - zoneTop
      const zoneW = Math.round(img.naturalWidth * 0.96)
      const preferCols =
        looksLikeHorizontalGraphRowLayout(zoneW, zoneH) || zoneW / Math.max(1, zoneH) >= 2.0

      if (preferCols) {
        const cols = geometricOptionColRects(img.naturalWidth, img.naturalHeight, excludeTopRatio)
        if (cols && optionGraphPanelRectsLookValid(cols, img.naturalWidth, img.naturalHeight)) {
          const analysis = await buildInkAnalysis(src, { ...opts, excludeTopRatio })
          const validated = analysis ? validateOptionRects(analysis, cols) : cols
          if (validated && optionGraphPanelRectsLookValid(validated, img.naturalWidth, img.naturalHeight)) {
            return validated
          }
          if (!analysis && optionGraphPanelRectsLookValid(cols, img.naturalWidth, img.naturalHeight)) {
            return cols
          }
        }
      }

      const rects = geometricOptionGridRects(img.naturalWidth, img.naturalHeight, excludeTopRatio)
      if (!rects) continue
      const analysis = await buildInkAnalysis(src, { ...opts, excludeTopRatio })
      const validated = analysis ? validateOptionRects(analysis, rects) : null
      if (
        validated &&
        optionGraphPanelRectsLookValid(validated, img.naturalWidth, img.naturalHeight)
      ) {
        return validated
      }
    }
    // Last resort for graph options: geometric cols4 / 2×2 / rows4 even when ink validation is weak.
    if (preferGraph) {
      for (const excludeTopRatio of topCandidates) {
        const cols = geometricOptionColRects(img.naturalWidth, img.naturalHeight, excludeTopRatio)
        if (cols && optionGraphPanelRectsLookValid(cols, img.naturalWidth, img.naturalHeight)) {
          return cols
        }
        const grid = geometricOptionGridRects(img.naturalWidth, img.naturalHeight, excludeTopRatio)
        if (grid && optionGraphPanelRectsLookValid(grid, img.naturalWidth, img.naturalHeight)) {
          return grid
        }
        const rows = geometricOptionRowRects(img.naturalWidth, img.naturalHeight, excludeTopRatio)
        if (rows && optionRectsLookValid(rows, img.naturalHeight)) return rows
      }
      const fallbackCols = geometricOptionColRects(img.naturalWidth, img.naturalHeight, baseTop)
      if (
        fallbackCols &&
        optionGraphPanelRectsLookValid(fallbackCols, img.naturalWidth, img.naturalHeight)
      ) {
        return fallbackCols
      }
      const fallback = geometricOptionGridRects(img.naturalWidth, img.naturalHeight, baseTop)
      if (fallback && optionGraphPanelRectsLookValid(fallback, img.naturalWidth, img.naturalHeight)) {
        return fallback
      }
    }
  } catch {
    /* ignore */
  }

  return null
}

/**
 * Try Gemini/OpenAI vision for option graph boxes (when API key is configured).
 * @param {string} src
 * @returns {Promise<({ x: number, y: number, width: number, height: number } | null)[] | null>}
 */
async function detectMcqOptionRegionsWithVision(src) {
  try {
    const { locateOptionRegionsWithCloudVisionClient } = await import('./cloudVisionClient.js')
    const rects = await locateOptionRegionsWithCloudVisionClient(src, {
      signal: AbortSignal.timeout(14000),
    })
    if (!rects?.length) return null
    let natW = 0
    let natH = 0
    try {
      const img = await loadImageElement(src)
      natW = img.naturalWidth
      natH = img.naturalHeight
    } catch {
      /* ignore */
    }
    if (natH && !optionRectsLookValid(rects, natH)) return null
    // Reject label-only / multi-graph-spanning boxes; local cols4 will retry.
    if (natW && natH && !optionGraphPanelRectsLookValid(rects, natW, natH)) return null
    return rects
  } catch {
    return null
  }
}

/**
 * Auto-crop options A–D from one screenshot (with source metadata).
 * Prefers Gemini/OpenAI vision boxes when configured, then local 2×2 / cols4 / stacked layout.
 * @param {string} src
 * @param {{
 *   excludeTopRatio?: number
 *   excludeBottomRatio?: number
 *   stemLength?: number
 *   preferGraph?: boolean
 *   useVision?: boolean
 * }} [opts]
 * @returns {Promise<{ crops: (string | null)[], source: 'cloud-vision' | 'local' | null }>}
 */
export async function autoCropMcqOptionsWithMeta(src, opts = {}) {
  const preferGraph = opts.preferGraph !== false
  let regions = null
  /** @type {'cloud-vision' | 'local' | null} */
  let source = null

  if (opts.useVision !== false && preferGraph) {
    regions = await detectMcqOptionRegionsWithVision(src)
    if (regions?.length) source = 'cloud-vision'
  }
  if (!regions?.length) {
    regions = await detectMcqOptionRegions(src, {
      ...opts,
      stemLength: opts.stemLength ?? 0,
      preferGraph,
    })
    if (regions?.length) source = 'local'
  }
  if (!regions?.length) return { crops: [null, null, null, null], source: null }

  let natW = 0
  let natH = 0
  try {
    const img = await loadImageElement(src)
    natW = img.naturalWidth
    natH = img.naturalHeight
  } catch {
    /* ignore */
  }
  if (natH && !optionRectsLookValid(regions, natH)) {
    return { crops: [null, null, null, null], source: null }
  }
  if (
    preferGraph &&
    natW &&
    natH &&
    !optionGraphPanelRectsLookValid(regions, natW, natH)
  ) {
    // Vision/local returned label strips or multi-graph spans — retry local cols4 only.
    if (source === 'cloud-vision') {
      regions = await detectMcqOptionRegions(src, {
        ...opts,
        stemLength: opts.stemLength ?? 0,
        preferGraph,
      })
      source = regions?.length ? 'local' : null
      if (!regions?.length) return { crops: [null, null, null, null], source: null }
      if (!optionGraphPanelRectsLookValid(regions, natW, natH)) {
        return { crops: [null, null, null, null], source: null }
      }
    } else {
      return { crops: [null, null, null, null], source: null }
    }
  }

  const crops = await Promise.all(
    regions.map(async (rect) => {
      if (!rect) return null
      try {
        return await cropImageDataUrl(src, rect)
      } catch {
        return null
      }
    }),
  )
  const filled = crops.filter(Boolean).length
  if (filled < 1) return { crops, source: null }
  return { crops, source }
}

/**
 * Auto-crop options A–D from one screenshot.
 * @param {string} src
 * @param {{
 *   excludeTopRatio?: number
 *   excludeBottomRatio?: number
 *   stemLength?: number
 *   preferGraph?: boolean
 *   useVision?: boolean
 * }} [opts]
 * @returns {Promise<(string | null)[]>}
 */
export async function autoCropMcqOptions(src, opts = {}) {
  const { crops } = await autoCropMcqOptionsWithMeta(src, opts)
  return crops
}

/**
 * User-facing status for option auto-crop.
 * @param {number} n
 * @param {'cloud-vision' | 'local' | null | undefined} source
 * @param {{ short?: boolean }} [opts]
 */
export function formatOptionsAutoCropStatus(n, source, opts = {}) {
  const count = Math.max(0, Number(n) || 0)
  if (count < 1) {
    return opts.short
      ? 'Option auto-crop skipped'
      : 'Could not auto-crop option graphs — click **Auto-crop A–D** to retry, or Split A–D manually.'
  }
  if (source === 'cloud-vision') {
    return opts.short
      ? `Auto-cropped A–D with AI (${count}/4)`
      : `Auto-cropped A–D with AI (${count}/4). Review previews, then Save.`
  }
  return opts.short
    ? `Auto-cropped A–D with AI (${count}/4)`
    : `Auto-cropped A–D with AI (${count}/4). Review previews, then Save.`
}
