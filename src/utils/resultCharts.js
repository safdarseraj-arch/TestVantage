import { getSubjectsForPattern } from '../data/subjects.js'
import { scoreToPercentile } from './percentile.js'
import { buildWeakTopics } from './testAnalysis.js'

/**
 * Build chart-ready datasets for the Result / Analysis page.
 * Uses real attempt + scoring data only — no invented marks.
 */

/**
 * @param {import('../data/tests').TestResult} result
 */
export function buildOutcomeDonut(result) {
  if (!result) return []
  const slices = [
    { key: 'correct', name: 'Correct', value: result.correct ?? 0, color: '#16a34a' },
    { key: 'wrong', name: 'Wrong', value: result.wrong ?? 0, color: '#dc2626' },
    { key: 'skipped', name: 'Skipped', value: result.unattempted ?? 0, color: '#94a3b8' },
  ]
  if ((result.partial ?? 0) > 0) {
    slices.splice(1, 0, {
      key: 'partial',
      name: 'Partial',
      value: result.partial,
      color: '#ca8a04',
    })
  }
  return slices.filter((s) => s.value > 0)
}

/**
 * Subject score bars — you vs your own max (and optional cohort avg %).
 * @param {import('../data/tests').TestResult} result
 * @param {string} examPatternId
 * @param {{ id: string, avgPct?: number }[]} [cohortAvgs]
 */
export function buildSubjectScoreBars(result, examPatternId, cohortAvgs = []) {
  const subjects = getSubjectsForPattern(examPatternId)
  const cohortMap = Object.fromEntries(cohortAvgs.map((c) => [c.id, c.avgPct]))
  return subjects
    .map((s) => {
      const sub = result?.bySubject?.[s.id]
      if (!sub) return null
      const totalQ = (sub.correct ?? 0) + (sub.wrong ?? 0) + (sub.unattempted ?? 0) + (sub.partial ?? 0)
      if (totalQ === 0 && !(sub.maxScore > 0)) return null
      const youPct = sub.maxScore > 0 ? Math.round((sub.score / sub.maxScore) * 100) : 0
      const attempted = (sub.correct ?? 0) + (sub.wrong ?? 0) + (sub.partial ?? 0)
      const accuracy = attempted > 0 ? Math.round((sub.correct / attempted) * 100) : 0
      return {
        id: s.id,
        label: s.label,
        color: s.color,
        score: sub.score ?? 0,
        maxScore: sub.maxScore ?? 0,
        youPct,
        accuracy,
        marketAvgPct: cohortMap[s.id] ?? null,
      }
    })
    .filter(Boolean)
}

/**
 * Cumulative / trend performance across attempts (newest last for reading left→right).
 * Falls back to section scores of the current test when fewer than 2 attempts.
 * @param {import('./attemptHistory.js').Attempt[]} attempts
 * @param {object} [currentData] result payload
 * @param {string} [examPatternId]
 */
export function buildCumulativeTrend(attempts = [], currentData = null, examPatternId = '') {
  const sorted = [...attempts]
    .filter((a) => a && a.maxScore > 0)
    .sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0))
    .slice(-12)

  if (sorted.length >= 2) {
    let running = 0
    return sorted.map((a, i) => {
      const pct = Math.round((a.score / a.maxScore) * 100)
      running += pct
      const date = a.submittedAt
        ? new Date(a.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : `T${i + 1}`
      return {
        label: date,
        shortLabel: `T${i + 1}`,
        scorePct: pct,
        cumulativeAvg: Math.round(running / (i + 1)),
        accuracy: a.accuracy ?? 0,
        percentile: scoreToPercentile(a.score, a.maxScore),
        title: a.title || `Attempt ${i + 1}`,
        score: a.score,
        maxScore: a.maxScore,
      }
    })
  }

  // Within this paper: subject sections as a mini “cumulative” path
  const result = currentData?.result
  if (!result) return []
  const subjects = getSubjectsForPattern(examPatternId || currentData.examPatternId)
  let running = 0
  const points = []
  subjects.forEach((s, i) => {
    const sub = result.bySubject?.[s.id]
    if (!sub || !(sub.maxScore > 0)) return
    const pct = Math.round((sub.score / sub.maxScore) * 100)
    running += pct
    points.push({
      label: s.label,
      shortLabel: s.label.slice(0, 3),
      scorePct: pct,
      cumulativeAvg: Math.round(running / (points.length + 1)),
      accuracy:
        sub.correct + sub.wrong + (sub.partial ?? 0) > 0
          ? Math.round((sub.correct / (sub.correct + sub.wrong + (sub.partial ?? 0))) * 100)
          : 0,
      percentile: null,
      title: s.label,
      score: sub.score,
      maxScore: sub.maxScore,
      withinTest: true,
    })
  })
  return points
}

/**
 * Radar axes: subject score % (0–100).
 * @param {import('../data/tests').TestResult} result
 * @param {string} examPatternId
 */
export function buildSubjectRadar(result, examPatternId) {
  const subjects = getSubjectsForPattern(examPatternId)
  return subjects
    .map((s) => {
      const sub = result?.bySubject?.[s.id]
      if (!sub || !(sub.maxScore > 0)) return null
      const you = Math.round((sub.score / sub.maxScore) * 100)
      const attempted = (sub.correct ?? 0) + (sub.wrong ?? 0) + (sub.partial ?? 0)
      const accuracy = attempted > 0 ? Math.round((sub.correct / attempted) * 100) : 0
      return {
        subject: s.label,
        you,
        fullMark: 100,
        accuracy,
        color: s.color,
      }
    })
    .filter(Boolean)
}

/**
 * Market-style snapshot KPIs from real result fields.
 * @param {object} data result payload
 * @param {import('./attemptHistory.js').Attempt[]} attempts
 * @param {{ studentCount?: number, categories?: { id: string, you: number, maxScore: number }[], series?: { key: string, values: Record<string, number> }[] } | null} [cohort]
 */
export function buildMarketSnapshot(data, attempts = [], cohort = null) {
  const result = data?.result
  if (!result) return null

  const pct = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0
  const perQ = result.perQuestion ?? []
  const timed = perQ.filter((pq) => (pq.timeSpentSeconds ?? 0) > 0)
  const avgTimeSec =
    timed.length > 0
      ? Math.round(timed.reduce((s, pq) => s + (pq.timeSpentSeconds ?? 0), 0) / timed.length)
      : data.durationSeconds && perQ.length
        ? Math.round(data.durationSeconds / perQ.length)
        : null

  const weak = buildWeakTopics(result.byChapter ?? {}).slice(0, 3)

  let vsMarket = null
  if (cohort?.series?.length && cohort?.categories?.length) {
    const allAvg = cohort.series.find((s) => s.key === 'allAvg')
    const overallCat = cohort.categories.find((c) => c.id === 'overall') ?? cohort.categories[0]
    if (allAvg && overallCat) {
      const avgScore = allAvg.values[overallCat.id] ?? 0
      const youScore = overallCat.you ?? result.score
      const delta = Math.round(youScore - avgScore)
      vsMarket = {
        delta,
        avgScore: Math.round(avgScore),
        youScore,
        studentCount: cohort.studentCount ?? 0,
        ahead: delta >= 0,
      }
    }
  }

  const attemptCount = attempts.length
  const tips = []
  if ((result.unattempted ?? 0) > 3) {
    tips.push('Attempt more questions next time — skipping costs easy marks.')
  }
  if ((result.accuracy ?? 0) < 60 && (result.wrong ?? 0) >= 3) {
    tips.push('Accuracy is low — slow down on doubtful MCQs and review solutions.')
  }
  if (avgTimeSec != null && avgTimeSec > 120) {
    tips.push('Average time per question is high — practice timed chapter drills.')
  }
  if (weak[0]) {
    tips.push(`Drill “${weak[0].chapter}” — weakest chapter this paper.`)
  }
  if (vsMarket && !vsMarket.ahead && vsMarket.studentCount > 0) {
    tips.push(`You are ${Math.abs(vsMarket.delta)} marks behind the device average — close the gap on weak subjects.`)
  }
  if (tips.length === 0 && pct >= 70) {
    tips.push('Keep full-length mocks weekly to lock stamina and speed.')
  }

  return {
    scorePct: pct,
    accuracy: result.accuracy ?? 0,
    avgTimeSec,
    percentile: data.percentile ?? null,
    attemptCount,
    weakChapters: weak,
    vsMarket,
    tips: tips.slice(0, 4),
  }
}

/**
 * Cohort subject averages as % for bar overlay.
 * @param {{ categories: { id: string, maxScore?: number }[], series: { key: string, values: Record<string, number> }[] }} scoreComparison
 */
export function cohortSubjectAvgPcts(scoreComparison) {
  if (!scoreComparison?.categories || !scoreComparison?.series) return []
  const allAvg = scoreComparison.series.find((s) => s.key === 'allAvg')
  if (!allAvg) return []
  return scoreComparison.categories
    .filter((c) => c.id !== 'overall')
    .map((c) => {
      const max = c.maxScore || 1
      const avg = allAvg.values[c.id] ?? 0
      return { id: c.id, avgPct: Math.round((avg / max) * 100) }
    })
}
