/**
 * Rough-sheet notes / images tagged to an attempt.
 * Storage hook only — AI forensics is labelled coming/partial (no fake analysis).
 */

const STORE_KEY = 'testvantage-rough-sheets'

function loadAll() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) : { byAttempt: {} }
  } catch {
    return { byAttempt: {} }
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data))
  } catch (err) {
    console.warn('Rough sheet save failed (storage full?)', err)
  }
}

/**
 * @param {string} attemptId
 * @returns {{ attemptId: string, note: string, imageDataUrl: string | null, fileName: string | null, updatedAt: number, aiStatus: 'coming' } | null}
 */
export function getRoughSheet(attemptId) {
  if (!attemptId) return null
  const all = loadAll()
  return all.byAttempt[attemptId] ?? null
}

/**
 * @param {string} attemptId
 * @param {{ note?: string, imageDataUrl?: string | null, fileName?: string | null }} patch
 */
export function saveRoughSheet(attemptId, patch = {}) {
  if (!attemptId) return null
  const all = loadAll()
  const prev = all.byAttempt[attemptId] ?? {
    attemptId,
    note: '',
    imageDataUrl: null,
    fileName: null,
    updatedAt: 0,
    aiStatus: 'coming',
  }
  const next = {
    ...prev,
    note: patch.note != null ? String(patch.note).slice(0, 4000) : prev.note,
    imageDataUrl:
      patch.imageDataUrl !== undefined ? patch.imageDataUrl : prev.imageDataUrl,
    fileName: patch.fileName !== undefined ? patch.fileName : prev.fileName,
    updatedAt: Date.now(),
    aiStatus: 'coming',
  }
  all.byAttempt[attemptId] = next
  // Cap entries
  const ids = Object.keys(all.byAttempt)
  if (ids.length > 40) {
    const sorted = ids
      .map((id) => ({ id, t: all.byAttempt[id].updatedAt || 0 }))
      .sort((a, b) => a.t - b.t)
    for (const row of sorted.slice(0, ids.length - 40)) {
      delete all.byAttempt[row.id]
    }
  }
  saveAll(all)
  return next
}

/**
 * Read a File as a data URL (images only; max ~1.5MB recommended).
 * @param {File} file
 * @returns {Promise<{ dataUrl: string, fileName: string }>}
 */
export function readRoughSheetImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) {
      reject(new Error('Please choose an image (photo of your rough sheet).'))
      return
    }
    if (file.size > 1.8 * 1024 * 1024) {
      reject(new Error('Image is too large — keep under about 1.5 MB.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      resolve({ dataUrl: String(reader.result || ''), fileName: file.name || 'rough-sheet' })
    }
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.readAsDataURL(file)
  })
}

export function clearRoughSheet(attemptId) {
  if (!attemptId) return
  const all = loadAll()
  delete all.byAttempt[attemptId]
  saveAll(all)
}
