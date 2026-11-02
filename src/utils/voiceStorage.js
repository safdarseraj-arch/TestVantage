const DB_NAME = 'testvantage-voice-db'
const DB_VERSION = 1
const STORE = 'clips'

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('Could not open voice storage'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
  })
}

/**
 * @param {Blob} blob
 * @param {{ durationMs?: number }} meta
 */
export async function saveVoiceClip(blob, meta = {}) {
  const id = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve(id)
    tx.onerror = () => reject(tx.error ?? new Error('Voice save failed'))
    tx.objectStore(STORE).put({
      id,
      blob,
      mimeType: blob.type || 'audio/webm',
      durationMs: meta.durationMs ?? 0,
      createdAt: Date.now(),
    })
  })
}

/** @param {string} id @returns {Promise<{ blob: Blob, mimeType: string, durationMs: number } | null>} */
export async function getVoiceClip(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => {
      const row = req.result
      if (!row?.blob) resolve(null)
      else resolve({ blob: row.blob, mimeType: row.mimeType, durationMs: row.durationMs ?? 0 })
    }
    req.onerror = () => reject(req.error ?? new Error('Voice load failed'))
  })
}

/** @param {string} id */
export async function deleteVoiceClip(id) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE).delete(id)
  })
}

/** @param {Blob} blob */
export function createVoicePlaybackUrl(blob) {
  return URL.createObjectURL(blob)
}
