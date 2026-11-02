import { findOptionsBlockStart } from './mcqOptionMarkers.js'
import { finalizeStemForBank } from './stemBankGuard.js'
import { resolveMcqFromOcr } from './uploadPipeline.js'

/**
 * Parse stem + A–D from OCR / LaTeX paste (pure — no React state).
 * @param {string} raw
 */
export function resolveMcqFieldsFromExtracted(raw) {
  const result = resolveMcqFromOcr(raw)
  if (result.multi) {
    return { stem: '', options: ['', '', '', ''], found: 0, multi: true }
  }
  return {
    stem: result.stem,
    options: result.options,
    found: result.found,
    complete: result.complete,
  }
}

/**
 * Resolve question stem for save/preview when OCR lives in extractedRaw but Question text is empty.
 * @returns {{ stem: string, source: 'field' | 'matrix_default' | 'ocr_parse' | 'ocr_raw' | 'image_only' | 'none' }}
 */
export function resolveStemInputForSave({
  qText = '',
  qType = 'single_correct',
  extractedRaw = '',
  ocrRawText = '',
  questionImage = '',
  stemTextInImage = false,
  options = [],
} = {}) {
  const finalize = (stem) => finalizeStemForBank(String(stem ?? '').trim(), options)

  const direct = String(qText ?? '').trim()
  if (direct) return { stem: direct, source: 'field' }
  if (qType === 'matrix_match') return { stem: 'Match the Column', source: 'matrix_default' }

  const raw = String(ocrRawText || extractedRaw || '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (raw) {
    const parsed = resolveMcqFromOcr(raw)
    if (!parsed.multi && parsed.stem?.trim()) {
      return { stem: finalize(parsed.stem.trim()), source: 'ocr_parse' }
    }
    let stemOnly = raw
    const optStart = findOptionsBlockStart(stemOnly)
    if (optStart > 40) stemOnly = stemOnly.slice(0, optStart).trim()
    if (stemOnly.length >= 10) {
      return { stem: finalize(stemOnly.slice(0, 4000)), source: 'ocr_raw' }
    }
  }

  if (String(questionImage ?? '').trim() && stemTextInImage) {
    return { stem: '(Image question)', source: 'image_only' }
  }

  return { stem: '', source: 'none' }
}
