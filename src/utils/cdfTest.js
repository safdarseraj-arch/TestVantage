import { getAnswerableQuestions } from './passage.js'
import { getExamPattern, getSlotMarking } from '../data/examPatterns.js'
import { filterQuestionsBySyllabus } from './syllabusMeta.js'
import { effectiveQuestionTypeId } from './bankListFilters.js'
import { aiTunePaper } from './aiPaperTuning.js'
import { scaleSlotsToQuestionBudget, slotsFromDeliveredQuestions } from './speedTest.js'

/** Concept Definition and Formula (CDF) Test — only toughness level 1. */
export const CDF_TEST_TOUGHNESS = 1

/** Fixed duration choices (minutes) for CDF Test. */
export const CDF_DURATION_OPTIONS = [15, 30]

export const CDF_ALLOWED_TYPES = ['single_correct', 'true_false']

/** Seconds allowed per question by subject. */
export const CDF_SECONDS_BY_SUBJECT = {
  mathematics: 30,
  physics: 25,
  chemistry: 20,
  biology: 20,
}

const DEFAULT_CDF_SECONDS = 22

/**
 * @param {import('../data/tests').Question} q
 */
export function cdfSecondsForQuestion(q) {
  const sub = String(q?.subject ?? '').toLowerCase()
  return CDF_SECONDS_BY_SUBJECT[sub] ?? DEFAULT_CDF_SECONDS
}

/**
 * @param {import('../data/tests').Question[]} questions
 */
export function computeCdfTestDurationMinutes(questions) {
  const answerable = getAnswerableQuestions(questions ?? [])
  if (!answerable.length) return 8
  const totalSec = answerable.reduce((sum, q) => sum + cdfSecondsForQuestion(q), 0)
  return Math.max(8, Math.ceil(totalSec / 60))
}

/**
 * @param {import('../data/tests').Question[]} pool
 */
export function filterQuestionsForCdfTest(pool) {
  return (pool ?? []).filter((q) => {
    const type = effectiveQuestionTypeId(q)
    if (!CDF_ALLOWED_TYPES.includes(type)) return false
    const t = Number(q.toughnessLevel)
    if (!Number.isFinite(t) || t <= 0) return false
    return t === CDF_TEST_TOUGHNESS
  })
}

/** Human-readable pacing line for instructions UI. */
export function formatCdfTestTimingSummary() {
  return 'Mathematics 30 sec · Physics 25 sec · Chemistry 20 sec · Biology 20 sec per question'
}

/**
 * @param {number} durationMinutes
 * @param {import('../data/tests').Question[]} pool
 */
export function estimateCdfQuestionBudget(durationMinutes, pool) {
  const answerable = getAnswerableQuestions(pool ?? [])
  if (!answerable.length) return 0
  const totalSec = durationMinutes * 60
  const avgSec =
    answerable.reduce((s, q) => s + cdfSecondsForQuestion(q), 0) / answerable.length
  return Math.max(3, Math.floor(totalSec / Math.max(15, avgSec)))
}

/**
 * @param {string} examPatternId
 * @param {import('../data/tests').Question[]} filtered
 * @param {number} budget
 */
function buildCdfBaseSlots(examPatternId, filtered, budget) {
  const pattern = getExamPattern(examPatternId)
  const scqMarking = getSlotMarking(pattern, 'single_correct')
  const tfMarking = getSlotMarking(pattern, 'true_false')

  const hasScq = filtered.some((q) => effectiveQuestionTypeId(q) === 'single_correct')
  const hasTf = filtered.some((q) => effectiveQuestionTypeId(q) === 'true_false')

  /** @type {import('../data/examPatterns').QuestionTypeSlot[]} */
  const baseSlots = []
  if (hasScq) {
    const scqCount = hasTf ? Math.max(1, Math.ceil(budget * 0.65)) : budget
    baseSlots.push({
      section: '',
      questionTypeId: 'single_correct',
      count: scqCount,
      marking: { ...scqMarking },
    })
  }
  if (hasTf) {
    const tfCount = hasScq ? Math.max(1, budget - (baseSlots[0]?.count ?? 0)) : budget
    baseSlots.push({
      section: '',
      questionTypeId: 'true_false',
      count: tfCount,
      marking: { ...tfMarking },
    })
  }
  return baseSlots
}

/**
 * @param {number} durationMinutes
 * @param {string} examPatternId
 * @param {import('../data/tests').Question[]} pool
 * @param {import('./syllabusMeta').SyllabusSelection} syllabus
 */
export function buildCdfSlotsForDuration(durationMinutes, examPatternId, pool, syllabus) {
  const filtered = filterQuestionsForCdfTest(filterQuestionsBySyllabus(pool, syllabus))
  const budget = estimateCdfQuestionBudget(durationMinutes, filtered)
  const baseSlots = buildCdfBaseSlots(examPatternId, filtered, budget)
  const scaled = scaleSlotsToQuestionBudget(baseSlots, budget).filter((s) => s.count > 0)
  return { slots: scaled, budget, pool: filtered }
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {number} durationMinutes
 */
export function trimQuestionsToCdfDuration(questions, durationMinutes) {
  const maxSec = durationMinutes * 60
  const answerable = getAnswerableQuestions(questions)
  if (!answerable.length) return []

  /** @type {import('../data/tests').Question[]} */
  const kept = []
  let used = 0
  for (const q of answerable) {
    const sec = cdfSecondsForQuestion(q)
    if (kept.length > 0 && used + sec > maxSec) break
    kept.push(q)
    used += sec
  }
  return kept.length ? kept : answerable.slice(0, 1)
}

/**
 * @param {number} requestedMinutes
 * @param {import('../data/tests').Question[]} questions
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} plannedSlots
 */
export function resolveCdfSessionDuration(requestedMinutes, questions, plannedSlots) {
  const answerable = getAnswerableQuestions(questions ?? [])
  if (!answerable.length) return requestedMinutes

  const naturalMinutes = Math.max(
    1,
    Math.ceil(answerable.reduce((s, q) => s + cdfSecondsForQuestion(q), 0) / 60),
  )

  const plannedTotal = plannedSlots.reduce((s, x) => s + (x.count || 0), 0)
  if (plannedTotal < 1) return requestedMinutes

  const fillRatio = answerable.length / plannedTotal
  if (fillRatio >= 0.5) return requestedMinutes

  return Math.min(requestedMinutes, naturalMinutes)
}

/**
 * AI-build a CDF paper for a fixed duration and syllabus.
 * @param {number} durationMinutes
 * @param {import('../data/tests').Question[]} pool
 * @param {import('./syllabusMeta').SyllabusSelection} syllabus
 * @param {string} examPatternId
 */
export function buildCdfPaperForDuration(durationMinutes, pool, syllabus, examPatternId) {
  const { slots, pool: cdfPool } = buildCdfSlotsForDuration(
    durationMinutes,
    examPatternId,
    pool,
    syllabus,
  )
  const plannedSlots = slots
  const plannedQuestionCount = plannedSlots.reduce((s, x) => s + (x.count || 0), 0)

  if (!plannedSlots.length || plannedQuestionCount < 1 || !cdfPool.length) {
    return { questions: [], slots: [], durationMinutes, tuneReport: null }
  }

  const tuned = aiTunePaper(cdfPool, plannedSlots, syllabus, {
    profileId: 'revision',
    toughnessTarget: CDF_TEST_TOUGHNESS,
    examPatternId,
  })
  const questions = trimQuestionsToCdfDuration(tuned.questions ?? [], durationMinutes)
  const actualSlots = slotsFromDeliveredQuestions(questions, plannedSlots)
  const effectiveDurationMinutes = resolveCdfSessionDuration(
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
export function normalizeCdfDurationChoice(minutes) {
  const n = Number(minutes)
  if (CDF_DURATION_OPTIONS.includes(n)) return n
  return CDF_DURATION_OPTIONS.reduce((best, opt) =>
    Math.abs(opt - n) < Math.abs(best - n) ? opt : best,
  )
}
