/**
 * Student “Why I got it wrong” tags — source of truth for Error DNA when set.
 * Soft suggestions map from auto behavioural classifier (silly / overtime / concept / calc).
 */

/** @typedef {'question_misread'|'question_misunderstanding'|'conceptual_error'|'calculation_error'|'formula_error'|'guess'} WrongReasonTagId */
/** @typedef {'silly'|'overtime'|'concept'|'calc'|'other'} AutoErrorDnaType */

/** @type {{ id: WrongReasonTagId, label: string, short: string, color: string, hint: string }[]} */
export const WRONG_REASON_TAGS = [
  {
    id: 'question_misread',
    label: 'Question Misread',
    short: 'Misread',
    color: '#e11d48',
    hint: 'Missed a word, sign, or condition',
  },
  {
    id: 'question_misunderstanding',
    label: 'Question Misunderstanding',
    short: 'Misunderstood',
    color: '#d97706',
    hint: 'Knew the topic but read the ask wrong',
  },
  {
    id: 'conceptual_error',
    label: 'Conceptual Error',
    short: 'Concept',
    color: '#7c3aed',
    hint: 'Wrong idea or method',
  },
  {
    id: 'calculation_error',
    label: 'Calculation error',
    short: 'Calc',
    color: '#2563eb',
    hint: 'Arithmetic / algebra slip',
  },
  {
    id: 'formula_error',
    label: 'Formula error',
    short: 'Formula',
    color: '#0d9488',
    hint: 'Wrong or misapplied formula',
  },
  {
    id: 'guess',
    label: 'Guess',
    short: 'Guess',
    color: '#64748b',
    hint: 'Educated or blind guess',
  },
]

/** @type {Record<WrongReasonTagId, { name: string, color: string, hint: string }>} */
export const WRONG_REASON_META = Object.fromEntries(
  WRONG_REASON_TAGS.map((t) => [t.id, { name: t.label, color: t.color, hint: t.hint }]),
)

/** Behavioural auto buckets (kept when student has not tagged). */
export const AUTO_ERROR_DNA_META = {
  silly: { name: 'Silly / avoidable', color: '#e11d48', hint: 'Easy or rushed wrongs' },
  overtime: { name: 'Overtime wrong', color: '#d97706', hint: 'Spent too long, still wrong' },
  concept: { name: 'Concept gap', color: '#7c3aed', hint: 'Solid time, wrong idea' },
  calc: { name: 'Calc / numerical', color: '#2563eb', hint: 'Integer / numerical slips' },
  other: { name: 'Other', color: '#64748b', hint: 'Unclear pattern' },
}

/** Combined chart meta: student tags + behavioural fallbacks. */
export const ERROR_DNA_CHART_META = {
  ...WRONG_REASON_META,
  ...AUTO_ERROR_DNA_META,
}

/** @param {string | null | undefined} id */
export function isWrongReasonTagId(id) {
  return WRONG_REASON_TAGS.some((t) => t.id === id)
}

/** @param {string | null | undefined} id */
export function getWrongReasonLabel(id) {
  return WRONG_REASON_TAGS.find((t) => t.id === id)?.label ?? null
}

/**
 * Soft suggestion from auto Error DNA type.
 * silly → Guess; calc → Calculation; concept → Conceptual; overtime → Misunderstanding.
 * @param {AutoErrorDnaType | string | null | undefined} autoType
 * @returns {WrongReasonTagId | null}
 */
export function suggestWrongReasonFromAuto(autoType) {
  switch (autoType) {
    case 'silly':
      return 'guess'
    case 'calc':
      return 'calculation_error'
    case 'concept':
      return 'conceptual_error'
    case 'overtime':
      return 'question_misunderstanding'
    default:
      return null
  }
}

/**
 * Map stored on attempt: questionId → tag id.
 * @param {Record<string, string> | null | undefined} map
 * @param {string} questionId
 * @returns {WrongReasonTagId | null}
 */
export function getWrongReasonForQuestion(map, questionId) {
  const raw = map?.[questionId]
  return isWrongReasonTagId(raw) ? /** @type {WrongReasonTagId} */ (raw) : null
}
