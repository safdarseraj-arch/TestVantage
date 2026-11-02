import assert from 'node:assert/strict'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import {
  shouldAttemptOptionsAutoCrop,
  shouldSkipOptionsAutoCrop,
} from '../src/utils/graphOptionOcr.js'
import { FX_PLUS_ONE_TIMES_EIGHT_OPTIONS } from '../src/utils/repairFxPlusOneTimesEightMcqOcr.js'

const raw =
  'If f : R — R is a function such that ( f x + 1) x =8, x >0, then the value is equal to (A) 4 (B) 8 (C) 32 (D) 64'

const ex = processMcqUploadExtract(raw)
assert.equal(ex.found, 4, 'four options')
assert.match(ex.parsed.text ?? '', /f\(x\+1\)\)x\s*=\s*8/i, 'clean stem')
assert.deepEqual(ex.parsed.options, FX_PLUS_ONE_TIMES_EIGHT_OPTIONS, 'numeric options')
assert.ok(
  shouldSkipOptionsAutoCrop(ex.parsed.text ?? '', ex.parsed.options ?? [], raw),
  'skip auto-crop',
)
assert.equal(
  shouldAttemptOptionsAutoCrop(ex.parsed.text ?? '', ex.parsed.options ?? [], [], raw),
  false,
  'no auto-crop',
)

console.log('test-fx-plus-one-times-eight-ocr: ok')
