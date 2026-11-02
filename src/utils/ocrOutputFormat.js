/**
 * OCR output format for Mathpix: latex (default, questions) or word (Mathpix markdown / docx).
 */
const STORAGE_KEY = 'testvantage-ocr-output-format'

/** @returns {'latex' | 'word'} */
export function loadOcrOutputFormat() {
  try {
    const raw = String(localStorage.getItem(STORAGE_KEY) ?? '').trim().toLowerCase()
    if (raw === 'word') return 'word'
  } catch {
    /* ignore */
  }
  return 'latex'
}

/** @param {'latex' | 'word'} format */
export function saveOcrOutputFormat(format) {
  const next = format === 'word' ? 'word' : 'latex'
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  return next
}

