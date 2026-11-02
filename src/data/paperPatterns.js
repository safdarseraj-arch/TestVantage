/**
 * Custom paper blueprints — each paper can have its own question-type counts and marking.
 * Defaults seed into localStorage; admins edit via Paper Pattern Designer.
 *
 * @typedef {import('./questionTypes').QuestionTypeId} QuestionTypeId
 * @typedef {import('./questionTypes').MarkingScheme} MarkingScheme
 * @typedef {import('./examPatterns').QuestionTypeSlot} QuestionTypeSlot
 *
 * @typedef {{
 *   id: string
 *   baseExamPatternId: string
 *   name: string
 *   description?: string
 *   totalMinutes?: number
 *   totalCap?: number
 *   durationMinutes?: number
 *   isBuiltIn?: boolean
 *   slots: QuestionTypeSlot[]
 * }} PaperPattern
 */

/** @type {PaperPattern[]} */
export const DEFAULT_PAPER_PATTERNS = [
  {
    id: 'jee-adv-p1-standard',
    baseExamPatternId: 'jee-advanced',
    name: 'JEE Advanced — Paper 1 (Standard mix)',
    description: 'SCQ + MSQ + Matrix + Integer + Numerical — typical Paper 1 style.',
    totalMinutes: 180,
    totalCap: 20,
    durationMinutes: 40,
    isBuiltIn: true,
    slots: [
      { section: 'Section A — SCQ', questionTypeId: 'single_correct', count: 6, marking: { correct: 3, wrong: -1, unattempted: 0 } },
      { section: 'Section B — MSQ', questionTypeId: 'multiple_correct', count: 4, marking: { correct: 4, wrong: -2, unattempted: 0, partial: 1 } },
      { section: 'Section C — Matrix', questionTypeId: 'matrix_match', count: 2, marking: { correct: 3, wrong: -1, unattempted: 0 } },
      { section: 'Section D — Integer', questionTypeId: 'integer', count: 4, marking: { correct: 3, wrong: 0, unattempted: 0 } },
      { section: 'Section E — Numerical', questionTypeId: 'numerical', count: 4, marking: { correct: 3, wrong: 0, unattempted: 0 } },
    ],
  },
  {
    id: 'jee-adv-p2-comprehension',
    baseExamPatternId: 'jee-advanced',
    name: 'JEE Advanced — Paper 2 (Comprehension heavy)',
    description: 'More passage blocks + mixed SCQ/MSQ — alternate Paper 2 style.',
    totalMinutes: 180,
    totalCap: 18,
    durationMinutes: 45,
    isBuiltIn: true,
    slots: [
      { section: 'Passage block', questionTypeId: 'passage', count: 6, marking: { correct: 3, wrong: -1, unattempted: 0 } },
      { section: 'SCQ', questionTypeId: 'single_correct', count: 4, marking: { correct: 3, wrong: -1, unattempted: 0 } },
      { section: 'MSQ', questionTypeId: 'multiple_correct', count: 3, marking: { correct: 4, wrong: -2, unattempted: 0, partial: 1 } },
      { section: 'Integer', questionTypeId: 'integer', count: 3, marking: { correct: 3, wrong: 0, unattempted: 0 } },
      { section: 'Numerical', questionTypeId: 'numerical', count: 2, marking: { correct: 3, wrong: 0, unattempted: 0 } },
    ],
  },
  {
    id: 'jee-adv-p1-2023-style',
    baseExamPatternId: 'jee-advanced',
    name: 'JEE Advanced — Paper 1 (2023-style +4/−1 MSQ)',
    description: 'Example variant: higher SCQ weight, +4/−2 MSQ marking.',
    totalMinutes: 180,
    totalCap: 18,
    durationMinutes: 40,
    isBuiltIn: true,
    slots: [
      { section: 'SCQ', questionTypeId: 'single_correct', count: 8, marking: { correct: 4, wrong: -1, unattempted: 0 } },
      { section: 'MSQ', questionTypeId: 'multiple_correct', count: 3, marking: { correct: 4, wrong: -2, unattempted: 0, partial: 2 } },
      { section: 'Matrix', questionTypeId: 'matrix_match', count: 2, marking: { correct: 4, wrong: -2, unattempted: 0 } },
      { section: 'Integer', questionTypeId: 'integer', count: 3, marking: { correct: 4, wrong: 0, unattempted: 0 } },
      { section: 'Numerical', questionTypeId: 'numerical', count: 2, marking: { correct: 4, wrong: 0, unattempted: 0 } },
    ],
  },
]

/** @param {PaperPattern} pattern */
export function getPaperPatternSlotTotal(pattern) {
  return pattern.slots.reduce((sum, s) => sum + s.count, 0)
}

/** @param {PaperPattern} pattern */
export function validatePaperPattern(pattern) {
  const sum = getPaperPatternSlotTotal(pattern)
  const cap = pattern.totalCap ?? sum
  if (sum !== cap) {
    return { ok: false, error: `Slot counts sum to ${sum} but total cap is ${cap}. They must match.` }
  }
  if (pattern.slots.length === 0) {
    return { ok: false, error: 'Add at least one question-type slot.' }
  }
  for (const slot of pattern.slots) {
    if (slot.count < 1) return { ok: false, error: 'Each slot needs count ≥ 1.' }
    if (!slot.questionTypeId) return { ok: false, error: 'Each slot needs a question type.' }
  }
  return { ok: true, total: sum }
}
