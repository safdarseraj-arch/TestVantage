import assert from 'node:assert/strict'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import {
  shouldAttemptOptionsAutoCrop,
  shouldSkipOptionsAutoCrop,
} from '../src/utils/graphOptionOcr.js'
import {
  F_RPLUS_POW_FUNCTION_OPTIONS,
  looksLikeFRplusPowFunctionMcq,
} from '../src/utils/repairFRplusPowFunctionMcqOcr.js'
import { looksLikeFxPlusOneTimesEightMcq } from '../src/utils/repairFxPlusOneTimesEightMcqOcr.js'

const raw =
  'a 256 If f : R^2 — Ris a function such that ( fx* + 1)" =8, x >0, then the value (+ (2 + J (A) 4 (B) 8 (C) 32 (D) 64'

assert.ok(looksLikeFRplusPowFunctionMcq(raw), 'detect R+ power function MCQ')
assert.equal(looksLikeFxPlusOneTimesEightMcq(raw), false, 'must not match simpler f(x+1) MCQ')

const ex = processMcqUploadExtract(raw)
assert.equal(ex.found, 4, 'four options')
assert.match(ex.parsed.text ?? '', /mathbb\{R\}\^\+/, 'R+ domain')
assert.match(ex.parsed.text ?? '', /x\^2 \+ 1/, 'x^2+1 inside f')
assert.match(ex.parsed.text ?? '', /256/, '256/x^2 term')
assert.match(ex.parsed.text ?? '', /x\^\{1\/4\}/, 'quarter-power exponent')
assert.doesNotMatch(ex.parsed.text ?? '', /f\(x\+1\)\)x/, 'not wrong f(x+1) stem')
assert.deepEqual(ex.parsed.options, F_RPLUS_POW_FUNCTION_OPTIONS, 'numeric options')
assert.ok(
  shouldSkipOptionsAutoCrop(ex.parsed.text ?? '', ex.parsed.options ?? [], raw),
  'skip auto-crop',
)
assert.equal(
  shouldAttemptOptionsAutoCrop(ex.parsed.text ?? '', ex.parsed.options ?? [], [], raw),
  false,
  'no auto-crop',
)

console.log('test-f-rplus-pow-function-ocr: ok')
