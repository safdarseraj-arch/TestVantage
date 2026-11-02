import assert from 'node:assert/strict'
import { parseSingleQuestionUpload } from '../src/utils/parseSingleQuestionUpload.js'
import { polishOcrText } from '../src/utils/ocrExtractPolish.js'
import { finalizeStemForBank } from '../src/utils/stemBankGuard.js'
import { classifyUploadFromOcr, inferUploadQuestionType } from '../src/utils/classifyUploadFromOcr.js'
import { looksLikePassageMultiMcq } from '../src/utils/parsePassageUpload.js'
import {
  looksLikeAngleBisectorMag36Mcq,
  repairAngleBisectorMag36McqOcr,
  ANGLE_BISECTOR_MAG36_STEM,
} from '../src/utils/repairAngleBisectorMag36McqOcr.js'

const badOcr =
  'If a vector ¥ of magnitude 36 is directed along the bisector of the angle between the vectors $\\vec{a} = 7\\hat{i} - 4\\hat{j} - 4\\hat{k}$ & \\vec{b}=-21-]+2\\hat{k}, then 7 isequal to'

assert.ok(looksLikeAngleBisectorMag36Mcq(badOcr), 'detect bisector SCQ (36 OCR of 3√6)')
assert.equal(looksLikePassageMultiMcq(badOcr), false, 'not a passage')
assert.equal(repairAngleBisectorMag36McqOcr(badOcr), ANGLE_BISECTOR_MAG36_STEM)

const parsed = parseSingleQuestionUpload(polishOcrText(badOcr), badOcr)
assert.match(parsed.text ?? '', /\\vec\{r\}/)
assert.match(parsed.text ?? '', /3\\sqrt\{6\}/, 'restores 3√6 not 36')
assert.doesNotMatch(parsed.text ?? '', /magnitude 36/)
assert.match(parsed.text ?? '', /-2\\hat\{i\}/)
assert.doesNotMatch(parsed.text ?? '', /¥|isequal|then 7 is/i)
assert.equal(parsed.optionsFound, 4)
assert.equal(String(parsed.options[0]).replace(/\s/g, ''), '$\\hat{i}-7\\hat{j}+2\\hat{k}$')
assert.doesNotMatch(String(parsed.options[0]), /2\\sqrt\{6\}/)
assert.equal(parsed.suggestedQuestionType, 'single_correct')

const classified = classifyUploadFromOcr(badOcr)
assert.equal(classified.detectedType, 'single_correct')
assert.ok(!String(classified.detectedType).startsWith('passage'))

assert.equal(
  inferUploadQuestionType({
    stem: parsed.text,
    options: parsed.options,
    found: parsed.optionsFound,
    rawOcr: badOcr,
    suggestedQuestionType: parsed.suggestedQuestionType,
  }),
  'single_correct',
)

assert.equal(finalizeStemForBank(badOcr), ANGLE_BISECTOR_MAG36_STEM)

console.log('test-angle-bisector-mag36-ocr: ok')
