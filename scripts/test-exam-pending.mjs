import assert from 'node:assert/strict'
import { getOrderedPendingIndices, countPendingQuestions } from '../src/utils/examPending.js'

const questions = [
  { id: 'q1', questionType: 'single_correct' },
  { id: 'q2', questionType: 'integer' },
  { id: 'q3', questionType: 'single_correct' },
]

const answers = { q1: 0, q2: null, q3: 1 }
const marked = new Set(['q3'])

assert.deepEqual(getOrderedPendingIndices(questions, answers, marked), [2, 1])
assert.equal(countPendingQuestions(questions, answers, marked), 2)
assert.deepEqual(getOrderedPendingIndices(questions, answers, marked, 2), [1])

console.log('test-exam-pending: ok')
