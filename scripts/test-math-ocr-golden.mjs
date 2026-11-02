import assert from 'node:assert/strict'
import { MATH_OCR_GOLDEN } from './fixtures/math-ocr-golden.js'
import { mathRegionsFromTesseractPage } from '../src/utils/tesseractMathRegions.js'
import { mergeHybridOcrText } from '../src/utils/hybridOcrMerge.js'
import {
  MATH_OCR_MODEL_FALLBACK,
  MATH_OCR_MODEL_PRIMARY,
} from '../src/utils/mathOcrConstants.js'

assert.equal(MATH_OCR_MODEL_PRIMARY, 'onnx-community/nougat-latex-base-ONNX')
assert.equal(MATH_OCR_MODEL_FALLBACK, 'Xenova/texify2')

for (const fx of MATH_OCR_GOLDEN) {
  const regions = mathRegionsFromTesseractPage(fx.page)
  assert.ok(
    regions.length >= fx.expectRegionMin,
    `${fx.name}: expected >= ${fx.expectRegionMin} regions, got ${regions.length}`,
  )

  const regionResults = regions.slice(0, fx.mockLatex.length).map((rect, i) => ({
    rect,
    latex: fx.mockLatex[i],
    lineText: rect.lineText,
  }))

  const merged = mergeHybridOcrText(fx.prose, regionResults)
  for (const re of fx.expectMerged) {
    assert.match(merged, re, `${fx.name}: merged text should match ${re}`)
  }
  for (const re of fx.expectAbsent ?? []) {
    assert.ok(!re.test(merged), `${fx.name}: merged text must not match ${re}`)
  }
}

console.log(`test-math-ocr-golden: ok (${MATH_OCR_GOLDEN.length} fixtures)`)
