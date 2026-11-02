/**
 * Detect previous-year (PYQ) questions in pick pools.
 * Official imported papers vs Gemini PYQ-style (AI) imitations — never the same label.
 */

export const PYQ_STYLE_AI_SOURCE = 'PYQ-style (AI)'
export const PYQ_STYLE_AI_BANK_SOURCE = 'pyq_style_ai'
/** Gemini practice items inspired by one official/bank PYQ — never Official PYQ. */
export const SIMILAR_TO_PYQ_SOURCE = 'AI practice / similar to PYQ'
export const SIMILAR_TO_PYQ_BANK_SOURCE = 'similar_to_pyq'
/** Single-question Gemini similar (secondary). */
export const AI_SIMILAR_SOURCE = 'AI similar'
export const AI_SIMILAR_BANK_SOURCE = 'ai_similar'
/** Full-paper Gemini replica sitting — never Official PYQ. */
export const AI_REPLICA_PAPER_SOURCE = 'AI replica paper'
export const AI_REPLICA_PAPER_BANK_SOURCE = 'ai_replica_paper'
/** Existing official catalog uses bankSource `pyq`; also accept `official_pyq`. */
export const OFFICIAL_PYQ_BANK_SOURCE = 'official_pyq'
export const LEGACY_OFFICIAL_PYQ_BANK_SOURCE = 'pyq'
/** Built-in sample drills — never labelled Official PYQ. */
export const SAMPLE_PRACTICE_BANK_SOURCE = 'sample_practice'

function isSamplePractice(q) {
  if (!q) return false
  if (q.isDemo === true) return true
  return String(q.bankSource ?? '').trim() === SAMPLE_PRACTICE_BANK_SOURCE
}

/**
 * @param {import('../data/tests').Question & {
 *   pyqYear?: number
 *   bankSource?: string
 *   imported?: boolean
 *   pyqStyle?: boolean
 * }} q
 */
export function isPyqStyleAi(q) {
  if (!q) return false
  if (isSimilarToPyq(q)) return false
  if (q.pyqStyle === true) return true
  if (q.bankSource === PYQ_STYLE_AI_BANK_SOURCE) return true
  return String(q.source ?? '').trim() === PYQ_STYLE_AI_SOURCE
}

/**
 * Gemini drafts inspired by one official or bank PYQ. Never Official PYQ.
 * @param {import('../data/tests').Question & {
 *   similarToPyq?: boolean
 *   bankSource?: string
 *   source?: string
 * }} q
 */
export function isReplicaPaperQuestion(q) {
  if (!q) return false
  if (q.aiReplicaPaper === true) return true
  if (q.bankSource === AI_REPLICA_PAPER_BANK_SOURCE) return true
  return String(q.source ?? '').trim() === AI_REPLICA_PAPER_SOURCE
}

export function isSimilarToPyq(q) {
  if (!q) return false
  if (isReplicaPaperQuestion(q)) return true
  if (q.similarToPyq === true) return true
  const src = String(q.source ?? '').trim()
  const bank = String(q.bankSource ?? '').trim()
  if (
    bank === SIMILAR_TO_PYQ_BANK_SOURCE ||
    bank === AI_SIMILAR_BANK_SOURCE ||
    bank === AI_REPLICA_PAPER_BANK_SOURCE
  ) {
    return true
  }
  return (
    src === SIMILAR_TO_PYQ_SOURCE ||
    src === AI_SIMILAR_SOURCE ||
    src === AI_REPLICA_PAPER_SOURCE
  )
}

/**
 * Real imported / catalog PYQ — not Gemini imitation.
 * @param {import('../data/tests').Question & {
 *   pyqYear?: number
 *   bankSource?: string
 *   imported?: boolean
 *   pyqStyle?: boolean
 * }} q
 */
export function isOfficialPyq(q) {
  if (!q || isPyqStyleAi(q) || isSimilarToPyq(q) || isSamplePractice(q)) return false
  if (q.officialPyq === true || q.imported === true) return true
  const src = String(q.bankSource ?? '').trim()
  return src === LEGACY_OFFICIAL_PYQ_BANK_SOURCE || src === OFFICIAL_PYQ_BANK_SOURCE
}

/**
 * PYQ tab keeps original papers. Similar PYQ tab keeps replica papers.
 * @param {import('../data/tests').Question[]} questions
 * @param {string} subBankType
 */
export function questionsForPyqPracticeTab(questions, subBankType) {
  const list = Array.isArray(questions) ? questions : []
  if (subBankType === 'similar_pyq') return list.filter((q) => isSimilarToPyq(q))
  return list.filter((q) => isOfficialPyq(q))
}

/** @param {import('../data/tests').Question & { pyqYear?: number, bankSource?: string, imported?: boolean, pyqStyle?: boolean }} q */
export function isPyqLike(q) {
  if (!q) return false
  if (isSamplePractice(q)) return false
  if (isOfficialPyq(q) || isPyqStyleAi(q) || isSimilarToPyq(q)) return true
  if (q.pyqYear != null) return true
  const blob = [q.source, q.examIds?.join(' '), q.chapter, q.topic, q.paperLabel]
    .filter(Boolean)
    .join(' ')
  return /pyq|previous\s*year|jee\s*main\s*20|nta|past\s*paper/i.test(blob)
}

/**
 * Everyday badge. Honest: Gemini imitates style + year tag; it is not a licensed NTA paper.
 * @param {import('../data/tests').Question} q
 * @returns {string}
 */
export function pyqProvenanceLabel(q) {
  if (isSamplePractice(q)) return 'Sample practice'
  if (isReplicaPaperQuestion(q)) return AI_REPLICA_PAPER_SOURCE
  const src = String(q.source ?? '').trim()
  if (src === AI_SIMILAR_SOURCE || q.bankSource === AI_SIMILAR_BANK_SOURCE) return AI_SIMILAR_SOURCE
  if (isSimilarToPyq(q)) return SIMILAR_TO_PYQ_SOURCE
  if (isPyqStyleAi(q)) return 'PYQ-style (AI)'
  if (isOfficialPyq(q)) return 'Official PYQ'
  if (isPyqLike(q)) return 'PYQ'
  return ''
}

/**
 * Staff can seed Gemini similar-practice from an official or bank PYQ.
 * Not from our own similar drafts (avoids a copy chain).
 * @param {import('../data/tests').Question} q
 */
export function canSeedSimilarFromPyq(q) {
  if (!q) return false
  if (isSimilarToPyq(q) || isSamplePractice(q)) return false
  const stem = String(q.text ?? q.stem ?? '').trim()
  if (!stem) return false
  return isOfficialPyq(q) || isPyqStyleAi(q) || isPyqLike(q)
}

/** Any bank question with a stem — not an existing similar variant. */
export function canSeedSimilarFromQuestion(q) {
  if (!q) return false
  if (isSimilarToPyq(q) || isSamplePractice(q)) return false
  const stem = String(q.text ?? q.stem ?? '').trim()
  return !!stem
}

/** @param {import('../data/tests').Question[]} questions */
export function countPyqQuestions(questions) {
  return (questions ?? []).filter(isPyqLike).length
}

/** @param {number} pyqCount @param {number} total */
export function pyqSharePercent(pyqCount, total) {
  if (!total) return 0
  return Math.round((pyqCount / total) * 100)
}
