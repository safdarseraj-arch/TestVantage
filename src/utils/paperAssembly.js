import { getAllowedQuestionTypeIdsForExams } from '../data/examPatterns.js'
import { getQuestionType } from '../data/questionTypes.js'
import { effectiveQuestionTypeId } from './bankListFilters.js'
import { filterQuestionsBySyllabus } from './syllabusMeta.js'
import { ensurePassageParentsIncluded } from './testQuestionClone.js'
import { getAnswerableQuestions } from './passage.js'
import {
  filterCandidatesExcludingFamilies,
  isQuestionFamilyBlocked,
  markQuestionFamilyUsed,
  duplicateFamilyIdsInSelection,
} from './questionFamily.js'
import { enforce_parent_child_exclusion } from './parentChildExclusion.js'

/**
 * @typedef {import('../data/examPatterns').QuestionTypeSlot} PaperSlot
 * @typedef {import('./syllabusMeta').SyllabusSelection} SyllabusSelection
 */

/** @param {string} typeId */
export function normalizeSlotTypeId(typeId) {
  if (typeId === 'passage') return ['passage_scq', 'passage_integer']
  return [typeId]
}

/** @param {import('../data/tests').Question} q @param {string} slotType */
function questionMatchesSlotType(q, slotType) {
  const eff = effectiveQuestionTypeId(q)
  const allowed = normalizeSlotTypeId(slotType)
  return allowed.includes(eff)
}

/**
 * @param {import('../data/tests').Question} q
 * @param {PaperSlot} slot
 */
export function applySlotMarkingToQuestion(q, slot) {
  const next = { ...q }
  if (slot.marking) next.marking = { ...slot.marking }
  if (slot.questionTypeId === 'multiple_correct' && slot.marking?.partial != null) {
    const p = slot.marking.partial
    next.msqMarking = {
      full: slot.marking.correct,
      partial1: p,
      partial2: p + 1,
      partial3: p + 2,
      wrongAny: slot.marking.wrong,
      unattempted: slot.marking.unattempted ?? 0 }
  }
  return next
}

/**
 * @param {import('../data/tests').Question[]} pool
 * @param {PaperSlot} slot
 * @param {Set<string>} usedIds
 * @param {{ toughnessTarget?: number }} [opts]
 */
function pickForSlot(pool, slot, usedIds, opts = {}) {
  const target = opts.toughnessTarget ?? 5
  const spread = opts.difficultySpread === 'balanced'
  const count = slot.count || 0
  const usedFamilies = opts.usedFamilies ?? new Set()
  /** @type {import('../data/tests').Question[]} */
  const batch = []

  for (let i = 0; i < count; i += 1) {
    const ideal = spread
      ? Math.max(1, Math.min(10, target + [-2, 0, 2, -1, 1][i % 5]))
      : target
    let candidates = pool.filter(
      (q) => !usedIds.has(q.id) && questionMatchesSlotType(q, slot.questionTypeId),
    )
    candidates = filterCandidatesExcludingFamilies(candidates, usedFamilies)
    const scored = candidates.map((q) => {
      const t = Number(q.toughnessLevel)
      const dist = Number.isFinite(t) ? Math.abs(t - ideal) : 3
      return { q, dist, rand: Math.random() }
    })
    scored.sort((a, b) => a.dist - b.dist || a.rand - b.rand)
    const pick = scored[0]?.q
    if (!pick) break
    usedIds.add(pick.id)
    markQuestionFamilyUsed(usedFamilies, pick)
    batch.push(pick)
  }

  return batch
}

/**
 * @param {import('../data/tests').Question[]} pool
 * @param {PaperSlot[]} slots
 * @param {SyllabusSelection} syllabus
 * @param {{ toughnessTarget?: number, examPatternId?: string, difficultySpread?: 'balanced' | 'target' }} [opts]
 */
export function autoAssemblePaper(pool, slots, syllabus, opts = {}) {
  const assembleOpts = {
    toughnessTarget: opts.toughnessTarget ?? 5,
    difficultySpread: opts.difficultySpread ?? 'balanced' }
  let filtered = filterQuestionsBySyllabus(pool, syllabus)
  if (opts.examPatternId) {
    const allowed = getAllowedQuestionTypeIdsForExams([opts.examPatternId])
    if (allowed?.length) {
      filtered = filtered.filter((q) => allowed.includes(effectiveQuestionTypeId(q)))
    }
  }

  const used = new Set()
  const usedFamilies = new Set()
  /** @type {import('../data/tests').Question[]} */
  const picked = []
  /** @type {{ slot: PaperSlot, short: number }[]} */
  const gaps = []

  for (const slot of slots) {
    if (!slot.count) continue
    const batch = pickForSlot(filtered, slot, used, { ...assembleOpts, usedFamilies })
    batch.forEach((q) => {
      used.add(q.id)
      picked.push(applySlotMarkingToQuestion(q, slot))
    })
    if (batch.length < slot.count) {
      gaps.push({ slot, short: slot.count - batch.length })
    }
  }

  const withParents = ensurePassageParentsIncluded([...pool, ...picked], picked)
  const questions = enforce_parent_child_exclusion(
    withParents.map((q) => {
      const fromPicked = picked.find((p) => p.id === q.id)
      return fromPicked ?? q
    }),
  )
  return {
    questions,
    gaps }
}

/**
 * @param {PaperSlot[]} slots
 */
export function totalSlotCount(slots) {
  return slots.reduce((s, x) => s + (x.count || 0), 0)
}

/**
 * @param {string} examPatternId
 * @param {import('../data/examPatterns').ExamPattern} pattern
 */
export function defaultSlotsForExam(examPatternId, pattern) {
  const allowed = getAllowedQuestionTypeIdsForExams([examPatternId])
  const slots = pattern.questionSlots.map((s) => ({
    section: s.section,
    questionTypeId: s.questionTypeId === 'passage' ? 'passage_scq' : s.questionTypeId,
    count: s.count,
    marking: { ...s.marking } }))
  if (!allowed?.length) return slots
  return slots.filter((s) => {
    const types = normalizeSlotTypeId(s.questionTypeId)
    return types.some((t) => allowed.includes(t))
  })
}

/** @param {PaperSlot[]} slots */
export function summarizeSlots(slots) {
  return slots.map((s) => {
    const def = getQuestionType(s.questionTypeId)
    return {
      ...s,
      typeLabel: def.shortName,
      typeName: def.name }
  })
}

/**
 * @param {import('../data/tests').Question[]} pool
 * @param {string[]} allowedTypeIds
 */
export function summarizeBankCountsByType(pool, allowedTypeIds) {
  /** @type {Record<string, number>} */
  const counts = {}
  for (const id of allowedTypeIds) counts[id] = 0
  for (const q of pool) {
    const t = effectiveQuestionTypeId(q)
    if (allowedTypeIds.includes(t)) counts[t] = (counts[t] ?? 0) + 1
  }
  return allowedTypeIds.map((typeId) => ({
    typeId,
    count: counts[typeId] ?? 0,
    typeLabel: getQuestionType(typeId).shortName,
    typeName: getQuestionType(typeId).name }))
}

/**
 * @param {PaperSlot[]} slots
 * @param {import('../data/tests').Question[]} pool
 */
export function bankShortageWarnings(slots, pool) {
  /** @type {Record<string, number>} */
  const needByType = {}
  for (const slot of slots) {
    if (!slot.count) continue
    const key = slot.questionTypeId
    needByType[key] = (needByType[key] ?? 0) + slot.count
  }
  /** @type {string[]} */
  const warnings = []
  for (const [typeId, need] of Object.entries(needByType)) {
    const inBank = countPoolForSlot(pool, { questionTypeId: typeId, count: 0 })
    if (need > inBank) {
      const def = getQuestionType(typeId)
      warnings.push(
        `Need ${need} ${def.shortName} but only ${inBank} in bank for this syllabus — upload more or lower the count.`,
      )
    }
  }
  return warnings
}

/**
 * @param {import('../data/tests').Question[]} pool
 * @param {PaperSlot} slot
 */
export function countPoolForSlot(pool, slot) {
  const types = normalizeSlotTypeId(slot.questionTypeId)
  return pool.filter((q) => types.includes(effectiveQuestionTypeId(q))).length
}

/**
 * @param {import('../data/tests').Question[]} selected
 * @param {PaperSlot} slot
 */
export function countSelectedForSlot(selected, slot) {
  const types = normalizeSlotTypeId(slot.questionTypeId)
  return getAnswerableQuestions(selected).filter((q) =>
    types.includes(effectiveQuestionTypeId(q)),
  ).length
}

/**
 * @param {import('../data/tests').Question[]} selected
 * @param {PaperSlot[]} slots
 */
export function selectionProgressBySlot(selected, slots) {
  return slots
    .filter((s) => s.count > 0)
    .map((slot) => ({
      slot,
      need: slot.count,
      have: countSelectedForSlot(selected, slot) }))
}

/**
 * @param {import('../data/tests').Question[]} selected
 * @param {PaperSlot[]} slots
 */
export function validateManualSelection(selected, slots) {
  const answerable = getAnswerableQuestions(selected)
  const byType = /** @type {Record<string, number>} */ ({})
  for (const q of answerable) {
    const t = effectiveQuestionTypeId(q)
    byType[t] = (byType[t] ?? 0) + 1
  }
  /** @type {string[]} */
  const errors = []
  for (const slot of slots) {
    if (!slot.count) continue
    const types = normalizeSlotTypeId(slot.questionTypeId)
    const have = types.reduce((n, t) => n + (byType[t] ?? 0), 0)
    if (have < slot.count) {
      const def = getQuestionType(slot.questionTypeId)
      errors.push(`Need ${slot.count} ${def.shortName}, selected ${have}`)
    }
  }
  for (const clash of duplicateFamilyIdsInSelection(answerable)) {
    errors.push(`Original and similar cannot be in the same paper (${clash}).`)
  }
  return errors
}
