import { compressQuestionImages, estimateDataUrlBytes } from './imageQuestion.js'
import { loadQuestionBank, saveQuestionBank } from './questionBank.js'

const IMAGE_SLIM_VERSION = '60'

/**
 * Re-compress stored question images to use less browser storage.
 * Safe to run multiple times — only saves when total size shrinks.
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ count: number, savedBytes: number, skipped?: boolean }>}
 */
export async function slimStoredBankImages({ force = false } = {}) {
  if (typeof window === 'undefined') return { count: 0, savedBytes: 0 }

  if (!force && localStorage.getItem('testvantage-bank-image-slim') === IMAGE_SLIM_VERSION) {
    return { count: 0, savedBytes: 0, skipped: true }
  }

  const bank = loadQuestionBank()
  if (!bank.questions.length) {
    localStorage.setItem('testvantage-bank-image-slim', IMAGE_SLIM_VERSION)
    return { count: 0, savedBytes: 0 }
  }

  const beforeBytes = bank.questions.reduce((sum, q) => sum + JSON.stringify(q).length, 0)

  const nextQuestions = []
  for (const q of bank.questions) {
    nextQuestions.push(await compressQuestionImages(q))
  }

  const afterBytes = nextQuestions.reduce((sum, q) => sum + JSON.stringify(q).length, 0)
  const savedBytes = Math.max(0, beforeBytes - afterBytes)

  if (savedBytes > 0 || force) {
    saveQuestionBank({ ...bank, questions: nextQuestions })
  }

  localStorage.setItem('testvantage-bank-image-slim', IMAGE_SLIM_VERSION)
  return { count: nextQuestions.length, savedBytes }
}

/** @param {import('../data/tests').Question[]} questions */
export function estimateQuestionsImageBytes(questions) {
  let total = 0
  for (const q of questions ?? []) {
    for (const key of ['questionImage', 'passageImage', 'optionsImage', 'solutionImage']) {
      total += estimateDataUrlBytes(q[key])
    }
    for (const img of q.optionImages ?? []) total += estimateDataUrlBytes(img)
  }
  return total
}
