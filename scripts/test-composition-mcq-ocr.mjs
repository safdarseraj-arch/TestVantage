import assert from 'node:assert/strict'
import { looksLikePassageMultiMcq } from '../src/utils/parsePassageUpload.js'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { processMcqUploadExtract } from '../src/utils/uploadPipeline.js'
import {
  looksLikeCompositionIdentityMcq,
  repairCompositionMcqParse,
} from '../src/utils/repairCompositionMcqOcr.js'
import { normalizeOptionMarkersInText } from '../src/utils/mcqOptionMarkers.js'

const stem =
  'Let f(x) = x/(1+x) and g(x) = rx/(1-x). Let S be the set of all real numbers r such that f(g(x)) = g(f(x)) for infinitely many real number x. The number of elements in set S is-'
const garbled = `${stem} @Aa)1 B)2 3 D)5`
const withNoise = `Let f(x) = Tox and let g(X) = 1-x .
${stem} (A) 1 (B) 2 (C) 3 (D) 5`

assert.ok(looksLikeCompositionIdentityMcq(garbled))
assert.ok(looksLikeCompositionIdentityMcq(withNoise))
assert.equal(looksLikePassageMultiMcq(garbled), false, 'not passage — single composition SCQ')
assert.equal(looksLikePassageMultiMcq(withNoise), false, 'not passage with OCR noise')

const marked = normalizeOptionMarkersInText(garbled)
assert.match(marked, /\(A\)\s*1/)

const parsed = parseSingleQuestionUpload(garbled, garbled)
assert.equal(parsed.optionsFound, 4, 'four options')
assert.match(parsed.text ?? '', /f\(g\(x\)\)\s*=\s*g\(f\(x\)\)/)
assert.equal(parsed.options[0], '$1$')
assert.equal(parsed.options[3], '$5$')

const extracted = processMcqUploadExtract(garbled)
assert.notEqual(extracted.pass, 'passage-deferred')

const repaired = repairCompositionMcqParse({
  text: 'garbled',
  options: ['', '', '', ''],
  _ocrSource: garbled,
})
assert.equal(repaired.optionsFound, 4)

console.log('test-composition-mcq-ocr: ok')
