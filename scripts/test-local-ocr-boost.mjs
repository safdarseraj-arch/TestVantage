import assert from 'node:assert/strict'
import {
  shouldUseLocalOcrQualityBoost,
  shouldUseMathpixFallback,
  resolveOcrEngine,
} from '../src/utils/ocrSettings.js'
import {
  shouldRunLocalOcrBoost,
  LOCAL_OCR_BOOST_MIN_SCORE,
} from '../src/utils/localOcrBoostDetect.js'
import { scoreOcrCandidate } from '../src/utils/pickBestOcrCandidate.js'

const defaults = {
  useLocalMathOcr: true,
  localOcrQualityBoost: true,
  mathpixFallback: false,
  useMathpixApi: false,
  mode: 'standard',
}

assert.equal(shouldUseMathpixFallback(defaults), false)
assert.equal(shouldUseLocalOcrQualityBoost(defaults), true)
assert.equal(resolveOcrEngine(defaults), 'mathpix')

const garbled = 'Then g(2) is - e +e 2 (A) Ys B)e Dye'
const good = 'Let $f(x)=\\ln(x+\\sqrt{x^2+1})$. Then $g(2)$ is (A) $\\frac{e^2+e^{-2}}{2}$ (B) $e^2$'
assert.ok(scoreOcrCandidate(good, { source: 'hybrid:boost-pass' }) > scoreOcrCandidate(garbled, { source: 'hybrid:merged' }))
assert.equal(shouldRunLocalOcrBoost(garbled, defaults), true)
assert.equal(shouldRunLocalOcrBoost(good, defaults), false)
// High-scoring math stem must not trigger a second ONNX pass (was the main OCR slowdown)
const vectorStem =
  'Vectors $\\vec{a}, \\vec{b}$ and $\\vec{c}$ are coplanar. (A) $5/3$ (B) $5/9$ (C) $5/12$ (D) $5/18$'
assert.ok(scoreOcrCandidate(vectorStem) >= LOCAL_OCR_BOOST_MIN_SCORE)
assert.equal(shouldRunLocalOcrBoost(vectorStem, defaults), false)

assert.ok(LOCAL_OCR_BOOST_MIN_SCORE >= 35 && LOCAL_OCR_BOOST_MIN_SCORE <= 55)

console.log('test-local-ocr-boost: ok')
