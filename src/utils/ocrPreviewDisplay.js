/**
 * Best text to show in PDF-crop OCR preview cards.
 * @param {{ text?: string, rawOcr?: string, options?: string[], userEdited?: boolean } | null | undefined} ocr
 */
export function getOcrDisplayText(ocr) {
  const text = String(ocr?.text ?? '').trim()
  if (text) return text
  const raw = String(ocr?.rawOcr ?? '').trim()
  if (raw) return raw
  const fromOptions = (ocr?.options ?? []).map((o) => String(o ?? '').trim()).filter(Boolean)
  if (fromOptions.length) return fromOptions.join('\n')
  return ''
}

/** @param {{ text?: string, rawOcr?: string, options?: string[] } | null | undefined} ocr */
export function hasOcrDisplayText(ocr) {
  return getOcrDisplayText(ocr).length > 0
}

/**
 * Build OCR meta patch when the user edits extracted text.
 * @param {import('./pdfCropOcr.js').PdfCropOcrResult | null | undefined} ocr
 * @param {string} newText
 * @param {string} [stepKey]
 */
export function patchOcrWithEditedText(ocr, newText, stepKey) {
  const trimmed = String(newText ?? '')
  /** @type {Partial<import('./pdfCropOcr.js').PdfCropOcrResult>} */
  const patch = { text: trimmed, userEdited: true }
  if (stepKey?.startsWith('option_')) {
    const idx = Number(stepKey.replace('option_', ''))
    if (Number.isFinite(idx) && idx >= 0 && idx < 4) {
      const options = [...(ocr?.options ?? ['', '', '', ''])]
      while (options.length < 4) options.push('')
      options[idx] = trimmed
      patch.options = options
    }
  }
  return patch
}

/**
 * Human label for the confidence badge (not “converted %”).
 * @param {number} confidence
 * @param {boolean} hasText
 */
export function ocrConfidenceBadgeLabel(confidence, hasText) {
  const pct = Math.round(Number(confidence) || 0)
  if (!hasText) return `${pct}% scan confidence · no text read`
  return `${pct}% confidence`
}
