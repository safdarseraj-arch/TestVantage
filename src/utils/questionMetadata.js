import { getQuestionTypesForPicker } from '../data/questionTypes.js'
import { ALL_SUBJECTS, LEGACY_SUBJECTS } from '../data/subjects.js'
import { getAllExamPatterns, loadCustomSubjects } from './customBankMeta.js'

/** Subjects that belong on NEET (not PCM JEE-only). */
export const NEET_SUBJECT_IDS = new Set(['biology', 'botany', 'zoology'])

/**
 * @param {string[]} examIds
 */
export function getSubjectsForExams(examIds) {
  if (!examIds?.length) return ALL_SUBJECTS
  const allowed = new Set()
  for (const id of examIds) {
    const pattern = getAllExamPatterns().find((p) => p.id === id)
    if (pattern) pattern.subjects.forEach((s) => allowed.add(s))
  }
  if (allowed.size === 0) return ALL_SUBJECTS
  return ALL_SUBJECTS.filter((s) => allowed.has(s.id))
}

/**
 * Subjects for the metadata dropdown: exam filter + legacy ids from saved questions.
 * @param {string[]} examIds
 * @param {import('../data/tests').Question[]} [bankQuestions]
 */
export function getSubjectOptionsForPicker(examIds, bankQuestions = []) {
  const byId = new Map(getSubjectsForExams(examIds).map((s) => [s.id, s]))
  for (const s of loadCustomSubjects()) {
    const base = byId.get(s.id) ?? [...ALL_SUBJECTS, ...LEGACY_SUBJECTS].find((x) => x.id === s.id)
    byId.set(s.id, { ...(base ?? { id: s.id, color: '#64748b' }), ...s })
  }
  // NEET compose / admin entry: offer Biology alongside Botany & Zoology
  const wantsNeet =
    !examIds?.length ||
    examIds.includes('neet') ||
    [...byId.keys()].some((id) => NEET_SUBJECT_IDS.has(id))
  if (wantsNeet && !byId.has('biology')) {
    const legacy = LEGACY_SUBJECTS.find((s) => s.id === 'biology')
    byId.set('biology', { ...(legacy ?? { id: 'biology', color: '#059669' }), label: 'Biology' })
  } else if (byId.has('biology')) {
    const cur = byId.get('biology')
    if (cur?.label?.includes('legacy')) {
      byId.set('biology', { ...cur, label: 'Biology' })
    }
  }
  for (const q of bankQuestions) {
    const id = q.subject?.trim()
    if (!id || byId.has(id)) continue
    const known = [...ALL_SUBJECTS, ...LEGACY_SUBJECTS].find((s) => s.id === id)
    byId.set(id, known ?? { id, label: id, color: '#64748b' })
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Upload / bank metadata: always offer every question type.
 * Exam tags still decide which papers/tests can pick the question later.
 * @param {string[]} [_examIds]
 */
export function getQuestionTypeOptionsForExams(_examIds) {
  return getQuestionTypesForPicker()
}

/** Default exam tag(s) for the metadata panel from subject. */
export function defaultExamIdsForSubject(subject) {
  const id = String(subject ?? '').trim()
  if (NEET_SUBJECT_IDS.has(id)) return ['neet']
  return ['jee-advanced']
}

/**
 * Keep the type the user already chose while uploading.
 * Paper blueprints still use getAllowedQuestionTypeIdsForExams separately.
 */
export function defaultQuestionTypeForExams(_examIds, currentType) {
  return currentType || 'single_correct'
}

/**
 * Sync exam + question type when subject changes (Biology → NEET, PCM → JEE Advanced).
 * @param {string} subject
 * @param {{ examIds: string[], questionType: string }} current
 */
export function metadataDefaultsForSubject(subject, current) {
  const examIds = defaultExamIdsForSubject(subject)
  const questionType = defaultQuestionTypeForExams(examIds, current.questionType)
  return { examIds, questionType }
}

/** @param {number | string | undefined | null} level */
export function formatToughnessLabel(level) {
  const n = Number(level)
  if (!n || n < 1 || n > 10) return ''
  const band = n <= 3 ? 'Easy' : n <= 7 ? 'Moderate' : 'Tough'
  return `T${n} · ${band}`
}

/** @param {string | undefined | null} value */
export function normalizeSource(value) {
  const s = String(value ?? '').trim()
  return s || undefined
}

/** @param {import('../data/tests').Question[]} questions */
export function collectSourcesInBank(questions) {
  const set = new Set()
  for (const q of questions ?? []) {
    const s = normalizeSource(q.source)
    if (s) set.add(s)
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

/**
 * @param {{ subject?: string, section?: string, chapter?: string, topic?: string, questionType?: string, examIds?: string[], toughnessLevel?: number | string, source?: string }} meta
 * @returns {string[]}
 */
export function validateQuestionMetadata(meta, { requireQuestionType = true } = {}) {
  const errors = []
  if (!meta.subject?.trim()) errors.push('Subject is required.')
  if (requireQuestionType && !meta.questionType?.trim()) errors.push('Question type is required.')
  if (!meta.examIds?.length) errors.push('Select at least one exam.')
  return errors
}

/**
 * @param {{ questionType?: string }[]} items
 * @returns {string[]}
 */
export function validateBulkPreviewQuestionTypes(items) {
  const errors = []
  items.forEach((q, i) => {
    if (!q.questionType?.trim()) errors.push(`Set question type for Q${i + 1} in the preview list.`)
  })
  return errors
}

/**
 * @param {import('../data/tests').Question} q
 * @param {{ subject: string, section?: string, chapter?: string, topic?: string, questionType: string, examIds: string[], toughnessLevel?: number | string, source?: string }} defaults
 */
export function applyQuestionMetadata(q, defaults) {
  const qLevel = q.toughnessLevel != null && q.toughnessLevel !== '' ? Number(q.toughnessLevel) : undefined
  const dLevel =
    defaults.toughnessLevel != null && defaults.toughnessLevel !== ''
      ? Number(defaults.toughnessLevel)
      : undefined
  const level = qLevel >= 1 && qLevel <= 10 ? qLevel : dLevel >= 1 && dLevel <= 10 ? dLevel : undefined
  const qSource = normalizeSource(q.source)
  const dSource = normalizeSource(defaults.source)

  return {
    ...q,
    subject: q.subject?.trim() ? q.subject : defaults.subject,
    section: q.section?.trim() ? q.section.trim() : defaults.section?.trim() || undefined,
    chapter: q.chapter?.trim() ? q.chapter.trim() : defaults.chapter?.trim() || undefined,
    topic: q.topic?.trim() ? q.topic.trim() : defaults.topic?.trim() || undefined,
    questionType: q.questionType ?? defaults.questionType,
    examIds: q.examIds?.length ? q.examIds : [...defaults.examIds],
    toughnessLevel: level,
    source: qSource ?? dSource,
  }
}

/** @param {string[]} examIds */
export function formatExamLabels(examIds) {
  if (!examIds?.length) return '—'
  return examIds
    .map((id) => getAllExamPatterns().find((p) => p.id === id)?.shortName ?? id)
    .join(', ')
}
