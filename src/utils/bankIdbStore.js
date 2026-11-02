/**
 * Durable IndexedDB mirror of the question bank.
 * Survives localStorage clears / quota failures better than LS alone.
 */

const DB_NAME = 'testvantage-bank-db'
const DB_VERSION = 1
const STORE = 'bank'
const ROW_ID = 'main'

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

/**
 * @param {string} json
 * @returns {Promise<void>}
 */
export async function writeBankJsonToIdb(json) {
  if (!json || typeof json !== 'string' || json.length < 20) return
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
      tx.objectStore(STORE).put({
        id: ROW_ID,
        json,
        updatedAt: Date.now(),
        bytes: json.length,
      })
    })
    db.close()
  } catch {
    /* optional durability layer */
  }
}

/**
 * @returns {Promise<string | null>}
 */
export async function readBankJsonFromIdb() {
  try {
    const db = await openDb()
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(ROW_ID)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'))
    })
    db.close()
    const json = row?.json
    return typeof json === 'string' && json.length > 20 ? json : null
  } catch {
    return null
  }
}

/**
 * Restore localStorage bank from IndexedDB when LS is empty / unreadable.
 * @returns {Promise<{ recovered: boolean, count: number }>}
 */
export async function restoreBankFromIdbIfNeeded() {
  if (typeof window === 'undefined') return { recovered: false, count: 0 }
  try {
    const { peekUploadedQuestions, saveQuestionBank } = await import('./questionBank.js')
    const { parseStoredBankJson } = await import('./bankParse.js')
    if (peekUploadedQuestions().length > 0) {
      return { recovered: false, count: peekUploadedQuestions().length }
    }
    const json = await readBankJsonFromIdb()
    if (!json) return { recovered: false, count: 0 }
    const parsed = parseStoredBankJson(json)
    if (!parsed?.questions?.length) return { recovered: false, count: 0 }
    saveQuestionBank({
      settings: parsed.settings ?? {},
      questions: parsed.questions,
    })
    return { recovered: true, count: parsed.questions.length }
  } catch {
    return { recovered: false, count: 0 }
  }
}
