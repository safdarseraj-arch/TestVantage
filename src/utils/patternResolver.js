import { getExamPattern } from '../data/examPatterns.js'
import { getPyqChapterPattern } from '../data/pyqChapterPatterns.js'
import { getPaperPatternSlotTotal } from '../data/paperPatterns.js'
import { formatMarkingLabel } from '../data/questionTypes.js'
import { getPaperPattern } from './paperPatternStore.js'

/**
 * Assembly blueprint (chapter PYQ, custom mocks).
 * @typedef {{
 *   totalCap: number
 *   durationMinutes?: number
 *   totalMinutes?: number
 *   note?: string
 *   slots: import('../data/examPatterns').QuestionTypeSlot[]
 *   paperPatternId?: string
 *   name?: string
 * }} AssemblyBlueprint
 */

/** @param {import('../data/paperPatterns').PaperPattern} pp */
function paperPatternToBlueprint(pp) {
  const totalCap = pp.totalCap ?? getPaperPatternSlotTotal(pp)
  return {
    totalCap,
    durationMinutes: pp.durationMinutes ?? 45,
    totalMinutes: pp.totalMinutes,
    note: pp.description ?? pp.name,
    name: pp.name,
    paperPatternId: pp.id,
    slots: pp.slots,
  }
}

/**
 * @param {string} examPatternId
 * @param {string} [paperPatternId]
 * @returns {AssemblyBlueprint}
 */
export function getAssemblyBlueprint(examPatternId, paperPatternId) {
  if (paperPatternId) {
    const pp = getPaperPattern(paperPatternId)
    if (pp && pp.baseExamPatternId === examPatternId) {
      return paperPatternToBlueprint(pp)
    }
  }
  const chapter = getPyqChapterPattern(examPatternId)
  return {
    totalCap: chapter.totalCap,
    durationMinutes: chapter.durationMinutes,
    note: chapter.note,
    slots: chapter.slots.map((s) => ({
      section: s.section,
      questionTypeId: s.questionTypeId,
      count: s.count,
      marking: s.marking,
    })),
  }
}

/**
 * Resolved exam pattern for scoring / instructions (ExamPattern shape).
 * @param {{ examPatternId?: string, paperPatternId?: string }} test
 */
export function getTestPattern(test) {
  const examId = test?.examPatternId ?? 'jee-main'
  if (test?.paperBlueprint?.length) {
    const base = getExamPattern(examId)
    return {
      ...base,
      questionSlots: test.paperBlueprint,
      markingLabel: 'Custom blueprint',
    }
  }
  if (test?.paperPatternId) {
    const pp = getPaperPattern(test.paperPatternId)
    if (pp) {
      const base = getExamPattern(examId)
      return {
        ...base,
        id: examId,
        name: pp.name,
        description: pp.description ?? base.description,
        totalMinutes: pp.totalMinutes ?? base.totalMinutes,
        questionSlots: pp.slots,
        paperPatternId: pp.id,
      }
    }
  }
  return getExamPattern(examId)
}

/** @param {string} examPatternId @param {string} [paperPatternId] */
export function getChapterPyqLimit(examPatternId, paperPatternId) {
  return getAssemblyBlueprint(examPatternId, paperPatternId).totalCap
}

/** @param {AssemblyBlueprint} blueprint */
export function getBlueprintTotal(blueprint) {
  return blueprint.slots.reduce((sum, s) => sum + s.count, 0)
}

/** @param {string} examPatternId @param {string} [paperPatternId] */
export function getBlueprintRows(examPatternId, paperPatternId) {
  const bp = getAssemblyBlueprint(examPatternId, paperPatternId)
  return bp.slots.map((slot) => ({
    section: slot.section ?? slot.questionTypeId,
    typeId: slot.questionTypeId,
    count: slot.count,
    marking: slot.marking,
    markingLabel: formatMarkingLabel(slot.marking),
  }))
}
