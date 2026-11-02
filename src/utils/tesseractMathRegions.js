import { looksLikeGarbledMathLine } from './hybridOcrMerge.js'
import {
  MAX_MATH_REGIONS_PER_PAGE,
  MIN_MATH_REGION_PX,
  MATH_REGION_MAX_BOTTOM_FRAC,
} from './mathOcrConfig.js'

/**
 * @typedef {import('./mathRegionDetect.js').MathRegion} MathRegion
 * @typedef {import('tesseract.js').Word} TesseractWord
 * @typedef {import('tesseract.js').Line} TesseractLine
 * @typedef {import('tesseract.js').Page} TesseractPage
 */

/**
 * @param {import('tesseract.js').Bbox} bbox
 * @param {number} [pad]
 */
export function bboxToRect(bbox, pad = 5) {
  const x0 = Math.floor(bbox.x0)
  const y0 = Math.floor(bbox.y0)
  const x1 = Math.ceil(bbox.x1)
  const y1 = Math.ceil(bbox.y1)
  return {
    x: Math.max(0, x0 - pad),
    y: Math.max(0, y0 - pad),
    width: Math.max(MIN_MATH_REGION_PX, x1 - x0 + pad * 2),
    height: Math.max(MIN_MATH_REGION_PX, y1 - y0 + pad * 2),
  }
}

/** @param {TesseractWord} word */
export function looksLikeMathWord(word) {
  const t = String(word?.text ?? '').trim()
  if (!t) return false
  if (/^\([A-D]\)$/.test(t) || /^[A-D][.)]$/.test(t)) return false
  if (/^(?:is|the|and|of|to|from|with|than|then|if|let|find|value)$/i.test(t)) return false

  const symbols = (t.match(/[^A-Za-z0-9\s.,;:'"()\-]/g) || []).length
  const letters = (t.match(/[A-Za-z]/g) || []).length

  if (word.is_numeric || digits(t) >= 2) return true
  if (/[=+\-*/^_{}\\|<>[\]]/.test(t)) return true
  if (symbols >= 2) return true
  if (symbols >= 1 && letters <= 2 && t.length <= 6) return true
  if (word.in_dictionary === false && symbols >= 1 && letters <= 4) return true
  if ((word.confidence ?? 100) < 62 && symbols >= 1 && letters <= 3) return true
  return false
}

function digits(t) {
  return (t.match(/\d/g) || []).length
}

/** @param {TesseractLine} line */
export function looksLikeMathLine(line) {
  const text = String(line?.text ?? '').trim()
  if (!text || text.length < 4) return false
  if (/^\([A-D]\)/.test(text)) return false
  if (/^(?:Value\s+of|Find\s+the|Which\s+of|Answer\s+the)/i.test(text)) return false
  if (looksLikeGarbledMathLine(text)) return true

  const words = line.words ?? []
  if (!words.length) return false
  const mathWords = words.filter(looksLikeMathWord)
  if (mathWords.length >= 2 && mathWords.length >= words.length * 0.35) return true
  if (words.length >= 4 && (line.confidence ?? 100) < 72 && /[=+\-*/^]/.test(text)) return true
  if (/\\begin\{|\$.*\$/.test(text)) return true
  return false
}

/** @param {TesseractWord[]} words */
function mergeWordBboxes(words) {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const w of words) {
    const b = w.bbox
    if (!b) continue
    x0 = Math.min(x0, b.x0)
    y0 = Math.min(y0, b.y0)
    x1 = Math.max(x1, b.x1)
    y1 = Math.max(y1, b.y1)
  }
  if (!Number.isFinite(x0)) return null
  return { x0, y0, x1, y1 }
}

/**
 * Inline math spans inside a mixed prose line.
 * @param {TesseractLine} line
 * @returns {Array<{ bbox: import('tesseract.js').Bbox, text: string, source: string }>}
 */
export function extractMathSpansFromLine(line) {
  const words = line.words ?? []
  if (!words.length) return []

  if (looksLikeMathLine(line)) {
    if (line.bbox) {
      return [{ bbox: line.bbox, text: line.text?.trim() ?? '', source: 'tesseract:line' }]
    }
    return []
  }

  /** @type {Array<{ bbox: import('tesseract.js').Bbox, text: string, source: string }>} */
  const spans = []
  /** @type {TesseractWord[]} */
  let run = []

  const flush = () => {
    if (run.length < 1) return
    const bbox = mergeWordBboxes(run)
    if (!bbox) {
      run = []
      return
    }
    const text = run.map((w) => w.text).join(' ').trim()
    const rect = bboxToRect(bbox, 4)
    if (rect.width >= MIN_MATH_REGION_PX && rect.height >= MIN_MATH_REGION_PX) {
      spans.push({ bbox, text, source: 'tesseract:inline' })
    }
    run = []
  }

  for (const w of words) {
    if (looksLikeMathWord(w)) run.push(w)
    else flush()
  }
  flush()

  return spans
}

function iou(a, b) {
  const x0 = Math.max(a.x, b.x)
  const y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.width, b.x + b.width)
  const y1 = Math.min(a.y + a.height, b.y + b.height)
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  const union = a.width * a.height + b.width * b.height - inter
  return union > 0 ? inter / union : 0
}

/**
 * @param {MathRegion[]} regions
 * @param {number} max
 */
function pickNonOverlapping(regions, max) {
  const sorted = [...regions].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  /** @type {MathRegion[]} */
  const picked = []
  for (const r of sorted) {
    if (picked.length >= max) break
    if (picked.some((p) => iou(p, r) > 0.4)) continue
    picked.push(r)
  }
  return picked.sort((a, b) => a.y - b.y)
}

/**
 * @param {TesseractPage | null | undefined} page
 * @param {{ maxRegions?: number, maxBottomFrac?: number }} [opts]
 * @returns {MathRegion[]}
 */
export function mathRegionsFromTesseractPage(page, opts = {}) {
  const lines = page?.lines ?? []
  if (!lines.length) return []

  let pageBottom = 0
  for (const line of lines) {
    if (line.bbox?.y1 > pageBottom) pageBottom = line.bbox.y1
  }
  const maxBottomY = pageBottom * (opts.maxBottomFrac ?? MATH_REGION_MAX_BOTTOM_FRAC)
  const maxRegions = opts.maxRegions ?? MAX_MATH_REGIONS_PER_PAGE

  /** @type {MathRegion[]} */
  const raw = []

  for (const line of lines) {
    if (!line.bbox || line.bbox.y0 > maxBottomY) continue
    const spans = extractMathSpansFromLine(line)
    for (const span of spans) {
      const rect = bboxToRect(span.bbox, span.source === 'tesseract:line' ? 8 : 5)
      let score = 55
      if (span.source === 'tesseract:line') score += 25
      if (looksLikeGarbledMathLine(span.text)) score += 20
      if ((line.confidence ?? 100) < 70) score += 8
      raw.push({
        ...rect,
        score,
        lineText: span.text,
        source: span.source,
      })
    }
  }

  return pickNonOverlapping(raw, maxRegions)
}

/** @param {string} text */
function looksLikeGarbledOptionBody(text) {
  const body = String(text ?? '')
    .replace(/^\(\s*[A-D]\s*\)\s*/i, '')
    .trim()
  if (body.length < 2) return false
  if (/\$[^$]{2,}\$/.test(body) || /\\frac|\\sqrt|\\begin\{/.test(body)) return false
  return (
    looksLikeGarbledMathLine(body) ||
    /sqrt|√|frac|\d\s*\/\s*\d|\\begin/i.test(body) ||
    (/[=+\-*/^]/.test(body) && (body.match(/[A-Za-z]/g) || []).length <= 4)
  )
}

/**
 * MCQ option rows sit below the stem band — Mathpix OCRs them; route garbled (A)–(D) lines to ONNX.
 * @param {TesseractPage | null | undefined} page
 * @param {{ maxRegions?: number }} [opts]
 * @returns {MathRegion[]}
 */
export function mathOptionRegionsFromTesseractPage(page, opts = {}) {
  const lines = page?.lines ?? []
  if (!lines.length) return []

  const maxRegions = opts.maxRegions ?? 4
  /** @type {MathRegion[]} */
  const raw = []

  for (const line of lines) {
    const text = String(line.text ?? '').trim()
    if (!/^\(\s*[A-D]\s*\)/i.test(text) || !line.bbox) continue
    if (!looksLikeGarbledOptionBody(text)) continue
    const rect = bboxToRect(line.bbox, 6)
    raw.push({
      ...rect,
      score: 48 + (looksLikeGarbledMathLine(text) ? 18 : 8),
      lineText: text,
      source: 'tesseract:option',
    })
  }

  return pickNonOverlapping(raw, maxRegions)
}
