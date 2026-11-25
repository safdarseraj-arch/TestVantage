import assert from 'node:assert/strict'
import {
  buildClockStaminaCurve,
  buildSkipIq,
  buildErrorDnaTypes,
  buildPassTimeline,
  buildDreamCollegeGapTeaser,
  enrichDifficultyWithSitterConversion,
  chooseStaminaBucketSeconds,
  makeClockBuckets,
} from '../src/utils/resultAdvancedAnalytics.js'

assert.equal(chooseStaminaBucketSeconds(180 * 60), 30 * 60)
assert.ok(makeClockBuckets(180 * 60, 30 * 60).length >= 6)

const perQ = [
  { index: 1, questionId: 'q1', subject: 'physics', chapter: 'Kinematics', grade: 'correct', marks: 4, maxMarks: 4, timeSpentSeconds: 40 },
  { index: 2, questionId: 'q2', subject: 'physics', chapter: 'Kinematics', grade: 'wrong', marks: -1, maxMarks: 4, timeSpentSeconds: 20 },
  { index: 3, questionId: 'q3', subject: 'chemistry', chapter: 'GOC', grade: 'unattempted', marks: 0, maxMarks: 4, timeSpentSeconds: 5 },
  { index: 4, questionId: 'q4', subject: 'chemistry', chapter: 'GOC', grade: 'wrong', marks: -1, maxMarks: 4, timeSpentSeconds: 180 },
  { index: 5, questionId: 'q5', subject: 'mathematics', chapter: 'Calculus', grade: 'correct', marks: 4, maxMarks: 4, timeSpentSeconds: 90 },
  { index: 6, questionId: 'q6', subject: 'mathematics', chapter: 'Calculus', grade: 'wrong', marks: 0, maxMarks: 4, timeSpentSeconds: 12 },
]

const questionTimes = Object.fromEntries(perQ.map((p) => [p.questionId, p.timeSpentSeconds]))
const result = {
  score: 6,
  maxScore: 24,
  correct: 2,
  wrong: 3,
  unattempted: 1,
  perQuestion: perQ,
}

const telemetry = {
  firstSeenAt: { q1: 0, q2: 600, q3: 1800, q4: 2400, q5: 5400, q6: 7200 },
  answerAt: { q1: 50, q2: 650, q4: 2600, q5: 5500, q6: 7250 },
  visitCounts: { q1: 1, q2: 1, q3: 2, q4: 1, q5: 1, q6: 3 },
  subjectSwitches: [
    { t: 1800, from: 'physics', to: 'chemistry' },
    { t: 5400, from: 'chemistry', to: 'mathematics' },
  ],
  navEvents: [
    { t: 0, questionId: 'q1', subject: 'physics', action: 'enter', visitN: 1 },
    { t: 1800, questionId: 'q3', subject: 'chemistry', action: 'enter', visitN: 1 },
    { t: 5400, questionId: 'q5', subject: 'mathematics', action: 'enter', visitN: 1 },
  ],
}

const clock = buildClockStaminaCurve({
  result,
  questionTimes,
  sessionTelemetry: telemetry,
  paperDurationSec: 180 * 60,
})
assert.equal(clock.mode, 'clock')
assert.ok(clock.chart.length >= 4)
assert.ok(clock.insight)

const skip = buildSkipIq({
  result,
  questionTimes,
  sessionTelemetry: telemetry,
  paperDurationSec: 180 * 60,
})
assert.equal(skip.skipped, 1)
assert.ok(skip.takeaway)

const dna = buildErrorDnaTypes({
  result,
  questionTimes,
  paperDurationSec: 180 * 60,
  questions: [
    { id: 'q2', difficulty: 'easy' },
    { id: 'q4', difficulty: 'hard', questionType: 'integer' },
    { id: 'q6', difficulty: 'medium' },
  ],
})
assert.ok(dna.chart.length >= 1)
assert.ok(dna.counts.silly + dna.counts.overtime + dna.counts.concept + dna.counts.calc + dna.counts.other === 3)

const dnaTagged = buildErrorDnaTypes({
  result,
  questionTimes,
  paperDurationSec: 180 * 60,
  questions: [
    { id: 'q2', difficulty: 'easy' },
    { id: 'q4', difficulty: 'hard', questionType: 'integer' },
    { id: 'q6', difficulty: 'medium' },
  ],
  wrongReasons: {
    q2: 'guess',
    q4: 'calculation_error',
    q6: 'conceptual_error',
  },
})
assert.equal(dnaTagged.studentTagged, 3)
assert.equal(dnaTagged.counts.guess, 1)
assert.equal(dnaTagged.counts.calculation_error, 1)
assert.equal(dnaTagged.counts.conceptual_error, 1)
assert.ok(dnaTagged.chart.some((c) => c.key === 'guess'))
assert.ok(dnaTagged.items.every((i) => i.studentTag))

const timeline = buildPassTimeline({
  result,
  sessionTelemetry: telemetry,
  examPatternId: 'jee-main',
})
assert.ok(timeline.hasTelemetry)
assert.ok(timeline.switchCount >= 1)
assert.ok(timeline.firstPass.count >= 1)

const dream = buildDreamCollegeGapTeaser({
  result: {
    ...result,
    score: 40,
    maxScore: 100,
    perQuestion: [
      ...perQ,
      ...Array.from({ length: 8 }, (_, i) => ({
        index: 10 + i,
        questionId: `easy-wrong-${i}`,
        subject: 'physics',
        chapter: 'Units',
        grade: 'wrong',
        marks: -1,
        maxMarks: 4,
        timeSpentSeconds: 25,
      })),
    ],
  },
  questionTimes: {
    ...questionTimes,
    ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`easy-wrong-${i}`, 25])),
  },
  paperDurationSec: 180 * 60,
  questions: Array.from({ length: 8 }, (_, i) => ({
    id: `easy-wrong-${i}`,
    difficulty: 'easy',
  })),
  examPatternId: 'jee-main',
  estimatedAIR: 120000,
})
assert.ok(dream)
assert.ok(dream.sillyCount >= 1)
assert.ok(dream.ready === true || dream.ready === false)

const diffRows = [
  { id: 'easy', label: 'Easy', correct: 0, incorrect: 2, unattempted: 0, score: -2, maxScore: 8, accuracy: 0 },
  { id: 'medium', label: 'Medium', correct: 1, incorrect: 1, unattempted: 0, score: 3, maxScore: 8, accuracy: 50 },
  { id: 'hard', label: 'Hard', correct: 1, incorrect: 0, unattempted: 1, score: 4, maxScore: 8, accuracy: 100 },
]
const enriched = enrichDifficultyWithSitterConversion(diffRows, {
  result: {
    perQuestion: [
      { questionId: 'e1', grade: 'wrong', subject: 'physics' },
      { questionId: 'e2', grade: 'correct', subject: 'physics' },
      { questionId: 'e3', grade: 'unattempted', subject: 'physics' },
    ],
  },
  cohortDiffMap: new Map([
    ['e1', 'easy'],
    ['e2', 'easy'],
    ['e3', 'easy'],
  ]),
})
assert.equal(enriched.sitter.total, 3)
assert.equal(enriched.sitter.conversion, 33)
assert.ok(enriched.insightExtra)

// Estimated mode without telemetry still returns buckets
const estimated = buildClockStaminaCurve({
  result,
  questionTimes,
  sessionTelemetry: null,
  paperDurationSec: 180 * 60,
})
assert.equal(estimated.mode, 'estimated')
assert.ok(estimated.chart.length >= 3)

console.log('test-result-advanced-analytics: ok')
