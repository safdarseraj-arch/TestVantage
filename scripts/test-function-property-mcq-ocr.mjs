import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import {
  looksLikeFunctionPropertyTextMcq,
  shouldSkipOptionsAutoCrop,
  shouldAttemptOptionsAutoCrop,
  shouldStripMistakenOptionCrops,
  stripWrongTextMcqOptionImages,
} from '../src/utils/graphOptionOcr.js'
import {
  normalizeOptionMarkersInText,
  splitEmbeddedMcqOptionMarkers,
} from '../src/utils/mcqOptionMarkers.js'
import { repairFunctionPropertyMcqParse } from '../src/utils/repairFunctionPropertyMcqOcr.js'
import { enhanceMcqFromOcr } from '../src/utils/aiUploadAssist.js'

const stem =
  'Let f : R to R be a real valued function such that f(10+x)=f(10-x) and f(20+x)=-f(20-x). Then which of the following statements is true -'
const garbled =
  `${stem} (A) f(x) is odd and periodic (B) f(x) is odd and aperiodic (CO ) f(x) is even and periodic (D) f(x) is even and aperiodic`

assert.ok(looksLikeFunctionPropertyTextMcq(garbled), 'detect function property MCQ')
assert.ok(shouldSkipOptionsAutoCrop(stem, ['f(x) is odd and periodic', '', '', ''], garbled))
assert.equal(shouldAttemptOptionsAutoCrop(stem, ['', '', '', ''], [], garbled), false)

const normalized = normalizeOptionMarkersInText(garbled)
assert.match(normalized, /\(C\)\s+f\(x\)/i, '(CO ) fixed to (C)')

const mergedOpts = splitEmbeddedMcqOptionMarkers([
  'f(x) is odd and periodic',
  'f(x) is odd and aperiodic (C) f(x) is even and periodic',
  '',
  'f(x) is even and aperiodic',
])
assert.equal(mergedOpts[1], 'f(x) is odd and aperiodic')
assert.match(mergedOpts[2], /even and periodic/)

const parsed = parseSingleQuestionUpload(garbled, garbled)
assert.equal(parsed.optionsFound, 4, 'all four text options')
assert.match(parsed.options[0] ?? '', /odd and periodic/)
assert.match(parsed.options[2] ?? '', /even and periodic/)
assert.ok(shouldStripMistakenOptionCrops(stem, parsed.options, ['data:image/png,x', null, null, null]))

const healed = stripWrongTextMcqOptionImages({
  questionType: 'single_correct',
  text: stem,
  options: parsed.options,
  optionImages: ['data:image/png,x', 'data:image/png,y', null, 'data:image/png,z'],
})
assert.equal(healed.optionImages, undefined, 'strip mistaken text option crops')

const garbledB = {
  text: stem,
  options: [
    'f(x) is odd and periodic',
    'f(x) is odd and aperiodic ($) f(>',
    '',
    'f(x) is even and aperiodic',
  ],
  _ocrSource: garbled,
}
const repairedB = repairFunctionPropertyMcqParse(garbledB)
assert.equal(repairedB.optionsFound, 4)
assert.match(repairedB.options[2] ?? '', /even and periodic/)

const ai = enhanceMcqFromOcr({
  stem,
  options: garbledB.options,
  rawOcr: garbled,
})
assert.equal(ai.found, 4, 'AI heal fills 4 options')
assert.ok(ai.improved, 'AI marks improved')

console.log('test-function-property-mcq-ocr: ok')
