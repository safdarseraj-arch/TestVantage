/**
 * Teacher paper pool — bank + PYQ mix or PYQ-only.
 */

import { filterQuestionsBySyllabus } from './syllabusMeta.js'
import { buildPickPoolWithPyq, pyqCatalogPickPool } from './pyqPoolMerge.js'
import { getAnswerableQuestions } from './passage.js'
import { isPyqLike } from './pyqDetect.js'
import { enforce_parent_child_exclusion } from './enforceParentChildExclusion.js'

/**
 * @param {import('../data/tests').Question[]} bankQuestions
 * @param {string} examPatternId
 * @param {import('./syllabusMeta.js').SyllabusSelection} syllabus
 * @param {{ pyqPercent?: number, pyqOnly?: boolean }} [opts]
 */
export function buildTeacherPaperPool(bankQuestions, examPatternId, syllabus, opts = {}) {
  const filtered = filterQuestionsBySyllabus(bankQuestions ?? [], syllabus)
  if (opts.pyqOnly) {
    return pyqCatalogPickPool(examPatternId, syllabus)
  }
  if (!examPatternId || !filtered.length) {
    return enforce_parent_child_exclusion(getAnswerableQuestions(filtered))
  }
  if (opts.pyqPercent != null && opts.pyqPercent <= 0) {
    return enforce_parent_child_exclusion(getAnswerableQuestions(filtered))
  }
  return buildPickPoolWithPyq(filtered, examPatternId, syllabus)
}

/**
 * Spread PYQ questions through the paper at roughly the target share.
 * @param {import('../data/tests').Question[]} questions
 * @param {number} [targetPercent]
 */
export function interleavePyqQuestions(questions, targetPercent = 15) {
  if (!questions?.length || targetPercent <= 0) return questions ?? []
  const pyq = questions.filter(isPyqLike)
  const bank = questions.filter((q) => !isPyqLike(q))
  if (!pyq.length || !bank.length) return questions

  const total = questions.length
  const targetPyq = Math.min(pyq.length, Math.max(1, Math.round((total * targetPercent) / 100)))
  const targetBank = total - targetPyq
  const pyqSlice = pyq.slice(0, targetPyq)
  const bankSlice = bank.slice(0, targetBank)
  const out = []
  let pi = 0
  let bi = 0
  const pyqEvery = targetPyq > 0 ? Math.max(1, Math.round(total / targetPyq)) : total

  while (out.length < total && (pi < pyqSlice.length || bi < bankSlice.length)) {
    const usePyq =
      pi < pyqSlice.length &&
      (bi >= bankSlice.length || out.length % pyqEvery === pyqEvery - 1 || bi === 0 && pi === 0)
    if (usePyq && pi < pyqSlice.length) {
      out.push(pyqSlice[pi++])
    } else if (bi < bankSlice.length) {
      out.push(bankSlice[bi++])
    } else if (pi < pyqSlice.length) {
      out.push(pyqSlice[pi++])
    }
  }

  return out.length ? out : questions
}

/**
 * @param {number} totalSlots
 * @param {number} availablePyq
 * @param {number} pyqPercent
 */
export function teacherPyqQuotaFromPercent(totalSlots, availablePyq, pyqPercent) {
  if (!totalSlots || !availablePyq || pyqPercent <= 0) {
    return { min: 0, max: 0, ideal: 0 }
  }
  if (pyqPercent >= 100) {
    const n = Math.min(totalSlots, availablePyq)
    return { min: n, max: n, ideal: n }
  }
  const ideal = Math.min(availablePyq, Math.max(1, Math.round((totalSlots * pyqPercent) / 100)))
  const slack = Math.max(0, Math.floor(totalSlots * 0.05))
  const min = Math.max(1, Math.min(ideal, availablePyq))
  const max = Math.min(availablePyq, Math.min(totalSlots, ideal + slack))
  return { min, max: Math.max(min, max), ideal }
}
