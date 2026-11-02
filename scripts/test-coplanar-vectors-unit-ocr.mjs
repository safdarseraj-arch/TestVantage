import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { inferUploadQuestionType, isMcqLikeFromOcr } from '../src/utils/classifyUploadFromOcr.js'
import { looksLikeIntegerValueQuestion } from '../src/utils/stemDiagramDetect.js'
import {
  looksLikeCoplanarVectorsUnitMcq,
  repairCoplanarVectorsUnitMcqParse,
  COPLANAR_VECTORS_UNIT_STEM,
} from '../src/utils/repairCoplanarVectorsUnitMcqOcr.js'

const badOcr = `Vectors a, b and ¢ are coplanar vectors such that [3 = 2g =3 & 37H = 1°.
A unit vector 4 is perpendicular to all of them. If (3x b)x (Ex d)= - 3 rx ,
then ci] n le] + ck] is equal to -
5 5 5 5 @ 3 ®) 3 © 15 ©) 15`

assert.ok(looksLikeCoplanarVectorsUnitMcq(badOcr), 'detect coplanar vectors SCQ')
assert.equal(
  looksLikeIntegerValueQuestion(badOcr.split(/\n/)[0] + ' is equal to -', []),
  false,
  'is equal to - is not IVQ',
)
assert.ok(isMcqLikeFromOcr({ stem: badOcr, rawOcr: badOcr }), 'OCR looks like MCQ not IVQ')
assert.equal(
  inferUploadQuestionType({ stem: badOcr, options: [], found: 0, rawOcr: badOcr }),
  'single_correct',
  'type must be SCQ not integer',
)

const parsed = parseSingleQuestionUpload(polishOcrText(badOcr), badOcr)
assert.match(parsed.text ?? '', /coplanar/i, 'stem keeps coplanar')
assert.match(parsed.text ?? '', /\\vec\{a\}/, 'stem restores vectors')
assert.match(parsed.text ?? '', /\\hat\{i\}/, 'stem restores unit hats')
assert.equal(parsed.optionsFound, 4, 'four options')
assert.match(parsed.options[0] ?? '', /5.*3|\\dfrac\{5\}\{3\}/, 'option A 5/3')
assert.match(parsed.options[3] ?? '', /5.*18|\\dfrac\{5\}\{18\}/, 'option D 5/18')

const forced = repairCoplanarVectorsUnitMcqParse({
  text: badOcr,
  options: ['', '', '', ''],
  optionsFound: 0,
})
assert.equal(forced.text, COPLANAR_VECTORS_UNIT_STEM)
assert.equal(forced.suggestedQuestionType, 'single_correct')

console.log('test-coplanar-vectors-unit-ocr: ok')
