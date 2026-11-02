import { getExamPattern } from '../data/examPatterns.js'

export const CALIBRATED_MINUTES_PER_SUBJECT = 60

function totalSlotCount(slots) {
  return (slots ?? []).reduce((s, x) => s + (x.count || 0), 0)
}

/**
 * Real-Time Calibrated Paper: 60 min per selected subject (capped at full exam time).
 * @param {number} subjectCount
 * @param {string} [examPatternId]
 */
export function computeCalibratedDurationMinutes(subjectCount, examPatternId) {
  const pattern = getExamPattern(examPatternId)
  const cap = pattern?.totalMinutes ?? 180
  const n = Math.max(1, subjectCount)
  return Math.min(cap, CALIBRATED_MINUTES_PER_SUBJECT * n)
}

/**
 * @param {string} [section]
 * @returns {string[]}
 */
export function slotSectionSubjectIds(section) {
  const s = String(section ?? '').toLowerCase()
  if (/physics/.test(s)) return ['physics']
  if (/chemistry/.test(s)) return ['chemistry']
  if (/mathem|maths/.test(s)) return ['mathematics']
  if (/botany/.test(s)) return ['botany']
  if (/zoology/.test(s)) return ['zoology']
  if (/biology/.test(s)) return ['botany', 'zoology']
  return []
}

/**
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} slots
 * @param {string[]} selectedSubjectIds
 */
export function filterSlotsForCalibratedSubjects(slots, selectedSubjectIds) {
  if (!selectedSubjectIds?.length) return slots ?? []
  const set = new Set(selectedSubjectIds)
  const hasSubjectSections = (slots ?? []).some((s) => slotSectionSubjectIds(s.section).length > 0)
  if (!hasSubjectSections) return slots ?? []
  return (slots ?? []).filter((slot) => {
    const linked = slotSectionSubjectIds(slot.section)
    if (!linked.length) return true
    return linked.some((id) => set.has(id))
  })
}

/**
 * Questions for one subject from exam slot pattern (actual exam counts per subject).
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} slots
 * @param {string} subjectId
 * @param {string[]} selectedSubjectIds
 */
export function questionsPerSubjectFromSlots(slots, subjectId, selectedSubjectIds) {
  const list = slots ?? []
  let total = 0
  for (const slot of list) {
    const linked = slotSectionSubjectIds(slot.section)
    if (!linked.length || !linked.includes(subjectId)) continue
    const c = slot.count || 0
    if (linked.length > 1) {
      const active = linked.filter((id) => selectedSubjectIds.includes(id))
      if (!active.includes(subjectId)) continue
      total += Math.round(c / Math.max(1, active.length))
    } else {
      total += c
    }
  }
  if (total > 0) return Math.max(4, total)
  const full = totalSlotCount(list)
  return Math.max(4, Math.round(full / Math.max(1, selectedSubjectIds.length)))
}

/**
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} slots
 * @param {string[]} subjectOrder
 */
export function buildCalibratedSubjectQuotas(slots, subjectOrder) {
  /** @type {Record<string, number>} */
  const questionsPerSectionBySubject = {}
  for (const sid of subjectOrder) {
    questionsPerSectionBySubject[sid] = questionsPerSubjectFromSlots(slots, sid, subjectOrder)
  }
  const targetTotal = Object.values(questionsPerSectionBySubject).reduce((a, b) => a + b, 0)
  const questionsPerSection = Math.max(
    4,
    ...Object.values(questionsPerSectionBySubject),
    4,
  )
  return { questionsPerSectionBySubject, targetTotal, questionsPerSection }
}

/**
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} baseSlots
 * @param {string[]} subjectOrder
 * @param {string} examPatternId
 */
export function planCalibratedPaperFromExam(baseSlots, subjectOrder, examPatternId) {
  const pattern = getExamPattern(examPatternId)
  const filtered = filterSlotsForCalibratedSubjects(baseSlots, subjectOrder)
  const useSlots =
    filtered.length && filtered.some((s) => slotSectionSubjectIds(s.section).length)
      ? filtered
      : baseSlots
  const quotas = buildCalibratedSubjectQuotas(useSlots, subjectOrder)
  const durationMinutes = computeCalibratedDurationMinutes(subjectOrder.length, examPatternId)
  return {
    slots: useSlots,
    durationMinutes,
    subjectOrder,
    patternName: pattern?.name ?? 'Exam',
    ...quotas,
  }
}

/**
 * @param {import('../data/tests').CalibratedMeta} meta
 * @param {string} subjectId
 */
export function calibratedSectionQuota(meta, subjectId) {
  return meta.questionsPerSectionBySubject?.[subjectId] ?? meta.questionsPerSection ?? 8
}
