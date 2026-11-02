import { CURRICULUM_TREE } from '../data/curriculum.js'
import { CANONICAL_QUESTION_TYPE_IDS } from '../data/questionTypes.js'

/** JEE Advanced PCM subjects only. */
export const JEE_UPLOAD_SUBJECTS = ['physics', 'chemistry', 'mathematics']

/** All bank question types to exercise on upload. */
export const JEE_UPLOAD_QUESTION_TYPES = [...CANONICAL_QUESTION_TYPE_IDS]

/** @param {string} text */
export function slugifyChapter(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * @returns {Array<{ id: string, subject: string, section: string, chapter: string }>}
 */
export function flattenJeeAdvancedChapters() {
  /** @type {Array<{ id: string, subject: string, section: string, chapter: string }>} */
  const rows = []
  for (const subject of JEE_UPLOAD_SUBJECTS) {
    const tree = CURRICULUM_TREE[subject]
    if (!tree) continue
    for (const [section, chapters] of Object.entries(tree)) {
      for (const chapter of Object.keys(chapters)) {
        const id = `${subject}-${slugifyChapter(chapter)}`
        rows.push({ id, subject, section, chapter })
      }
    }
  }
  return rows
}

/**
 * @param {{ subject: string, section: string, chapter: string, questionTypeId: string }} ctx
 */
export function buildJeeImageSearchQuery(ctx) {
  const typeHint = {
    single_correct: 'single correct MCQ',
    multiple_correct: 'multiple correct MSQ',
    matrix_match: 'match the column matrix',
    integer: 'integer value question',
    numerical: 'numerical value question',
    passage_integer: 'passage based integer',
    passage_scq: 'passage based MCQ',
  }[ctx.questionTypeId]
  return `JEE Advanced ${ctx.chapter} ${ctx.subject} ${typeHint} question paper image`
}

/** @param {string} query */
export function buildGoogleImageSearchUrl(query) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`
}

/**
 * @param {{ subject: string, section: string, chapter: string, questionTypeId: string }} ctx
 */
export function buildJeeQuestionText(ctx) {
  const { subject, section, chapter, questionTypeId: type } = ctx
  const tag = `${chapter} (${section}, ${subject})`

  if (type === 'single_correct') {
    return `${tag}\nA particle moves with velocity v = 2t m/s. Find displacement after 3 s.\n(A) 6 m\n(B) 9 m\n(C) 12 m\n(D) 18 m`
  }
  if (type === 'multiple_correct') {
    return `${tag}\nWhich of the following statements about ${chapter} are correct?\n(A) Statement I is true\n(B) Statement II is true\n(C) Both I and II are true\n(D) Neither I nor II is true`
  }
  if (type === 'matrix_match') {
    return `${tag}\nMatch the Column\nColumn-I Column-II\n(A) Concept related to ${chapter}  (P) Definition P\n(B) Formula in ${chapter}  (Q) Definition Q\n(C) Application  (R) Definition R\n(D) Special case  (S) Definition S\n(E) Limit case  (T) Definition T`
  }
  if (type === 'integer') {
    return `${tag}\nIf the value of x satisfying the ${chapter} relation equals 42, enter the integer answer (0–9999).`
  }
  if (type === 'numerical') {
    return `${tag}\nFind the numerical value (up to 2 decimals) of the ${chapter} quantity in SI units.`
  }
  if (type === 'passage_integer') {
    return `${tag}\nPassage: Consider the following about ${chapter}.\n\n1. Using the passage, find the integer value of n.\n2. Find the integer coefficient k from the data above.`
  }
  if (type === 'passage_scq') {
    return `${tag}\nPassage: Read the following about ${chapter}.\n\n1. From the passage, which is correct?\n(A) Option A\n(B) Option B\n(C) Option C\n(D) Option D\n\n2. Which statement follows from the passage?\n(A) True\n(B) False\n(C) Cannot say\n(D) None`
  }
  return `${tag}\nSample JEE Advanced question.`
}

/**
 * @param {{ mode?: 'full' | 'sample', maxChapters?: number }} [opts]
 * @returns {Array<{ id: string, subject: string, section: string, chapter: string, questionTypeId: string, searchQuery: string, googleUrl: string }>}
 */
export function buildJeeUploadTestCases(opts = {}) {
  const { mode = 'full', maxChapters } = opts
  let chapters = flattenJeeAdvancedChapters()
  if (mode === 'sample') {
    chapters = chapters.filter((_, i) => i % 8 === 0).slice(0, maxChapters ?? 10)
  } else if (maxChapters) {
    chapters = chapters.slice(0, maxChapters)
  }

  /** @type {ReturnType<typeof buildJeeUploadTestCases>} */
  const cases = []
  for (const ch of chapters) {
    for (const questionTypeId of JEE_UPLOAD_QUESTION_TYPES) {
      const id = `${ch.id}-${questionTypeId}`
      const searchQuery = buildJeeImageSearchQuery({ ...ch, questionTypeId })
      cases.push({
        ...ch,
        questionTypeId,
        id,
        searchQuery,
        googleUrl: buildGoogleImageSearchUrl(searchQuery),
      })
    }
  }
  return cases
}

/** Public URL for a pre-downloaded web image (see npm run fetch:jee-test-images). */
export function jeeUploadTestImageUrl(testCaseId) {
  return `/jee-upload-test/${testCaseId}.jpg`
}
