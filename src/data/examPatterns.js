import { CANONICAL_QUESTION_TYPE_IDS, formatMarkingLabel } from './questionTypes.js'

/** @typedef {'jee-main' | 'jee-advanced' | 'neet'} ExamPatternId */

/**
 * @typedef {import('./questionTypes').MarkingScheme} MarkingScheme
 * @typedef {import('./questionTypes').QuestionTypeId} QuestionTypeId
 */

/**
 * @typedef {Object} QuestionTypeSlot
 * @property {QuestionTypeId} questionTypeId
 * @property {number} count
 * @property {MarkingScheme} marking
 * @property {string} [section]
 */

/**
 * @typedef {Object} ExamPattern
 * @property {ExamPatternId} id
 * @property {string} name
 * @property {string} shortName
 * @property {string} description
 * @property {string[]} subjects
 * @property {number} totalMinutes
 * @property {QuestionTypeSlot[]} questionSlots
 * @property {string} color
 */

/**
 * Bank metadata: question types per exam (canonical order: SCQ … PSCQ).
 * @type {Record<ExamPatternId, QuestionTypeId[]>}
 */
export const EXAM_METADATA_QUESTION_TYPES = {
  'jee-main': ['single_correct', 'integer'],
  neet: ['single_correct', 'integer', 'passage_scq'],
  'jee-advanced': [...CANONICAL_QUESTION_TYPE_IDS],
}

const TYPE_SHORT_LABEL = {
  single_correct: 'SCQ',
  true_false: 'T/F',
  multiple_correct: 'MCQ',
  matrix_match: 'MTC',
  integer: 'IVQ',
  numerical: 'NVQ',
  passage_integer: 'PIVQ',
  passage_scq: 'PSCQ',
}

/** @param {string[]} examIds @returns {QuestionTypeId[] | null} null = all types (no exam tag) */
export function getAllowedQuestionTypeIdsForExams(examIds) {
  if (!examIds?.length) return null
  const out = new Set()
  let hasConfigured = false
  for (const id of examIds) {
    const fixed = EXAM_METADATA_QUESTION_TYPES[id]
    if (fixed?.length) {
      hasConfigured = true
      fixed.forEach((t) => out.add(t))
      continue
    }
    const pattern = EXAM_PATTERNS.find((p) => p.id === id)
    pattern?.questionSlots.forEach((s) => {
      out.add(s.questionTypeId)
      if (s.questionTypeId === 'passage') {
        out.add('passage_scq')
        out.add('passage_integer')
      }
    })
  }
  if (!hasConfigured && out.size === 0) return null
  return [...out]
}

/** Hint under Type of question for the current exam selection (upload allows all types). */
export function getExamQuestionTypeHint(examIds) {
  if (!examIds?.length) {
    return 'Upload any type (SCQ, T/F, MCQ, MTC, IVQ, NVQ, PIVQ, PSCQ). Tick exam tags so the right tests can find this question.'
  }
  const paperTypes = getAllowedQuestionTypeIdsForExams(examIds) ?? []
  const labels = CANONICAL_QUESTION_TYPE_IDS.filter((id) => paperTypes.includes(id)).map(
    (id) => TYPE_SHORT_LABEL[id] ?? id,
  )
  const paperHint = labels.length
    ? `Typical ${examIds.length === 1 ? 'paper' : 'papers'} use: ${labels.join(', ')}.`
    : ''
  return `You can upload any type. ${paperHint} T/F is CDF-only (toughness 1).`.trim()
}

/** @type {ExamPattern[]} */
export const EXAM_PATTERNS = [
  {
    id: 'jee-main',
    name: 'JEE Main',
    shortName: 'JEE Main',
    description: 'PCM · 75 questions · 180 min · MCQ + Numerical per subject.',
    subjects: ['physics', 'chemistry', 'mathematics'],
    totalMinutes: 180,
    color: '#4f46e5',
    questionSlots: [
      {
        section: 'Physics',
        questionTypeId: 'single_correct',
        count: 20,
        marking: { correct: 4, wrong: -1, unattempted: 0 },
      },
      {
        section: 'Physics',
        questionTypeId: 'numerical',
        count: 5,
        marking: { correct: 4, wrong: 0, unattempted: 0 },
      },
      {
        section: 'Chemistry',
        questionTypeId: 'single_correct',
        count: 20,
        marking: { correct: 4, wrong: -1, unattempted: 0 },
      },
      {
        section: 'Chemistry',
        questionTypeId: 'numerical',
        count: 5,
        marking: { correct: 4, wrong: 0, unattempted: 0 },
      },
      {
        section: 'Mathematics',
        questionTypeId: 'single_correct',
        count: 20,
        marking: { correct: 4, wrong: -1, unattempted: 0 },
      },
      {
        section: 'Mathematics',
        questionTypeId: 'numerical',
        count: 5,
        marking: { correct: 4, wrong: 0, unattempted: 0 },
      },
    ],
  },
  {
    id: 'jee-advanced',
    name: 'JEE Advanced',
    shortName: 'JEE Adv',
    description: 'PCM · Paper-specific mix — configure each paper’s types & marking in Admin → Paper Patterns.',
    subjects: ['physics', 'chemistry', 'mathematics'],
    totalMinutes: 180,
    color: '#7c3aed',
    questionSlots: [
      {
        section: 'Paper 1 (per subject mix)',
        questionTypeId: 'single_correct',
        count: 6,
        marking: { correct: 3, wrong: -1, unattempted: 0 },
      },
      {
        section: 'Paper 1',
        questionTypeId: 'multiple_correct',
        count: 4,
        marking: { correct: 4, wrong: -2, unattempted: 0, partial: 1 },
      },
      {
        section: 'Paper 1',
        questionTypeId: 'matrix_match',
        count: 2,
        marking: { correct: 3, wrong: -1, unattempted: 0 },
      },
      {
        section: 'Paper 1',
        questionTypeId: 'integer',
        count: 4,
        marking: { correct: 3, wrong: 0, unattempted: 0 },
      },
      {
        section: 'Paper 1',
        questionTypeId: 'numerical',
        count: 4,
        marking: { correct: 3, wrong: 0, unattempted: 0 },
      },
      {
        section: 'Paper 2',
        questionTypeId: 'passage',
        count: 6,
        marking: { correct: 3, wrong: -1, unattempted: 0 },
      },
    ],
  },
  {
    id: 'neet',
    name: 'NEET',
    shortName: 'NEET',
    description: 'PCB · 200 questions · 200 min · Single correct MCQ.',
    subjects: ['physics', 'chemistry', 'botany', 'zoology'],
    totalMinutes: 200,
    color: '#059669',
    questionSlots: [
      {
        section: 'Physics',
        questionTypeId: 'single_correct',
        count: 45,
        marking: { correct: 4, wrong: -1, unattempted: 0 },
      },
      {
        section: 'Chemistry',
        questionTypeId: 'single_correct',
        count: 45,
        marking: { correct: 4, wrong: -1, unattempted: 0 },
      },
      {
        section: 'Biology',
        questionTypeId: 'single_correct',
        count: 90,
        marking: { correct: 4, wrong: -1, unattempted: 0 },
      },
      {
        section: 'Biology',
        questionTypeId: 'passage',
        count: 20,
        marking: { correct: 4, wrong: -1, unattempted: 0 },
      },
    ],
  },
]

/** @param {string} id */
export function getExamPattern(id) {
  return EXAM_PATTERNS.find((p) => p.id === id) ?? EXAM_PATTERNS[0]
}

/** @param {ExamPattern} pattern */
export function getPatternTotalQuestions(pattern) {
  return pattern.questionSlots.reduce((sum, s) => sum + s.count, 0)
}

/** @param {ExamPattern} pattern */
export function getPatternMaxScore(pattern) {
  return pattern.questionSlots.reduce((sum, s) => sum + s.count * s.marking.correct, 0)
}

/**
 * @param {ExamPattern} pattern
 * @param {string} questionTypeId
 */
export function getSlotMarking(pattern, questionTypeId) {
  const slot = pattern.questionSlots.find((s) => s.questionTypeId === questionTypeId)
  return slot?.marking ?? getExamPattern(pattern.id).questionSlots[0].marking
}

/** @param {ExamPattern} pattern */
export function getPatternBlueprintRows(pattern) {
  return pattern.questionSlots.map((slot) => ({
    section: slot.section ?? '—',
    typeId: slot.questionTypeId,
    count: slot.count,
    markingLabel: formatMarkingLabel(slot.marking),
    minutesShare: Math.round((slot.count / getPatternTotalQuestions(pattern)) * pattern.totalMinutes),
  }))
}

/** Legacy: first slot marking for simple tests */
export function getDefaultPatternMarking(pattern) {
  return pattern.questionSlots[0]?.marking ?? { correct: 4, wrong: -1, unattempted: 0 }
}

export function getPatternMarkingLabel(pattern) {
  const types = [...new Set(pattern.questionSlots.map((s) => s.questionTypeId))]
  if (types.length === 1) {
    return formatMarkingLabel(pattern.questionSlots[0].marking)
  }
  return 'Mixed (see blueprint)'
}
