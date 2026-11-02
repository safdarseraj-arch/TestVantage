import assert from 'node:assert/strict'
import {
  buildTestFromAttempt,
  questionsFromPerQuestion,
  resolveTestForResult,
} from '../src/utils/resolveTestForResult.js'

const attempt = {
  id: 'att-1',
  testId: 'smock-gone',
  title: 'AI Mock — Physics',
  examPatternId: 'jee-main',
  testTypeId: 'full',
  resultSnapshot: {
    title: 'AI Mock — Physics',
    result: {
      score: 40,
      maxScore: 100,
      accuracy: 50,
      correct: 10,
      wrong: 5,
      partial: 0,
      unattempted: 5,
      perQuestion: [
        {
          questionId: 'q1',
          index: 1,
          subject: 'physics',
          questionType: 'single_correct',
          chapter: 'Mechanics',
          text: 'Sample question?',
          grade: 'correct',
          marks: 4,
          maxMarks: 4,
          userAnswerLabel: 'A',
          correctAnswerLabel: 'A',
        },
      ],
    },
  },
}

const data = {
  testId: 'smock-gone',
  title: 'AI Mock — Physics',
  examPatternId: 'jee-main',
  testTypeId: 'full',
  result: attempt.resultSnapshot.result,
}

const rebuilt = buildTestFromAttempt('smock-gone', attempt, data)
assert.ok(rebuilt, 'should rebuild test when session paper is missing')
assert.equal(rebuilt.id, 'smock-gone')
assert.equal(rebuilt.title, 'AI Mock — Physics')
assert.equal(rebuilt.questions.length, 1)
assert.equal(rebuilt.questions[0].id, 'q1')

assert.equal(resolveTestForResult('smock-gone', attempt, data, null)?.id, 'smock-gone')
assert.equal(resolveTestForResult('x', attempt, data, { id: 'x', title: 'Live' }).title, 'Live')

const fromPerQ = questionsFromPerQuestion(attempt.resultSnapshot.result.perQuestion)
assert.equal(fromPerQ[0].chapter, 'Mechanics')

console.log('test-resolve-test-for-result: ok')
