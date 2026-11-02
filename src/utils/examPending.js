import { isAnswerAttempted } from './answers.js'

/**
 * Questions still needing attention: marked for review or not answered.
 * Marked questions are listed first, then unanswered, in paper order.
 *
 * @param {import('../data/tests').Question[]} questions
 * @param {Record<string, unknown>} answers
 * @param {Set<string>} marked
 * @param {number} [excludeIndex] — skip this palette index (e.g. current question)
 */
export function getOrderedPendingIndices(questions, answers, marked, excludeIndex = -1) {
  const markedIdx = []
  const unansweredIdx = []

  questions.forEach((q, i) => {
    if (i === excludeIndex) return
    if (marked.has(q.id)) {
      markedIdx.push(i)
      return
    }
    if (!isAnswerAttempted(answers[q.id], q)) {
      unansweredIdx.push(i)
    }
  })

  return [...markedIdx, ...unansweredIdx]
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {Record<string, unknown>} answers
 * @param {Set<string>} marked
 * @param {number} [excludeIndex]
 */
export function countPendingQuestions(questions, answers, marked, excludeIndex = -1) {
  return getOrderedPendingIndices(questions, answers, marked, excludeIndex).length
}
