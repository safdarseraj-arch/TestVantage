/**
 * Practice / mock pick pool — bank + PYQ catalog for the same exam (10–25% quota at pick time).
 */

import { getAnswerableQuestions } from './passage.js'
import { filterQuestionsByPracticeSyllabus } from './practiceFilters.js'
import { buildPickPoolWithPyq } from './pyqPoolMerge.js'
import { filterQuestionsByBloom } from './bloomFilter.js'
import { enforce_parent_child_exclusion } from './enforceParentChildExclusion.js'

/**
 * @param {import('../data/tests').Question[]} bankQuestions
 * @param {import('./syllabusMeta.js').SyllabusSelection} syllabus
 * @param {string} [examPatternId]
 */
export function buildPracticePickPool(bankQuestions, syllabus, examPatternId, bloomLevels) {
  const filtered = filterQuestionsByPracticeSyllabus(bankQuestions, syllabus, examPatternId)
  const byBloom = filterQuestionsByBloom(filtered, bloomLevels)
  if (!examPatternId || !byBloom.length) return byBloom
  return filterQuestionsByBloom(
    buildPickPoolWithPyq(byBloom, examPatternId, syllabus, bloomLevels),
    bloomLevels,
  )
}

/**
 * @param {import('../data/tests').Question[]} bankQuestions
 * @param {import('./syllabusMeta.js').SyllabusSelection} syllabus
 * @param {string} [examPatternId]
 */
export function buildPracticePickPoolAnswerable(bankQuestions, syllabus, examPatternId, bloomLevels) {
  const pooled = buildPracticePickPool(bankQuestions, syllabus, examPatternId, bloomLevels)
  return getAnswerableQuestions(enforce_parent_child_exclusion(pooled))
}
