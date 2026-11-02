import assert from 'node:assert/strict'
import {
  BOOK_OCR_MAX_PAGES,
  BOOK_PDF_RENDER_SCALE,
  HYBRID_OCR_FIRST_RUN_TIMEOUT_MS,
  HYBRID_OCR_TIMEOUT_MS,
  SINGLE_PDF_RENDER_SCALE,
  ocrTimeoutForPdfPages,
} from '../src/utils/bookOcrConfig.js'

assert.equal(ocrTimeoutForPdfPages(1), 120_000)
assert.ok(ocrTimeoutForPdfPages(50) > 120_000)
assert.ok(ocrTimeoutForPdfPages(250) <= 3_600_000)
assert.equal(ocrTimeoutForPdfPages(500), ocrTimeoutForPdfPages(BOOK_OCR_MAX_PAGES))
assert.ok(BOOK_PDF_RENDER_SCALE < SINGLE_PDF_RENDER_SCALE, 'book scans use lower scale than single uploads')
assert.ok(HYBRID_OCR_FIRST_RUN_TIMEOUT_MS > HYBRID_OCR_TIMEOUT_MS, 'first ONNX download gets longer budget')
assert.ok(HYBRID_OCR_TIMEOUT_MS >= 480_000, 'cached hybrid OCR allows 8+ minutes')

console.log('test-book-pdf: ok')
