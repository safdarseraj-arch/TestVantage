import { getExamPattern, getPatternTotalQuestions } from '../data/examPatterns.js'
import { getTestPattern } from './patternResolver.js'
import { getTestType } from '../data/testTypes.js'
import { computeSpeedTestDurationMinutes } from './speedTest.js'
import { computeCdfTestDurationMinutes } from './cdfTest.js'
import { computeCalibratedDurationMinutes } from './calibratedPaperPlan.js'

/**
 * Real-exam timing: full exam minutes × (your questions ÷ full pattern questions).
 * @param {string} examPatternId
 * @param {number} questionCount
 * @param {string} [paperPatternId]
 * @param {number} [minMinutes]
 */
export function computeExamProportionalDuration(
  examPatternId,
  questionCount,
  paperPatternId,
  minMinutes = 10,
) {
  const pattern = paperPatternId
    ? getTestPattern({ examPatternId, paperPatternId })
    : getExamPattern(examPatternId)
  const n = Math.max(1, questionCount)
  const fullQ = Math.max(1, getPatternTotalQuestions(pattern))
  const ratio = Math.min(1, n / fullQ)
  return Math.max(minMinutes, Math.round(pattern.totalMinutes * ratio))
}

/**
 * Real-Time Calibrated Paper: 60 min per selected subject (capped at full exam time).
 * @param {number} subjectCount
 * @param {string} [examPatternId]
 */
export { computeCalibratedDurationMinutes } from './calibratedPaperPlan.js'

/**
 * @param {string} examPatternId
 * @param {string} testTypeId
 * @param {number} questionCount
 * @param {string} [paperPatternId]
 * @param {import('../data/tests').Question[]} [questions] — used for speed tests (subject-wise timing)
 */
export function computeTestDuration(
  examPatternId,
  testTypeId,
  questionCount,
  paperPatternId,
  questions,
) {
  const type = getTestType(testTypeId)
  const n = Math.max(1, questionCount)

  if (type.id === 'speed') {
    if (questions?.length) {
      return computeSpeedTestDurationMinutes(questions)
    }
    return Math.max(8, Math.round(n * type.minutesPerQuestion))
  }
  if (type.id === 'cdf') {
    if (questions?.length) {
      return computeCdfTestDurationMinutes(questions)
    }
    return Math.max(8, Math.round(n * type.minutesPerQuestion))
  }
  if (type.id === 'practice') {
    return Math.max(10, Math.round(n * type.minutesPerQuestion))
  }

  if (type.id === 'calibrated') {
    return computeCalibratedDurationMinutes(3, examPatternId)
  }
  const min = 10
  return computeExamProportionalDuration(examPatternId, n, paperPatternId, min)
}

