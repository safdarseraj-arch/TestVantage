/**
 * Competitive / remedial batches — dual-track with class/section (SMS Phase-1).
 * A student can sit in Class 11-A and also JEE Integrated Batch 1.
 */

const STORAGE_KEY = 'testvantage-school-batches'

export const BATCH_TRACK_TYPES = Object.freeze([
  { id: 'jee', label: 'JEE' },
  { id: 'neet', label: 'NEET' },
  { id: 'olympiad', label: 'Olympiad' },
  { id: 'foundation', label: 'Foundation' },
  { id: 'remedial', label: 'Remedial' },
])

const TRACK_IDS = new Set(BATCH_TRACK_TYPES.map((t) => t.id))

/**
 * @typedef {{
 *   id: string
 *   schoolId: string
 *   name: string
 *   trackType: string
 *   teacherIds: string[]
 *   studentIds: string[]
 *   createdAt: number
 * }} SchoolBatch
 */

/** @returns {SchoolBatch[]} */
export function loadBatches() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data.batches) ? data.batches.map(normalizeBatch) : []
  } catch {
    return []
  }
}

/** @param {SchoolBatch[]} batches */
function saveBatches(batches) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ batches }))
  import('./orgServerSync.js')
    .then((m) => m.notifyOrgChanged())
    .catch(() => {})
}

/** @param {object} row @returns {SchoolBatch} */
function normalizeBatch(row) {
  return {
    id: String(row.id || ''),
    schoolId: String(row.schoolId || ''),
    name: String(row.name || '').trim(),
    trackType: TRACK_IDS.has(row.trackType) ? row.trackType : 'jee',
    teacherIds: Array.isArray(row.teacherIds) ? row.teacherIds.map(String) : [],
    studentIds: Array.isArray(row.studentIds) ? row.studentIds.map(String) : [],
    createdAt: Number(row.createdAt) || Date.now(),
  }
}

/** @param {string} schoolId */
export function getBatchesBySchool(schoolId) {
  return loadBatches().filter((b) => b.schoolId === schoolId)
}

/** @param {string} id */
export function getBatchById(id) {
  return loadBatches().find((b) => b.id === id) ?? null
}

/**
 * @param {{ schoolId: string, name: string, trackType?: string, teacherIds?: string[] }} data
 */
export function addBatch({ schoolId, name, trackType = 'jee', teacherIds = [] }) {
  const trimmed = String(name ?? '').trim()
  if (!schoolId) return { ok: false, error: 'Select a school.' }
  if (!trimmed) return { ok: false, error: 'Batch name is required.' }

  const batches = loadBatches()
  const mine = batches.filter((b) => b.schoolId === schoolId)
  if (mine.some((b) => b.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: 'This school already has a batch with this name.' }
  }

  const batch = {
    id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    schoolId,
    name: trimmed,
    trackType: TRACK_IDS.has(trackType) ? trackType : 'jee',
    teacherIds: Array.isArray(teacherIds) ? teacherIds.map(String) : [],
    studentIds: [],
    createdAt: Date.now(),
  }
  batches.push(batch)
  saveBatches(batches)
  return { ok: true, batch }
}

/**
 * @param {string} id
 * @param {{ name?: string, trackType?: string, teacherIds?: string[], studentIds?: string[] }} updates
 */
export function updateBatch(id, updates) {
  const batches = loadBatches()
  const idx = batches.findIndex((b) => b.id === id)
  if (idx < 0) return { ok: false, error: 'Batch not found.' }

  const row = { ...batches[idx] }
  if (updates.name != null) {
    const trimmed = String(updates.name).trim()
    if (!trimmed) return { ok: false, error: 'Batch name is required.' }
    if (
      batches.some(
        (b) =>
          b.id !== id &&
          b.schoolId === row.schoolId &&
          b.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      return { ok: false, error: 'This school already has a batch with this name.' }
    }
    row.name = trimmed
  }
  if (updates.trackType != null && TRACK_IDS.has(updates.trackType)) {
    row.trackType = updates.trackType
  }
  if (updates.teacherIds != null) {
    row.teacherIds = updates.teacherIds.map(String)
  }
  if (updates.studentIds != null) {
    row.studentIds = [...new Set(updates.studentIds.map(String))]
  }

  batches[idx] = row
  saveBatches(batches)
  return { ok: true, batch: row }
}

/** @param {string} id */
export function deleteBatch(id) {
  const batches = loadBatches()
  const next = batches.filter((b) => b.id !== id)
  if (next.length === batches.length) return { ok: false, error: 'Batch not found.' }
  saveBatches(next)
  return { ok: true }
}

/** Wipe competitive batches for a deleted campus (students stay in classes). */
export function deleteBatchesForSchool(schoolId) {
  if (!schoolId) return { ok: false, error: 'Missing school.' }
  const batches = loadBatches()
  const next = batches.filter((b) => b.schoolId !== schoolId)
  if (next.length === batches.length) return { ok: true, removed: 0 }
  saveBatches(next)
  return { ok: true, removed: batches.length - next.length }
}

/** @param {string} batchId @param {string} studentId */
export function enrollStudentInBatch(batchId, studentId) {
  const batch = getBatchById(batchId)
  if (!batch) return { ok: false, error: 'Batch not found.' }
  if (!studentId) return { ok: false, error: 'Select a student.' }
  const studentIds = batch.studentIds.includes(studentId)
    ? batch.studentIds
    : [...batch.studentIds, studentId]
  return updateBatch(batchId, { studentIds })
}

/** @param {string} batchId @param {string} studentId */
export function removeStudentFromBatch(batchId, studentId) {
  const batch = getBatchById(batchId)
  if (!batch) return { ok: false, error: 'Batch not found.' }
  return updateBatch(batchId, {
    studentIds: batch.studentIds.filter((id) => id !== studentId),
  })
}

/** @param {string} studentId */
export function getBatchesForStudent(studentId) {
  return loadBatches().filter((b) => b.studentIds.includes(studentId))
}

/** @param {string} trackType */
export function trackLabel(trackType) {
  return BATCH_TRACK_TYPES.find((t) => t.id === trackType)?.label || trackType || 'Batch'
}
