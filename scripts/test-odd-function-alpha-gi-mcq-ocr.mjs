import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import {
  looksLikeOddFunctionAlphaGiMcq,
  repairOddFunctionAlphaGiMcqParse,
  ODD_FUNCTION_ALPHA_GI_OPTIONS } from '../src/utils/repairOddFunctionAlphaGiMcqOcr.js'
import { shouldSkipOptionsAutoCrop, shouldStripMistakenOptionCrops } from '../src/utils/graphOptionOcr.js'

const garbled =
  'If f(x) =x^\\circ+sinx + Leen! is an odd function, then which is true for parameter o. (where [.] denotes |cosx | greatest integer function) is - (\\lambda)0< \\alpha < 1(\\lambda) \\alpha = 1(\\lambda) \\alpha= 1(\\lambda)(\\lambda) 0 < \\alpha < 2'

assert.ok(looksLikeOddFunctionAlphaGiMcq(garbled))

const parsed = parseSingleQuestionUpload(garbled, garbled)
assert.equal(parsed.optionsFound, 4)
assert.match(parsed.text ?? '', /x\^5 \+ \\sin x/)
assert.match(parsed.text ?? '', /\\cos x.*\\alpha/)
assert.match(parsed.text ?? '', /greatest integer function/)
assert.deepEqual(parsed.options, ODD_FUNCTION_ALPHA_GI_OPTIONS)
assert.ok(!/Leen|x\^\\circ|\\lambda/i.test(parsed.text ?? ''))

assert.ok(shouldSkipOptionsAutoCrop(parsed.text ?? '', parsed.options ?? [], garbled))
assert.ok(
  shouldStripMistakenOptionCrops(
    parsed.text ?? '',
    parsed.options ?? [],
    ['data:image/png;base64,sliver', 'data:image/png;base64,sliver', null, null],
    garbled,
  ),
  'strip mistaken graph crops on text α options',
)

const healed = repairOddFunctionAlphaGiMcqParse({
  text: garbled,
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  _ocrSource: garbled })
assert.equal(healed.options[0], ODD_FUNCTION_ALPHA_GI_OPTIONS[0])
assert.equal(healed.options[3], ODD_FUNCTION_ALPHA_GI_OPTIONS[3])

console.log('test-odd-function-alpha-gi-mcq-ocr: ok')
