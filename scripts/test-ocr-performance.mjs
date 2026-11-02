import assert from 'node:assert/strict'
import { mapConcurrent } from '../src/utils/ocrConcurrency.js'
import {
  HYBRID_FAST_LAYOUT_CONFIDENCE,
  HYBRID_LAYOUT_MIN_CHARS,
  MATH_OCR_MAX_NEW_TOKENS,
  MATH_OCR_REGION_CONCURRENCY,
  MATH_OCR_WORKER_POOL_SIZE,
} from '../src/utils/mathOcrConfig.js'

const order = []
const out = await mapConcurrent([1, 2, 3, 4, 5], 2, async (n) => {
  order.push(`start-${n}`)
  await new Promise((r) => setTimeout(r, 5))
  order.push(`end-${n}`)
  return n * 10
})
assert.deepEqual(out, [10, 20, 30, 40, 50])
assert.equal(order.filter((x) => x.startsWith('start')).length, 5)

assert.ok(MATH_OCR_MAX_NEW_TOKENS <= 200, 'equation crops use fewer tokens than full page')
assert.ok(MATH_OCR_REGION_CONCURRENCY >= 2)
assert.ok(HYBRID_LAYOUT_MIN_CHARS >= 20)
assert.ok(MATH_OCR_WORKER_POOL_SIZE >= 1)
assert.ok(HYBRID_FAST_LAYOUT_CONFIDENCE >= 40)

import { getOcrProgressLabel } from '../src/utils/ocrProgressLabel.js'
import { TESSERACT_LAYOUT_MAX_DIM } from '../src/utils/preprocessImage.js'

assert.match(getOcrProgressLabel(25), /Mathpix OCR/i)
assert.match(getOcrProgressLabel(60), /Mathpix OCR/i)
assert.match(getOcrProgressLabel(78), /Splitting questions|Gemini/i)
assert.ok(TESSERACT_LAYOUT_MAX_DIM <= 1800, 'layout downscale keeps Tesseract fast')

console.log('test-ocr-performance: ok')
