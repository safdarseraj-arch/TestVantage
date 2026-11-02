import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { assessUploadQuality, classifyUploadFromOcr, inferUploadQuestionType } from '../src/utils/classifyUploadFromOcr.js'
import { assessUploadQualityFull } from '../src/utils/uploadErrorBrain.js'
import { cleanStemMergedOptionGarbage } from '../src/utils/optionStemLeak.js'
import {
  looksLikeLineUnitDistanceMcq,
  repairLineUnitDistanceMcqOcr,
  LINE_UNIT_DISTANCE_STEM,
  LINE_UNIT_DISTANCE_OPTIONS,
} from '../src/utils/repairLineUnitDistanceMcqOcr.js'

const badOcr =
  'A line passes through two points A and B whose position vectors are $\\hat{i} + \\hat{j} - 2\\hat{k}$ and $\\hat{i} - 3\\hat{j} + \\hat{k}$ respectively. The position vector of a point on it at a unit distance from the point A is - 1,2,» (C) 1, (C) 1,» (C) 1,.- HI ©'

assert.ok(looksLikeLineUnitDistanceMcq(badOcr), 'detect line AB unit-distance MCQ')
assert.equal(repairLineUnitDistanceMcqOcr(badOcr), LINE_UNIT_DISTANCE_STEM)
assert.doesNotMatch(cleanStemMergedOptionGarbage(badOcr), /»|\(C\)|HI\s*©/)

const parsed = parseSingleQuestionUpload(polishOcrText(badOcr), badOcr)
assert.equal(parsed.text, LINE_UNIT_DISTANCE_STEM)
assert.equal(parsed.optionsFound, 4)
assert.equal(parsed.options[0], LINE_UNIT_DISTANCE_OPTIONS[0])
assert.equal(parsed.options[3], LINE_UNIT_DISTANCE_OPTIONS[3])
assert.ok(
  parsed.suggestedQuestionType === 'multiple_correct' || parsed.suggestedQuestionType === 'single_correct',
)

const classified = classifyUploadFromOcr(badOcr)
assert.ok(
  classified.detectedType === 'single_correct' || classified.detectedType === 'multiple_correct',
  'MCQ type not integer/passage',
)

assert.equal(finalizeStemForBank(badOcr), LINE_UNIT_DISTANCE_STEM)

const quality = assessUploadQualityFull({
  detectedType: 'multiple_correct',
  questionType: 'multiple_correct',
  stem: parsed.text,
  options: parsed.options,
  rawOcr: badOcr,
})
assert.equal(quality.readyToSave, true, 'line AB unit-distance ready to save')
assert.equal(
  (quality.issues ?? []).filter((i) => i.severity === 'error').length,
  0,
  'no blocking errors after repair',
)

// Stem leak alone must not block a filled 4-option SCQ
const leakStem =
  'The position vector of a point on it at a unit distance from the point A is - 1,2,» (C) 1, (C) 1,» (C) 1,.- HI ©'
const opts = LINE_UNIT_DISTANCE_OPTIONS
const leakQuality = assessUploadQuality({
  detectedType: 'single_correct',
  stem: cleanStemMergedOptionGarbage(leakStem),
  options: opts,
  rawOcr: leakStem,
})
assert.ok(leakQuality.readyToSave, 'cleaned stem + 4 options ready')
assert.equal(
  inferUploadQuestionType({
    stem: LINE_UNIT_DISTANCE_STEM,
    options: opts,
    found: 4,
    rawOcr: badOcr,
    suggestedQuestionType: 'multiple_correct',
  }),
  'multiple_correct',
)

console.log('test-line-unit-distance-ocr: ok')
