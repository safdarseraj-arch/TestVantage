/**
 * Upload date / operator helpers for bank filters (no browser auth dependency).
 */

/**
 * @param {import('../data/tests').Question} q
 * @returns {number}
 */
export function questionFirstSavedTimestamp(q) {
  const saved = Number(q?.savedAt)
  if (Number.isFinite(saved) && saved > 0) return saved
  const m = String(q?.id ?? '').match(/(?:^|-)(\d{10,})(?:-|$)/)
  if (m) return Number(m[1])
  return 0
}

/**
 * Newest activity time (edit or save) — for sorting.
 * @param {import('../data/tests').Question} q
 * @returns {number}
 */
export function questionUploadTimestamp(q) {
  const updated = Number(q?.updatedAt)
  if (Number.isFinite(updated) && updated > 0) return updated
  return questionFirstSavedTimestamp(q)
}

/** @param {number} ts */
export function formatQuestionUploadDate(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return new Date(n).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * @param {import('../data/tests').Question} q
 * @returns {string}
 */
export function questionUploadOperatorLabel(q) {
  return String(q?.uploadedByName ?? q?.uploadedBy ?? '').trim() || 'Unknown operator'
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @returns {{ id: string, label: string, count: number }[]}
 */
export function collectOperatorsInBank(questions) {
  /** @type {Map<string, { label: string, count: number }>} */
  const map = new Map()
  for (const q of questions ?? []) {
    const label = questionUploadOperatorLabel(q)
    const id = String(q?.uploadedById ?? label).trim() || label
    const row = map.get(id) ?? { label, count: 0 }
    row.count += 1
    map.set(id, row)
  }
  return [...map.entries()]
    .map(([id, row]) => ({ id, label: row.label, count: row.count }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Parse filter day as local calendar date (yyyy-mm-dd or dd-mm-yyyy).
 * @param {string} raw
 * @returns {{ y: number, m: number, d: number } | null}
 */
export function parseUploadFilterLocalDay(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  let y
  let mo
  let day
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) {
    y = Number(m[1])
    mo = Number(m[2]) - 1
    day = Number(m[3])
  } else {
    m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/)
    if (!m) return null
    day = Number(m[1])
    mo = Number(m[2]) - 1
    y = Number(m[3])
  }
  if (!Number.isFinite(y) || mo < 0 || mo > 11 || day < 1 || day > 31) return null
  return { y, m: mo, d: day }
}

/** @param {number} ts @returns {{ y: number, m: number, d: number }} */
function localDayFromTimestamp(ts) {
  const dt = new Date(ts)
  return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() }
}

/** @param {{ y: number, m: number, d: number }} a @param {{ y: number, m: number, d: number }} b */
function compareLocalDays(a, b) {
  if (a.y !== b.y) return a.y - b.y
  if (a.m !== b.m) return a.m - b.m
  return a.d - b.d
}

/**
 * @param {import('../data/tests').Question} q
 * @param {{ dateFrom?: string, dateTo?: string }} filters ISO yyyy-mm-dd (date input) or dd-mm-yyyy
 */
export function questionMatchesUploadDateFilter(q, { dateFrom = '', dateTo = '' } = {}) {
  const from = String(dateFrom ?? '').trim()
  const to = String(dateTo ?? '').trim()
  if (!from && !to) return true

  const ts = questionFirstSavedTimestamp(q)
  if (!ts) return false

  const fromDay = from ? parseUploadFilterLocalDay(from) : null
  const toDay = to ? parseUploadFilterLocalDay(to) : null
  if ((from && !fromDay) || (to && !toDay)) return false

  const qDay = localDayFromTimestamp(ts)
  if (fromDay && compareLocalDays(qDay, fromDay) < 0) return false
  if (toDay && compareLocalDays(qDay, toDay) > 0) return false
  return true
}

/**
 * @param {import('../data/tests').Question} q
 * @param {string} operatorId
 */
export function questionMatchesOperatorFilter(q, operatorId) {
  const want = String(operatorId ?? '').trim()
  if (!want) return true
  const id = String(q?.uploadedById ?? '').trim()
  const label = questionUploadOperatorLabel(q)
  if (id && id === want) return true
  return label === want
}

/**
 * @param {string} raw
 * @returns {{ mode: 'none' | 'contains' | 'exact', tokens: string[] }}
 */
export function parseQuestionIdQuery(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return { mode: 'none', tokens: [] }
  if (/[,;\n]/.test(s)) {
    const tokens = s
      .split(/[,;\n]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
    return { mode: 'exact', tokens }
  }
  return { mode: 'contains', tokens: [s.toUpperCase()] }
}

/** @param {string} raw */
export function questionIdsFromQuery(raw) {
  const parsed = parseQuestionIdQuery(raw)
  return parsed.mode === 'exact' ? parsed.tokens : []
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {string} id
 */
export function findBankQuestionById(questions, id) {
  const want = String(id ?? '').trim().toUpperCase()
  if (!want) return null
  return (
    (questions ?? []).find((q) => String(q?.id ?? '').trim().toUpperCase() === want) ??
    (questions ?? []).find((q) => String(q?.id ?? '').trim().toUpperCase().includes(want)) ??
    null
  )
}

/**
 * @param {import('../data/tests').Question} q
 * @param {string} query partial match, or comma/newline-separated exact IDs
 */
export function questionMatchesIdFilter(q, query) {
  const parsed = parseQuestionIdQuery(query)
  if (parsed.mode === 'none') return true
  const id = String(q?.id ?? '').trim().toUpperCase()
  if (!id) return false
  if (parsed.mode === 'exact') {
    return parsed.tokens.some((t) => id === t)
  }
  return parsed.tokens.some((t) => id.includes(t))
}

/**
 * Backfill bankStatus for rows saved before the draft/publish workflow.
 * @param {import('../data/tests').Question} q
 * @returns {import('../data/tests').Question}
 */
export function normalizeLegacyBankStatus(q) {
  const s = String(q?.bankStatus ?? '').trim()
  if (s === 'draft' || s === 'published') return q

  if (q?.publishedAt) return { ...q, bankStatus: 'published' }

  const hist = Array.isArray(q?.updateHistory) ? q.updateHistory : []
  if (hist.some((h) => h?.action === 'published')) {
    return { ...q, bankStatus: 'published' }
  }
  if (hist.some((h) => h?.action === 'created' && /draft/i.test(String(h?.summary ?? '')))) {
    return { ...q, bankStatus: 'draft' }
  }

  // Pre-workflow uploads had no draft gate — keep them available once published is explicit.
  return { ...q, bankStatus: 'published' }
}

/** @param {import('../data/tests').Question} q */
export function effectiveBankStatus(q) {
  const s = String(q?.bankStatus ?? '').trim().toLowerCase()
  if (s === 'draft' || s === 'published') return s
  return 'draft'
}

/** @param {import('../data/tests').Question} q */
export function isQuestionPublished(q) {
  return effectiveBankStatus(q) === 'published'
}

/** @param {import('../data/tests').Question[]} questions */
export function filterPublishedQuestions(questions) {
  return (questions ?? []).filter(isQuestionPublished)
}

/** @param {import('../data/tests').Question} q */
export function bankStatusLabel(q) {
  return effectiveBankStatus(q) === 'published' ? 'Published' : 'Draft'
}
