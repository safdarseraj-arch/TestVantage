import { getSubjectsForPattern } from '../data/subjects.js'
import { attemptToResultData, getAllStudentAttempts } from './attemptHistory.js'
import { formatTime } from './formatTime.js'

const SUBJECT_ICONS = {
  overall: '📊',
  physics: '⚛️',
  chemistry: '🧪',
  mathematics: '📐',
  botany: '🌿',
  zoology: '🦴',
  biology: '🧬',
}

const BIOLOGY_IDS = new Set(['botany', 'zoology', 'biology'])

import { COMPARE_SERIES_KEYS, COMPARE_SERIES_LABELS, chartSeries } from './chartColors.js'

/** @param {string} examPatternId */
export function getAnalysisSubjectTabs(examPatternId) {
  const subjects = getSubjectsForPattern(examPatternId)
  const hasBioSplit = subjects.some((s) => s.id === 'botany' || s.id === 'zoology')
  const tabs = [{ id: 'overall', label: 'Overall', icon: SUBJECT_ICONS.overall, color: '#6366f1' }]

  for (const s of subjects) {
    if (hasBioSplit && BIOLOGY_IDS.has(s.id)) continue
    tabs.push({
      id: s.id,
      label: s.label,
      icon: SUBJECT_ICONS[s.id] ?? '📘',
      color: s.color,
    })
  }
  if (hasBioSplit) {
    tabs.push({ id: 'biology', label: 'Biology', icon: SUBJECT_ICONS.biology, color: '#059669' })
  }
  return tabs
}

/** @param {import('../data/tests').PerQuestionResult[]} perQ @param {string} subjectId */
export function filterPerQuestionForSubject(perQ, subjectId) {
  if (!subjectId || subjectId === 'overall') return perQ ?? []
  if (subjectId === 'biology') {
    return (perQ ?? []).filter((pq) => BIOLOGY_IDS.has(pq.subject))
  }
  return (perQ ?? []).filter((pq) => pq.subject === subjectId)
}

/** @param {import('../data/tests').TestResult} result @param {string} categoryId */
export function getScoreForCategory(result, categoryId) {
  if (categoryId === 'overall') {
    return { score: result.score, maxScore: result.maxScore }
  }
  if (categoryId === 'biology') {
    const perQ = filterPerQuestionForSubject(result.perQuestion, 'biology')
    return {
      score: perQ.reduce((s, p) => s + (p.marks ?? 0), 0),
      maxScore: perQ.reduce((s, p) => s + (p.maxMarks ?? 0), 0),
    }
  }
  const sub = result.bySubject?.[categoryId]
  return { score: sub?.score ?? 0, maxScore: sub?.maxScore ?? 0 }
}

/** @param {number[]} values */
function percentileThreshold(values, pct) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

/** @param {number[]} values @param {number} minScore */
function avgAbove(values, minScore) {
  const above = values.filter((v) => v >= minScore)
  if (!above.length) return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  return above.reduce((a, b) => a + b, 0) / above.length
}

/**
 * Cohort score comparison for vertical bar chart.
 * @param {string} testId
 * @param {import('../data/tests').TestResult} currentResult
 * @param {string} examPatternId
 * @param {string} subjectFilter
 */
export function buildCohortScoreComparison(testId, currentResult, examPatternId, subjectFilter) {
  const subjectTabs = getAnalysisSubjectTabs(examPatternId)
  const categoryIds =
    subjectFilter === 'overall'
      ? subjectTabs.map((t) => t.id)
      : [subjectFilter]

  const categories = categoryIds.map((id) => {
    const tab = subjectTabs.find((t) => t.id === id)
    const { score, maxScore } = getScoreForCategory(currentResult, id)
    return {
      id,
      label: tab?.label ?? id,
      maxScore,
      you: score,
    }
  })

  const attempts = getAllStudentAttempts().filter((a) => a.testId === testId)
  const cohortByCategory = Object.fromEntries(categoryIds.map((id) => [id, []]))

  for (const attempt of attempts) {
    const data = attemptToResultData(attempt)
    const r = data?.result
    if (!r) continue
    for (const id of categoryIds) {
      cohortByCategory[id].push(getScoreForCategory(r, id).score)
    }
  }

  const series = COMPARE_SERIES_KEYS.map((key) => {
    const base = chartSeries(key, COMPARE_SERIES_LABELS[key])
    return {
      ...base,
      values: Object.fromEntries(
        categoryIds.map((id) => {
          const vals = cohortByCategory[id]
          if (key === 'you') return [id, getScoreForCategory(currentResult, id).score]
          if (!vals.length) return [id, 0]
          if (key === 'topper') return [id, Math.max(...vals)]
          if (key === 'allAvg') return [id, Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)]
          if (key === 'top10') return [id, Math.round(avgAbove(vals, percentileThreshold(vals, 90)))]
          if (key === 'top25') return [id, Math.round(avgAbove(vals, percentileThreshold(vals, 75)))]
          return [id, 0]
        }),
      ),
    }
  })

  return { categories, series, studentCount: attempts.length }
}

/**
 * Percentile milestone bar for summary header.
 * @param {string} testId
 * @param {number} yourScore
 * @param {number} maxScore
 */
export function buildPercentileMilestones(testId, yourScore, maxScore) {
  const attempts = getAllStudentAttempts().filter((a) => a.testId === testId)
  const scores = attempts.map((a) => a.score ?? a.result?.score ?? 0).sort((a, b) => a - b)
  const yourPct =
    scores.length > 1
      ? Math.round((scores.filter((s) => s < yourScore).length / scores.length) * 100)
      : null

  const milestones = [51, 73, 90].map((pct) => {
    const score = Math.round(percentileThreshold(scores, pct))
    return { pct, score, maxScore }
  })

  return { yourScore, maxScore, yourPct, milestones, studentCount: scores.length }
}

/**
 * Stamina — correct / incorrect per quarter of the paper.
 * @param {import('../data/tests').TestResult} result
 * @param {string} subjectFilter
 */
export function buildStaminaQuarters(result, subjectFilter) {
  const perQ = filterPerQuestionForSubject(result.perQuestion ?? [], subjectFilter)
  const sorted = [...perQ].sort((a, b) => a.index - b.index)
  const n = sorted.length
  if (!n) return []

  const qSize = Math.ceil(n / 4)
  return [0, 1, 2, 3].map((i) => {
    const slice = sorted.slice(i * qSize, i === 3 ? n : (i + 1) * qSize)
    const from = slice[0]?.index ?? 0
    const to = slice[slice.length - 1]?.index ?? 0
    const correct = slice.filter((p) => p.grade === 'correct').length
    const incorrect = slice.filter((p) => p.grade === 'wrong' || p.grade === 'partial').length
    const unattempted = slice.filter((p) => p.grade === 'unattempted').length
    const attempted = correct + incorrect
    return {
      id: `q${i + 1}`,
      label: `Quarter ${i + 1}`,
      range: `Q${from}–Q${to}`,
      correct,
      incorrect,
      unattempted,
      attempted,
      total: slice.length,
    }
  })
}

/**
 * Difficulty breakdown using cohort question difficulty tags.
 * @param {import('../data/tests').TestResult} result
 * @param {string} testId
 * @param {import('../data/tests').Question[]} questions
 * @param {string} subjectFilter
 */
export function buildDifficultyAnalysis(result, testId, questions, subjectFilter) {
  const cohort = buildQuestionLevelCohortStats(testId, questions)
  const diffMap = new Map(cohort.map((r) => [r.questionId, r.difficulty]))
  const perQ = filterPerQuestionForSubject(result.perQuestion ?? [], subjectFilter)

  const buckets = {
    easy: { label: 'Easy', correct: 0, incorrect: 0, unattempted: 0, score: 0, maxScore: 0 },
    medium: { label: 'Medium', correct: 0, incorrect: 0, unattempted: 0, score: 0, maxScore: 0 },
    hard: { label: 'Hard', correct: 0, incorrect: 0, unattempted: 0, score: 0, maxScore: 0 },
  }

  for (const pq of perQ) {
    const d = diffMap.get(pq.questionId) ?? 'medium'
    const b = buckets[d] ?? buckets.medium
    if (pq.grade === 'correct') b.correct++
    else if (pq.grade === 'unattempted') b.unattempted++
    else b.incorrect++
    b.score += pq.marks ?? 0
    b.maxScore += pq.maxMarks ?? 0
  }

  return Object.entries(buckets).map(([id, b]) => ({
    id,
    ...b,
    accuracy:
      b.correct + b.incorrect > 0 ? Math.round((b.correct / (b.correct + b.incorrect)) * 100) : 0,
  }))
}

/**
 * Chapter-level stats for vertical comparison.
 * @param {import('../data/tests').TestResult} result
 * @param {string} testId
 * @param {string} subjectFilter
 */
export function buildChapterLevelAnalysis(result, testId, subjectFilter) {
  const perQ = filterPerQuestionForSubject(result.perQuestion ?? [], subjectFilter)
  const byChapter = {}

  for (const pq of perQ) {
    const ch = pq.chapter || 'General'
    if (!byChapter[ch]) {
      byChapter[ch] = { chapter: ch, score: 0, maxScore: 0, correct: 0, wrong: 0, unattempted: 0 }
    }
    byChapter[ch].score += pq.marks ?? 0
    byChapter[ch].maxScore += pq.maxMarks ?? 0
    if (pq.grade === 'correct') byChapter[ch].correct++
    else if (pq.grade === 'unattempted') byChapter[ch].unattempted++
    else byChapter[ch].wrong++
  }

  const attempts = getAllStudentAttempts().filter((a) => a.testId === testId)
  const cohortChapterScores = {}

  for (const attempt of attempts) {
    const data = attemptToResultData(attempt)
    const attemptPerQ = filterPerQuestionForSubject(data?.result?.perQuestion ?? [], subjectFilter)
    const chapterTotals = {}
    for (const pq of attemptPerQ) {
      const ch = pq.chapter || 'General'
      chapterTotals[ch] = (chapterTotals[ch] ?? 0) + (pq.marks ?? 0)
    }
    for (const [ch, score] of Object.entries(chapterTotals)) {
      if (!cohortChapterScores[ch]) cohortChapterScores[ch] = []
      cohortChapterScores[ch].push(score)
    }
  }

  return Object.values(byChapter)
    .map((row) => {
      const cohort = cohortChapterScores[row.chapter] ?? []
      const allAvg = cohort.length
        ? Math.round(cohort.reduce((a, b) => a + b, 0) / cohort.length)
        : 0
      const topper = cohort.length ? Math.max(...cohort) : row.score
      return {
        ...row,
        topper,
        allAvg,
        top10: cohort.length ? Math.round(avgAbove(cohort, percentileThreshold(cohort, 90))) : 0,
        top25: cohort.length ? Math.round(avgAbove(cohort, percentileThreshold(cohort, 75))) : 0,
      }
    })
    .sort((a, b) => b.maxScore - a.maxScore)
}

/**
 * Time behaviour stats with cohort comparison.
 * @param {object} params
 */
export function buildTimeBehaviourAnalysis({
  result,
  questionTimes = {},
  examPatternId,
  subjectFilter,
  testId,
}) {
  const perQ = filterPerQuestionForSubject(result.perQuestion ?? [], subjectFilter)
  const subjectTabs = getAnalysisSubjectTabs(examPatternId)
  const categoryIds =
    subjectFilter === 'overall' ? subjectTabs.map((t) => t.id) : [subjectFilter]

  const yourStats = (list) => {
    const times = list.map((pq) => questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0)
    const total = times.reduce((a, b) => a + b, 0)
    const attempted = list.filter((pq) => pq.grade !== 'unattempted').length
    return {
      totalSeconds: total,
      avgSeconds: attempted ? Math.round(total / attempted) : 0,
      attempted,
    }
  }

  const categories = categoryIds.map((id) => {
    const list =
      id === 'overall' ? perQ : filterPerQuestionForSubject(result.perQuestion ?? [], id)
    const tab = subjectTabs.find((t) => t.id === id)
    const stats = yourStats(list)
    return {
      id,
      label: tab?.label ?? id,
      ...stats,
      totalLabel: formatTime(stats.totalSeconds),
    }
  })

  const attempts = getAllStudentAttempts().filter((a) => a.testId === testId)
  const cohortAvgTime = Object.fromEntries(
    categoryIds.map((id) => {
      const avgs = attempts
        .map((a) => {
          const data = attemptToResultData(a)
          const list = filterPerQuestionForSubject(data?.result?.perQuestion ?? [], id)
          const times = list.map(
            (pq) => (data?.questionTimes ?? {})[pq.questionId] ?? pq.timeSpentSeconds ?? 0,
          )
          const attempted = list.filter((pq) => pq.grade !== 'unattempted').length
          return attempted ? times.reduce((s, t) => s + t, 0) / attempted : 0
        })
        .filter((v) => v > 0)
      return [id, avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : 0]
    }),
  )

  const series = [
    {
      ...chartSeries('you', 'Your avg (sec/Q)'),
      values: Object.fromEntries(categories.map((c) => [c.id, c.avgSeconds])),
    },
    {
      ...chartSeries('allAvg', 'Device avg (sec/Q)'),
      values: cohortAvgTime,
    },
  ]

  return { categories, series, studentCount: attempts.length }
}
/**
 * Detailed overview rows: score, correct, incorrect, unattempted, not visited.
 * @param {object} params
 * @param {import('../data/tests').TestResult} params.result
 * @param {string} params.examPatternId
 * @param {number} [params.totalQuestions]
 * @param {Set<string>|string[]} [params.visitedIds]
 * @param {Record<string, number>} [params.questionTimes]
 * @param {import('../data/tests').Question[]} [params.questions]
 */
export function buildPerformanceOverview({
  result,
  examPatternId,
  totalQuestions,
  visitedIds,
  questionTimes = {},
  questions: _questions = [],
}) {
  const subjects = getSubjectsForPattern(examPatternId)
  const total = totalQuestions ?? result.perQuestion?.length ?? 0
  const visited = visitedIds instanceof Set ? visitedIds : new Set(visitedIds ?? [])

  const countNotVisited = (list) => {
    if (!list?.length) return 0
    return list.filter((pq) => {
      if (pq.grade !== 'unattempted') return false
      if (pq.marked) return false
      const spent = questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0
      if (spent > 0) return false
      if (visited.size && !visited.has(pq.questionId)) return true
      return visited.size === 0 && spent === 0
    }).length
  }

  const rowFromStats = (label, stats, perQ = []) => ({
    label,
    score: stats?.score ?? 0,
    maxScore: stats?.maxScore ?? 0,
    correct: stats?.correct ?? 0,
    incorrect: stats?.wrong ?? 0,
    partial: stats?.partial ?? 0,
    unattempted: stats?.unattempted ?? 0,
    notVisited: countNotVisited(perQ),
    totalQuestions: perQ.length || total,
    accuracyPct:
      stats && stats.correct + stats.wrong + (stats.partial ?? 0) > 0
        ? Math.round(
            (stats.correct / (stats.correct + stats.wrong + (stats.partial ?? 0))) * 100,
          )
        : 0,
    scorePct: stats?.maxScore > 0 ? Math.round((stats.score / stats.maxScore) * 100) : 0,
  })

  const perQ = result.perQuestion ?? []
  const overallStats = {
    score: result.score,
    maxScore: result.maxScore,
    correct: result.correct,
    wrong: result.wrong,
    partial: result.partial ?? 0,
    unattempted: result.unattempted,
  }

  const rows = [rowFromStats('Overall', overallStats, perQ)]

  for (const sub of subjects) {
    const stats = result.bySubject?.[sub.id]
    const subPerQ = perQ.filter((pq) => pq.subject === sub.id)
    if (!stats && !subPerQ.length) continue
    const totalSub = subPerQ.length
    if (totalSub === 0 && !stats) continue
    rows.push(rowFromStats(sub.label, stats ?? {}, subPerQ))
  }

  return rows
}

/** Time analytics — slow questions, subject time share. */
export function buildTimeAnalytics({ result, questionTimes = {}, examPatternId }) {
  const perQ = result?.perQuestion ?? []
  const subjects = getSubjectsForPattern(examPatternId)
  const times = perQ.map((pq) => ({
    index: pq.index,
    questionId: pq.questionId,
    subject: pq.subject,
    grade: pq.grade,
    seconds: questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0,
  }))

  const totalSeconds = times.reduce((s, t) => s + t.seconds, 0)
  const attempted = times.filter((t) => t.seconds > 0 || t.grade !== 'unattempted')
  const avgSeconds = attempted.length
    ? Math.round(totalSeconds / attempted.length)
    : 0

  const slowest = [...times].sort((a, b) => b.seconds - a.seconds).slice(0, 8)

  const bySubject = {}
  for (const sub of subjects) {
    bySubject[sub.id] = { label: sub.label, seconds: 0, count: 0 }
  }
  for (const t of times) {
    if (!bySubject[t.subject]) bySubject[t.subject] = { label: t.subject, seconds: 0, count: 0 }
    bySubject[t.subject].seconds += t.seconds
    bySubject[t.subject].count++
  }

  return {
    totalSeconds,
    totalLabel: formatTime(totalSeconds),
    avgSeconds,
    slowest,
    bySubject: Object.values(bySubject).filter((s) => s.count > 0),
  }
}

/** Weak topics from chapter breakdown. */
export function buildWeakTopics(byChapter = {}) {
  return Object.entries(byChapter)
    .map(([chapter, stats]) => {
      const attempted = stats.correct + stats.wrong + (stats.partial ?? 0)
      const accuracy = attempted > 0 ? Math.round((stats.correct / attempted) * 100) : 0
      return {
        chapter,
        accuracy,
        wrong: stats.wrong,
        unattempted: stats.unattempted,
        score: stats.score,
        maxScore: stats.maxScore,
      }
    })
    .filter((t) => t.wrong > 0 || t.unattempted > 0 || t.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 12)
}

/** @param {import('../data/tests').PerQuestionResult[]} perQuestion */
export function buildChapterSubjectMap(perQuestion = []) {
  /** @type {Record<string, Set<string>>} */
  const map = {}
  for (const pq of perQuestion) {
    if (!pq.chapter || !pq.subject) continue
    if (!map[pq.chapter]) map[pq.chapter] = new Set()
    map[pq.chapter].add(pq.subject)
  }
  return Object.fromEntries(Object.entries(map).map(([ch, set]) => [ch, [...set]]))
}

/**
 * Per-question cohort stats across all stored attempts for one test.
 * @param {string} testId
 * @param {import('../data/tests').Question[]} [questions]
 */
export function buildQuestionLevelCohortStats(testId, questions = []) {
  const attempts = getAllStudentAttempts().filter((a) => a.testId === testId)
  const counts = new Map()

  for (const q of questions) {
    counts.set(q.id, { questionId: q.id, correct: 0, wrong: 0, unattempted: 0, total: 0 })
  }

  for (const attempt of attempts) {
    const data = attemptToResultData(attempt)
    const perQ = data?.result?.perQuestion ?? []
    for (const pq of perQ) {
      const row = counts.get(pq.questionId)
      if (!row) continue
      row.total++
      if (pq.grade === 'correct') row.correct++
      else if (pq.grade === 'unattempted') row.unattempted++
      else row.wrong++
    }
  }

  const studentCount = attempts.length

  return questions.map((q, i) => {
    const row = counts.get(q.id) ?? { correct: 0, wrong: 0, unattempted: 0, total: 0 }
    const denom = row.total > 0 ? row.total : studentCount || 1
    const correctPct = Math.round((row.correct / denom) * 100)
    const wrongPct = Math.round((row.wrong / denom) * 100)
    let unattemptedPct = Math.round((row.unattempted / denom) * 100)
    const sum = correctPct + wrongPct + unattemptedPct
    if (sum !== 100 && denom > 0) {
      unattemptedPct = Math.max(0, 100 - correctPct - wrongPct)
    }
    return {
      questionId: q.id,
      index: i + 1,
      subject: q.subject,
      chapter: q.chapter,
      questionType: q.questionType ?? 'single_correct',
      text: q.text ?? '',
      correct: row.correct,
      wrong: row.wrong,
      unattempted: row.unattempted,
      responses: row.total,
      studentCount,
      correctPct,
      wrongPct,
      unattemptedPct,
      difficulty:
        wrongPct >= 60 ? 'hard' : wrongPct >= 35 || unattemptedPct >= 40 ? 'medium' : 'easy',
    }
  })
}

/** @param {number[]} times @param {number} pct — fastest fraction (e.g. 10 = top 10% quickest) */
function avgFastestFraction(times, pct) {
  const sorted = times.filter((t) => t > 0).sort((a, b) => a - b)
  if (!sorted.length) return null
  const n = Math.max(1, Math.ceil((pct / 100) * sorted.length))
  const slice = sorted.slice(0, n)
  return Math.round(slice.reduce((a, b) => a + b, 0) / slice.length)
}

/** @param {number[]} times */
function averagePositiveTime(times) {
  const valid = times.filter((t) => t > 0)
  if (!valid.length) return null
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
}

/**
 * Per-question peer response + time stats across stored attempts for one test.
 * @param {string} testId
 * @param {import('../data/tests').Question[]} [questions]
 * @returns {Map<string, {
 *   questionId: string
 *   appearedTo: number
 *   correct: number
 *   wrong: number
 *   skipped: number
 *   correctPct: number
 *   wrongPct: number
 *   skippedPct: number
 *   studentCount: number
 *   avgTimeSeconds: number | null
 *   top10TimeSeconds: number | null
 *   top25TimeSeconds: number | null
 *   top50TimeSeconds: number | null
 *   timeSampleSize: number
 * }>}
 */
export function buildPerQuestionPeerStats(testId, questions = []) {
  const attempts = getAllStudentAttempts().filter((a) => a.testId === testId)
  const responseMap = new Map()
  const timeMap = new Map()

  for (const q of questions) {
    responseMap.set(q.id, { correct: 0, wrong: 0, unattempted: 0, total: 0 })
    timeMap.set(q.id, [])
  }

  for (const attempt of attempts) {
    const data = attemptToResultData(attempt)
    const qTimes = data?.questionTimes ?? {}
    const perQ = data?.result?.perQuestion ?? []
    for (const pq of perQ) {
      const id = pq.questionId
      const row = responseMap.get(id)
      if (row) {
        row.total++
        if (pq.grade === 'correct') row.correct++
        else if (pq.grade === 'unattempted') row.unattempted++
        else row.wrong++
      }
      const sec = Number(qTimes[id] ?? pq.timeSpentSeconds ?? 0)
      if (sec > 0 && timeMap.has(id)) timeMap.get(id).push(sec)
    }
  }

  const studentCount = attempts.length
  const out = new Map()

  for (const q of questions) {
    const row = responseMap.get(q.id) ?? { correct: 0, wrong: 0, unattempted: 0, total: 0 }
    const times = timeMap.get(q.id) ?? []
    const denom = row.total > 0 ? row.total : studentCount || 1
    const correctPct = Math.round((row.correct / denom) * 100)
    const wrongPct = Math.round((row.wrong / denom) * 100)
    let skippedPct = Math.round((row.unattempted / denom) * 100)
    const sum = correctPct + wrongPct + skippedPct
    if (sum !== 100 && denom > 0) skippedPct = Math.max(0, 100 - correctPct - wrongPct)

    out.set(q.id, {
      questionId: q.id,
      appearedTo: row.total,
      correct: row.correct,
      wrong: row.wrong,
      skipped: row.unattempted,
      correctPct,
      wrongPct,
      skippedPct,
      studentCount,
      avgTimeSeconds: averagePositiveTime(times),
      top10TimeSeconds: avgFastestFraction(times, 10),
      top25TimeSeconds: avgFastestFraction(times, 25),
      top50TimeSeconds: avgFastestFraction(times, 50),
      timeSampleSize: times.filter((t) => t > 0).length,
    })
  }

  return out
}

/**
 * Questions that ate extra time and still went wrong — the real time sinks.
 * @param {{
 *   result?: { perQuestion?: object[] }
 *   questionTimes?: Record<string, number>
 *   avgSeconds?: number
 *   subjectFilter?: string
 * }} params
 */
export function buildTimeSinks({
  result,
  questionTimes = {},
  avgSeconds = 0,
  subjectFilter = 'overall',
} = {}) {
  const perQ = filterPerQuestionForSubject(result?.perQuestion ?? [], subjectFilter)
  const rows = perQ.map((pq) => ({
    index: pq.index,
    questionId: pq.questionId,
    chapter: pq.chapter,
    subject: pq.subject,
    grade: pq.grade,
    seconds: Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0),
  }))
  const timed = rows.filter((t) => t.seconds > 0)
  const avg =
    avgSeconds > 0
      ? avgSeconds
      : timed.length
        ? Math.round(timed.reduce((s, t) => s + t.seconds, 0) / timed.length)
        : 0
  const threshold = Math.max(Math.round(avg * 1.4), avg + 12, 40)
  return {
    avgSeconds: avg,
    threshold,
    sinks: rows
      .filter(
        (t) => t.seconds >= threshold && (t.grade === 'wrong' || t.grade === 'partial'),
      )
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 10),
  }
}

/** One-line stamina read from quarter cards. */
export function buildStaminaInsight(quarters = []) {
  if (!quarters.length) return null
  const withAcc = quarters.map((q) => ({
    ...q,
    acc: q.total > 0 ? Math.round((q.correct / q.total) * 100) : 0,
  }))
  const best = withAcc.reduce((a, b) => (a.acc >= b.acc ? a : b))
  const worst = withAcc.reduce((a, b) => (a.acc <= b.acc ? a : b))
  if (best.id === worst.id) {
    return `Steady stamina — about ${best.acc}% accuracy across the paper.`
  }
  const fade =
    worst.id === 'q4' || worst.id === 'q3'
      ? ' You faded later in the paper — timed full mocks will help.'
      : ''
  return `Strongest in ${best.label} (${best.acc}%), weakest in ${worst.label} (${worst.acc}%).${fade}`
}

/** One-line difficulty read. */
export function buildDifficultyInsight(difficulty = []) {
  if (!difficulty.length) return null
  const hard = difficulty.find((d) => d.id === 'hard')
  const easy = difficulty.find((d) => d.id === 'easy')
  if (easy && easy.accuracy < 70 && easy.correct + easy.incorrect > 0) {
    return `Easy questions are leaking marks (${easy.accuracy}% accuracy) — lock the syllabus basics first.`
  }
  if (hard && hard.incorrect > hard.correct && hard.incorrect + hard.correct > 0) {
    return `Hard items cost you ${hard.incorrect} wrong answers. Skip faster and return only if time remains.`
  }
  if (hard && hard.accuracy >= 60) {
    return `Hard questions are holding up (${hard.accuracy}% accuracy) — keep that toughness, tidy the rest.`
  }
  return 'Review Easy / Medium / Hard below — accuracy is on attempted questions only.'
}
