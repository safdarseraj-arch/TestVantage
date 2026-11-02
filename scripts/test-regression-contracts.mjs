import assert from 'node:assert/strict'
import { CANONICAL_QUESTION_TYPE_IDS } from '../src/data/questionTypes.js'
import {
  getAllowedQuestionTypeIdsForExams } from '../src/data/examPatterns.js'
import {
  assertExamAllowsQuestionType,
  assertFigureImageStorageContract,
  assertPassageSetStorageConsistent,
  PASSAGE_REGRESSION_FIXTURES } from '../src/utils/uploadRegressionContracts.js'
import { trimPassageBodyText } from '../src/utils/passage.js'

assert.equal(CANONICAL_QUESTION_TYPE_IDS.length, 8)

const jm = getAllowedQuestionTypeIdsForExams(['jee-main'])
assert.equal(jm?.length, 2)
assert.ok(jm.includes('single_correct') && jm.includes('integer'))
assert.ok(!jm.includes('passage_scq'))

const neet = getAllowedQuestionTypeIdsForExams(['neet'])
assert.equal(neet?.length, 3)
assert.ok(neet.includes('passage_scq'))
assert.ok(!neet.includes('passage_integer'))

const adv = getAllowedQuestionTypeIdsForExams(['jee-advanced'])
assert.equal(adv?.length, 8)

assert.doesNotThrow(() => assertExamAllowsQuestionType(['jee-main'], 'passage_integer'))
assert.doesNotThrow(() => assertExamAllowsQuestionType(['neet'], 'passage_scq'))

const tower =
  'A ball is thrown from the top of 36 m high tower with velocity 5 m/s at an angle 37° above the horizontal as shown.'
assert.doesNotThrow(() =>
  assertFigureImageStorageContract({
    text: tower,
    questionImage: 'data:image/jpeg;base64,crop',
    stemImageCrop: true,
    stemTextInImage: false }),
)

const vdwTrim = trimPassageBodyText(PASSAGE_REGRESSION_FIXTURES.vanDerWaalsOneLine.passageText)
assert.ok(
  !PASSAGE_REGRESSION_FIXTURES.vanDerWaalsOneLine.mustNotMatchInTrimmedPassage.test(vdwTrim),
  'Van der Waals one-line: passage trim must drop inline sub-stems',
)

assertPassageSetStorageConsistent([
  {
    id: 'p',
    passageText: 'Passage only.',
    questionType: 'passage_scq',
    text: 'Q1',
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0 },
  {
    id: 'c2',
    passageId: 'p',
    questionType: 'passage_scq',
    text: 'Q2',
    options: ['1', '2', '3', '4'],
    correctIndex: 1 },
])

console.log('test-regression-contracts: ok')
