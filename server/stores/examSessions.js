import {
  clearExamSession as clearFile,
  countExamSessions as countFile,
  listExamSessionsForOwner as listFile,
  loadExamSession as loadFile,
  saveExamSession as saveFile,
} from '../examStore.js'
import {
  clearExamSessionRedis,
  countExamSessionsRedis,
  listExamSessionsForOwnerRedis,
  loadExamSessionRedis,
  saveExamSessionRedis,
  useRedis,
} from '../redis/examSessions.js'

/** @type {'redis' | 'file'} */
let backend = 'file'

export function examSessionsBackend() {
  return backend
}

/** @param {'redis' | 'file'} mode */
export function setExamSessionsBackend(mode) {
  backend = mode
}

/**
 * @param {object} snapshot
 */
export async function saveExamSession(snapshot) {
  if (backend === 'redis') return saveExamSessionRedis(snapshot)
  return saveFile(snapshot)
}

/**
 * @param {string} ownerKey
 * @param {string} testId
 */
export async function loadExamSession(ownerKey, testId) {
  if (backend === 'redis') return loadExamSessionRedis(ownerKey, testId)
  return loadFile(ownerKey, testId)
}

/** @param {string} ownerKey @param {string} testId */
export async function clearExamSession(ownerKey, testId) {
  if (backend === 'redis') return clearExamSessionRedis(ownerKey, testId)
  return clearFile(ownerKey, testId)
}

/** @param {string} ownerKey */
export async function listExamSessionsForOwner(ownerKey) {
  if (backend === 'redis') return listExamSessionsForOwnerRedis(ownerKey)
  return listFile(ownerKey)
}

/** @returns {Promise<number>} */
export async function countExamSessions() {
  if (backend === 'redis') return countExamSessionsRedis()
  return countFile()
}

export { useRedis }
