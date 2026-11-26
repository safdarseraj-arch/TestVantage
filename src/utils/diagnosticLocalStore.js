/**
 * Local MVP persistence for diagnostic verification audit + class trend snapshots.
 * Browser localStorage only — not a production rollup DB.
 */

const VERIFICATION_KEY = 'testvantage-diag-verification-v1'
const TREND_KEY = 'testvantage-diag-trend-v1'
const ROLLUP_KEY = 'testvantage-diag-rollup-cache-v1'
export const TREND_MAX_POINTS = 12
export const ROLLUP_MAX_ENTRIES = 24

/** @typedef {'verified'|'wrong_key'|'keep'} VerificationStatus */

/**
 * @returns {{
 *   byQuestion: Record<string, { status: VerificationStatus, updatedAt: number, note?: string }>
 *   audit: { at: number, questionId: string, status: VerificationStatus, note?: string }[]
 * }}
 */
function emptyVerification() {
  return { byQuestion: {}, audit: [] }
}

function loadVerification() {
  try {
    if (typeof localStorage === 'undefined') return emptyVerification()
    const raw = localStorage.getItem(VERIFICATION_KEY)
    if (!raw) return emptyVerification()
    const parsed = JSON.parse(raw)
    return {
      byQuestion: parsed?.byQuestion && typeof parsed.byQuestion === 'object' ? parsed.byQuestion : {},
      audit: Array.isArray(parsed?.audit) ? parsed.audit : [],
    }
  } catch {
    return emptyVerification()
  }
}

function saveVerification(data) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(VERIFICATION_KEY, JSON.stringify(data))
}

/** @param {string} questionId */
export function getVerificationStatus(questionId) {
  if (!questionId) return null
  return loadVerification().byQuestion[questionId] || null
}

/** @returns {Record<string, { status: VerificationStatus, updatedAt: number, note?: string }>} */
export function getAllVerificationStatuses() {
  return { ...loadVerification().byQuestion }
}

/**
 * @param {string} questionId
 * @param {VerificationStatus} status
 * @param {{ note?: string }} [opts]
 */
export function setVerificationStatus(questionId, status, opts = {}) {
  if (!questionId || !status) return null
  const data = loadVerification()
  const entry = {
    status,
    updatedAt: Date.now(),
    note: opts.note ? String(opts.note).slice(0, 200) : undefined,
  }
  data.byQuestion[questionId] = entry
  data.audit.unshift({
    at: entry.updatedAt,
    questionId,
    status,
    note: entry.note,
  })
  if (data.audit.length > 80) data.audit = data.audit.slice(0, 80)
  saveVerification(data)
  return entry
}

/** @param {number} [limit] */
export function getVerificationAuditLog(limit = 20) {
  const audit = loadVerification().audit
  return audit.slice(0, Math.max(1, limit))
}

/** Clear verification bag (tests). */
export function clearVerificationStore() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(VERIFICATION_KEY)
}

/**
 * @returns {{ points: object[] }}
 */
function loadTrends() {
  try {
    if (typeof localStorage === 'undefined') return { points: [] }
    const raw = localStorage.getItem(TREND_KEY)
    if (!raw) return { points: [] }
    const parsed = JSON.parse(raw)
    return { points: Array.isArray(parsed?.points) ? parsed.points : [] }
  } catch {
    return { points: [] }
  }
}

function saveTrends(data) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(TREND_KEY, JSON.stringify(data))
}

/**
 * Append a class diagnostic rollup snapshot (deduped within ~2 min for same testId).
 * @param {object} point from summarizeDiagnosticTrendPoint
 * @param {{ max?: number }} [opts]
 */
export function recordDiagnosticTrendSnapshot(point, opts = {}) {
  if (!point || typeof point !== 'object') return []
  const max = opts.max ?? TREND_MAX_POINTS
  const data = loadTrends()
  const testId = String(point.testId || '')
  const now = Number(point.at) || Date.now()
  const recent = data.points[0]
  if (
    recent &&
    String(recent.testId || '') === testId &&
    Math.abs((Number(recent.at) || 0) - now) < 120_000
  ) {
    data.points[0] = { ...point, at: now }
  } else {
    data.points.unshift({ ...point, at: now })
  }
  if (data.points.length > max) data.points = data.points.slice(0, max)
  saveTrends(data)
  return data.points
}

/** @param {{ testId?: string, limit?: number }} [opts] */
export function getDiagnosticTrendSnapshots(opts = {}) {
  const limit = Math.max(1, Number(opts.limit) || TREND_MAX_POINTS)
  let points = loadTrends().points
  if (opts.testId) {
    const tid = String(opts.testId)
    points = points.filter((p) => String(p.testId || '') === tid)
  }
  return points.slice(0, limit)
}

export function clearDiagnosticTrendStore() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(TREND_KEY)
}

/**
 * Local rollup cache (browser “DB” MVP) — full tab summary keyed by testId.
 * @returns {{ byTestId: Record<string, object>, order: string[] }}
 */
function loadRollupCache() {
  try {
    if (typeof localStorage === 'undefined') return { byTestId: {}, order: [] }
    const raw = localStorage.getItem(ROLLUP_KEY)
    if (!raw) return { byTestId: {}, order: [] }
    const parsed = JSON.parse(raw)
    return {
      byTestId: parsed?.byTestId && typeof parsed.byTestId === 'object' ? parsed.byTestId : {},
      order: Array.isArray(parsed?.order) ? parsed.order : [],
    }
  } catch {
    return { byTestId: {}, order: [] }
  }
}

function saveRollupCache(data) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(ROLLUP_KEY, JSON.stringify(data))
}

/**
 * @param {string} testId
 * @param {object} payload — compact rollup (tabs summary, paperBalance takeaway, etc.)
 */
export function saveDiagnosticRollupCache(testId, payload) {
  const id = String(testId || 'all')
  const data = loadRollupCache()
  data.byTestId[id] = {
    ...(payload && typeof payload === 'object' ? payload : {}),
    testId: id,
    savedAt: Date.now(),
  }
  data.order = [id, ...data.order.filter((x) => x !== id)].slice(0, ROLLUP_MAX_ENTRIES)
  const keep = new Set(data.order)
  for (const key of Object.keys(data.byTestId)) {
    if (!keep.has(key)) delete data.byTestId[key]
  }
  saveRollupCache(data)
  return data.byTestId[id]
}

/** @param {string} [testId] */
export function getDiagnosticRollupCache(testId) {
  const data = loadRollupCache()
  if (testId) return data.byTestId[String(testId)] || null
  return data.order.map((id) => data.byTestId[id]).filter(Boolean)
}

export function clearDiagnosticRollupCache() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(ROLLUP_KEY)
}
