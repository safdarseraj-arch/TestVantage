import { filterBankQuestions, isQuestionMetaUntagged } from './bankListFilters.js'
import { maybeHealHybridDraftQuestion } from './hybridLatexSanitize.js'
import { getQuestionReviewState } from './questionBankReview.js'
import { isPyqLike } from './pyqDetect.js'
import { effectiveBankStatus } from './questionUploadFilter.js'

/** @typedef {'drafts' | 'untagged' | 'pyq' | 'ready' | 'needs-fix' | 'needs-action' | 'warnings'} BankReviewModeId */

/** @typedef {'newest' | 'oldest'} ReviewSortOrder */

/** @typedef {'all' | 'today' | '7d' | '30d'} ReviewDatePreset */

/** @typedef {import('./bankListFilters.js').BankListFilters & { pyqYear?: string, reviewSort?: ReviewSortOrder }} BankReviewFilters */

export const BANK_REVIEW_MODES = [
  {
    id: 'drafts',
    label: 'All drafts',
    hint: 'Every draft question — tag, fix, then publish.',
    tone: 'neutral',
  },
  {
    id: 'duplicates',
    label: 'Possible duplicates',
    hint: 'New copies kept next to an original so you can compare.',
    tone: 'warn',
  },
  {
    id: 'untagged',
    label: 'Untagged',
    hint: 'Missing subject, unit/chapter, or type.',
    tone: 'warn',
  },
  {
    id: 'pyq',
    label: 'PYQ',
    hint: 'Previous-year questions — filter by year and syllabus.',
    tone: 'accent',
  },
  {
    id: 'ready',
    label: 'Ready to publish',
    hint: 'Tagged and content-safe — publish in one click.',
    tone: 'ok',
  },
  {
    id: 'needs-fix',
    label: 'Needs content fix',
    hint: 'Broken stem, options, or answer.',
    tone: 'error',
  },
  {
    id: 'needs-action',
    label: 'Needs action',
    hint: 'Hybrid AI drafts that failed the completeness check.',
    tone: 'error',
  },
  {
    id: 'warnings',
    label: 'Review warnings',
    hint: 'Minor issues — check before publishing.',
    tone: 'warn',
  },
]

/**
 * @param {import('../data/tests').Question & { pyqYear?: number, paperLabel?: string }} q
 */
export function getQuestionPyqYear(q) {
  if (q?.pyqYear != null) {
    const y = Number(q.pyqYear)
    if (Number.isFinite(y) && y >= 1990 && y <= 2100) return y
  }
  const blob = [q?.source, q?.paperLabel, q?.examIds?.join(' '), q?.chapter, q?.topic]
    .filter(Boolean)
    .join(' ')
  const m = blob.match(/\b(20\d{2})\b/)
  return m ? Number(m[1]) : null
}

/** @param {import('../data/tests').Question[]} questions */
export function collectPyqYearsInBank(questions) {
  const years = new Set()
  for (const q of questions ?? []) {
    if (!isPyqLike(q)) continue
    const y = getQuestionPyqYear(q)
    if (y) years.add(y)
  }
  return [...years].sort((a, b) => b - a)
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {BankReviewModeId} mode
 */
export function applyReviewModeFilter(questions, mode) {
  const list = questions ?? []
  switch (mode) {
    case 'duplicates':
      return list.filter((q) => !!String(q?.duplicateOfId ?? '').trim())
    case 'untagged':
      return list.filter((q) => isQuestionMetaUntagged(q))
    case 'pyq':
      return list.filter((q) => isPyqLike(q))
    case 'ready':
      return list.filter((q) => getQuestionReviewState(q).id === 'ready')
    case 'needs-fix':
      return list.filter((q) => getQuestionReviewState(q).id === 'needs-fix')
    case 'needs-action':
      return list.filter((q) => q?.needsAction === true || getQuestionReviewState(q).id === 'needs-action')
    case 'warnings':
      return list.filter((q) => {
        const id = getQuestionReviewState(q).id
        return id === 'needs-review' || id === 'possible-duplicate'
      })
    default:
      return list
  }
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {BankReviewFilters} filters
 * @param {BankReviewModeId} mode
 */
/** @param {import('../data/tests').Question} q */
export function getQuestionSortTime(q) {
  const updated = Number(q?.updatedAt)
  if (Number.isFinite(updated) && updated > 0) return updated
  const saved = Number(q?.savedAt)
  if (Number.isFinite(saved) && saved > 0) return saved
  const m = String(q?.id ?? '').match(/(?:^|-)(\d{10,})(?:-|$)/)
  if (m) return Number(m[1])
  return 0
}

/**
 * @param {import('../data/tests').Question[]} items
 * @param {ReviewSortOrder} [sort]
 */
export function sortReviewQueue(items, sort = 'newest') {
  const list = [...(items ?? [])]
  const newestFirst = sort !== 'oldest'
  list.sort((a, b) => {
    const ta = getQuestionSortTime(a)
    const tb = getQuestionSortTime(b)
    if (ta !== tb) return newestFirst ? tb - ta : ta - tb
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
  })
  return list
}

/** @param {ReviewDatePreset} preset */
export function reviewDatePresetToRange(preset) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const fmt = (d) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  switch (preset) {
    case 'today':
      return { dateFrom: fmt(today), dateTo: fmt(today) }
    case '7d': {
      const from = new Date(today)
      from.setDate(from.getDate() - 6)
      return { dateFrom: fmt(from), dateTo: fmt(today) }
    }
    case '30d': {
      const from = new Date(today)
      from.setDate(from.getDate() - 29)
      return { dateFrom: fmt(from), dateTo: fmt(today) }
    }
    default:
      return { dateFrom: '', dateTo: '' }
  }
}

/**
 * @param {string} dateFrom
 * @param {string} dateTo
 * @returns {ReviewDatePreset}
 */
export function inferReviewDatePreset(dateFrom, dateTo) {
  const from = String(dateFrom ?? '').trim()
  const to = String(dateTo ?? '').trim()
  if (!from && !to) return 'all'
  for (const preset of /** @type {ReviewDatePreset[]} */ (['today', '7d', '30d'])) {
    const range = reviewDatePresetToRange(preset)
    if (range.dateFrom === from && range.dateTo === to) return preset
  }
  return 'all'
}

/**
 * Apply the reviewDays address-bar value onto upload-date filters.
 * today / 7d / 30d replace both sides. Explicit "all" clears both sides.
 * A missing value is a custom from/to (or not written yet) — leave the dates alone.
 * @param {{ dateFrom?: string, dateTo?: string }} filters
 * @param {string | null | undefined} reviewDaysParam
 * @returns {{ dateFrom: string, dateTo: string, changed: boolean }}
 */
export function reviewDatesAfterUrlParam(filters, reviewDaysParam) {
  const param = String(reviewDaysParam ?? '').trim()
  const prevFrom = String(filters?.dateFrom ?? '')
  const prevTo = String(filters?.dateTo ?? '')
  if (param === 'today' || param === '7d' || param === '30d') {
    const range = reviewDatePresetToRange(param)
    return {
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      changed: range.dateFrom !== prevFrom || range.dateTo !== prevTo,
    }
  }
  if (param === 'all') {
    return {
      dateFrom: '',
      dateTo: '',
      changed: prevFrom !== '' || prevTo !== '',
    }
  }
  return { dateFrom: prevFrom, dateTo: prevTo, changed: false }
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {BankReviewFilters} filters
 * @param {BankReviewModeId} mode
 * @param {'draft' | 'published' | null | undefined} [viewTab]
 */
/**
 * Mark rows (and passage children of those rows) with a bank status.
 * Returns the same array when nothing changes.
 * @param {import('../data/tests').Question[]} questions
 * @param {Array<string | number>} ids
 * @param {'draft' | 'published'} status
 */
export function withForcedBankStatus(questions, ids, status) {
  const want = new Set((ids ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))
  if (!want.size) return questions ?? []
  const nextStatus = status === 'published' ? 'published' : 'draft'
  let changed = false
  const next = (questions ?? []).map((q) => {
    const linked =
      want.has(String(q?.id ?? '')) ||
      (q?.passageId != null && want.has(String(q.passageId)))
    if (!linked || effectiveBankStatus(q) === nextStatus) return q
    changed = true
    return { ...q, bankStatus: nextStatus }
  })
  return changed ? next : (questions ?? [])
}

export function buildReviewQueue(questions, filters, mode, viewTab = null) {
  const rawTab = String(viewTab ?? '').trim().toLowerCase()
  const tab =
    rawTab === 'published'
      ? 'published'
      : rawTab === 'draft' || rawTab === 'drafts'
        ? 'draft'
        : filters?.bankStatus === 'published'
          ? 'published'
          : 'draft'
  const statusScoped = (questions ?? []).filter((q) => effectiveBankStatus(q) === tab)
  const modeScoped = applyReviewModeFilter(statusScoped, mode)
  const { bankStatus: _statusDrop, ...metaFilters } = filters ?? {}
  const metaScoped = filterBankQuestions(modeScoped, metaFilters)
  const pyqYear = String(filters.pyqYear ?? '').trim()
  const yearScoped = pyqYear
    ? metaScoped.filter((q) => String(getQuestionPyqYear(q) ?? '') === pyqYear)
    : metaScoped
  const sort = filters.reviewSort === 'oldest' ? 'oldest' : 'newest'
  const healed = yearScoped.map((q) => maybeHealHybridDraftQuestion(q))
  return sortReviewQueue(healed, sort)
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {BankReviewModeId} mode
 */
export function countReviewMode(questions, mode) {
  const drafts = (questions ?? []).filter((q) => effectiveBankStatus(q) === 'draft')
  return applyReviewModeFilter(drafts, mode).length
}

/** One pass over drafts — used by the review mode cards so we do not re-scan 7 times. */
export function countAllReviewModes(questions) {
  const drafts = (questions ?? []).filter((q) => effectiveBankStatus(q) === 'draft')
  const map = {
    drafts: drafts.length,
    duplicates: 0,
    untagged: 0,
    pyq: 0,
    ready: 0,
    'needs-fix': 0,
    'needs-action': 0,
    warnings: 0,
  }
  for (const q of drafts) {
    if (String(q?.duplicateOfId ?? '').trim()) map.duplicates += 1
    if (isQuestionMetaUntagged(q)) map.untagged += 1
    if (isPyqLike(q)) map.pyq += 1
    const id = getQuestionReviewState(q).id
    if (id === 'ready') map.ready += 1
    else if (id === 'needs-action') map['needs-action'] += 1
    else if (id === 'needs-fix') map['needs-fix'] += 1
    else if (id === 'needs-review' || id === 'possible-duplicate') map.warnings += 1
  }
  return map
}

export const REVIEW_PAGE_SIZE_DRAFT = 10
export const REVIEW_PAGE_SIZE_PUBLISHED = 20

/**
 * Slice a review queue so the page only mounts one screen of cards.
 * @param {unknown[]} items
 * @param {number} page
 * @param {number} pageSize
 */
export function sliceReviewPage(items, page, pageSize) {
  const list = Array.isArray(items) ? items : []
  const size = Math.max(1, Number(pageSize) || REVIEW_PAGE_SIZE_DRAFT)
  const totalPages = Math.max(1, Math.ceil(list.length / size) || 1)
  const safePage = Math.min(Math.max(0, Number(page) || 0), totalPages - 1)
  const start = list.length === 0 ? 0 : safePage * size
  return {
    page: safePage,
    totalPages,
    pageSize: size,
    start,
    end: Math.min(list.length, start + size),
    items: list.slice(start, start + size),
  }
}
