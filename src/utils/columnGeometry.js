/**
 * Match-the-column geometry — split line_data into left (Column I) / right (Column II) x-bands.
 * Local only; complements text parsers in parseMatchColumnUpload.js.
 */

import { normalizeMatrixItemText } from './normalizeMathText.js'

const COL_II_LABEL_RE = /^\(?\s*([P-T]|[1-5])\s*\)?[.:)\]]?\s*/i

/**
 * @param {import('./ocrLineData.js').OcrLineData[]} lineData
 * @param {{ width?: number, height?: number }} [imageSize]
 */
export function splitLineDataByXBands(lineData, imageSize = {}) {
  const rows = (lineData ?? []).filter((l) => l.included && l.conversionOutput && l.text?.trim())
  if (rows.length < 4) return { left: rows, right: [], splitX: null }

  const pageW = imageSize.width ?? Math.max(...rows.map((r) => r.bbox?.x1 ?? 0), 800)
  const centers = rows.map((r) => ((r.bbox?.x0 ?? 0) + (r.bbox?.x1 ?? 0)) / 2)
  const splitX = pageW * 0.48

  const leftBand = []
  const rightBand = []
  let rightHits = 0
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const cx = centers[i]
    if (cx >= splitX) {
      rightBand.push(row)
      if (COL_II_LABEL_RE.test(row.text)) rightHits += 1
    } else {
      leftBand.push(row)
    }
  }

  if (rightBand.length < 2 || rightHits < 1) {
    return { left: rows, right: [], splitX: null }
  }

  return { left: leftBand, right: rightBand, splitX }
}

/**
 * @param {import('./ocrLineData.js').OcrLineData[]} band
 */
function bandLinesToColEntries(band) {
  /** @type {string[]} */
  const entries = []
  for (const row of band) {
    let t = String(row.text ?? '').trim()
    t = t.replace(COL_II_LABEL_RE, '').trim()
    t = normalizeMatrixItemText(t)
    if (t.length >= 1 && t.length <= 120) entries.push(t)
  }
  return entries
}

/**
 * @param {import('./ocrLineData.js').OcrLineData[]} lineData
 * @param {{ width?: number, height?: number }} [imageSize]
 * @returns {{ matrixCols: string[], matrixColLabels: string[], filled: number } | null}
 */
export function matrixColsFromLineGeometry(lineData, imageSize = {}) {
  const { right, splitX } = splitLineDataByXBands(lineData, imageSize)
  if (!splitX || right.length < 2) return null

  const entries = bandLinesToColEntries(right)
  if (entries.length < 2) return null

  const colCount = Math.min(5, Math.max(4, entries.length))
  const labels = ['(P)', '(Q)', '(R)', '(S)', '(T)'].slice(0, colCount)
  const cols = entries.slice(0, colCount)
  while (cols.length < colCount) cols.push('')

  return {
    matrixCols: cols,
    matrixColLabels: labels,
    filled: cols.filter((c) => c.trim()).length,
  }
}

/**
 * Merge geometry Column II into a text parse when geometry fills gaps.
 * @param {import('./parseMatchColumnUpload.js').MatchColumnParse} parsed
 * @param {import('./ocrLineData.js').OcrLineData[]} lineData
 * @param {{ width?: number, height?: number }} [imageSize]
 */
export function enhanceMatrixColsFromGeometry(parsed, lineData, imageSize = {}) {
  if (!parsed?.matrixRows?.length || !lineData?.length) return parsed

  const geo = matrixColsFromLineGeometry(lineData, imageSize)
  if (!geo) return parsed

  const textFilled = (parsed.matrixCols ?? []).filter((c) => String(c ?? '').trim().length > 2).length
  if (textFilled >= geo.filled) return parsed

  const colCount = geo.matrixCols.length
  const mergedCols = [...geo.matrixCols]
  for (let i = 0; i < colCount; i += 1) {
    const existing = String(parsed.matrixCols?.[i] ?? '').trim()
    if (existing.length > mergedCols[i]?.length) mergedCols[i] = existing
  }

  return {
    ...parsed,
    matrixCols: mergedCols,
    matrixColLabels: geo.matrixColLabels,
  }
}
