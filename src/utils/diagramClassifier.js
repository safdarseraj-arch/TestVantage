/**
 * Local diagram / graph region classifier (ink geometry — no cloud API).
 * Refines line_data types before structure segmentation.
 */

/** @param {import('./ocrLineData.js').OcrLineData} line */
function bboxArea(line) {
  const b = line.bbox
  if (!b) return 0
  return Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0))
}

/** @param {import('./ocrLineData.js').OcrLineData} line */
function inkDensityScore(line) {
  const area = bboxArea(line)
  const chars = String(line.text ?? '').trim().length
  if (area < 1) return 0
  return chars / Math.sqrt(area)
}

/**
 * @param {import('./ocrLineData.js').OcrLineData} line
 * @param {{ width?: number, height?: number }} imageSize
 */
export function classifyLineVisualRole(line, imageSize = {}) {
  const text = String(line.text ?? '').trim()
  const b = line.bbox
  if (!b) return line.type ?? 'text'

  const pageW = imageSize.width ?? 1000
  const pageH = imageSize.height ?? 1000
  const pageArea = Math.max(1, pageW * pageH)
  const area = bboxArea(line)
  const h = b.y1 - b.y0
  const w = Math.max(1, b.x1 - b.x0)
  const density = inkDensityScore(line)

  if (area > pageArea * 0.14 && text.length < 32) return 'diagram'
  if (h > w * 1.2 && area > pageArea * 0.06 && text.length < 24) return 'diagram'
  if (text.length < 4 && area > pageArea * 0.05 && density < 0.08) return 'diagram'
  if (/^\(\s*[A-D]\s*[\).:\]]/i.test(text) || /^[A-D][\).:\]]\s+/i.test(text)) return 'mcq_option'
  if (line.type === 'math' || /\\frac|\\int|\\sum|\\left/i.test(text)) return 'math'
  return line.type === 'diagram' && density > 0.15 ? 'text' : line.type ?? 'text'
}

/**
 * @param {import('./ocrLineData.js').OcrLineData[]} lineData
 * @param {{ width?: number, height?: number }} [imageSize]
 */
export function refineLineDataDiagramTypes(lineData, imageSize = {}) {
  return (lineData ?? []).map((line) => {
    const role = classifyLineVisualRole(line, imageSize)
    const conversionOutput = role !== 'diagram' && line.conversionOutput !== false
    return {
      ...line,
      type: role,
      conversionOutput,
      included: conversionOutput && role !== 'diagram',
    }
  })
}

/**
 * Diagram bounding boxes for auto-crop hints.
 * @param {import('./ocrLineData.js').OcrLineData[]} lineData
 */
export function diagramBboxesFromLineData(lineData) {
  return (lineData ?? [])
    .filter((l) => l.type === 'diagram' && l.bbox)
    .map((l) => ({ ...l.bbox }))
}
