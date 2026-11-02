/**
 * Exam Fit (/100) + Revision Ladder — readiness score and ordered reattempt queue.
 * Packages mastery / weak chapters / wrongs into a clear product surface.
 */

import {
  buildAiStudyPlan,
  buildMasteryGraph,
  pickWeakChaptersForStudy,
  savePracticePrefill,
} from './aiMastery.js'
import { normalizeForecastExamId } from './formForecast.js'

/**
 * @param {import('./attemptHistory.js').Attempt[]} attempts
 * @returns {{
 *   score: number
 *   label: string
 *   bands: { mastery: number, accuracy: number, consistency: number, coverage: number, momentum: number }
 *   summary: string
 *   ladder: {
 *     rank: number
 *     chapter: string
 *     subject?: string
 *     reason: string
 *     accuracy: number
 *     wrong: number
 *     masteryScore: number
 *     reattemptTo: string
 *     attemptId?: string
 *     testId?: string
 *     examPatternId?: string
 *   }[]
 *   mastery: ReturnType<typeof buildMasteryGraph>
 *   studyPlan: ReturnType<typeof buildAiStudyPlan>
 * }}
 */
export function buildExamFit(attempts = []) {
  const mastery = buildMasteryGraph(attempts)
  const studyPlan = buildAiStudyPlan(attempts)
  const weak = pickWeakChaptersForStudy(mastery, 8)

  if (!attempts.length) {
    return {
      score: 0,
      label: 'Not started',
      bands: { mastery: 0, accuracy: 0, consistency: 0, coverage: 0, momentum: 0 },
      summary: 'Take a mock or practice set to unlock Exam Fit and your Revision Ladder.',
      ladder: [],
      mastery,
      studyPlan,
    }
  }

  const avgAccuracy = Math.round(
    attempts.reduce((s, a) => s + (a.accuracy ?? 0), 0) / attempts.length,
  )

  const recent = attempts.slice(0, 5)
  const older = attempts.slice(5, 10)
  const recentAcc =
    recent.length > 0
      ? recent.reduce((s, a) => s + (a.accuracy ?? 0), 0) / recent.length
      : avgAccuracy
  const olderAcc =
    older.length > 0
      ? older.reduce((s, a) => s + (a.accuracy ?? 0), 0) / older.length
      : recentAcc
  const momentumRaw = Math.max(-20, Math.min(20, recentAcc - olderAcc))
  const momentum = Math.round(50 + momentumRaw)

  // Consistency: low variance of recent accuracy
  let consistency = 55
  if (recent.length >= 2) {
    const mean = recentAcc
    const variance =
      recent.reduce((s, a) => s + ((a.accuracy ?? 0) - mean) ** 2, 0) / recent.length
    const sd = Math.sqrt(variance)
    consistency = Math.round(Math.max(20, Math.min(100, 100 - sd * 1.4)))
  }

  const chapterCount = Object.keys(mastery.chapters).length
  const coverage = Math.round(Math.min(100, chapterCount * 8 + Math.min(20, attempts.length * 3)))

  const bands = {
    mastery: mastery.overallMastery,
    accuracy: avgAccuracy,
    consistency,
    coverage,
    momentum,
  }

  const score = Math.round(
    bands.mastery * 0.34 +
      bands.accuracy * 0.28 +
      bands.consistency * 0.14 +
      bands.coverage * 0.12 +
      bands.momentum * 0.12,
  )
  const clamped = Math.max(5, Math.min(99, score))

  const label =
    clamped >= 85
      ? 'Exam-ready'
      : clamped >= 70
        ? 'Strong form'
        : clamped >= 55
          ? 'Building'
          : clamped >= 40
            ? 'Needs focus'
            : 'Foundation'

  const summary =
    weak.length > 0
      ? `Exam Fit ${clamped}/100 (${label}). Climb the Revision Ladder — start with ${weak[0].chapter}.`
      : `Exam Fit ${clamped}/100 (${label}). Keep timed mocks to lock exam-day stamina.`

  // Wrong-heavy attempts for reattempt links
  /** @type {Map<string, { attemptId: string, testId: string, wrong: number, examPatternId?: string }>} */
  const chapterReattempt = new Map()
  for (const a of attempts.slice(0, 20)) {
    const chapters = a.byChapter ?? a.resultSnapshot?.result?.byChapter ?? {}
    for (const [ch, stats] of Object.entries(chapters)) {
      const key = String(ch).trim().toLowerCase()
      if (!key || !(stats.wrong > 0)) continue
      const prev = chapterReattempt.get(key)
      if (!prev || (stats.wrong ?? 0) > prev.wrong) {
        chapterReattempt.set(key, {
          attemptId: a.id,
          testId: a.testId,
          wrong: stats.wrong ?? 0,
          examPatternId: a.examPatternId,
        })
      }
    }
  }

  const ladder = weak.map((c, i) => {
    const key = String(c.chapter).trim().toLowerCase()
    const re = chapterReattempt.get(key)
    const reason =
      c.trend === 'down'
        ? `Accuracy dropping · ${c.wrong} wrong · ${c.masteryScore}% strength`
        : c.masteryScore < 45
          ? `Priority chapter · ${c.wrong} wrong across ${c.attempts} test(s)`
          : `${c.accuracy}% accuracy · ${c.wrong} to rework`

    return {
      rank: i + 1,
      chapter: c.chapter,
      subject: c.subject,
      reason,
      accuracy: c.accuracy,
      wrong: c.wrong,
      masteryScore: c.masteryScore,
      reattemptTo: re ? `/result/${re.testId}?attempt=${re.attemptId}` : '/practice',
      attemptId: re?.attemptId,
      testId: re?.testId,
      examPatternId: re?.examPatternId ?? normalizeForecastExamId(attempts[0]?.examPatternId) ?? undefined,
      practicePrefill: {
        chapters: [c.chapter],
        subjects: c.subject ? [c.subject] : [],
        examPatternId: re?.examPatternId,
      },
    }
  })

  return {
    score: clamped,
    label,
    bands,
    summary,
    ladder,
    mastery,
    studyPlan,
  }
}

/**
 * Prefill practice from a Revision Ladder rung, then navigate caller to /practice.
 * @param {{ chapters?: string[], subjects?: string[], examPatternId?: string }} prefill
 */
export function openLadderPractice(prefill) {
  savePracticePrefill(prefill ?? {})
}
