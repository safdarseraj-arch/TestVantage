/**
 * PYQ chapter test blueprints — edit this file to fix question-type mix per exam.
 * Each slot `count` must sum to `totalCap` for that exam.
 *
 * @typedef {import('./questionTypes').QuestionTypeId} QuestionTypeId
 * @typedef {import('./questionTypes').MarkingScheme} MarkingScheme
 *
 * @typedef {{
 *   questionTypeId: QuestionTypeId
 *   count: number
 *   section?: string
 *   marking: MarkingScheme
 * }} PyqChapterPatternSlot
 *
 * @typedef {{
 *   totalCap: number
 *   durationMinutes?: number
 *   note?: string
 *   slots: PyqChapterPatternSlot[]
 * }} PyqChapterPattern
 */

/** @type {Record<string, PyqChapterPattern>} */
export const PYQ_CHAPTER_PATTERNS = {
  'jee-main': {
    totalCap: 25,
    durationMinutes: 50,
    note: 'JEE Main chapter slice: 20 MCQ + 5 Numerical (per subject paper style).',
    slots: [
      {
        section: 'MCQ',
        questionTypeId: 'single_correct',
        count: 20,
        marking: { correct: 4, wrong: -1, unattempted: 0 },
      },
      {
        section: 'Numerical',
        questionTypeId: 'numerical',
        count: 5,
        marking: { correct: 4, wrong: 0, unattempted: 0 },
      },
    ],
  },
  'jee-advanced': {
    totalCap: 18,
    durationMinutes: 40,
    note: 'JEE Advanced chapter mix: SCQ + MSQ + Matrix + Integer + Numerical.',
    slots: [
      {
        section: 'SCQ',
        questionTypeId: 'single_correct',
        count: 6,
        marking: { correct: 3, wrong: -1, unattempted: 0 },
      },
      {
        section: 'MSQ',
        questionTypeId: 'multiple_correct',
        count: 4,
        marking: { correct: 4, wrong: -2, unattempted: 0, partial: 1 },
      },
      {
        section: 'Matrix',
        questionTypeId: 'matrix_match',
        count: 2,
        marking: { correct: 3, wrong: -1, unattempted: 0 },
      },
      {
        section: 'Integer',
        questionTypeId: 'integer',
        count: 3,
        marking: { correct: 3, wrong: 0, unattempted: 0 },
      },
      {
        section: 'Numerical',
        questionTypeId: 'numerical',
        count: 3,
        marking: { correct: 3, wrong: 0, unattempted: 0 },
      },
    ],
  },
  neet: {
    totalCap: 25,
    durationMinutes: 45,
    note: 'NEET chapter: mostly MCQ + short passage block.',
    slots: [
      {
        section: 'MCQ',
        questionTypeId: 'single_correct',
        count: 22,
        marking: { correct: 4, wrong: -1, unattempted: 0 },
      },
      {
        section: 'Passage',
        questionTypeId: 'passage',
        count: 3,
        marking: { correct: 4, wrong: -1, unattempted: 0 },
      },
    ],
  },
}

/** @param {string} examPatternId */
export function getPyqChapterPattern(examPatternId) {
  return PYQ_CHAPTER_PATTERNS[examPatternId] ?? PYQ_CHAPTER_PATTERNS['jee-main']
}

/** @param {PyqChapterPattern} pattern */
export function getPyqChapterPatternTotal(pattern) {
  return pattern.slots.reduce((sum, s) => sum + s.count, 0)
}

/** Validate slot sums (dev console warning only). */
export function assertPyqChapterPatterns() {
  for (const [id, p] of Object.entries(PYQ_CHAPTER_PATTERNS)) {
    const sum = getPyqChapterPatternTotal(p)
    if (sum !== p.totalCap) {
      console.warn(
        `[TestVantages] PYQ chapter pattern "${id}": slots sum ${sum} ≠ totalCap ${p.totalCap}. Fix pyqChapterPatterns.js`,
      )
    }
  }
}

assertPyqChapterPatterns()

/** Blueprint rows for UI */
export function getPyqChapterPatternRows(examPatternId) {
  const pattern = getPyqChapterPattern(examPatternId)
  return pattern.slots.map((slot) => ({
    section: slot.section ?? slot.questionTypeId,
    typeId: slot.questionTypeId,
    count: slot.count,
    marking: slot.marking,
  }))
}
