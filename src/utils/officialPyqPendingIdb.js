/**
 * Durable IndexedDB mirror for Official PYQ pending papers.
 * localStorage alone hits the ~5–10MB origin quota once OCR + questions are
 * tripled (fat root + session backup + per-paper item keys). IndexedDB holds
 * full paper bodies so uploads survive after LS quota failures.
 */

const DB_NAME = 'testvantage-official-pyq-db'
const DB_VERSION = 1
const PAPER_STORE = 'papers'
const META_STORE = 'meta'
const META_ID = 'root'

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
      if (!db.objectStoreNames.contains(PAPER_STORE)) {
        db.createObjectStore(PAPER_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

/**
 * @param {object[]} papers
 * @param {number} [updatedAt]
 * @returns {Promise<boolean>}
 */
export async function writeOfficialPyqPapersToIdb(papers, updatedAt = Date.now()) {
  const list = Array.isArray(papers) ? papers.filter((p) => p && p.id) : []
  try {
    const db = await openDb()
    await new Promise((resolve, reject) => {
      const tx = db.transaction([PAPER_STORE, META_STORE], 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'))
      const paperStore = tx.objectStore(PAPER_STORE)
      for (const paper of list) {
        paperStore.put({
          id: String(paper.id),
          paper,
          updatedAt: Number(paper.importedAt) || updatedAt,
          bytes: 0,
        })
      }
      tx.objectStore(META_STORE).put({
        id: META_ID,
        paperIds: list.map((p) => String(p.id)),
        updatedAt,
        count: list.length,
      })
    })
    db.close()
    return true
  } catch {
    return false
  }
}

/**
 * @returns {Promise<{ papers: object[], updatedAt: number } | null>}
 */
export async function readOfficialPyqPapersFromIdb() {
  try {
    const db = await openDb()
    const meta = await new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly')
      const req = tx.objectStore(META_STORE).get(META_ID)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB meta read failed'))
    })
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(PAPER_STORE, 'readonly')
      const req = tx.objectStore(PAPER_STORE).getAll()
      req.onsuccess = () => resolve(req.result ?? [])
      req.onerror = () => reject(req.error ?? new Error('IndexedDB papers read failed'))
    })
    db.close()
    const papers = (Array.isArray(rows) ? rows : [])
      .map((row) => row?.paper)
      .filter((p) => p && p.id && Array.isArray(p.questions))
    if (!papers.length) return null
    return {
      papers,
      updatedAt: Number(meta?.updatedAt) || Date.now(),
    }
  } catch {
    return null
  }
}

/**
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function readOfficialPyqPaperFromIdb(id) {
  const key = String(id ?? '').trim()
  if (!key) return null
  try {
    const db = await openDb()
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(PAPER_STORE, 'readonly')
      const req = tx.objectStore(PAPER_STORE).get(key)
      req.onsuccess = () => resolve(req.result ?? null)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB paper read failed'))
    })
    db.close()
    return row?.paper && row.paper.id ? row.paper : null
  } catch {
    return null
  }
}
