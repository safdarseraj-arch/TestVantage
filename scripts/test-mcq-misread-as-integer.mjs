import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { inferUploadQuestionType, isMcqLikeFromOcr } from '../src/utils/classifyUploadFromOcr.js'
import { looksLikeIntegerValueQuestion } from '../src/utils/stemDiagramDetect.js'
import {
  looksLikeMcqMisreadAsInteger,
  looksLikeMcqPromptNotInteger,
  repairMcqMisreadAsIntegerParse,
  extractSimpleMcqOptionsFromTail,
  normalizeGarbledMcqOptionMarkers,
} from '../src/utils/repairMcqMisreadAsInteger.js'

/** Three different future-style OCR failures — none use a golden stem. */
const cases = [
  {
    name: 'vector coplanar garbled options',
    ocr: `Vectors a, b and c are coplanar. then |c·i|+|c·j|+|c·k| is equal to -
5/3 5/9 5/12 5/18`,
  },
  {
    name: 'physics energy SCQ with ®) ©) markers',
    ocr: `The energy stored in a capacitor is equal to -
1/2 CV^2 @) 1/4 CV^2 ®) CV^2 ©) 2CV^2`,
  },
  {
    name: 'math limit equals prompt only',
    ocr: `If lim x→0 (sin x)/x = L, then L is equal to -
1 0 -1 does not exist`,
  },
]

for (const c of cases) {
  assert.ok(looksLikeMcqMisreadAsInteger(c.ocr), `${c.name}: detect MCQ-not-IVQ`)
  assert.equal(
    inferUploadQuestionType({ stem: c.ocr, options: [], found: 0, rawOcr: c.ocr }),
    'single_correct',
    `${c.name}: type SCQ`,
  )
  assert.ok(isMcqLikeFromOcr({ stem: c.ocr, rawOcr: c.ocr }), `${c.name}: isMcqLike`)
  assert.equal(
    looksLikeIntegerValueQuestion(c.ocr.split('\n')[0].replace(/\s*$/, '') + ' is equal to -', []),
    false,
    `${c.name}: prompt not IVQ`,
  )
}

assert.ok(looksLikeMcqPromptNotInteger('then the value is equal to -'))
assert.deepEqual(
  extractSimpleMcqOptionsFromTail('5/3 5/9 5/12 5/18').length,
  4,
  'extract four fractions',
)
assert.match(normalizeGarbledMcqOptionMarkers('®) 1 ©) 2'), /\(B\).*\(C\)/s)

const repaired = repairMcqMisreadAsIntegerParse({
  text: cases[0].ocr,
  options: ['', '', '', ''],
  optionsFound: 0,
})
assert.equal(repaired.suggestedQuestionType, 'single_correct')
assert.ok((repaired.optionsFound ?? 0) >= 2, 'recovers options from fraction tail')
assert.doesNotMatch(repaired.text ?? '', /5\/18\s*$/, 'strips option tail from stem')

const parsed = parseSingleQuestionUpload(polishOcrText(cases[1].ocr), cases[1].ocr)
assert.equal(
  inferUploadQuestionType({
    stem: parsed.text,
    options: parsed.options,
    found: parsed.optionsFound,
    rawOcr: cases[1].ocr,
    suggestedQuestionType: parsed.suggestedQuestionType,
  }),
  'single_correct',
  'physics case stays SCQ after parse',
)

console.log('test-mcq-misread-as-integer: ok')
