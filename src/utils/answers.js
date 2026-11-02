import { getMatrixResponseMode, isMatrixAnswerAttempted } from './matrixMatch.js'

/** @typedef {import('../data/tests').Question} Question */

/**
 * @typedef {number | null} SingleAnswer
 * @typedef {number[] | null} MultiAnswer
 * @typedef {Record<number, number> | null} MatrixAnswer
 * @typedef {string | number | null} NumericAnswer
 */

/**
 * @param {Question} q
 */
export function createEmptyAnswer(q) {
  const type = q.questionType ?? 'single_correct'
  switch (type) {
    case 'multiple_correct':
      return []
    case 'matrix_match':
      return getMatrixResponseMode(q) === 'options' ? null : {}
    default:
      return null
  }
}

/** @param {Question[]} questions */
export function buildInitialAnswers(questions) {
  return Object.fromEntries(questions.map((q) => [q.id, createEmptyAnswer(q)]))
}

/** @param {unknown} answer @param {Question} q */
export function isAnswerAttempted(answer, q) {
  const type = q.questionType ?? 'single_correct'
  if (answer === null || answer === undefined) return false
  switch (type) {
    case 'multiple_correct':
      return Array.isArray(answer) && answer.length > 0
    case 'matrix_match':
      return isMatrixAnswerAttempted(answer, q)
    case 'integer':
    case 'numerical':
    case 'passage_integer':
      return String(answer).trim() !== ''
    default:
      return answer !== null && answer !== undefined
  }
}
