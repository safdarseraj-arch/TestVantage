/** Full chapter / book PDF — page cap for one upload (built-in OCR). */
export const BOOK_OCR_MAX_PAGES = 250

export const SINGLE_OCR_TIMEOUT_MS = 120_000

/** Hybrid OCR when LaTeX model is already cached in the browser. */
export const HYBRID_OCR_TIMEOUT_MS = 480_000

/** First hybrid run may download the LaTeX ONNX model — allow extra time. */
export const HYBRID_OCR_FIRST_RUN_TIMEOUT_MS = 720_000

/** ~40s per scanned page for built-in book OCR (fast 2-pass mode). */
export const BOOK_OCR_MS_PER_PAGE = 40_000

/** Lower scale for multi-page book OCR — smaller PNG, faster Tesseract. */
export const BOOK_PDF_RENDER_SCALE = 2.5

/** Single-page / MCQ PDF — keep detail for small diagrams. */
export const SINGLE_PDF_RENDER_SCALE = 3.25

/**
 * @param {number} pageCount
 * @returns {number}
 */
export function ocrTimeoutForPdfPages(pageCount) {
  const pages = Math.min(Math.max(1, pageCount), BOOK_OCR_MAX_PAGES)
  if (pages <= 1) return SINGLE_OCR_TIMEOUT_MS
  return Math.min(3_600_000, SINGLE_OCR_TIMEOUT_MS + pages * BOOK_OCR_MS_PER_PAGE)
}
