import assert from 'node:assert/strict'
import {
  buildResultCoachInsights,
  compareWithPreviousAttempt,
  computePerformanceGrade,
  findPreviousAttempt,
} from '../src/utils/resultInsights.js'

assert.deepEqual(computePerformanceGrade(90, 100), {
  grade: 'A+',
  label: 'Outstanding',
  color: '#059669',
})

assert.equal(computePerformanceGrade(50, 100).grade, 'C')

const cmp = compareWithPreviousAttempt(
  { testId: 't1', result: { score: 80, maxScore: 100, accuracy: 70 } },
  { testId: 't1', title: 'Old', score: 60, maxScore: 100, accuracy: 55 },
)
assert.ok(cmp?.improved)
assert.equal(cmp?.scoreDelta, 20)

const attempts = [
  { id: 'a1', testId: 't1', score: 80, maxScore: 100, submittedAt: Date.now(), accuracy: 70 },
  { id: 'a2', testId: 't1', score: 60, maxScore: 100, submittedAt: Date.now() - 86400000, accuracy: 55 },
]
assert.equal(findPreviousAttempt(attempts, 't1', 'a1')?.id, 'a2')

const coach = buildResultCoachInsights(
  {
    result: {
      score: 40,
      maxScore: 100,
      correct: 8,
      wrong: 12,
      unattempted: 5,
      accuracy: 40,
      bySubject: {
        physics: { score: 10, maxScore: 40, correct: 2, wrong: 6, unattempted: 2 },
      },
      byChapter: {},
    },
  },
  { examPatternId: 'jee-main' },
)
assert.ok(coach.summary)
assert.ok(coach.actions.length >= 2)

const { buildTimeSinks, buildStaminaInsight, buildDifficultyInsight } = await import(
  '../src/utils/testAnalysis.js'
)

const sinks = buildTimeSinks({
  result: {
    perQuestion: [
      { index: 1, questionId: 'q1', grade: 'wrong', timeSpentSeconds: 120, chapter: 'Kinematics' },
      { index: 2, questionId: 'q2', grade: 'correct', timeSpentSeconds: 20, chapter: 'Optics' },
      { index: 3, questionId: 'q3', grade: 'wrong', timeSpentSeconds: 15, chapter: 'Kinematics' },
    ],
  },
  avgSeconds: 40,
})
assert.ok(sinks.sinks.some((s) => s.questionId === 'q1'))
assert.ok(!sinks.sinks.some((s) => s.questionId === 'q2'))
assert.ok(buildStaminaInsight([{ id: 'q1', label: 'Quarter 1', correct: 8, total: 10 }]))
assert.ok(buildDifficultyInsight([{ id: 'easy', accuracy: 40, correct: 2, incorrect: 4 }]))

console.log('test-result-insights: ok')
