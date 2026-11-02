/**
 * Form Forecast — practice-based AIR / percentile with confidence.
 * Uses attempt history (speed + accuracy + score) mapped through Career Compass NTA curves.
 * Complements Career Compass (marks → exam-day AIR); does not replace it.
 */

import { CAREER_EXAMS } from '../data/careerCompassCatalog.js'
import { projectMarksToRank2027, reconcilePercentileAir } from './careerCompassPredict.js'
import { getPercentileCurveTable } from './counsellingPredictor.js'

const EXAM_IDS = ['jee-main', 'jee-advanced', 'neet']

/** Healthy seconds-per-question bands by exam (rough NTA pacing). */
const PACE_BAND = {
  'jee-main': { ideal: 90, min: 35, max: 150 },
  'jee-advanced': { ideal: 180, min: 60, max: 300 },
  neet: { ideal: 60, min: 25, max: 120 },
}

/** @param {string} examPatternId */
export function normalizeForecastExamId(examPatternId) {
  const id = String(examPatternId || '').toLowerCase()
  if (id.includes('neet')) return 'neet'
  if (id.includes('advanced') || id.includes('adv')) return 'jee-advanced'
  if (id.includes('main') || id.includes('jee')) return 'jee-main'
  return null
}

/** @param {string} examId */
export function getForecastExamMeta(examId) {
  return CAREER_EXAMS.find((e) => e.id === examId) ?? CAREER_EXAMS[0]
}

/**
 * @param {import('./attemptHistory.js').Attempt} attempt
 * @param {string} examId
 */
function attemptPaceSeconds(attempt) {
  const n =
    (attempt.correct ?? 0) + (attempt.wrong ?? 0) + (attempt.partial ?? 0) + (attempt.unattempted ?? 0)
  if (n <= 0 || !attempt.durationSeconds) return null
  return attempt.durationSeconds / n
}

/**
 * Speed multiplier: rush with mistakes → down; calm accuracy → slight up; glacial → slight down.
 * @param {number|null} secPerQ
 * @param {number} accuracy
 * @param {string} examId
 */
function speedMultiplier(secPerQ, accuracy, examId) {
  if (secPerQ == null || !Number.isFinite(secPerQ)) return 1
  const band = PACE_BAND[examId] ?? PACE_BAND['jee-main']
  const ratio = secPerQ / band.ideal
  if (ratio < 0.55 && accuracy < 70) return 0.88
  if (ratio < 0.55 && accuracy >= 70) return 0.96
  if (ratio > 1.6 && accuracy >= 75) return 1.02
  if (ratio > 1.8) return 0.94
  if (ratio >= 0.75 && ratio <= 1.25) return 1.03
  return 1
}

/**
 * Difficulty signal from wrongs share + unattempted (proxy when toughness missing).
 * @param {import('./attemptHistory.js').Attempt} attempt
 */
function difficultyMultiplier(attempt) {
  const c = attempt.correct ?? 0
  const w = attempt.wrong ?? 0
  const u = attempt.unattempted ?? 0
  const total = c + w + u
  if (total <= 0) return 1
  const hardProxy = (w + u * 0.5) / total
  // More wrongs/skips on a scored attempt → treat form as slightly softer for AIR
  if (hardProxy > 0.45) return 0.94
  if (hardProxy < 0.2 && (attempt.accuracy ?? 0) >= 75) return 1.03
  return 1
}

/**
 * @param {import('./attemptHistory.js').Attempt} attempt
 * @param {string} examId
 */
function effectiveMarksFromAttempt(attempt, examId) {
  const meta = getForecastExamMeta(examId)
  const maxScore = attempt.maxScore || 0
  if (maxScore <= 0) return null
  const scorePct = Math.max(0, Math.min(100, (attempt.score / maxScore) * 100))
  const accuracy = attempt.accuracy ?? scorePct
  const pace = attemptPaceSeconds(attempt)
  const adj =
    scorePct *
    (0.55 + 0.45 * (accuracy / 100)) *
    speedMultiplier(pace, accuracy, examId) *
    difficultyMultiplier(attempt)
  return Math.round(Math.max(0, Math.min(meta.marksMax, (adj / 100) * meta.marksMax)))
}

/**
 * Confidence 0–100 from sample size, consistency, and recency coverage.
 * @param {number[]} marksList
 * @param {number} attemptCount
 * @param {number} questionVolume
 */
function computeConfidence(marksList, attemptCount, questionVolume) {
  if (attemptCount <= 0) return 0
  let sample = Math.min(40, attemptCount * 12)
  if (attemptCount >= 5) sample += 15
  if (attemptCount >= 10) sample += 10

  let consistency = 20
  if (marksList.length >= 2) {
    const mean = marksList.reduce((a, b) => a + b, 0) / marksList.length
    const variance =
      marksList.reduce((s, m) => s + (m - mean) ** 2, 0) / marksList.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1
    consistency = Math.round(Math.max(5, Math.min(35, 35 - cv * 40)))
  }

  const volume = Math.min(25, Math.round(questionVolume / 8))
  return Math.max(8, Math.min(96, sample + consistency + volume))
}

/**
 * @param {import('./attemptHistory.js').Attempt[]} attempts newest first
 * @param {string} examId
 */
function buildForecastForExam(attempts, examId) {
  const meta = getForecastExamMeta(examId)
  const filtered = attempts.filter((a) => normalizeForecastExamId(a.examPatternId) === examId)
  const pool = filtered.length ? filtered : attempts.filter((a) => a.maxScore > 0)

  if (!pool.length) {
    return {
      examId,
      examLabel: meta.label,
      marksMax: meta.marksMax,
      ready: false,
      attemptCount: 0,
      practiceMarks: null,
      percentile: null,
      air: null,
      airLow: null,
      airHigh: null,
      confidence: 0,
      confidenceLabel: 'Need mocks',
      trend: 'flat',
      recentAir: [],
      formNote: `Take a ${meta.label} mock or practice set to unlock Form Forecast.`,
      vsCompassHint:
        'Career Compass projects exam-day AIR from marks you enter. Form Forecast reads your practice history.',
    }
  }

  // Recency weights: newest attempts matter more
  const used = pool.slice(0, 12)
  let weightSum = 0
  let marksSum = 0
  /** @type {number[]} */
  const marksList = []
  let questionVolume = 0

  used.forEach((a, i) => {
    const marks = effectiveMarksFromAttempt(a, examId)
    if (marks == null) return
    const w = Math.pow(0.82, i)
    marksSum += marks * w
    weightSum += w
    marksList.push(marks)
    questionVolume += (a.correct ?? 0) + (a.wrong ?? 0) + (a.unattempted ?? 0)
  })

  if (!weightSum || !marksList.length) {
    return {
      examId,
      examLabel: meta.label,
      marksMax: meta.marksMax,
      ready: false,
      attemptCount: pool.length,
      practiceMarks: null,
      percentile: null,
      air: null,
      airLow: null,
      airHigh: null,
      confidence: 0,
      confidenceLabel: 'Need scored attempts',
      trend: 'flat',
      recentAir: [],
      formNote: 'Attempts need a score to project practice AIR.',
      vsCompassHint:
        'Open Career Compass with your target marks to see college bands alongside this practice form.',
    }
  }

  const practiceMarks = Math.round(marksSum / weightSum)
  const proj = projectMarksToRank2027(examId, practiceMarks)
  const synced = reconcilePercentileAir(examId, proj.percentile, proj.air)

  // Confidence band on AIR (± based on confidence)
  const confidence = computeConfidence(marksList, used.length, questionVolume)
  const spread = Math.max(0.08, (100 - confidence) / 100)
  const airLow = Math.max(1, Math.round(synced.air * (1 - spread * 0.55)))
  const airHigh = Math.max(airLow, Math.round(synced.air * (1 + spread * 1.1)))

  /** @type {{ label: string, air: number, marks: number, date: string }[]} */
  const recentAir = []
  for (const a of used.slice(0, 6)) {
    const m = effectiveMarksFromAttempt(a, examId)
    if (m == null) continue
    const p = projectMarksToRank2027(examId, m)
    const r = reconcilePercentileAir(examId, p.percentile, p.air)
    recentAir.push({
      label: a.title || 'Attempt',
      air: r.air,
      marks: m,
      date: a.submittedAt,
    })
  }

  let trend = 'flat'
  if (recentAir.length >= 3) {
    const first = recentAir[recentAir.length - 1].air
    const last = recentAir[0].air
    if (last < first * 0.88) trend = 'up'
    else if (last > first * 1.12) trend = 'down'
  }

  const confidenceLabel =
    confidence >= 75 ? 'High' : confidence >= 50 ? 'Solid' : confidence >= 30 ? 'Early' : 'Low'

  const formNote =
    trend === 'up'
      ? 'Practice form is improving — keep mocks timed like exam day.'
      : trend === 'down'
        ? 'Practice AIR softened recently — climb the Revision Ladder, then re-check Form Forecast.'
        : 'Stable practice form. Compare with Career Compass marks for exam-day counselling.'

  return {
    examId,
    examLabel: meta.label,
    marksMax: meta.marksMax,
    ready: true,
    attemptCount: pool.length,
    attemptsUsed: used.length,
    practiceMarks,
    percentile: Math.round(synced.percentile * 100) / 100,
    air: synced.air,
    airLow,
    airHigh,
    poolSize: synced.poolSize,
    confidence,
    confidenceLabel,
    trend,
    recentAir,
    formNote,
    vsCompassHint:
      'Practice form vs projected exam day: use Career Compass with the same marks for colleges, round chances, and placements.',
    percentileCurve: getPercentileCurveTable(examId, {
      highlightPercentile: Math.round(synced.percentile * 10) / 10,
      toughness: 'moderate',
      radius: 2.5,
    }),
  }
}

/**
 * Build Form Forecast for all supported exams from attempt history.
 * @param {import('./attemptHistory.js').Attempt[]} attempts newest first
 */
export function buildFormForecast(attempts = []) {
  const byExam = {}
  for (const id of EXAM_IDS) {
    byExam[id] = buildForecastForExam(attempts, id)
  }

  // Prefer exam with most attempts; else first ready
  const ranked = EXAM_IDS.map((id) => byExam[id]).sort(
    (a, b) => (b.attemptCount || 0) - (a.attemptCount || 0),
  )
  const primary = ranked.find((f) => f.ready) ?? ranked[0]

  return {
    primaryExamId: primary?.examId ?? 'jee-main',
    byExam,
    exams: EXAM_IDS.map((id) => byExam[id]),
    hasAnyData: ranked.some((f) => f.ready),
  }
}
