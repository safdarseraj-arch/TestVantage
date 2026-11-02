/**
 * Student / teacher reports on a saved question.
 * Stored separately from the question bank so a report never wipes or unpublishes items.
 */

export const QUESTION_REPORT_STORAGE_KEY = 'testvantage-question-reports'
export const QUESTION_REPORT_MAX_COMMENT = 500
export const QUESTION_REPORT_STATUSES = ['open', 'reviewed']

/** Everyday labels shown in the Report picker — keep in sync with the UI. */
export const QUESTION_REPORT_CATEGORIES = [
  {
    id: 'question_related',
    label: 'Question related issue',
    reasons: [
      { id: 'wrong_question', label: 'Wrong question' },
      { id: 'data_error', label: 'Data error' },
      { id: 'spelling_error', label: 'Spelling error' },
    ],
  },
  {
    id: 'solution',
    label: 'Solution',
    reasons: [
      { id: 'wrong_solution', label: 'Wrong solution' },
      { id: 'incomplete_solution', label: 'Incomplete solution' },
      { id: 'lengthy_solution', label: 'Lengthy solution' },
    ],
  },
  {
    id: 'option_related',
    label: 'Option related',
    reasons: [{ id: 'no_option_correct', label: 'No option is correct' }],
  },
  {
    id: 'answer',
    label: 'Answer',
    reasons: [{ id: 'answer_is_wrong', label: 'Answer is wrong' }],
  },
  {
    id: 'meta_tag_error',
    label: 'Meta tag error',
    reasons: [],
  },
]

const CATEGORY_BY_ID = new Map(QUESTION_REPORT_CATEGORIES.map((c) => [c.id, c]))

/** @param {string} id */
export function getQuestionReportCategory(id) {
  return CATEGORY_BY_ID.get(String(id ?? '').trim()) ?? null
}

/** @param {string} categoryId @param {string} reasonId */
export function getQuestionReportReason(categoryId, reasonId) {
  const cat = getQuestionReportCategory(categoryId)
  if (!cat) return null
  return cat.reasons.find((r) => r.id === String(reasonId ?? '').trim()) ?? null
}

/**
 * @param {unknown} input
 * @returns {{ ok: true, value: {
 *   questionId: string
 *   category: string
 *   categoryLabel: string
 *   subReason: string
 *   subReasonLabel: string
 *   comment: string
 * }} | { ok: false, error: string }}
 */
export function validateQuestionReportInput(input) {
  const raw = input && typeof input === 'object' ? input : {}
  const questionId = String(raw.questionId ?? '').trim()
  if (!questionId) return { ok: false, error: 'Pick a question first.' }

  const category = getQuestionReportCategory(raw.category)
  if (!category) return { ok: false, error: 'Pick a main category.' }

  const needsReason = category.reasons.length > 0
  const reasonId = String(raw.subReason ?? raw.reason ?? '').trim()
  if (needsReason && !reasonId) {
    return { ok: false, error: 'Pick a more specific reason.' }
  }
  const reason = needsReason ? getQuestionReportReason(category.id, reasonId) : null
  if (needsReason && !reason) {
    return { ok: false, error: 'That reason does not match the category.' }
  }
  if (!needsReason && reasonId) {
    return { ok: false, error: 'This category has no extra reason.' }
  }

  const comment = String(raw.comment ?? '').trim()
  if (comment.length > QUESTION_REPORT_MAX_COMMENT) {
    return {
      ok: false,
      error: `Keep the note under ${QUESTION_REPORT_MAX_COMMENT} characters.`,
    }
  }

  return {
    ok: true,
    value: {
      questionId,
      category: category.id,
      categoryLabel: category.label,
      subReason: reason?.id ?? '',
      subReasonLabel: reason?.label ?? '',
      comment,
    },
  }
}

function newReportId() {
  return `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * @param {{
 *   questionId?: string
 *   category?: string
 *   subReason?: string
 *   comment?: string
 *   reporter?: { userId?: string | null, name?: string | null, email?: string | null, role?: string | null } | null
 *   source?: string
 *   id?: string
 *   createdAt?: number
 *   status?: string
 * }} input
 */
export function buildQuestionReport(input = {}) {
  const checked = validateQuestionReportInput(input)
  if (!checked.ok) {
    throw new Error(checked.error)
  }
  const status = QUESTION_REPORT_STATUSES.includes(input.status)
    ? input.status
    : 'open'
  const reporter = normalizeReporter(input.reporter)
  return {
    id: String(input.id ?? '').trim() || newReportId(),
    questionId: checked.value.questionId,
    reporter,
    category: checked.value.category,
    categoryLabel: checked.value.categoryLabel,
    subReason: checked.value.subReason,
    subReasonLabel: checked.value.subReasonLabel,
    comment: checked.value.comment,
    createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : Date.now(),
    status,
    source: String(input.source ?? '').trim(),
    reviewedAt: status === 'reviewed' && Number.isFinite(Number(input.reviewedAt))
      ? Number(input.reviewedAt)
      : status === 'reviewed'
        ? Date.now()
        : null,
  }
}

function normalizeReporter(reporter) {
  if (!reporter || typeof reporter !== 'object') return null
  const userId = reporter.userId != null ? String(reporter.userId).trim() : ''
  const name = reporter.name != null ? String(reporter.name).trim() : ''
  const email = reporter.email != null ? String(reporter.email).trim() : ''
  const role = reporter.role != null ? String(reporter.role).trim() : ''
  if (!userId && !name && !email && !role) return null
  return {
    userId: userId || null,
    name: name || null,
    email: email || null,
    role: role || null,
  }
}

/** @param {unknown} row */
export function normalizeStoredReport(row) {
  try {
    return buildQuestionReport(row)
  } catch {
    return null
  }
}

function loadReportsRaw() {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    const raw = window.localStorage.getItem(QUESTION_REPORT_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const list = Array.isArray(parsed?.reports) ? parsed.reports : Array.isArray(parsed) ? parsed : []
    return list.map(normalizeStoredReport).filter(Boolean)
  } catch {
    return []
  }
}

/** @param {object[]} list */
function saveReportsRaw(list) {
  if (typeof window === 'undefined' || !window.localStorage) return
  window.localStorage.setItem(
    QUESTION_REPORT_STORAGE_KEY,
    JSON.stringify({ reports: list, updatedAt: Date.now() }),
  )
}

export function listQuestionReports() {
  return loadReportsRaw().sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

export function countOpenQuestionReports() {
  return listQuestionReports().filter((r) => r.status === 'open').length
}

/**
 * @param {Parameters<typeof buildQuestionReport>[0]} input
 */
export function addQuestionReport(input) {
  const report = buildQuestionReport({ ...input, status: 'open' })
  const list = loadReportsRaw()
  list.unshift(report)
  saveReportsRaw(list)
  return report
}

/**
 * Mark reviewed only — never deletes the question or the report.
 * @param {string} id
 */
export function markQuestionReportReviewed(id) {
  const key = String(id ?? '').trim()
  if (!key) return null
  const list = loadReportsRaw()
  const idx = list.findIndex((r) => r.id === key)
  if (idx < 0) return null
  const next = {
    ...list[idx],
    status: 'reviewed',
    reviewedAt: Date.now(),
  }
  list[idx] = next
  saveReportsRaw(list)
  return next
}

/**
 * Merge remote rows into local by id. Local status wins when it is newer.
 * @param {object[]} remote
 */
export function mergeQuestionReports(remote = []) {
  const byId = new Map(loadReportsRaw().map((r) => [r.id, r]))
  for (const raw of remote) {
    const row = normalizeStoredReport(raw)
    if (!row) continue
    const prev = byId.get(row.id)
    if (!prev) {
      byId.set(row.id, row)
      continue
    }
    const prevTouch = Math.max(Number(prev.reviewedAt) || 0, Number(prev.createdAt) || 0)
    const nextTouch = Math.max(Number(row.reviewedAt) || 0, Number(row.createdAt) || 0)
    if (nextTouch > prevTouch) byId.set(row.id, row)
  }
  const merged = [...byId.values()].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  saveReportsRaw(merged)
  return merged
}

/** Deep-link to the saved question viewer on Question Bank. */
export function questionBankViewUrl(questionId) {
  const id = String(questionId ?? '').trim()
  if (!id) return '/question-bank?hub=view'
  return `/question-bank?hub=view&qid=${encodeURIComponent(id)}`
}

export function reporterDisplayName(report) {
  const r = report?.reporter
  if (!r) return 'Not signed in'
  if (r.name) return r.name
  if (r.email) return r.email
  if (r.userId) return r.userId
  return 'Not signed in'
}

export function reportReasonLine(report) {
  if (!report) return ''
  if (report.subReasonLabel) return `${report.categoryLabel} · ${report.subReasonLabel}`
  return report.categoryLabel || 'Report'
}
