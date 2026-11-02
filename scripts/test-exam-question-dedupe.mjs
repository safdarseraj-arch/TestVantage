import assert from 'node:assert/strict'
import { dedupeQuestionsForExam } from '../src/utils/testQuestionClone.js'
import { applyExamQuestionOrder } from '../src/utils/examShuffle.js'

const stem =
  'If exactly one root of the quadratic equation lies at infinity then the possible integral value of a is equal to'

const dupes = [
  { id: 'q-1', text: stem, questionType: 'integer' },
  { id: 'q-2', text: stem, questionType: 'integer' },
  { id: 'q-3', text: 'Different question stem about triangles and angles in ABC', questionType: 'single_correct' },
]

const deduped = dedupeQuestionsForExam(dupes)
assert.equal(deduped.length, 2, 'drops same-stem duplicate')
assert.equal(deduped[0].id, 'q-1')
assert.equal(deduped[1].id, 'q-3')

const layout = {
  enabled: true,
  questionIds: ['a', 'a', 'b'],
  optionPerms: {},
}
const ordered = applyExamQuestionOrder(
  [
    { id: 'a', text: 'Question A stem long enough to fingerprint well here' },
    { id: 'b', text: 'Question B stem also long enough for fingerprint test' },
  ],
  layout,
)
assert.equal(ordered.length, 2, 'shuffle layout duplicate ids collapsed')
assert.equal(ordered[0].id, 'a')
assert.equal(ordered[1].id, 'b')

console.log('test-exam-question-dedupe: ok')
