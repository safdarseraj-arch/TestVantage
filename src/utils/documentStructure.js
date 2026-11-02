/**
 * Local document structure (Mathpix lines.json–inspired, no cloud API).
 * Segments OCR line_data into semantic zones before text-only parsing.
 */

import { findOptionMarkersInLineText, optionsFromTextMarkers } from './mcqOptionMarkers.js'
import { normalizeMathText } from './normalizeMathText.js'
import { looksLikeMatchColumnUpload } from './parseMatchColumnUpload.js'

/** @typedef {'stem'|'options'|'column_i'|'column_ii'|'passage'|'diagram'|'header'} DocumentZoneId */

/**
 * @typedef {{
 *   id: DocumentZoneId
 *   lines: string[]
 *   bboxes: { x0: number, y0: number, x1: number, y1: number }[]
 * }} DocumentZone
 */

/**
 * @typedef {{
 *   zones: DocumentZone[]
 *   kind: 'mcq'|'matrix'|'passage'|'integer_diagram'|'unknown'
 *   diagramBboxes: { x0: number, y0: number, x1: number, y1: number }[]
 *   optionStartY: number | null
 *   lineCount: number
 * }} DocumentStructure
 */

const COL_I_RE = /\bcolumn\s*[-–]?\s*i\b/i
const COL_II_RE = /\bcolumn\s*[-–]?\s*ii\b/i
const PASSAGE_RE =
  /\b(?:answer\s+the\s+following\s+questions|on\s+the\s+basis\s+of\s+(?:the\s+)?above|passage\s*:|comprehension)\b/i

/** @param {DocumentZoneId} id @param {string} text @param {import('./ocrLineData.js').OcrLineData} row */
function zonePush(zoneMap, id, text, row) {
  if (!text.trim()) return
  if (!zoneMap.has(id)) {
    zoneMap.set(id, { id, lines: [], bboxes: [] })
  }
  const z = zoneMap.get(id)
  z.lines.push(text.trim())
  if (row?.bbox) z.bboxes.push(row.bbox)
}

/**
 * @param {import('./ocrLineData.js').OcrLineData[]} lineData
 * @param {{ width?: number, height?: number }} [imageSize]
 * @returns {DocumentStructure}
 */
export function segmentLineDataIntoStructure(lineData, _imageSize = {}) {
  const rows = (lineData ?? []).filter((l) => l.included && l.conversionOutput && l.text?.trim())
  /** @type {Map<DocumentZoneId, DocumentZone>} */
  const zoneMap = new Map()

  let firstOptY = Infinity
  for (const row of rows) {
    if (row.type === 'mcq_option' || findOptionMarkersInLineText(row.text).length > 0) {
      firstOptY = Math.min(firstOptY, row.bbox?.y0 ?? firstOptY)
    }
  }

  const blob = rows.map((r) => r.text).join('\n')
  const matrixHint = looksLikeMatchColumnUpload(blob)
  const passageHint = PASSAGE_RE.test(blob)

  /** @type {'stem'|'column_i'|'column_ii'|'passage'} */
  let columnMode = 'stem'

  for (const row of rows) {
    const t = row.text.trim()
    if (row.type === 'diagram') {
      zonePush(zoneMap, 'diagram', t, row)
      continue
    }

    if (passageHint && PASSAGE_RE.test(t)) {
      columnMode = 'passage'
      zonePush(zoneMap, 'passage', t, row)
      continue
    }

    if (matrixHint) {
      if (COL_I_RE.test(t)) {
        columnMode = 'column_i'
        zonePush(zoneMap, 'column_i', t, row)
        continue
      }
      if (COL_II_RE.test(t)) {
        columnMode = 'column_ii'
        zonePush(zoneMap, 'column_ii', t, row)
        continue
      }
      if (columnMode === 'column_i') {
        zonePush(zoneMap, 'column_i', t, row)
        continue
      }
      if (columnMode === 'column_ii') {
        zonePush(zoneMap, 'column_ii', t, row)
        continue
      }
    }

    const markers = findOptionMarkersInLineText(t)
    const inOptionBand =
      row.type === 'mcq_option' ||
      markers.length > 0 ||
      (firstOptY < Infinity && (row.bbox?.y0 ?? 0) >= firstOptY - 6)

    if (inOptionBand && firstOptY < Infinity && !matrixHint) {
      zonePush(zoneMap, 'options', t, row)
    } else if (columnMode === 'passage') {
      zonePush(zoneMap, 'passage', t, row)
    } else {
      zonePush(zoneMap, 'stem', t, row)
    }
  }

  const zones = [...zoneMap.values()]
  const diagramBboxes = zones
    .filter((z) => z.id === 'diagram')
    .flatMap((z) => z.bboxes)

  const kind = inferStructureKind(zones, { matrixHint, passageHint, firstOptY })

  return {
    zones,
    kind,
    diagramBboxes,
    optionStartY: firstOptY < Infinity ? firstOptY : null,
    lineCount: rows.length,
  }
}

/**
 * @param {DocumentZone[]} zones
 * @param {{ matrixHint?: boolean, passageHint?: boolean, firstOptY?: number }} hints
 */
export function inferStructureKind(zones, hints = {}) {
  const has = (id) => zones.some((z) => z.id === id && z.lines.length > 0)
  // Passage cue alone is weak — prefer MCQ when an option band is present.
  if ((hints.passageHint || has('passage')) && !has('options')) return 'passage'
  if (hints.matrixHint || has('column_i') || has('column_ii')) return 'matrix'
  if (has('diagram') && !has('options')) return 'integer_diagram'
  if (has('options') || (hints.firstOptY ?? Infinity) < Infinity) return 'mcq'
  if (hints.passageHint || has('passage')) return 'passage'
  return 'unknown'
}

/** @param {DocumentZone[]} zones @param {DocumentZoneId} id */
export function zoneText(zones, id) {
  return zones
    .filter((z) => z.id === id)
    .flatMap((z) => z.lines)
    .join('\n')
    .trim()
}

/**
 * @param {DocumentStructure} structure
 * @returns {{ text: string, options: string[], optionsFound: number } | null}
 */
export function mcqPayloadFromStructure(structure) {
  if (!structure?.zones?.length) return null

  const stem = normalizeMathText(zoneText(structure.zones, 'stem'))
  const optLines = structure.zones
    .filter((z) => z.id === 'options')
    .flatMap((z) => z.lines)
  if (!stem || !optLines.length) return null

  const options = ['', '', '', '']
  for (const line of optLines) {
    const markers = findOptionMarkersInLineText(line)
    const fromLine = optionsFromTextMarkers(line, markers)
    for (let i = 0; i < 4; i += 1) {
      const body = String(fromLine[i] ?? '').trim()
      if (body && (!options[i] || body.length > options[i].length)) options[i] = body
    }
  }
  const found = options.filter((o) => o.trim()).length
  if (found < 2) return null
  return {
    text: stem,
    options: options.map((o) => normalizeMathText(o)),
    optionsFound: found,
  }
}

/**
 * @param {DocumentStructure} structure
 * @returns {string}
 */
export function matrixBlobFromStructure(structure) {
  const stem = zoneText(structure.zones, 'stem')
  const colI = zoneText(structure.zones, 'column_i')
  const colII = zoneText(structure.zones, 'column_ii')
  return [stem, colI, colII].filter(Boolean).join('\n\n')
}

/**
 * @param {DocumentStructure} structure
 * @returns {string}
 */
export function passageBlobFromStructure(structure) {
  return zoneText(structure.zones, 'passage') || zoneText(structure.zones, 'stem')
}
