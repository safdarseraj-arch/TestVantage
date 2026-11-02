import { finalizeOcrText } from './inferMathFromPlainOcr.js'
import { layoutTextFromTesseractPage } from './tesseractLayoutText.js'
import { normalizeMathText } from './normalizeMathText.js'
import { pickBestOcrCandidate } from './pickBestOcrCandidate.js'

/**
 * Mathpix returns mmd / latex / text — pick the best polished candidate for hybrid output.
 * @param {string} tesseractRaw layout or boosted Tesseract prose
 * @param {string} merged Hybrid OCR + LaTeX merge (or same as tesseract when model skipped)
 * @param {import('tesseract.js').Page | null | undefined} [layoutPage]
 */
export function pickHybridFinalResult(tesseractRaw, merged, layoutPage) {
  const raw = String(tesseractRaw ?? '').trim()
  const hybrid = String(merged ?? '').trim()
  if (!raw && !hybrid) return ''

  const layoutText = layoutTextFromTesseractPage(layoutPage)
  /** @type {Array<{ text: string, raw?: string, source?: string }>} */
  const candidates = []

  if (hybrid) {
    candidates.push({
      text: normalizeMathText(finalizeOcrText(hybrid)),
      raw: hybrid,
      source: 'hybrid:merged',
    })
  }
  if (raw) {
    candidates.push({
      text: normalizeMathText(finalizeOcrText(raw)),
      raw,
      source: 'builtin:synthesis',
    })
  }
  if (layoutText.trim() && layoutText.trim() !== raw) {
    candidates.push({
      text: normalizeMathText(finalizeOcrText(layoutText)),
      raw: layoutText,
      source: 'tesseract:lines',
    })
  }

  if (!candidates.length) return hybrid || raw
  const best = pickBestOcrCandidate(candidates)
  return (best.raw ?? best.text ?? hybrid) || raw
}
