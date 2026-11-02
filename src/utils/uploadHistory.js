/**
 * Local upload timeline — recent OCR / parse attempts on this browser.
 */

export const UPLOAD_HISTORY_STORAGE_KEY = 'tv-upload-history'
const MAX_ENTRIES = 40

/**
 * @typedef {{
 *   id: string
 *   at: string
 *   fileName?: string
 *   mode?: string
 *   engine?: string
 *   found?: number
 *   confidence?: number
 *   readyToSave?: boolean
 *   needsReview?: boolean
 *   needsAgentRepair?: boolean
 *   durationMs?: number
 *   detectedType?: string
 *   stemPreview?: string
 *   steps?: string[]
 *   error?: string
 * }} UploadHistoryEntry
 */

/** @returns {UploadHistoryEntry[]} */
export function listUploadHistory() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(UPLOAD_HISTORY_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * @param {Partial<UploadHistoryEntry>} entry
 * @returns {UploadHistoryEntry}
 */
export function recordUploadHistory(entry = {}) {
  if (typeof localStorage === 'undefined') {
    return /** @type {UploadHistoryEntry} */ ({
      id: `${Date.now()}`,
      at: new Date().toISOString(),
      ...entry,
    })
  }
  const row = /** @type {UploadHistoryEntry} */ ({
    id: entry.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: entry.at ?? new Date().toISOString(),
    fileName: String(entry.fileName ?? 'Upload').slice(0, 120),
    mode: entry.mode ?? 'unknown',
    engine: entry.engine ?? '',
    found: entry.found ?? 0,
    confidence: entry.confidence ?? 0,
    readyToSave: !!entry.readyToSave,
    needsReview: !!entry.needsReview,
    needsAgentRepair: !!entry.needsAgentRepair,
    durationMs: Math.max(0, entry.durationMs ?? 0),
    detectedType: entry.detectedType ?? '',
    stemPreview: String(entry.stemPreview ?? '').slice(0, 140),
    steps: (entry.steps ?? []).slice(0, 8),
    error: entry.error ? String(entry.error).slice(0, 240) : '',
  })
  try {
    const queue = listUploadHistory()
    queue.unshift(row)
    localStorage.setItem(UPLOAD_HISTORY_STORAGE_KEY, JSON.stringify(queue.slice(0, MAX_ENTRIES)))
  } catch {
    /* quota / private mode */
  }
  return row
}

export function clearUploadHistory() {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(UPLOAD_HISTORY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** @param {string} iso */
export function formatUploadHistoryWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = Date.now()
  const diffMs = now - d.getTime()
  if (diffMs < 60_000) return 'Just now'
  if (diffMs < 3_600_000) return `${Math.max(1, Math.round(diffMs / 60_000))} min ago`
  const sameDay = new Date(now).toDateString() === d.toDateString()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today ${time}`
  const yday = new Date(now)
  yday.setDate(yday.getDate() - 1)
  if (yday.toDateString() === d.toDateString()) return `Yesterday ${time}`
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** @param {number} ms */
export function formatUploadDuration(ms) {
  const n = Math.max(0, ms ?? 0)
  if (n < 1000) return `${n} ms`
  if (n < 60_000) return `${(n / 1000).toFixed(1)} s`
  return `${Math.floor(n / 60_000)}m ${Math.round((n % 60_000) / 1000)}s`
}

/** @param {UploadHistoryEntry} entry */
export function labelUploadHistoryMode(entry) {
  const map = {
    single: 'Single MCQ',
    'diagram-split': 'MCQ + diagram',
    passage: 'Passage',
    bulk: 'Bulk',
    matrix: 'Match column',
    'passage-hint': 'Passage (needs split)',
    error: 'Failed',
    unknown: 'Upload',
  }
  return map[entry.mode ?? ''] ?? entry.mode ?? 'Upload'
}

/** @param {UploadHistoryEntry} entry */
export function uploadHistoryTone(entry) {
  if (entry.error || entry.mode === 'error') return 'bad'
  if (entry.needsAgentRepair) return 'bad'
  if (entry.needsReview || !entry.readyToSave) return 'warn'
  return 'ok'
}
