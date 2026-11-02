/** @typedef {'single_correct' | 'true_false' | 'multiple_correct' | 'matrix_match' | 'passage' | 'passage_integer' | 'passage_scq' | 'integer' | 'numerical'} QuestionTypeId */

/** Fixed options for True/False questions. */
export const TRUE_FALSE_OPTIONS = ['TRUE', 'FALSE']

/** @param {string} [type] */
export function isTrueFalseQuestionType(type) {
  return type === 'true_false'
}

/** Single-answer MCQ-style types (one correct option index). */
export function isSingleAnswerOptionType(type) {
  return type === 'single_correct' || type === 'passage_scq' || type === 'true_false'
}

/**
 * @typedef {Object} MarkingScheme
 * @property {number} correct
 * @property {number} wrong
 * @property {number} unattempted
 * @property {number} [partial]
 */

/**
 * @typedef {Object} QuestionTypeDef
 * @property {QuestionTypeId} id
 * @property {string} name
 * @property {string} shortName
 * @property {string} description
 * @property {MarkingScheme} defaultMarking
 * @property {string} markingLabel
 */

/** Canonical bank question types (display order). */
export const CANONICAL_QUESTION_TYPE_IDS = [
  'single_correct',
  'true_false',
  'multiple_correct',
  'matrix_match',
  'integer',
  'numerical',
  'passage_integer',
  'passage_scq',
]

/** @type {QuestionTypeDef[]} */
export const QUESTION_TYPES = [
  {
    id: 'single_correct',
    name: 'SCQ',
    shortName: 'SCQ',
    description: 'Single Option Correct — choose exactly one option (A/B/C/D).',
    defaultMarking: { correct: 4, wrong: -1, unattempted: 0 },
    markingLabel: '+4 / −1 / 0',
  },
  {
    id: 'true_false',
    name: 'T/F',
    shortName: 'T/F',
    description: 'True or False — statement in the stem; exactly two options (TRUE / FALSE).',
    defaultMarking: { correct: 4, wrong: -1, unattempted: 0 },
    markingLabel: '+4 / −1 / 0',
  },
  {
    id: 'multiple_correct',
    name: 'MCQ',
    shortName: 'MCQ',
    description:
      'One or More Options Correct — partial +1/+2/+3; full +4 if all correct; −ve if any wrong option marked.',
    defaultMarking: { correct: 4, wrong: -2, unattempted: 0, partial: 1 },
    markingLabel: 'Partial +1/+2/+3 · Full +4 · Wrong opt −2',
  },
  {
    id: 'matrix_match',
    name: 'MTC',
    shortName: 'MTC',
    description:
      'Matrix Match the Column — Column I (rows A–D) × Column II (4 or 5 entries); grid or options A–D.',
    defaultMarking: { correct: 4, wrong: -2, unattempted: 0 },
    markingLabel: '+4 / −2 / 0 (all rows must match)',
  },
  {
    id: 'integer',
    name: 'IVQ',
    shortName: 'IVQ',
    description: 'Integer Value Question — non-negative integer (0–9999, up to 4 digits). No A–D options.',
    defaultMarking: { correct: 4, wrong: 0, unattempted: 0 },
    markingLabel: '+4 / 0 / 0',
  },
  {
    id: 'numerical',
    name: 'NVQ',
    shortName: 'NVQ',
    description:
      'Numerical Value Question — numerical answer (optional −, decimals, up to 6 digits). No A–D options.',
    defaultMarking: { correct: 4, wrong: 0, unattempted: 0 },
    markingLabel: '+4 / 0 / 0',
  },
  {
    id: 'passage_integer',
    name: 'PIVQ',
    shortName: 'PIVQ',
    description:
      'Passage Based Integer/Numerical — shared passage; each sub-question accepts an integer (0–9999) or decimal answer, scored separately.',
    defaultMarking: { correct: 4, wrong: 0, unattempted: 0 },
    markingLabel: '+4 / 0 / 0',
  },
  {
    id: 'passage_scq',
    name: 'PSCQ',
    shortName: 'PSCQ',
    description: 'Passage Based SCQ — shared passage; SCQ sub-questions with A–D (each scored separately).',
    defaultMarking: { correct: 4, wrong: -1, unattempted: 0 },
    markingLabel: '+4 / −1 / 0',
  },
]

/** Legacy bank rows saved as questionType "passage". */
const LEGACY_PASSAGE_TYPE = {
  id: 'passage',
  name: 'Passage',
  shortName: 'Passage',
  description: 'Legacy passage type — use PIVQ or PSCQ for new questions.',
  defaultMarking: { correct: 4, wrong: -1, unattempted: 0 },
  markingLabel: '+4 / −1 / 0',
}

/** @param {string} [id] */
export function isPassageMetadataType(id) {
  return id === 'passage' || id === 'passage_integer' || id === 'passage_scq'
}

/**
 * PIVQ / PSCQ for the whole passage set (metadata + every saved sub-question).
 * @param {string} qType — value from metadata form
 * @param {{ options?: string[] }[]} [subQuestions]
 * @returns {'passage_integer' | 'passage_scq'}
 */
export function resolvePassageSetMetaType(qType, subQuestions = []) {
  if (qType === 'passage_integer') return 'passage_integer'
  if (qType === 'passage_scq') return 'passage_scq'
  if (qType === 'passage') return 'passage_scq'
  if (isPassageMetadataType(qType)) return qType

  const allOptionless =
    subQuestions.length > 0 &&
    subQuestions.every((sq) => (sq.options ?? []).every((o) => !String(o ?? '').trim()))

  return allOptionless ? 'passage_integer' : 'passage_scq'
}

/** @param {string} qType @param {{ options?: string[] }[]} [subQuestions] */
export function isPassageSetIntegerMode(qType, subQuestions = []) {
  return resolvePassageSetMetaType(qType, subQuestions) === 'passage_integer'
}

const CUSTOM_TYPE_LABELS_KEY = 'testvantage-question-type-labels'

/** @returns {Record<string, { name?: string, shortName?: string }>} */
export function loadCustomQuestionTypeLabels() {
  try {
    const raw = localStorage.getItem(CUSTOM_TYPE_LABELS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveCustomQuestionTypeLabels(data) {
  localStorage.setItem(CUSTOM_TYPE_LABELS_KEY, JSON.stringify(data))
}

/** @param {QuestionTypeDef} def */
function applyCustomTypeLabels(def) {
  const custom = loadCustomQuestionTypeLabels()[def.id]
  if (!custom) return def
  return {
    ...def,
    ...(custom.name?.trim() ? { name: custom.name.trim() } : {}),
    ...(custom.shortName?.trim() ? { shortName: custom.shortName.trim() } : {}),
  }
}

/** Sort picker options into canonical order (SCQ … PSCQ). */
function sortByCanonicalOrder(types) {
  const rank = new Map(CANONICAL_QUESTION_TYPE_IDS.map((id, i) => [id, i]))
  return [...types].sort(
    (a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99),
  )
}

/** All types for metadata dropdown (includes custom display names). */
export function getQuestionTypesForPicker() {
  return sortByCanonicalOrder(QUESTION_TYPES.map((t) => applyCustomTypeLabels(t)))
}

/**
 * Rename how a question type appears in metadata tags and dropdowns (id unchanged).
 * @returns {{ ok: boolean, error?: string }}
 */
export function renameQuestionTypeLabel(typeId, newName, newShortName = '') {
  const id = String(typeId ?? '').trim()
  const name = String(newName ?? '').trim()
  const shortName = String(newShortName ?? '').trim()
  if (!id) return { ok: false, error: 'Select a question type first.' }
  if (!name) return { ok: false, error: 'Name cannot be empty.' }

  const base =
    id === 'passage'
      ? LEGACY_PASSAGE_TYPE
      : QUESTION_TYPES.find((t) => t.id === id)
  if (!base) return { ok: false, error: 'Unknown question type.' }
  if (name === base.name && (!shortName || shortName === base.shortName)) {
    return { ok: false, error: 'New name is the same as the current name.' }
  }

  const data = loadCustomQuestionTypeLabels()
  data[id] = {
    name,
    ...(shortName ? { shortName } : {}),
  }
  saveCustomQuestionTypeLabels(data)
  return { ok: true }
}

/** Restore built-in label for a question type. */
export function resetQuestionTypeLabel(typeId) {
  const data = loadCustomQuestionTypeLabels()
  delete data[typeId]
  saveCustomQuestionTypeLabels(data)
}

export function hasCustomQuestionTypeLabel(typeId) {
  return !!loadCustomQuestionTypeLabels()[typeId]?.name?.trim()
}

/** @param {string} id */
export function getQuestionType(id) {
  if (id === 'passage') return applyCustomTypeLabels(LEGACY_PASSAGE_TYPE)
  const base = QUESTION_TYPES.find((t) => t.id === id) ?? QUESTION_TYPES[0]
  return applyCustomTypeLabels(base)
}

/** @param {MarkingScheme} m */
export function formatMarkingLabel(m) {
  const w = m.wrong < 0 ? `−${Math.abs(m.wrong)}` : String(m.wrong)
  let label = `+${m.correct} / ${w} / ${m.unattempted}`
  if (m.partial != null) label += ` (partial +${m.partial})`
  return label
}
