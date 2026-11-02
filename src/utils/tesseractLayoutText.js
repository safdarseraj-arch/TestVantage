/**
 * Rebuild page text from Tesseract line boxes (Mathpix mmd-style line breaks).
 * @param {import('tesseract.js').Page | null | undefined} page
 */
export function layoutTextFromTesseractPage(page) {
  const lines = page?.lines ?? []
  if (!lines.length) return String(page?.text ?? '').replace(/\r\n/g, '\n').trim()
  return lines
    .map((line) => String(line.text ?? '').trim())
    .filter(Boolean)
    .join('\n')
}
