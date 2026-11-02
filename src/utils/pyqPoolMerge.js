/**
 * Merge PYQ catalog into AI pick pools (exam + syllabus filtered).
 */

import { filterQuestionsBySyllabus, syllabusSelectionEmpty } from './syllabusMeta.js'
import { getAnswerableQuestions } from './passage.js'
import { getSubBankPracticePool } from './masterPool.js'
import { SUB_BANK_TYPE_PYQ } from './subBankType.js'
import { filterQuestionsByBloom } from './bloomFilter.js'
import { enforce_parent_child_exclusion } from './enforceParentChildExclusion.js'

/**
 * @param {import('../data/pyqCatalog.js').PyqQuestion} q
 * @param {string} examPatternId
 */
function normalizePyqForPick(q, examPatternId) {
  const isSample = q.isDemo === true || q.bankSource === 'sample_practice'
  return {
    ...q,
    bankSource: isSample ? 'sample_practice' : (q.bankSource || 'pyq'),
    officialPyq: isSample ? false : q.officialPyq,
    examIds: q.examIds?.length ? [...q.examIds] : [examPatternId],
    source: isSample
      ? q.source?.trim() || 'Sample practice — not an official NTA paper'
      : q.source?.trim() ||
        `PYQ ${q.pyqYear}${q.paperLabel ? ` · ${q.paperLabel}` : ''}`.trim(),
  }
}

/**
 * PYQ rows eligible for mixed AI pick.
 * @param {string} examPatternId
 * @param {import('./syllabusMeta.js').SyllabusSelection} [syllabus]
 * @param {import('../data/tests').Question[]} [sourcePool] optional pre-filtered catalog
 * @param {import('./subBankType.js').SubBankType} [subBankType]
 */
export function pyqCatalogPickPool(examPatternId, syllabus, sourcePool, subBankType = SUB_BANK_TYPE_PYQ, bloomLevels) {
  if (!examPatternId) return []
  let rows =
    sourcePool ??
    getSubBankPracticePool(subBankType, examPatternId, syllabus, undefined, bloomLevels)
  if (sourcePool && syllabus && !syllabusSelectionEmpty(syllabus)) {
    rows = filterQuestionsBySyllabus(rows, syllabus)
  }
  rows = filterQuestionsByBloom(rows, bloomLevels)
  return getAnswerableQuestions(
    enforce_parent_child_exclusion(rows.map((q) => normalizePyqForPick(q, examPatternId))),
  )
}

/**
 * Bank + PYQ catalog (deduped by id) for AI paper / practice pick.
 * @param {import('../data/tests').Question[]} bankQuestions
 * @param {string} examPatternId
 * @param {import('./syllabusMeta.js').SyllabusSelection} [syllabus]
 */
export function buildPickPoolWithPyq(bankQuestions, examPatternId, syllabus, bloomLevels) {
  const bank = getAnswerableQuestions(bankQuestions ?? [])
  try {
    const pyq = pyqCatalogPickPool(examPatternId, syllabus, undefined, SUB_BANK_TYPE_PYQ, bloomLevels)
    const seen = new Set(bank.map((q) => q.id))
    const extra = pyq.filter((q) => !seen.has(q.id))
    return enforce_parent_child_exclusion(getAnswerableQuestions([...bank, ...extra]))
  } catch (err) {
    console.warn('PYQ pool merge skipped:', err)
    return enforce_parent_child_exclusion(bank)
  }
}
