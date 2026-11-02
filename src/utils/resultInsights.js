import { scoreToPercentile } from './percentile.js'
import { buildWeakTopics } from './testAnalysis.js'
import { getSubjectsForPattern } from '../data/subjects.js'
import { buildMasteryGraph } from './aiMastery.js'

/**
 * @param {number} score
 * @param {number} maxScore
 */
export function computePerformanceGrade(score, maxScore) {
  const pct = maxScore > 0 ? (score / maxScore) * 100 : 0
  if (pct >= 90) return { grade: 'A+', label: 'Outstanding', color: '#059669' }
  if (pct >= 80) return { grade: 'A', label: 'Excellent', color: '#16a34a' }
  if (pct >= 70) return { grade: 'B+', label: 'Very good', color: '#2563eb' }
  if (pct >= 60) return { grade: 'B', label: 'Good', color: '#6366f1' }
  if (pct >= 50) return { grade: 'C', label: 'Average', color: '#ca8a04' }
  if (pct >= 35) return { grade: 'D', label: 'Needs work', color: '#ea580c' }
  return { grade: 'E', label: 'Foundation', color: '#dc2626' }
}

/**
 * @param {object} data current result payload
 * @param {import('./attemptHistory.js').Attempt | null} previousAttempt
 */
export function compareWithPreviousAttempt(data, previousAttempt) {
  if (!previousAttempt || !data?.result) return null
  const curPct = data.result.maxScore > 0
    ? Math.round((data.result.score / data.result.maxScore) * 100)
    : 0
  const prevPct = previousAttempt.maxScore > 0
    ? Math.round((previousAttempt.score / previousAttempt.maxScore) * 100)
    : 0
  const scoreDelta = data.result.score - previousAttempt.score
  const pctDelta = curPct - prevPct
  const accDelta = (data.result.accuracy ?? 0) - (previousAttempt.accuracy ?? 0)
  return {
    previousTitle: previousAttempt.title,
    previousScore: previousAttempt.score,
    previousMax: previousAttempt.maxScore,
    scoreDelta,
    pctDelta,
    accDelta,
    improved: scoreDelta > 0,
    sameTest: previousAttempt.testId === data.testId }
}

/**
 * Local AI-style coach insights (no cloud API).
 * @param {object} data result payload
 * @param {import('../data/tests').Test} test
 * @param {import('./attemptHistory.js').Attempt[]} [allAttempts]
 */
export function buildResultCoachInsights(data, test, allAttempts = []) {
  if (!data?.result) return { strengths: [], focus: [], actions: [], summary: '' }

  const { result } = data
  const subjects = getSubjectsForPattern(test.examPatternId)
  const weakTopics = buildWeakTopics(result.byChapter ?? {})
  const pct = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0
  const attempts = allAttempts.length ? allAttempts : []
  const mastery = buildMasteryGraph(attempts)
  const topWeak = weakTopics[0]
  const topWeakSubjects = topWeak
    ? [
        ...new Set(
          (result.perQuestion ?? [])
            .filter((pq) => pq.chapter === topWeak.chapter && pq.subject)
            .map((pq) => pq.subject),
        ),
      ]
    : []

  /** @type {string[]} */
  const strengths = []
  /** @type {string[]} */
  const focus = []
  /** @type {{ label: string, to: string, icon: string }[]} */
  const actions = []

  for (const s of subjects) {
    const sub = result.bySubject?.[s.id]
    if (!sub) continue
    const subPct = sub.maxScore > 0 ? Math.round((sub.score / sub.maxScore) * 100) : 0
    const att = sub.correct + sub.wrong + (sub.partial ?? 0)
    const acc = att > 0 ? Math.round((sub.correct / att) * 100) : 0
    if (subPct >= 75 && acc >= 70) {
      strengths.push(`${s.label} — ${subPct}% score, ${acc}% accuracy`)
    } else if (sub.wrong + sub.unattempted >= 2) {
      focus.push(`${s.label} — ${sub.wrong} wrong, ${sub.unattempted} skipped (${subPct}% score)`)
    }
  }

  for (const t of weakTopics.slice(0, 4)) {
    focus.push(`Chapter "${t.chapter}" — ${t.accuracy}% accuracy, ${t.wrong} wrong`)
  }

  if (result.unattempted > 0) {
    focus.push(`${result.unattempted} unattempted — improve time management or skip strategy`)
  }

  if (result.wrong > result.correct && result.wrong >= 3) {
    focus.push('More wrong than correct — review solutions and redo weak chapters')
  }

  if (strengths.length === 0 && pct >= 60) {
    strengths.push('Balanced performance across subjects — push for higher accuracy')
  }
  if (focus.length === 0 && pct >= 80) {
    strengths.push('Strong overall attempt — try a harder mock or speed test next')
  }

  actions.push({
    label: topWeak ? `Practice ${topWeak.chapter}` : 'Practice weak topics',
    to: '/practice',
    icon: '🎯',
    prefill: topWeak
      ? {
          examPatternId: test.examPatternId,
          subjects: topWeakSubjects,
          chapters: [topWeak.chapter] }
      : { examPatternId: test.examPatternId } })
  if (weakTopics.length) {
    actions.push({ label: 'Question bank', to: '/question-bank?hub=view&view=published', icon: '📚', prefill: null })
  }
  actions.push({ label: 'Full analytics', to: '/analytics', icon: '📈', prefill: null })
  actions.push({ label: 'Another mock', to: '/mock-test', icon: '📝', prefill: null })

  if (data.result?.calibratedStanding?.ability) {
    const ab = data.result.calibratedStanding.ability
    focus.push(`Calibrated ability ~${ab}/10 — ${ab >= 7 ? 'try harder mocks' : 'drill fundamentals in practice'}`)
  }

  if (mastery.overallMastery < 50 && attempts.length >= 2) {
    focus.push(`Overall chapter strength ${mastery.overallMastery}% — AI practice will target weak chapters`)
  }

  let summary = ''
  if (pct >= 80) {
    summary = 'You are exam-ready on this paper. Focus on speed and full-length stamina.'
  } else if (pct >= 55) {
    summary = 'Solid base — targeted chapter practice will lift your score quickly.'
  } else {
    summary = 'Build fundamentals first, then retake chapter tests before full mocks.'
  }

  return {
    strengths,
    focus,
    actions,
    summary,
    weakTopics: weakTopics.slice(0, 6),
    mastery }
}

/**
 * @param {import('./attemptHistory.js').Attempt[]} attempts
 * @param {string} testId
 * @param {string} [currentAttemptId]
 */
export function findPreviousAttempt(attempts, testId, currentAttemptId) {
  const sorted = [...attempts].sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
  let skippedCurrent = false
  for (const a of sorted) {
    if (currentAttemptId && a.id === currentAttemptId) {
      skippedCurrent = true
      continue
    }
    if (skippedCurrent || !currentAttemptId) {
      if (a.testId === testId) return a
    }
  }
  if (currentAttemptId) {
    return sorted.find((a) => a.id !== currentAttemptId && a.testId === testId) ?? null
  }
  return sorted.find((a) => a.testId === testId) ?? null
}

/** @param {number} score @param {number} maxScore */
export function percentileLabel(score, maxScore) {
  return scoreToPercentile(score, maxScore)
}
