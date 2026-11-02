import { countAttempts as countFile, listAttemptRecords, saveAttemptRecord as saveFile } from '../examStore.js'
import { countAttemptsPg, listAttemptsPg, saveAttemptPg, usePostgres } from '../db/attemptRepo.js'

/** @type {'postgres' | 'file'} */
let backend = 'file'

export function attemptsBackend() {
  return backend
}

/** @param {'postgres' | 'file'} mode */
export function setAttemptsBackend(mode) {
  backend = mode
}

/**
 * @param {object} attempt
 */
export async function saveAttemptRecord(attempt) {
  if (backend === 'postgres') return saveAttemptPg(attempt)
  return saveFile(attempt)
}

/** @returns {Promise<number>} */
export async function countAttempts() {
  if (backend === 'postgres') return countAttemptsPg()
  return countFile()
}

/**
 * @param {{ ownerKeys?: string[], limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function listAttempts(opts = {}) {
  if (backend === 'postgres') return listAttemptsPg(opts)
  return listAttemptRecords(opts)
}

export { usePostgres }
