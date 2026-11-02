/**
 * Last OCR layout cache — line_data + Tesseract page for Mathpix-style geometry.
 */

import { parseMcqFromLineData } from './ocrLineData.js'
import { parseMcqFromTesseractPage } from './ocrWordData.js'
import { parseSingleQuestionUpload } from './parseSingleQuestionUpload.js'

/** @typedef {import('./ocrLineData.js').OcrLineData} OcrLineData */

/** @type {WeakMap<File | Blob, { lineData: OcrLineData[], page?: import('tesseract.js').Page | null, imageSize?: { width: number, height: number } }>} */
const cache = new WeakMap()

/** PDF file → raster page blob that holds the layout cache */
/** @type {WeakMap<File | Blob, File | Blob>} */
const sourceAlias = new WeakMap()

/**
 * @param {File | Blob} key
 * @param {OcrLineData[]} lineData
 * @param {{ page?: import('tesseract.js').Page, imageSize?: { width: number, height: number } }} [layout]
 */
export function setLastOcrLineData(key, lineData, layout = {}) {
  if (!key) return
  cache.set(key, {
    lineData: lineData ?? [],
    page: layout.page ?? null,
    imageSize: layout.imageSize ?? {},
  })
}

/** Link original upload file (e.g. PDF) to page image blob cache. */
export function linkOcrLayoutSource(sourceFile, pageBlob) {
  if (sourceFile && pageBlob) sourceAlias.set(sourceFile, pageBlob)
}

/** @param {File | Blob} key */
export function getLastOcrLayout(key) {
  if (!key) return null
  const direct = cache.get(key)
  if (direct) return direct
  const alias = sourceAlias.get(key)
  return alias ? cache.get(alias) ?? null : null
}

/** @param {File | Blob} key @returns {OcrLineData[] | null} */
export function getLastOcrLineData(key) {
  return getLastOcrLayout(key)?.lineData ?? null
}

/** @param {File | Blob} key */
export function clearLastOcrLineData(key) {
  if (!key) return
  cache.delete(key)
  sourceAlias.delete(key)
}

/**
 * @param {{ text: string, options: string[], optionsFound: number, complete?: boolean, multi?: boolean }} mcq
 * @param {string} rawOcr
 */
function finalizeGeometryMcq(mcq, rawOcr) {
  const optBlock = (mcq.options ?? [])
    .map((o, i) => (String(o ?? '').trim() ? `(${String.fromCharCode(65 + i)}) ${String(o).trim()}` : ''))
    .filter(Boolean)
    .join('\n')
  const polished = optBlock ? `${mcq.text}\n${optBlock}` : mcq.text
  const repaired = parseSingleQuestionUpload(polished, rawOcr)
  if ((repaired.optionsFound ?? 0) >= (mcq.optionsFound ?? 0)) {
    return {
      ...repaired,
      complete: (repaired.optionsFound ?? 0) >= 4,
      multi: false,
    }
  }
  return {
    text: mcq.text,
    options: mcq.options,
    optionsFound: mcq.optionsFound,
    complete: mcq.optionsFound >= 4,
    multi: false,
  }
}

/**
 * Geometry MCQ from cached layout — line bands, then word-level horizontal split.
 * @param {File | Blob} sourceFile
 * @param {string} [rawOcr]
 */
export function tryMcqParseFromCachedLineData(sourceFile, rawOcr = '') {
  const layout = getLastOcrLayout(sourceFile)
  if (!layout?.lineData?.length && !layout?.page?.lines?.length) return null

  let mcq = null
  if (layout.page) {
    mcq = parseMcqFromTesseractPage(layout.page, layout.imageSize)
  }
  if (!mcq || mcq.optionsFound < 2) {
    const lineMcq = parseMcqFromLineData(layout.lineData ?? [])
    if (lineMcq && lineMcq.optionsFound >= (mcq?.optionsFound ?? 0)) {
      mcq = { ...lineMcq, source: 'mathpix-line-geometry' }
    }
  }

  if (!mcq || mcq.optionsFound < 2) return null
  return finalizeGeometryMcq(mcq, rawOcr)
}

/** @param {File | Blob} sourceFile */
export function geometryParseSource(sourceFile) {
  const layout = getLastOcrLayout(sourceFile)
  if (!layout?.page) return 'mathpix-line-geometry'
  const mcq = parseMcqFromTesseractPage(layout.page, layout.imageSize)
  return mcq?.source ?? 'mathpix-line-geometry'
}
