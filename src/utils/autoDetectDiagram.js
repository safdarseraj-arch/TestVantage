/**
 * Heuristic, fully client-side detection of the figure/diagram region in a
 * question screenshot (graph + text, or circuit + text). No ML / no network.
 *
 * Primary signal: figures (graph axes, circuit wires) contain LONG continuous
 * ink runs — horizontally and vertically — that ordinary text never produces
 * (letters break into many short runs). We collect the bounding box of those
 * "structural" runs, which isolates the figure whether it sits above/below the
 * text OR beside it (side-by-side). Full-width borders and divider rules are
 * excluded by ignoring runs that span almost the whole image.
 *
 * Fallback: horizontal band segmentation for the simple top/bottom layout.
 */

import { cropImageDataUrl } from './cropImageRegion.js'

/**
 * Bounding box of long horizontal/vertical strokes (axes, wires, curves).
 * @param {Uint8Array} ink
 * @param {number} W
 * @param {number} H
 */
function structuralRunBox(ink, W, H) {
  const minH = Math.round(W * 0.12)
  const maxH = Math.round(W * 0.82)
  const minV = Math.round(H * 0.1)
  const maxV = Math.round(H * 0.82)

  let minX = W
  let minY = H
  let maxX = -1
  let maxY = -1
  let count = 0

  const include = (x0, x1, y0, y1) => {
    if (x0 < minX) minX = x0
    if (x1 > maxX) maxX = x1
    if (y0 < minY) minY = y0
    if (y1 > maxY) maxY = y1
    count++
  }

  // Horizontal runs
  for (let y = 0; y < H; y++) {
    const base = y * W
    let run = 0
    let start = 0
    let prev = 0
    for (let x = 0; x <= W; x++) {
      const v = x < W ? ink[base + x] : 0
      if (v && prev) run++
      else if (v && !prev) {
        run = 1
        start = x
      } else if (!v && prev) {
        if (run >= minH && run <= maxH) include(start, start + run - 1, y, y)
        run = 0
      }
      prev = v
    }
  }

  // Vertical runs
  for (let x = 0; x < W; x++) {
    let run = 0
    let start = 0
    let prev = 0
    for (let y = 0; y <= H; y++) {
      const v = y < H ? ink[y * W + x] : 0
      if (v && prev) run++
      else if (v && !prev) {
        run = 1
        start = y
      } else if (!v && prev) {
        if (run >= minV && run <= maxV) include(x, x, start, start + run - 1)
        run = 0
      }
      prev = v
    }
  }

  if (count < 2 || maxX < minX || maxY < minY) return null
  return { left: minX, top: minY, right: maxX, bottom: maxY }
}

/** @param {string} src */
function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image for diagram detection.'))
    img.src = src
  })
}

/**
 * Detect the diagram bounding box in natural (source) pixels.
 * @param {string} src data URL / object URL
 * @param {{ inkThreshold?: number, excludeTopRatio?: number, excludeBottomRatio?: number, lenient?: boolean }} [opts]
 *   excludeTopRatio — skip top share (stem text). excludeBottomRatio — skip bottom (A–D block).
 * @returns {Promise<{ x: number, y: number, width: number, height: number } | null>}
 */
export async function detectDiagramRegion(src, {
  inkThreshold = 205,
  excludeTopRatio = 0,
  excludeBottomRatio = 0,
  lenient = false,
} = {}) {
  let img
  try {
    img = await loadImageElement(src)
  } catch {
    return null
  }
  const natW = img.naturalWidth
  const natH = img.naturalHeight
  if (!natW || !natH) return null

  // Downscale for analysis speed; map results back to natural pixels at the end.
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
    return null // tainted canvas (cross-origin) — cannot analyze
  }

  const ink = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4
      const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
      ink[y * W + x] = data[o + 3] > 40 && lum < inkThreshold ? 1 : 0
    }
  }

  const yMin = Math.round(H * Math.min(0.45, Math.max(0, excludeTopRatio)))
  const yMax = Math.round(H * (1 - Math.min(0.5, Math.max(0, excludeBottomRatio))))
  const inFigureZone = (y) => y >= yMin && y <= yMax

  const toNatural = (box) => {
    const inv = 1 / scale
    const padX = Math.round(W * 0.025)
    const padY = Math.round(H * 0.025)
    const left = Math.max(0, box.left - padX)
    const right = Math.min(W - 1, box.right + padX)
    const top = Math.max(0, box.top - padY)
    const bottom = Math.min(H - 1, box.bottom + padY)
    return {
      x: Math.round(left * inv),
      y: Math.round(top * inv),
      width: Math.round((right - left + 1) * inv),
      height: Math.round((bottom - top + 1) * inv),
      wRatio: (right - left + 1) / W,
      hRatio: (bottom - top + 1) / H,
    }
  }

  /** Accept figure bbox; side-column diagrams (JEE layout) get slightly taller limits. */
  const acceptDiagramRegion = (r) => {
    const area = r.wRatio * r.hRatio
    const nearFull = r.wRatio > 0.9 && r.hRatio > 0.85
    const narrowCol = r.wRatio < 0.52
    const maxH = narrowCol ? (lenient ? 0.68 : 0.55) : lenient ? 0.5 : 0.38
    const maxArea = narrowCol ? (lenient ? 0.38 : 0.32) : lenient ? 0.34 : 0.28
    const bigEnough = r.wRatio >= 0.08 && r.hRatio >= 0.05 && r.width >= 32 && r.height >= 32
    if (nearFull || !bigEnough) return null
    if (r.hRatio > maxH || area > maxArea) return null
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  }

  const struct = structuralRunBox(ink, W, H)
  if (struct && inFigureZone(struct.top) && inFigureZone(struct.bottom)) {
    const r = toNatural(struct)
    const maxStructH = lenient ? 0.55 : 0.42
    const maxStructW = lenient ? 0.88 : 0.82
    if (r.wRatio < maxStructW && r.hRatio < maxStructH) {
      const accepted = acceptDiagramRegion(r)
      if (accepted) return accepted
    }
  }

  const rowInk = new Int32Array(H)
  const rowTrans = new Int32Array(H)
  for (let y = 0; y < H; y++) {
    let count = 0
    let trans = 0
    let prev = 0
    const base = y * W
    for (let x = 0; x < W; x++) {
      const v = ink[base + x]
      if (v) count++
      if (v && !prev) trans++
      prev = v
    }
    rowInk[y] = count
    rowTrans[y] = trans
  }

  const blankLimit = Math.max(2, Math.round(W * 0.004))
  const isBlankRow = (y) => rowInk[y] <= blankLimit
  const minGap = Math.max(6, Math.round(H * 0.02))

  // Split into bands separated by blank runs >= minGap (merges text lines + figure internals).
  const bands = []
  let y = 0
  while (y < H) {
    if (isBlankRow(y) || !inFigureZone(y)) {
      y++
      continue
    }
    const top = y
    let bottom = y
    let blanks = 0
    while (y < H) {
      if (isBlankRow(y)) {
        blanks++
        if (blanks >= minGap) break
      } else {
        blanks = 0
        bottom = y
      }
      y++
    }
    bands.push({ top, bottom })
  }
  if (!bands.length) return null

  const scored = bands.map((b, bandIdx) => {
    const h = b.bottom - b.top + 1
    let inkRows = 0
    let transSum = 0
    let maxHRun = 0
    let left = W
    let right = 0

    for (let yy = b.top; yy <= b.bottom; yy++) {
      if (rowInk[yy] > 0) {
        inkRows++
        transSum += rowTrans[yy]
      }
      let run = 0
      let prev = 0
      const base = yy * W
      for (let x = 0; x < W; x++) {
        const v = ink[base + x]
        if (v) {
          if (x < left) left = x
          if (x > right) right = x
          run = prev ? run + 1 : 1
          if (run > maxHRun) maxHRun = run
        } else {
          run = 0
        }
        prev = v
      }
    }
    if (right < left) {
      left = 0
      right = W - 1
    }

    let maxVRun = 0
    for (let x = left; x <= right; x++) {
      let run = 0
      for (let yy = b.top; yy <= b.bottom; yy++) {
        const v = ink[yy * W + x]
        run = v ? run + 1 : 0
        if (run > maxVRun) maxVRun = run
      }
    }

    const bw = Math.max(1, right - left + 1)
    const textScore = inkRows ? transSum / inkRows : 0
    const figureRun = Math.max(maxHRun / bw, maxVRun / h)
    return { ...b, bandIdx, h, left, right, bw, textScore, figureRun }
  })

  const isFigure = (s) => {
    if (lenient) {
      return s.figureRun >= 0.26 && s.textScore < 12 && s.h / H <= 0.52 && s.h / H >= 0.05
    }
    return s.figureRun >= 0.38 && s.textScore < 8 && s.h / H <= 0.4 && s.h / H >= 0.06
  }

  const figs = scored.filter(isFigure)
  if (figs.length) {
    const lowText = figs.filter((f) => f.textScore < (lenient ? 8 : 5))
    let pool = lowText.length ? lowText : figs
    if (scored.length >= 3) {
      const mid = pool.filter((f) => f.bandIdx >= 1 && f.bandIdx <= scored.length - 2)
      if (mid.length) pool = mid
    } else if (scored.length === 2) {
      pool = [pool.reduce((a, b) => (b.figureRun > a.figureRun ? b : a))]
    }
    const best = pool.reduce((a, b) => (b.figureRun > a.figureRun ? b : a))
    const accepted = acceptDiagramRegion(
      toNatural({ left: best.left, top: best.top, right: best.right, bottom: best.bottom }),
    )
    if (accepted) return accepted
  }

  // Side-by-side JEE layout: diagram in the right column beside question text.
  const colStart = Math.round(W * 0.48)
  let minX = W
  let minY = H
  let maxX = -1
  let maxY = -1
  for (let y = yMin; y <= yMax; y++) {
    for (let x = colStart; x < W; x++) {
      if (ink[y * W + x]) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX >= minX && maxY >= minY) {
    const accepted = acceptDiagramRegion(toNatural({ left: minX, top: minY, right: maxX, bottom: maxY }))
    if (accepted) return accepted
  }

  return null
}

/**
 * Detect + crop the diagram. Returns a cropped data URL, or null if no confident
 * figure region was found (caller should fall back to the full image).
 * @param {string} src
 * @param {{ inkThreshold?: number }} [opts]
 * @returns {Promise<string | null>}
 */
export async function autoCropDiagram(src, opts = {}) {
  const region = await detectDiagramRegion(src, opts)
  if (!region) return null
  try {
    return await cropImageDataUrl(src, region)
  } catch {
    return null
  }
}
