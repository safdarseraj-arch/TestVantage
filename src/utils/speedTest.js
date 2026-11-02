import { getAnswerableQuestions } from './passage.js'
import { getExamPattern } from '../data/examPatterns.js'
import { filterQuestionsBySyllabus } from './syllabusMeta.js'
import { defaultSlotsForExam, normalizeSlotTypeId, totalSlotCount } from './paperAssembly.js'
import { effectiveQuestionTypeId } from './bankListFilters.js'
import { aiTunePaper } from './aiPaperTuning.js'
import { filterQuestionsForNonCdfUse } from './cdfOnlyQuestions.js'

/** Precision Speed Test — only questions at or below this toughness level. */
export const SPEED_TEST_MAX_TOUGHNESS = 3

/** Fixed duration choices (minutes) for Precision Speed Test. */
export const SPEED_DURATION_OPTIONS = [15, 30, 45, 60]

const DEFAULT_SPEED_SECONDS = 50

/** Seconds allowed per question by subject (approximate exam pacing). */
export const SPEED_SECONDS_BY_SUBJECT = {
  mathematics: 60,
  physics: 50,
  chemistry: 40,
  biology: 40,
}

/**
 * @param {import('../data/tests').Question} q
 */
export function speedSecondsForQuestion(q) {
  const sub = String(q?.subject ?? '').toLowerCase()
  // Inline map avoids TDZ when tests.js loads during a circular import of this module.
  const bySubject = {
    mathematics: 60,
    physics: 50,
    chemistry: 40,
    biology: 40,
  }
  return bySubject[sub] ?? DEFAULT_SPEED_SECONDS
}

/**
 * @param {import('../data/tests').Question[]} questions
 */
export function computeSpeedTestDurationMinutes(questions) {
  const answerable = getAnswerableQuestions(questions ?? [])
  if (!answerable.length) return 8
  const totalSec = answerable.reduce((sum, q) => sum + speedSecondsForQuestion(q), 0)
  return Math.max(8, Math.ceil(totalSec / 60))
}

/**
 * @param {import('../data/tests').Question[]} pool
 * @param {number} [maxLevel]
 */
export function filterQuestionsForSpeedTest(pool, maxLevel = SPEED_TEST_MAX_TOUGHNESS) {
  return filterQuestionsForNonCdfUse(pool ?? []).filter((q) => {
    const t = Number(q.toughnessLevel)
    if (!Number.isFinite(t) || t <= 0) return true
    return t <= maxLevel
  })
}

/** Human-readable pacing line for instructions UI. */
export function formatSpeedTestTimingSummary() {
  return 'Mathematics ~1 min · Physics ~50 sec · Chemistry ~40 sec per question'
}

/**
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} slots
 * @param {number} budget
 */
export function scaleSlotsToQuestionBudget(slots, budget) {
  const current = totalSlotCount(slots)
  if (current <= 0 || budget <= 0) {
    return slots.map((s) => ({ ...s, count: 0 }))
  }
  if (budget >= current) {
    return slots.map((s) => ({ ...s }))
  }

  const ratio = budget / current
  /** @type {{ slot: typeof slots[0], floor: number, frac: number }[]} */
  const parts = slots.map((slot) => {
    const raw = (slot.count || 0) * ratio
    const floor = Math.floor(raw)
    return { slot, floor, frac: raw - floor }
  })

  let result = parts.map((p) => ({ ...p.slot, count: p.floor }))
  let assigned = result.reduce((s, x) => s + x.count, 0)
  let remaining = budget - assigned

  const byFrac = [...parts].sort((a, b) => b.frac - a.frac)
  for (const part of byFrac) {
    if (remaining <= 0) break
    if ((part.slot.count || 0) < 1) continue
    const row = result.find((r) => r.questionTypeId === part.slot.questionTypeId)
    if (row) {
      row.count += 1
      remaining -= 1
    }
  }

  if (budget > 0 && result.every((r) => r.count === 0)) {
    const richest = [...slots].sort((a, b) => (b.count || 0) - (a.count || 0))[0]
    if (richest) {
      result = slots.map((s) =>
        s.questionTypeId === richest.questionTypeId ? { ...s, count: 1 } : { ...s, count: 0 },
      )
    }
  }

  return result
}

/**
 * @param {number} durationMinutes
 * @param {import('../data/tests').Question[]} pool
 */
export function estimateSpeedQuestionBudget(durationMinutes, pool) {
  const answerable = getAnswerableQuestions(pool ?? [])
  if (!answerable.length) return 0
  const totalSec = durationMinutes * 60
  const avgSec =
    answerable.reduce((s, q) => s + speedSecondsForQuestion(q), 0) / answerable.length
  return Math.max(3, Math.floor(totalSec / Math.max(30, avgSec)))
}

/**
 * @param {number} durationMinutes
 * @param {string} examPatternId
 * @param {import('../data/tests').Question[]} pool
 * @param {import('./syllabusMeta').SyllabusSelection} syllabus
 */
export function buildSpeedSlotsForDuration(durationMinutes, examPatternId, pool, syllabus) {
  const pattern = getExamPattern(examPatternId)
  const baseSlots = defaultSlotsForExam(examPatternId, pattern)
  const filtered = filterQuestionsForSpeedTest(filterQuestionsBySyllabus(pool, syllabus))
  const budget = estimateSpeedQuestionBudget(durationMinutes, filtered)
  const scaled = scaleSlotsToQuestionBudget(baseSlots, budget).filter((s) => s.count > 0)
  return { slots: scaled, budget, pool: filtered }
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {number} durationMinutes
 */
/**
 * Slot rows that reflect questions actually on the paper (not the scaled blueprint).
 * @param {import('../data/tests').Question[]} questions
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} plannedSlots
 */
export function slotsFromDeliveredQuestions(questions, plannedSlots) {
  const answerable = getAnswerableQuestions(questions ?? [])
  if (!answerable.length) return []

  /** @type {Map<string, import('../data/examPatterns').QuestionTypeSlot>} */
  const byType = new Map()
  for (const q of answerable) {
    const typeId = effectiveQuestionTypeId(q)
    if (!typeId) continue
    if (!byType.has(typeId)) {
      const template = plannedSlots.find((s) =>
        normalizeSlotTypeId(s.questionTypeId).includes(typeId),
      )
      byType.set(typeId, {
        section: template?.section ?? q.section ?? '',
        questionTypeId: typeId,
        count: 0,
        marking: template?.marking ? { ...template.marking } : undefined,
      })
    }
    byType.get(typeId).count += 1
  }
  return [...byType.values()]
}

/**
 * When AI cannot fill the planned paper, use natural pacing time instead of the full slot.
 * @param {number} requestedMinutes
 * @param {import('../data/tests').Question[]} questions
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} plannedSlots
 */
export function resolveSpeedSessionDuration(requestedMinutes, questions, plannedSlots) {
  const answerable = getAnswerableQuestions(questions ?? [])
  if (!answerable.length) return requestedMinutes

  const naturalMinutes = Math.max(
    1,
    Math.ceil(answerable.reduce((s, q) => s + speedSecondsForQuestion(q), 0) / 60),
  )

  const plannedTotal = totalSlotCount(plannedSlots)
  if (plannedTotal < 1) return requestedMinutes

  const fillRatio = answerable.length / plannedTotal
  if (fillRatio >= 0.5) return requestedMinutes

  return Math.min(requestedMinutes, naturalMinutes)
}

export function trimQuestionsToSpeedDuration(questions, durationMinutes) {
  const maxSec = durationMinutes * 60
  const answerable = getAnswerableQuestions(questions)
  if (!answerable.length) return []

  /** @type {import('../data/tests').Question[]} */
  const kept = []
  let used = 0
  for (const q of answerable) {
    const sec = speedSecondsForQuestion(q)
    if (kept.length > 0 && used + sec > maxSec) break
    kept.push(q)
    used += sec
  }
  return kept.length ? kept : answerable.slice(0, 1)
}

/**
 * AI-build a speed paper for a fixed duration and syllabus.
 * @param {number} durationMinutes
 * @param {import('../data/tests').Question[]} pool
 * @param {import('./syllabusMeta').SyllabusSelection} syllabus
 * @param {string} examPatternId
 */
export function buildSpeedPaperForDuration(durationMinutes, pool, syllabus, examPatternId) {
  const { slots, pool: speedPool } = buildSpeedSlotsForDuration(
    durationMinutes,
    examPatternId,
    pool,
    syllabus,
  )
  if (!slots.length || totalSlotCount(slots) < 1 || !speedPool.length) {
    return { questions: [], slots: [], durationMinutes, tuneReport: null }
  }

  const plannedSlots = slots
  const plannedQuestionCount = totalSlotCount(plannedSlots)

  const tuned = aiTunePaper(speedPool, plannedSlots, syllabus, {
    profileId: 'revision',
    toughnessTarget: SPEED_TEST_MAX_TOUGHNESS,
    examPatternId,
  })
  const questions = trimQuestionsToSpeedDuration(tuned.questions ?? [], durationMinutes)
  const actualSlots = slotsFromDeliveredQuestions(questions, plannedSlots)
  const effectiveDurationMinutes = resolveSpeedSessionDuration(
    durationMinutes,
    questions,
    plannedSlots,
  )

  return {
    questions,
    slots: actualSlots.length ? actualSlots : plannedSlots,
    durationMinutes,
    effectiveDurationMinutes,
    plannedQuestionCount,
    tuneReport: tuned.tuneReport ?? null,
  }
}

/**
 * @param {number} minutes
 */
export function normalizeSpeedDurationChoice(minutes) {
  const n = Number(minutes)
  if (SPEED_DURATION_OPTIONS.includes(n)) return n
  return SPEED_DURATION_OPTIONS.reduce((best, opt) =>
    Math.abs(opt - n) < Math.abs(best - n) ? opt : best,
  )
}
