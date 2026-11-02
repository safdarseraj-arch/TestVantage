import { loadTestsFile, saveTestsFile } from '../testsFileStore.js'

/** @returns {Promise<{ tests: object[], updatedAt: number }>} */
export async function loadCustomTestsData() {
  return loadTestsFile()
}

/**
 * @param {{ tests?: object[] }} payload
 */
export async function saveCustomTestsData(payload) {
  return saveTestsFile(payload)
}
