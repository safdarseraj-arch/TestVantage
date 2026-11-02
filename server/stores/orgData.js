import { loadOrgFile, saveOrgFile } from '../orgFileStore.js'
import { loadOrgPg, saveOrgPg, usePostgres } from '../db/orgRepo.js'

/** @type {'postgres' | 'file'} */
let backend = 'file'

export function orgDataBackend() {
  return backend
}

/** @param {'postgres' | 'file'} mode */
export function setOrgDataBackend(mode) {
  backend = mode
}

/** @returns {Promise<{ schools: object[], classes: object[], assignments: object[], users: object[], updatedAt: number }>} */
export async function loadOrgData() {
  if (backend === 'postgres') return loadOrgPg()
  return loadOrgFile()
}

/**
 * @param {{ schools?: object[], classes?: object[], assignments?: object[], users?: object[] }} payload
 */
export async function saveOrgData(payload) {
  if (backend === 'postgres') return saveOrgPg(payload)
  return saveOrgFile(payload)
}

export { usePostgres }
