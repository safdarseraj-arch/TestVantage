import { effectiveQuestionTypeId } from './bankListFilters.js'

/** @param {import('../data/tests').Question} q */
export function isCdfOnlyQuestion(q) {
  return effectiveQuestionTypeId(q) === 'true_false'
}

/**
 * T/F questions are reserved for Concept Definition and Formula tests.
 * @param {import('../data/tests').Question[]} questions
 */
export function filterQuestionsForNonCdfUse(questions) {
  return (questions ?? []).filter((q) => !isCdfOnlyQuestion(q))
}

/** @param {import('../data/tests').Test} test */
export function stripCdfOnlyQuestionsFromNonCdfTest(test) {
  if (!test || test.id?.startsWith('cdf-') || test.testTypeId === 'cdf') return test
  const questions = filterQuestionsForNonCdfUse(test.questions ?? [])
  if (questions.length === (test.questions ?? []).length) return test
  return {
    ...test,
    questions,
    totalQuestions: questions.length,
  }
}
