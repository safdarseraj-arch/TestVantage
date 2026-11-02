import { scoreToPercentile } from './percentile.js'
import { buildAiStudyPlan, savePracticePrefill } from './aiMastery.js'
import { attemptToResultData } from './attemptHistory.js'
import { buildTimeSinks } from './testAnalysis.js'

/** @param {import('./attemptHistory').Attempt[]} attempts */
export function buildUserAnalytics(attempts) {
  if (!attempts.length) {
    return {
      totalAttempts: 0,
      avgAccuracy: 0,
      avgPercentile: 0,
      bestPercentile: 0,
      trend: [],
      bySubject: {},
      streak: 0,
      totalTimeMinutes: 0,
      timeSinks: [],
    }
  }

  const trend = attempts
    .slice(0, 12)
    .reverse()
    .map((a, i) => ({
      label: `T${i + 1}`,
      score: a.score,
      maxScore: a.maxScore,
      percentile: scoreToPercentile(a.score, a.maxScore),
      date: a.submittedAt,
    }))

  const avgAccuracy = Math.round(
    attempts.reduce((s, a) => s + (a.accuracy ?? 0), 0) / attempts.length,
  )

  const percentiles = attempts.map((a) => scoreToPercentile(a.score, a.maxScore))
  const avgPercentile = Math.round(
    percentiles.reduce((s, p) => s + p, 0) / percentiles.length,
  )
  const bestPercentile = Math.round(Math.max(...percentiles))

  const bySubject = {}
  for (const a of attempts) {
    if (!a.bySubject) continue
    for (const [sub, data] of Object.entries(a.bySubject)) {
      if (!bySubject[sub]) bySubject[sub] = { score: 0, max: 0, count: 0 }
      bySubject[sub].score += data.score ?? 0
      bySubject[sub].max += data.maxScore ?? data.score ?? 0
      bySubject[sub].count++
    }
  }

  let streak = 0
  const daySet = new Set(attempts.map((a) => new Date(a.submittedAt).toDateString()))
  const days = [...daySet].sort()
  for (let i = days.length - 1; i >= 0; i--) {
    const expected = new Date()
    expected.setDate(expected.getDate() - (days.length - 1 - i))
    if (days[i] === expected.toDateString()) streak++
    else break
  }

  const totalTimeMinutes = Math.round(
    attempts.reduce((s, a) => s + (a.durationSeconds ?? 0), 0) / 60,
  )

  const avgTimePerQuestion = (() => {
    let totalQ = 0
    let totalSec = 0
    for (const a of attempts) {
      const n = (a.correct ?? 0) + (a.wrong ?? 0) + (a.unattempted ?? 0)
      if (n > 0 && a.durationSeconds) {
        totalQ += n
        totalSec += a.durationSeconds
      }
    }
    return totalQ > 0 ? Math.round(totalSec / totalQ) : 0
  })()

  const recentAttempts = attempts.slice(0, 8).map((a) => ({
    id: a.id,
    testId: a.testId,
    title: a.title,
    score: a.score,
    maxScore: a.maxScore,
    accuracy: a.accuracy ?? 0,
    percentile: scoreToPercentile(a.score, a.maxScore),
    durationSeconds: a.durationSeconds,
    submittedAt: a.submittedAt,
    pct: a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0,
  }))

  const lastTwo = recentAttempts.slice(0, 2)
  const scoreTrendDelta =
    lastTwo.length === 2 ? lastTwo[0].pct - lastTwo[1].pct : 0

  const strongSubjects = Object.entries(bySubject)
    .map(([id, d]) => ({
      id,
      pct: d.max > 0 ? Math.round((d.score / d.max) * 100) : 0,
      count: d.count,
    }))
    .filter((s) => s.pct >= 65 && s.count >= 1)
    .sort((a, b) => b.pct - a.pct)

  const weakSubjects = Object.entries(bySubject)
    .map(([id, d]) => ({
      id,
      pct: d.max > 0 ? Math.round((d.score / d.max) * 100) : 0,
      count: d.count,
    }))
    .filter((s) => s.pct < 55 && s.count >= 1)
    .sort((a, b) => a.pct - b.pct)

  const activityByDay = (() => {
    /** @type {Record<string, number>} */
    const map = {}
    for (const a of attempts) {
      const key = new Date(a.submittedAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      })
      map[key] = (map[key] ?? 0) + 1
    }
    return Object.entries(map)
      .slice(0, 14)
      .map(([day, count]) => ({ day, count }))
  })()

  let totalCorrect = 0
  let totalWrong = 0
  let totalUnattempted = 0
  const byChapter = {}

  for (const a of attempts) {
    totalCorrect += a.correct ?? 0
    totalWrong += a.wrong ?? 0
    totalUnattempted += a.unattempted ?? 0
    const chapters = a.byChapter ?? a.resultSnapshot?.result?.byChapter ?? {}
    for (const [ch, stats] of Object.entries(chapters)) {
      if (!byChapter[ch]) {
        byChapter[ch] = { correct: 0, wrong: 0, unattempted: 0, score: 0, maxScore: 0, tests: 0 }
      }
      byChapter[ch].correct += stats.correct ?? 0
      byChapter[ch].wrong += stats.wrong ?? 0
      byChapter[ch].unattempted += stats.unattempted ?? 0
      byChapter[ch].score += stats.score ?? 0
      byChapter[ch].maxScore += stats.maxScore ?? 0
      byChapter[ch].tests++
    }
  }

  const weakChapters = Object.entries(byChapter)
    .map(([chapter, s]) => {
      const att = s.correct + s.wrong
      return {
        chapter,
        accuracy: att > 0 ? Math.round((s.correct / att) * 100) : 0,
        wrong: s.wrong,
        unattempted: s.unattempted,
        tests: s.tests,
      }
    })
    .filter((c) => c.wrong > 0 || c.accuracy < 65)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10)

  const studyPlan = buildAiStudyPlan(attempts)

  const recommendations = []
  for (const step of studyPlan.steps.slice(0, 3)) {
    recommendations.push({
      type: 'ai-plan',
      title: step.title,
      detail: step.detail,
      to: step.to,
      chapter: step.chapter,
      subject: step.subject,
      icon: step.icon,
      onNavigate: step.chapter
        ? () =>
            savePracticePrefill({
              subjects: step.subject ? [step.subject] : [],
              chapters: [step.chapter],
            })
        : undefined,
    })
  }
  if (weakChapters.length && !recommendations.some((r) => r.chapter === weakChapters[0].chapter)) {
    recommendations.push({
      type: 'chapter',
      title: `Practice ${weakChapters[0].chapter}`,
      detail: `${weakChapters[0].accuracy}% accuracy — drill this chapter`,
      to: '/practice',
      chapter: weakChapters[0].chapter,
      onNavigate: () =>
        savePracticePrefill({ chapters: [weakChapters[0].chapter] }),
    })
  }
  if (avgAccuracy < 60) {
    recommendations.push({
      type: 'accuracy',
      title: 'Chapter proficiency tests',
      detail: 'Shorter tests help build accuracy before full mocks',
      to: '/tests',
    })
  }
  if (streak < 3) {
    recommendations.push({
      type: 'streak',
      title: 'Daily practice streak',
      detail: 'One test a day builds exam stamina',
      to: '/practice',
    })
  }
  recommendations.push({
    type: 'mock',
    title: 'Full mock test',
    detail: 'Simulate exam day with timed NTA-style paper',
    to: '/tests',
  })

  const timeSinks = []
  for (const a of attempts.slice(0, 6)) {
    const data = attemptToResultData(a)
    if (!data?.result) continue
    const pack = buildTimeSinks({
      result: data.result,
      questionTimes: data.questionTimes ?? {},
    })
    for (const sink of pack.sinks.slice(0, 3)) {
      timeSinks.push({
        ...sink,
        title: a.title,
        testId: a.testId,
        attemptId: a.id,
      })
    }
  }
  timeSinks.sort((a, b) => b.seconds - a.seconds)

  return {
    totalAttempts: attempts.length,
    avgAccuracy,
    avgPercentile,
    bestPercentile,
    trend,
    bySubject,
    byChapter,
    weakChapters,
    totalCorrect,
    totalWrong,
    totalUnattempted,
    streak: Math.max(streak, attempts.length > 0 ? 1 : 0),
    totalTimeMinutes,
    avgTimePerQuestion,
    recentAttempts,
    scoreTrendDelta,
    strongSubjects,
    weakSubjects,
    activityByDay,
    recommendations,
    mastery: studyPlan.mastery,
    studyPlan,
    timeSinks: timeSinks.slice(0, 8),
  }
}
