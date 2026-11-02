import {
  bulkUpsertQuestions as bulkFile,
  loadBankFile,
  upsertQuestion as upsertFile,
} from '../bankStore.js'
import {
  bulkUpsertQuestionsPg,
  countQuestionsPg,
  loadQuestionsPg,
  upsertQuestionPg,
  usePostgres,
} from '../db/questionRepo.js'

/** @type {'postgres' | 'file'} */
let backend = 'file'

export function questionsBackend() {
  return backend
}

/** @param {'postgres' | 'file'} mode */
export function setQuestionsBackend(mode) {
  backend = mode
}

/** @returns {Promise<{ questions: object[], updatedAt: number }>} */
export async function loadQuestions() {
  if (backend === 'postgres') return loadQuestionsPg()
  return loadBankFile()
}

/**
 * @param {object} question
 */
export async function upsertQuestion(question) {
  if (backend === 'postgres') return upsertQuestionPg(question)
  return upsertFile(question)
}

/**
 * @param {object[]} questions
 */
export async function bulkUpsertQuestions(questions) {
  if (backend === 'postgres') return bulkUpsertQuestionsPg(questions)
  return bulkFile(questions)
}

/** @returns {Promise<number>} */
export async function countQuestions() {
  if (backend === 'postgres') return countQuestionsPg()
  return loadBankFile().questions.length
}

export { usePostgres }
