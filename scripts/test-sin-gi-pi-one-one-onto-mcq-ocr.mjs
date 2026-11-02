import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import { shouldSkipOptionsAutoCrop } from '../src/utils/graphOptionOcr.js'
import {
  looksLikeSinGiPiOneOneOntoMcq,
  repairSinGiPiOneOneOntoMcqParse,
  SIN_GI_PI_ONE_ONE_ONTO_STEM,
  SIN_GI_PI_ONE_ONE_ONTO_OPTIONS,
} from '../src/utils/repairSinGiPiOneOneOntoMcqOcr.js'

const garbled =
  'If f:R>R& f(x) = -5-">+2x-1+, [x(x -1) + - (where [x] denotes integral part of X), then f(x) is - X"+2x+3 4 (A) one-one but not onto (B) one-one & onto (C) onto but not $$# One-one$ \\newcommand{\\vec{s}}[1]{\\overset{\\rightharpoonup}{\\mathbf{#1}}} (D) neither one-one nor onto'

assert.ok(looksLikeSinGiPiOneOneOntoMcq(garbled))

const parsed = parseSingleQuestionUpload(garbled, garbled)
assert.equal(parsed.optionsFound, 4, 'repair fills four one-one/onto options')
assert.equal(parsed.text, SIN_GI_PI_ONE_ONE_ONTO_STEM)
assert.deepEqual(parsed.options, SIN_GI_PI_ONE_ONE_ONTO_OPTIONS)
assert.ok(!/\\newcommand|R>R|">\+/i.test(parsed.text ?? ''))
assert.ok(!parsed.options.some((o) => /\\newcommand|\$\$?#/i.test(o ?? '')))

const extracted = processMcqUploadExtract(garbled)
assert.equal(extracted.found, 4)
assert.ok(
  shouldSkipOptionsAutoCrop(extracted.parsed.text ?? '', extracted.parsed.options ?? [], garbled),
  'text one-one/onto MCQ must not auto-crop options',
)

const healed = repairSinGiPiOneOneOntoMcqParse({
  text: garbled,
  options: ['one-one but not onto', 'one-one & onto', 'onto but not $$# One-one$', ''],
  _ocrSource: garbled,
})
assert.equal(healed.options[2], SIN_GI_PI_ONE_ONE_ONTO_OPTIONS[2])
assert.equal(healed.options[3], SIN_GI_PI_ONE_ONE_ONTO_OPTIONS[3])

console.log('test-sin-gi-pi-one-one-onto-mcq-ocr: ok')
