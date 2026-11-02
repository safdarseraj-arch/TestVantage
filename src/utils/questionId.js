/**
 * Founder Question ID rules.
 * Extends existing classified IDs (MAQ00001 / MAQS2345-style). Does not invent a new prefix.
 *
 *   Normal:     MAQS2345
 *   Similar:    MAQS2345C1, MAQS2345C2, ...
 *   Official PYQ: MAQS2345A2024   (+ 5 chars: exam letter + year)
 *   PYQ similar:  MAQS2345A2024C1
 *
 * Exam letters: A = JEE Advanced, J = JEE Main, N = NEET.
 * Old published bank IDs stay as they are; only new similar / official PYQ IDs use this.
 */

/** @type {RegExp} */
export const SIMILAR_SUFFIX_RE = /C(\d+)$/

/** Official PYQ tail: one exam letter + four-digit year. */
export const PYQ_EXAM_YEAR_RE = /([AJN])(\d{4})$/

/** Classified core + optional PYQ tail + optional similar tail. */
export const FOUNDER_QUESTION_ID_PATTERN = /^[A-Z]{3}\d{5}(?:[AJN]\d{4})?(?:C\d+)?$/

const PYQ_EXAM_LETTER = {
  a: 'A',
  advanced: 'A',
  'jee-advanced': 'A',
  jee_advanced: 'A',
  'jee advanced': 'A',
  j: 'J',
  main: 'J',
  'jee-main': 'J',
  jee_main: 'J',
  'jee main': 'J',
  n: 'N',
  neet: 'N',
  'neet-ug': 'N',
  neet_ug: 'N',
  'neet ug': 'N',
}

/**
 * @param {unknown} exam
 * @returns {'A' | 'J' | 'N'}
 */
export function pyqExamLetter(exam) {
  const key = String(exam ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (PYQ_EXAM_LETTER[key]) return PYQ_EXAM_LETTER[key]
  if (/\badvanced\b/.test(key)) return 'A'
  if (/\bneet\b/.test(key)) return 'N'
  if (/\bmain\b/.test(key)) return 'J'
  return 'A'
}

/**
 * Four-digit year for the official PYQ suffix.
 * @param {unknown} year
 */
export function pyqYearDigits(year) {
  const n = Number(year)
  if (Number.isFinite(n) && n > 0) return String(Math.trunc(n)).padStart(4, '0').slice(-4)
  const digits = String(year ?? '').replace(/\D/g, '')
  return (digits || '0000').padStart(4, '0').slice(-4)
}

/**
 * Similar / replica child: {originalId}C{n}  (no extra dash).
 * @param {string} originalId
 * @param {number} n
 */
export function similarId(originalId, n) {
  const base = String(originalId ?? '').trim()
  const idx = Math.max(1, Math.trunc(Number(n) || 1))
  return base + 'C' + idx
}

/**
 * Official PYQ: {base}{letter}{year}  — five extra characters.
 * @param {string} base
 * @param {unknown} exam  advanced | main | neet | jee-advanced | jee-main | ...
 * @param {unknown} year
 */
export function pyqId(base, exam, year) {
  return String(base ?? '').trim() + pyqExamLetter(exam) + pyqYearDigits(year)
}

/** @param {string} id */
export function parseSimilarVariantIndex(id) {
  const m = String(id ?? '').trim().match(SIMILAR_SUFFIX_RE)
  return m ? Number(m[1]) : null
}

/** @param {string} id */
export function stripSimilarSuffix(id) {
  return String(id ?? '').trim().replace(SIMILAR_SUFFIX_RE, '')
}

/** @param {string} id */
export function stripPyqExamYear(id) {
  return String(id ?? '').trim().replace(PYQ_EXAM_YEAR_RE, '')
}

/** Drop C{n} then [AJN]YYYY so the classified / normal core remains. */
export function stripFounderIdSuffixes(id) {
  return stripPyqExamYear(stripSimilarSuffix(id))
}

/** @param {string} id */
export function isFounderQuestionId(id) {
  return FOUNDER_QUESTION_ID_PATTERN.test(String(id ?? '').trim())
}