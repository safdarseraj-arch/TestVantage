import assert from 'node:assert/strict'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import {
  shouldAttemptOptionsAutoCrop,
  shouldSkipOptionsAutoCrop,
} from '../src/utils/graphOptionOcr.js'
import { SURJECTIVE_NOT_INJECTIVE_OPTIONS } from '../src/utils/repairSurjectiveNotInjectiveMcqOcr.js'

const raw =
  "Which of the following function is surjective but not injective (A)f:R>R f(x) = x^2 + 2x^3 - x^2 + 1(B)f : R > R lx)=x^2 + x + 1(C)f : R \\to"

const ex = processMcqUploadExtract(raw)
assert.equal(ex.found, 4, 'four options')
assert.match(ex.parsed.text ?? '', /surjective but not injective/i, 'clean stem')
assert.match(ex.parsed.options?.[0] ?? '', /x\^4/, 'option A has x^4')
assert.match(ex.parsed.options?.[2] ?? '', /\\sqrt/, 'option C has sqrt')

assert.ok(
  shouldSkipOptionsAutoCrop(ex.parsed.text ?? '', ex.parsed.options ?? [], raw),
  'skip auto-crop for function text MCQ',
)
assert.equal(
  shouldAttemptOptionsAutoCrop(ex.parsed.text ?? '', ex.parsed.options ?? [], [], raw),
  false,
  'never auto-crop surjective MCQ',
)

assert.deepEqual(
  ex.parsed.options?.map((o) => o.replace(/\s+/g, ' ').trim()),
  SURJECTIVE_NOT_INJECTIVE_OPTIONS.map((o) => o.replace(/\s+/g, ' ').trim()),
  'golden options',
)

console.log('test-surjective-not-injective-ocr: ok')
