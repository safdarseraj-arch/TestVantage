import { CANONICAL_QUESTION_TYPE_IDS } from '../data/questionTypes.js'
import { normalizeSource } from './questionMetadata.js'
import { bankListVisibleQuestions } from './passageBankList.js'
import {
  questionMatchesIdFilter,
  questionMatchesOperatorFilter,
  questionMatchesUploadDateFilter,
} from './questionUploadFilter.js'
import { effectiveBankStatus } from './questionUploadFilter.js'
import { placeDuplicateReviewsBesideOriginals } from './detectDuplicateQuestion.js'
import { toughnessBandFromLevel } from './bankToughnessMix.js'
import { isOfficialPyq, isPyqLike, isPyqStyleAi, isSimilarToPyq } from './pyqDetect.js'
import { questionMatchesPyqSlotFilters } from './pyqSlotMeta.js'
import { questionFamilyKind } from './questionFamily.js'
import { questionMatchesSubBankType, normalizeSubBankType } from './subBankType.js'

/** @typedef {{
 *   examId?: string
 *   subject?: string
 *   section?: string
 *   chapter?: string
 *   topic?: string
 *   questionType?: string
 *   toughnessLevel?: string
 *   toughnessBand?: string
 *   source?: string
 *   sourceKind?: string
 *   pyqYear?: string
 *   pyqDate?: string
 *   pyqShift?: string
 *   pyqPaper?: string
 *   dateFrom?: string
 *   dateTo?: string
 *   uploadedBy?: string
 *   bankStatus?: string
 *   questionIdQuery?: string
 *   familyKind?: string
 *   subBankType?: string
 * }} BankListFilters */

export const BANK_EXAM_FILTER_OPTIONS = [
  { id: 'jee-main', label: 'JEE Main' },
  { id: 'jee-advanced', label: 'JEE Advanced' },
  { id: 'neet', label: 'NEET' },
]

export const BANK_SOURCE_KIND_OPTIONS = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'upload', label: 'Upload' },
  { id: 'pyq', label: 'PYQ' },
]

export const BANK_FAMILY_KIND_OPTIONS = [
  { id: 'original', label: 'Originals (parents)' },
  { id: 'similar', label: 'Similar children (C1, C2…)' },
  { id: 'replica', label: 'Replica papers' },
]

/**
 * Gemini / upload / PYQ family for the review filter.
 * @param {import('../data/tests').Question} q
 * @returns {'gemini' | 'upload' | 'pyq'}
 */
export function questionSourceKind(q) {
  if (isSimilarToPyq(q)) return 'gemini'
  if (isOfficialPyq(q) || isPyqStyleAi(q) || isPyqLike(q)) return 'pyq'
  const src = String(q?.source ?? '')
  if (/gemini/i.test(src) || /AI practice/i.test(src)) return 'gemini'
  return 'upload'
}

/** @param {import('../data/tests').Question} q @param {string} [examId] */
export function questionMatchesExamFilter(q, examId) {
  const want = String(examId ?? '').trim()
  if (!want) return true
  const ids = Array.isArray(q?.examIds) ? q.examIds.map(String) : []
  if (ids.includes(want)) return true
  return String(q?.examPatternId ?? '') === want
}

/** Filter value / group id for questions missing classification meta */
export const BANK_UNTAGGED_FILTER = '__untagged__'

function questionSortTime(q) {
  const updated = Number(q?.updatedAt)
  if (Number.isFinite(updated) && updated > 0) return updated
  const saved = Number(q?.savedAt)
  if (Number.isFinite(saved) && saved > 0) return saved
  const m = String(q?.id ?? '').match(/(?:^|-)(\d{10,})(?:-|$)/)
  if (m) return Number(m[1])
  return 0
}

/** True when subject filter is a real curriculum subject (not Untagged pseudo-filter). */
export function isBankCurriculumSubject(subject) {
  return !!subject && subject !== BANK_UNTAGGED_FILTER
}

/** @typedef {{ id: string, title: string, questions: import('../data/tests').Question[] }} BankListGroup */

const TYPE_RANK = new Map(CANONICAL_QUESTION_TYPE_IDS.map((id, i) => [id, i]))

/**
 * @param {import('../data/tests').Question} q
 */
export function hierarchyFields(q) {
  let section = String(q?.section ?? q?.unit ?? '').trim()
  let chapter = String(q?.chapter ?? '').trim()
  let topic = String(q?.topic ?? '').trim()
  // Legacy saves: unit in `chapter`, real chapter in `topic`
  if (!section && chapter && topic) {
    section = chapter
    chapter = topic
    topic = ''
  }
  // Legacy saves: unit name only in `chapter`
  if (!section && chapter && !topic) {
    section = chapter
    chapter = ''
  }
  return { section, chapter, topic }
}

/**
 * Type stored on the row, or inferred from shape (legacy saves often omit questionType).
 * @param {import('../data/tests').Question} q
 */
export function effectiveQuestionTypeId(q) {
  const explicit = String(q?.questionType ?? '').trim()
  if (explicit) return explicit
  if (q?.matrixRows?.length || q?.matrixCols?.length) return 'matrix_match'
  if (q?.isPassageHeader) return 'passage_scq'
  if (q?.correctNumerical != null && !(q?.options?.length >= 2)) return 'numerical'
  if (q?.correctInteger != null && !(q?.options?.length >= 2)) return 'integer'
  if (Array.isArray(q?.correctIndices) && q.correctIndices.length > 1) return 'multiple_correct'
  if (q?.options?.length >= 2 || q?.correctIndex != null) return 'single_correct'
  return 'single_correct'
}

/**
 * @param {import('../data/tests').Question} a
 * @param {import('../data/tests').Question} b
 */
export function compareBankQuestions(a, b) {
  const ha = hierarchyFields(a)
  const hb = hierarchyFields(b)

  const subjectCmp = (a.subject ?? '').localeCompare(b.subject ?? '')
  if (subjectCmp) return subjectCmp

  const sectionCmp = (ha.section ?? '').localeCompare(hb.section ?? '')
  if (sectionCmp) return sectionCmp

  const chapterCmp = (ha.chapter ?? '').localeCompare(hb.chapter ?? '')
  if (chapterCmp) return chapterCmp

  const topicCmp = (ha.topic ?? '').localeCompare(hb.topic ?? '')
  if (topicCmp) return topicCmp

  const typeA = a.questionType ?? 'single_correct'
  const typeB = b.questionType ?? 'single_correct'
  const typeCmp = (TYPE_RANK.get(typeA) ?? 99) - (TYPE_RANK.get(typeB) ?? 99)
  if (typeCmp) return typeCmp

  const tA = Number(a.toughnessLevel)
  const tB = Number(b.toughnessLevel)
  const aValid = Number.isFinite(tA) && tA >= 1
  const bValid = Number.isFinite(tB) && tB >= 1
  if (aValid && bValid && tA !== tB) return tA - tB
  if (aValid !== bValid) return aValid ? -1 : 1

  return questionSortTime(b) - questionSortTime(a)
}

/**
 * Classified when Subject, Type, and at least Unit or Chapter are set.
 * Topic, exams, and toughness are optional.
 * @param {import('../data/tests').Question} q
 */
export function isQuestionMetaClassified(q) {
  const h = hierarchyFields(q)
  if (!String(q.subject ?? '').trim()) return false
  if (!h.section && !h.chapter) return false
  if (!effectiveQuestionTypeId(q)) return false
  return true
}

/** @param {import('../data/tests').Question} q */
export function isQuestionMetaUntagged(q) {
  return !isQuestionMetaClassified(q)
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {BankListFilters} filters
 */
export function filterBankQuestions(questions, filters) {
  const f = filters ?? {}
  return questions.filter((q) => {
    if (!questionMatchesExamFilter(q, f.examId)) return false

    if (f.subject === BANK_UNTAGGED_FILTER) {
      if (!isQuestionMetaUntagged(q)) return false
    } else if (f.subject && q.subject !== f.subject) return false

    const h = hierarchyFields(q)
    if (f.section && h.section !== f.section) return false
    if (f.chapter && h.chapter !== f.chapter) return false
    if (f.topic && h.topic !== f.topic) return false

    if (f.questionType && (q.questionType ?? 'single_correct') !== f.questionType) return false

    if (f.toughnessBand) {
      if (toughnessBandFromLevel(q.toughnessLevel) !== f.toughnessBand) return false
    } else if (f.toughnessLevel !== '' && f.toughnessLevel != null) {
      const want = Number(f.toughnessLevel)
      const have = Number(q.toughnessLevel)
      if (!Number.isFinite(want) || have !== want) return false
    }

    if (f.sourceKind) {
      if (questionSourceKind(q) !== f.sourceKind) return false
    } else if (f.source) {
      const want = normalizeSource(f.source)
      const have = normalizeSource(q.source)
      if (!want || have !== want) return false
    }

    if (!questionMatchesUploadDateFilter(q, { dateFrom: f.dateFrom, dateTo: f.dateTo })) {
      return false
    }
    if (!questionMatchesOperatorFilter(q, f.uploadedBy)) return false

    if (f.bankStatus) {
      if (effectiveBankStatus(q) !== f.bankStatus) return false
    }

    if (!questionMatchesIdFilter(q, f.questionIdQuery)) return false

    if (f.familyKind) {
      if (questionFamilyKind(q) !== f.familyKind) return false
    }

    if (!questionMatchesPyqSlotFilters(q, f)) return false

    const subWant = normalizeSubBankType(f.subBankType)
    if (subWant && !questionMatchesSubBankType(q, subWant)) return false

    return true
  })
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {BankListFilters} filters
 */
export function sortAndFilterBankQuestions(questions, filters) {
  return [...filterBankQuestions(questions, filters)].sort(compareBankQuestions)
}

/**
 * Split filtered list: Untagged group first, then classified (Subject → … → Toughness).
 * @param {import('../data/tests').Question[]} questions
 * @param {BankListFilters} filters
 * @returns {BankListGroup[]}
 */
export function buildBankListGroups(questions, filters) {
  const filtered = bankListVisibleQuestions(questions, filters)
  const untagged = []
  const tagged = []
  for (const q of filtered) {
    if (isQuestionMetaUntagged(q)) untagged.push(q)
    else tagged.push(q)
  }
  untagged.sort((a, b) => questionSortTime(b) - questionSortTime(a))
  tagged.sort(compareBankQuestions)
  const untaggedGrouped = placeDuplicateReviewsBesideOriginals(untagged)
  const taggedGrouped = placeDuplicateReviewsBesideOriginals(tagged)

  const groups = []
  if (untaggedGrouped.length) {
    groups.push({
      id: BANK_UNTAGGED_FILTER,
      title: 'Untagged',
      questions: untaggedGrouped,
    })
  }
  if (taggedGrouped.length) {
    groups.push({
      id: 'classified',
      title: untaggedGrouped.length ? 'Classified' : '',
      questions: taggedGrouped,
    })
  }
  return groups
}

/**
 * Filter + sort without placing duplicate copies next to originals.
 * Slice this list before mounting cards so tab switches stay cheap.
 * @param {import('../data/tests').Question[]} questions
 * @param {BankListFilters} filters
 */
export function listBankQuestionsFast(questions, filters) {
  const filtered = bankListVisibleQuestions(questions, filters)
  const untagged = []
  const tagged = []
  for (const q of filtered) {
    if (isQuestionMetaUntagged(q)) untagged.push(q)
    else tagged.push(q)
  }
  untagged.sort((a, b) => questionSortTime(b) - questionSortTime(a))
  tagged.sort(compareBankQuestions)
  return untagged.concat(tagged)
}

/**
 * @param {BankListFilters} prev
 * @param {Partial<BankListFilters>} patch
 */
export function patchBankListFilters(prev, patch) {
  const next = { ...prev, ...patch }
  if ('subject' in patch) {
    next.section = ''
    next.chapter = ''
    next.topic = ''
  }
  if ('section' in patch) {
    next.chapter = ''
    next.topic = ''
  }
  if ('chapter' in patch) {
    next.topic = ''
  }
  return next
}

/**
 * Clear browse filters. When the status dropdown is hidden, keep the visible Draft/Published tab.
 * @param {BankListFilters} filters
 * @param {{ hideBankStatusFilter?: boolean, viewTab?: string }} [opts]
 */
export function clearedBankListFilters(filters, opts = {}) {
  const hide = opts.hideBankStatusFilter === true
  const tab = opts.viewTab === 'published' ? 'published' : 'draft'
  return {
    examId: '',
    subject: '',
    section: '',
    chapter: '',
    topic: '',
    questionType: '',
    toughnessLevel: '',
    toughnessBand: '',
    source: '',
    sourceKind: '',
    pyqYear: '',
    pyqDate: '',
    pyqShift: '',
    pyqPaper: '',
    dateFrom: '',
    dateTo: '',
    uploadedBy: '',
    bankStatus: hide ? tab : '',
    questionIdQuery: '',
    familyKind: '',
    subBankType: filters?.subBankType ?? '',
    reviewSort: filters?.reviewSort === 'oldest' ? 'oldest' : filters?.reviewSort,
  }
}

/**
 * Drop bankStatus so draft/published tabs (viewTab) stay the single source of truth.
 * @param {BankListFilters} filters
 */
export function bankListFiltersForViewTab(filters) {
  if (!filters || !filters.bankStatus) return filters ?? {}
  const { bankStatus: _drop, ...rest } = filters
  return rest
}

/** @param {BankListFilters} f */
export function bankListFiltersActive(f) {
  return !!(
    f.examId ||
    f.subject ||
    f.section ||
    f.chapter ||
    f.topic ||
    f.questionType ||
    f.toughnessBand ||
    (f.toughnessLevel !== '' && f.toughnessLevel != null) ||
    f.sourceKind ||
    f.pyqYear ||
    f.pyqDate ||
    f.pyqShift ||
    f.pyqPaper ||
    f.source ||
    f.dateFrom ||
    f.dateTo ||
    f.uploadedBy ||
    f.bankStatus ||
    f.questionIdQuery ||
    f.familyKind ||
    normalizeSubBankType(f.subBankType)
  )
}

/**
 * Human-readable summary of bulk publish / review filters.
 * @param {BankListFilters} f
 * @param {{ operatorLabel?: string }} [opts]
 */
export function describeBankPublishFilters(f, opts = {}) {
  const parts = []
  const idQ = String(f?.questionIdQuery ?? '').trim()
  if (idQ) {
    const parsed = idQ.includes(',') || idQ.includes('\n') ? 'IDs' : 'ID contains'
    parts.push(`${parsed}: ${idQ.length > 40 ? `${idQ.slice(0, 40)}…` : idQ}`)
  }
  if (f?.familyKind) {
    const fam = BANK_FAMILY_KIND_OPTIONS.find((e) => e.id === f.familyKind)
    parts.push(fam?.label || f.familyKind)
  }
  if (f?.examId) {
    const exam = BANK_EXAM_FILTER_OPTIONS.find((e) => e.id === f.examId)
    parts.push(exam?.label || f.examId)
  }
  if (f?.toughnessBand) parts.push(f.toughnessBand)
  if (f?.sourceKind) parts.push(f.sourceKind)
  if (f?.dateFrom || f?.dateTo) {
    if (f.dateFrom && f.dateTo) parts.push(`date ${f.dateFrom} → ${f.dateTo}`)
    else if (f.dateFrom) parts.push(`date from ${f.dateFrom}`)
    else parts.push(`date until ${f.dateTo}`)
  }
  if (f?.uploadedBy) {
    parts.push(`operator: ${opts.operatorLabel || f.uploadedBy}`)
  }
  if (f?.bankStatus === 'draft') parts.push('draft only')
  else if (f?.bankStatus === 'published') parts.push('published only')
  return parts.length ? parts.join(' · ') : 'all questions in this tab'
}

/**
 * @param {import('../data/tests').Question[]} questions
 */
/**
 * @param {import('../data/tests').Question[]} questions
 */
export function filterClassifiedQuestions(questions) {
  return bankListVisibleQuestions(questions, {}).filter((q) => isQuestionMetaClassified(q))
}

/** @param {import('../data/tests').Question[]} questions */
export function filterUntaggedQuestions(questions) {
  return bankListVisibleQuestions(questions, {}).filter((q) => isQuestionMetaUntagged(q))
}

/** Sort by saved time (newest first). */
export function sortQuestionsByRecent(questions) {
  return [...questions].sort((a, b) => questionSortTime(b) - questionSortTime(a))
}

export function collectQuestionTypesInBank(questions) {
  const set = new Set()
  for (const q of questions) {
    set.add(q.questionType ?? 'single_correct')
  }
  const rank = (id) => TYPE_RANK.get(id) ?? 99
  return [...set].sort((a, b) => rank(a) - rank(b))
}

export { collectSourcesInBank } from './questionMetadata.js'
