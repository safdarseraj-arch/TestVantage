import assert from 'node:assert/strict'
import { slimQuestionImageFields } from '../src/utils/imageQuestion.js'

const stripped = slimQuestionImageFields({
  id: 'q1',
  text: 'Test',
  questionImage: '   ',
  optionImages: ['', '', '', ''],
})
assert.equal(stripped.questionImage, undefined)
assert.equal(stripped.optionImages, undefined)
assert.equal(stripped.contentMode, undefined)

const compact = slimQuestionImageFields({
  id: 'q2',
  text: 'Graph MCQ',
  optionImages: ['data:image/jpeg;base64,aa', '', '', 'data:image/jpeg;base64,bb'],
})
assert.deepEqual(compact.optionImages, [
  'data:image/jpeg;base64,aa',
  '',
  '',
  'data:image/jpeg;base64,bb',
])
assert.equal(compact.contentMode, 'hybrid')

const hybrid = slimQuestionImageFields({
  id: 'q3',
  text: 'Diagram',
  questionImage: 'data:image/jpeg;base64,abc',
})
assert.equal(hybrid.contentMode, 'hybrid')
assert.equal(hybrid.questionImage, 'data:image/jpeg;base64,abc')

console.log('test-slim-question-images: ok')
