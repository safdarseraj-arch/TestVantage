/**
 * Chunked bulk bank writes — safe for large imports (thousands+ rows).
 */

import { addBulkUploadedQuestions } from './questionBank.js'
import { chunkArray } from './uploadOrchestrator.js'

/**
 * @param {Omit<import('../data/tests').Question, 'id'>[]} items
 * @param {{ chunkSize?: number }} [opts]
 */
export function addBulkUploadedQuestionsChunked(items, opts = {}) {
  const chunks = chunkArray(items, opts.chunkSize ?? 50)
  /** @type {import('../data/tests').Question[]} */
  const allAdded = []
  for (const chunk of chunks) {
    allAdded.push(...addBulkUploadedQuestions(chunk))
  }
  return allAdded
}
