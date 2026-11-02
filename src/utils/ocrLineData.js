/**
 * Mathpix-inspired line_data — typed OCR lines with confidence and geometry.
 * Built from Tesseract layout (local, no cloud API).
 */

import { looksLikeGarbledMathLine } from './hybridOcrMerge.js'
import { looksLikeMathLine } from './tesseractMathRegions.js'
import { findOptionMarkersInLineText, optionsFromTextMarkers } from './mcqOptionMarkers.js'
import { normalizeMathText } from './normalizeMathText.js'

/** @typedef {'text'|'math'|'diagram'|'mcq_option'|'unknown'} OcrLineType */

/**
 * @typedef {{
 *   id: string
 *   lineIndex: number
 *   type: OcrLineType
 *   text: string
 *   confidence: number
 *   confidenceRate: number
 *   conversionOutput: boolean
 *   included: boolean
 *   bbox: { x0: number, y0: number, x1: number, y1: number }
 *   cnt: [number, number][]
 * }} OcrLineData
 */

const MIN_LINE_CONFIDENCE_RATE = 0.38

/** @param {import('tesseract.js').Bbox} bbox */
function bboxToCnt(bbox) {
  return [
    [bbox.x0, bbox.y0],
    [bbox.x1, bbox.y0],
    [bbox.x1, bbox.y1],
    [bbox.x0, bbox.y1],
  ]
}

/** @param {import('tesseract.js').Line} line */
function lineConfidenceRate(line) {
  const words = line.words ?? []
  if (!words.length) return Math.max(0, Math.min(1, (line.confidence ?? 0) / 100))
  let sum = 0
  for (const w of words) sum += (w.confidence ?? 50) / 100
  return sum / words.length
}

/**
 * Mathpix separates diagrams (conversion_output: false) from text/math lines.
 * @param {import('tesseract.js').Line} line
 * @param {number} pageArea
 */
function classifyLineType(line, pageArea) {
  const text = String(line?.text ?? '').trim()
  const bbox = line.bbox
  if (bbox) {
    const area = Math.max(1, (bbox.x1 - bbox.x0) * (bbox.y1 - bbox.y0))
    const h = bbox.y1 - bbox.y0
    const w = Math.max(1, bbox.x1 - bbox.x0)
    if (area > pageArea * 0.16 && text.length < 28) return 'diagram'
    if (h > w * 1.15 && area > pageArea * 0.07 && text.length < 20) return 'diagram'
  }
  if (
    /^\(\s*[A-D]\s*[\).:\]]/i.test(text) ||
    /^[A-D][\).:\]]\s+/i.test(text) ||
    /^\(\s*[A-D]\s*\)\s*\S/.test(text)
  ) {
    return 'mcq_option'
  }
  if (looksLikeMathLine(line) || looksLikeGarbledMathLine(text)) return 'math'
  return 'text'
}

/**
 * @param {import('tesseract.js').Page} page
 * @param {{ width?: number, height?: number }} [imageSize]
 * @returns {OcrLineData[]}
 */
export function buildLineDataFromTesseractPage(page, imageSize = {}) {
  const lines = [...(page?.lines ?? [])].sort(
    (a, b) => (a.bbox?.y0 ?? 0) - (b.bbox?.y0 ?? 0),
  )
  const pageW = imageSize.width ?? page?.width ?? 1000
  const pageH = imageSize.height ?? page?.height ?? 1000
  const pageArea = Math.max(1, pageW * pageH)

  return lines.map((line, i) => {
    const text = String(line.text ?? '').trim()
    const confRate = lineConfidenceRate(line)
    const type = classifyLineType(line, pageArea)
    const bbox = line.bbox ?? { x0: 0, y0: i * 20, x1: pageW, y1: (i + 1) * 20 }
    const conversionOutput =
      type !== 'diagram' && text.length > 0 && confRate >= MIN_LINE_CONFIDENCE_RATE
    return {
      id: `line-${i}`,
      lineIndex: i,
      type,
      text,
      confidence: (line.confidence ?? 0) / 100,
      confidenceRate: confRate,
      conversionOutput,
      included: conversionOutput,
      bbox,
      cnt: bboxToCnt(bbox) }
  })
}

/** @param {OcrLineData[]} lineData */
export function lineDataToDocumentText(lineData) {
  return lineData
    .filter((l) => l.included && l.conversionOutput && l.text.trim())
    .map((l) => l.text.trim())
    .join('\n')
}

/**
 * Mathpix lines.json style MCQ split — geometry + labels, not per-question templates.
 * @param {OcrLineData[]} lineData
 * @returns {{ text: string, options: string[], optionsFound: number } | null}
 */
export function parseMcqFromLineData(lineData) {
  const rows = (lineData ?? []).filter((l) => l.included && l.conversionOutput && l.text.trim())
  if (rows.length < 2) return null

  const options = ['', '', '', '']
  let firstOptY = Infinity
  let markerLines = 0

  for (const row of rows) {
    const markers = findOptionMarkersInLineText(row.text)
    if (!markers.length) continue
    markerLines += 1
    if (row.bbox.y0 < firstOptY) firstOptY = row.bbox.y0
    const fromLine = optionsFromTextMarkers(row.text, markers)
    for (let i = 0; i < 4; i += 1) {
      const body = String(fromLine[i] ?? '').trim()
      if (body && (!options[i] || body.length > options[i].length)) options[i] = body
    }
  }

  if (markerLines < 1) return null

  const stemRows = rows.filter((r) => r.bbox.y1 <= firstOptY + 8)
  const stem = stemRows.map((r) => r.text.trim()).join('\n').trim()

  const found = options.filter((o) => String(o ?? '').trim()).length
  if (found < 2 || !stem) return null

  return {
    text: normalizeMathText(stem),
    options: options.map((o) => normalizeMathText(String(o ?? '').trim())),
    optionsFound: found }
}
