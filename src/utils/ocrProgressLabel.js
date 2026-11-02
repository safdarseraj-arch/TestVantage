/**
 * Human-readable OCR stage for progress UI.
 * Mathpix reads the page. Local AI splits. Gemini fills tags/answers/solutions (never OCR).
 * @param {number} pct
 */
export function getOcrProgressLabel(pct) {
  const n = Number(pct) || 0
  if (n < 8) return 'Checking Mathpix on port 3001…'
  if (n < 70) return 'Mathpix OCR (handwriting / image / PDF)…'
  if (n < 86) return 'Local AI splitting questions (clean options, figures)…'
  if (n < 96) return 'Gemini flash-lite tags, answers, solutions (not OCR)…'
  if (n < 100) return 'Saving drafts to the question bank…'
  return 'Finished.'
}
