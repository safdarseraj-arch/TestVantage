import assert from 'node:assert/strict'
import {
  BETA_DEFINITE_INTEGRAL_STEM,
  looksLikeSingleIntegralCalculusQuestion,
  repairIntegralStemOcr,
} from '../src/utils/repairIntegralStemOcr.js'
import { normalizeQuestionStemText } from '../src/utils/normalizeMathText.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { looksLikePassageMultiMcq } from '../src/utils/parsePassageUpload.js'
import { polishExtractedText } from '../src/utils/ocrExtractPolish.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { tryFastHybridTesseractResult } from '../src/utils/hybridOcrFastPath.js'

const garbled =
  'Let jlasamea)ox then find the value of 2 et B= -=, then In € value o O Wx +x +1'

assert.ok(looksLikeSingleIntegralCalculusQuestion(garbled), 'single integral stem')
assert.equal(looksLikePassageMultiMcq(garbled), false, 'must not route as passage')

const repaired = repairIntegralStemOcr(garbled)
assert.match(repaired, /\\int_0\^1/, 'rebuilds definite integral')
assert.match(repaired, /\\frac\{\(2\+3x\+4x\^2\)/, 'numerator polynomial')
assert.match(repaired, /\\sqrt\{x\^2\+x\+1\}/, 'denominator sqrt')
assert.match(repaired, /\\beta\^2/, 'asks for beta squared')

const polished = polishExtractedText(garbled)
assert.match(polished, /\\int_0\^1/, 'polish pipeline keeps integral')
assert.match(polished, /\\beta\^2|\\beta/, 'polish pipeline keeps beta squared ask')
assert.doesNotMatch(polished, /\$\s+beta\s*=/, 'normalize must not leave broken $ beta')

const parsed = parseSingleQuestionUpload(polished, garbled)
assert.match(parsed.text ?? '', /\\int_0\^1/, 'parse prefers polished stem over raw OCR')
assert.doesNotMatch(parsed.text ?? '', /jlasamea/, 'parsed stem must not keep garbled OCR')

const fast = tryFastHybridTesseractResult(garbled, null)
assert.match(fast ?? '', /\\int_0\^1/, 'fast path skips ONNX for repaired integral')

const onnxBlock =
  'Let $beta = \\int_{0}^{1} \\frac{(2+3x+4x^2) dx}{2\\sqrt{x^2+x+1}} , \\text{ then find the value of } beta^2$'
const normalizedOnnx = finalizeStemForBank(repairIntegralStemOcr(onnxBlock))
assert.match(normalizedOnnx, /\\beta/, 'storage pipeline keeps LaTeX beta')
assert.doesNotMatch(normalizedOnnx, /\$ beta\b|\$beta\b/, 'no bare beta in math delimiters')
assert.match(normalizedOnnx, /\\int_0\^1/, 'onnx block normalizes to definite integral')

const normalizedCanonical = normalizeQuestionStemText(BETA_DEFINITE_INTEGRAL_STEM)
assert.match(normalizedCanonical, /\\beta/, 'normalize must not strip backslash from \\beta')
assert.doesNotMatch(normalizedCanonical, /\$ beta\b/, 'normalize must not corrupt \\beta to bare beta')

console.log('test-integral-beta-ocr: ok')
