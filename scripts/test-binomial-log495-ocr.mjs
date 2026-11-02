import assert from 'node:assert/strict'
import {
  looksLikeBinomialLog495Question,
  repairBinomialLog495StemOcr,
  BINOMIAL_LOG495_STEM,
} from '../src/utils/repairBinomialLog495StemOcr.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'

const garbled = `12 If the 9 term in the expansion of (& + log , x) is equal to 495, then the value of x can be- X AI
(A) Option A
(B) An
(C) a fraction
(D) an irrational number`

assert.ok(looksLikeBinomialLog495Question(garbled), 'detect binomial log495 stem')

const repaired = repairBinomialLog495StemOcr(garbled)
assert.match(repaired, /\\frac\{1\}\{x\^2\}/, 'rebuilds binomial expression')
assert.match(repaired, /\\log_2\s*x/, 'log base 2')
assert.match(repaired, /495/, 'keeps 495')
assert.match(repaired, /\(A\)\s*1\b/, 'option A is 1')
assert.match(repaired, /integer greater than/i, 'option B prose')
assert.match(repaired, /a fraction/i, 'option C')
assert.match(repaired, /irrational number/i, 'option D')
assert.doesNotMatch(repaired, /\\ce\{An\}|Option A|\(\s*&\s*\+/i, 'removes garbled OCR')

const polished = polishOcrText(garbled)
assert.match(polished, /\\frac\{1\}\{x\^2\}/, 'polish pipeline keeps binomial')

const parsed = parseSingleQuestionUpload(polished)
assert.equal(parsed.multi, false, 'single question')
assert.ok(parsed.text?.includes('495'), 'stem parsed')
assert.equal(parsed.options?.[0]?.trim(), '1', 'option A parsed')
assert.match(parsed.options?.[1] ?? '', /integer greater than/i, 'option B parsed')
assert.equal(parsed.options?.[2]?.trim(), 'a fraction', 'option C parsed')
assert.match(parsed.options?.[3] ?? '', /irrational number/i, 'option D parsed')
assert.equal(parsed.options?.filter((o) => o.trim()).length, 4, 'four options')

assert.match(BINOMIAL_LOG495_STEM, /9\^\{\\text\{th\}\}/, 'canonical stem')

console.log('test-binomial-log495-ocr: ok')
