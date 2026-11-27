/**
 * Exhaustive multi-page printable diagnostic report (HTML → Print → Save as PDF).
 * Matches / exceeds founder Flagship / JEE Advanced / NEET sample PDF depth using
 * existing Result analysis builders — no paid PDF SaaS.
 */

import { scoreToPercentile, estimateAIR } from './percentile.js'
import { formatTime } from './formatTime.js'
import { computePerformanceGrade, buildResultCoachInsights } from './resultInsights.js'
import {
  buildWeakTopics,
  buildPerformanceOverview,
  buildTimeBehaviourAnalysis,
  buildTimeAnalytics,
  buildTimeSinks,
  buildDifficultyAnalysis,
  buildDifficultyInsight,
  buildStaminaQuarters,
  buildStaminaInsight,
  buildChapterLevelAnalysis,
  buildCohortScoreComparison,
  buildPerQuestionPeerStats,
  getAnalysisSubjectTabs,
} from './testAnalysis.js'
import {
  buildAttemptQualityMatrix,
  simulateWhatIfScore,
} from './attemptQualityMatrix.js'
import {
  buildClockStaminaCurve,
  buildSkipIq,
  buildErrorDnaTypes,
  buildPassTimeline,
  buildDreamCollegeGapTeaser,
  enrichDifficultyWithSitterConversion,
  buildScoreFloorCeilingBand,
} from './resultAdvancedAnalytics.js'
import {
  resolveToughnessLevel,
  toughnessLabel,
  resolveIdealTimeSeconds,
  formatDiagDuration,
  selfStatusLabel,
  buildDemoPeerStatsForQuestions,
  buildQuestionVisitTimeline,
} from './questionLevelDiagnostics.js'
import { getSubjectsForPattern } from '../data/subjects.js'
import { WRONG_REASON_TAGS } from './wrongReasonTags.js'
import {
  buildAnswerFlipForensics,
  resolvePeerStatsForDiagnostics,
} from './diagnosticLiveCapacity.js'

const TOUGHNESS_ORDER = [1, 2, 3, 4, 5]
const TOUGHNESS_NAMES = {
  1: 'L1 Very easy',
  2: 'L2 Easy',
  3: 'L3 Moderate',
  4: 'L4 Hard',
  5: 'L5 Very hard',
}

const BUCKET7_META = {
  perfect: { label: 'Perfect', hint: 'Correct within ideal time' },
  slowWin: { label: 'Slow Win', hint: 'Correct, over ideal time' },
  wasted: { label: 'Wasted', hint: 'Wrong, rushed under ~25% ideal' },
  painful: { label: 'Painful', hint: 'Wrong after over-investing time' },
  smartSkip: { label: 'Smart Skip', hint: 'Skipped cleanly under ~60s / 25% ideal' },
  confused: { label: 'Confused', hint: 'Skipped after wasting over ideal' },
  notVisited: { label: 'Not Visited', hint: 'Never opened / 0s dwell' },
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function subjectLabelOf(id, examPatternId) {
  const subs = getSubjectsForPattern(examPatternId)
  const hit = subs.find((s) => s.id === id)
  if (hit) return hit.label
  if (!id) return '—'
  return String(id).charAt(0).toUpperCase() + String(id).slice(1)
}

function fmtMarks(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return Number(n).toLocaleString('en-IN')
}

function pctOf(num, den) {
  if (!(den > 0)) return 0
  return Math.round((num / den) * 1000) / 10
}

function barHtml(pct, color = '#2563eb') {
  const w = Math.max(0, Math.min(100, Number(pct) || 0))
  return `<div class="bar"><span style="width:${w}%;background:${color}"></span></div>`
}

function wrongReasonLabel(tag) {
  if (!tag) return '—'
  const hit = WRONG_REASON_TAGS.find((t) => t.id === tag)
  if (hit) return hit.short
  const legacy = { misread: 'Misread', concept: 'Concept', calc: 'Calc', guess: 'Guess' }
  return legacy[tag] || String(tag)
}

/**
 * Expand attempt-quality into the founder-style 7-bucket matrix.
 */
function buildSevenBucketMatrix({ result, questionTimes = {}, questions = [], paperDurationSec = 0 }) {
  const perQ = result?.perQuestion ?? []
  const qById = Object.fromEntries((questions || []).map((q) => [q.id, q]))
  const matrix = buildAttemptQualityMatrix({
    result,
    questionTimes,
    paperDurationSec,
    questions,
  })
  const idealFallback = matrix.idealSeconds || 90

  /** @type {Record<string, number>} */
  const overall = {
    perfect: 0,
    slowWin: 0,
    wasted: 0,
    painful: 0,
    smartSkip: 0,
    confused: 0,
    notVisited: 0,
  }
  /** @type {Record<string, Record<string, number>>} */
  const bySubject = {}

  const bump = (sub, key) => {
    overall[key]++
    if (!bySubject[sub]) {
      bySubject[sub] = {
        perfect: 0,
        slowWin: 0,
        wasted: 0,
        painful: 0,
        smartSkip: 0,
        confused: 0,
        notVisited: 0,
      }
    }
    bySubject[sub][key]++
  }

  let sunkSec = 0
  let sunkMarks = 0

  for (const pq of perQ) {
    const sub = pq.subject || 'other'
    const sec = Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0)
    const q = qById[pq.questionId]
    const ideal = resolveIdealTimeSeconds(q || { toughnessLevel: pq.toughnessLevel, difficulty: pq.difficulty })
      .seconds || idealFallback
    const grade = pq.grade

    let key = 'confused'
    if (grade === 'correct' || grade === 'partial') {
      key = sec === 0 || sec <= ideal ? 'perfect' : 'slowWin'
    } else if (grade === 'wrong') {
      if (sec > 0 && sec < ideal * 0.25) key = 'wasted'
      else if (sec > ideal * 1.5) key = 'painful'
      else if (sec > ideal) key = 'painful'
      else key = 'wasted'
    } else {
      // unattempted
      if (sec <= 0) key = 'notVisited'
      else if (sec < Math.min(60, ideal * 0.25)) key = 'smartSkip'
      else if (sec > ideal) key = 'confused'
      else key = 'smartSkip'
    }

    bump(sub, key)
    if (key === 'painful' || key === 'confused') {
      sunkSec += sec
      if (grade === 'wrong') {
        sunkMarks += Math.max(0, (pq.maxMarks ?? 0) - (pq.marks ?? 0))
      }
    }
  }

  return {
    overall,
    bySubject,
    sunkSec,
    sunkMarks,
    idealSeconds: idealFallback,
    meta: BUCKET7_META,
    matrix4: matrix,
  }
}

/**
 * Question-format split (MCQ / numerical / match / assertion-style).
 */
function buildFormatSplit({ result, questions = [], questionTimes = {} }) {
  const qById = Object.fromEntries((questions || []).map((q) => [q.id, q]))
  /** @type {Record<string, { label: string, total: number, attempted: number, correct: number, incorrect: number, time: number, score: number, maxScore: number }>} */
  const buckets = {}

  const classify = (q, pq) => {
    const t = String(q?.questionType || q?.type || '').toLowerCase()
    const text = String(q?.text || pq?.text || '').toLowerCase()
    if (/multi|more_than_one|msq/.test(t)) return { id: 'multi', label: 'Multi-correct / MSQ' }
    if (/integer|numerical|nat|float|numeric/.test(t)) return { id: 'nvt', label: 'Numerical / Integer (NVT)' }
    if (/match|matrix|column/.test(t) || /match the|list[\s-]?i/.test(text))
      return { id: 'match', label: 'Match / Matrix / Column' }
    if (/assertion|statement/.test(t) || /assertion[\s-]?reason|statement[\s-]?i/.test(text))
      return { id: 'ar', label: 'Statement / Assertion-Reason' }
    return { id: 'mcq', label: 'Single-choice MCQ' }
  }

  for (const pq of result?.perQuestion ?? []) {
    const q = qById[pq.questionId]
    const { id, label } = classify(q, pq)
    if (!buckets[id]) {
      buckets[id] = {
        label,
        total: 0,
        attempted: 0,
        correct: 0,
        incorrect: 0,
        time: 0,
        score: 0,
        maxScore: 0,
      }
    }
    const b = buckets[id]
    b.total++
    b.score += pq.marks ?? 0
    b.maxScore += pq.maxMarks ?? 0
    b.time += Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0)
    if (pq.grade === 'correct' || pq.grade === 'partial') {
      b.attempted++
      b.correct++
    } else if (pq.grade === 'wrong') {
      b.attempted++
      b.incorrect++
    }
  }

  return Object.values(buckets).sort((a, b) => b.total - a.total)
}

/**
 * Toughness L1–L5 mix from question bank + attempt outcomes.
 */
function buildToughnessMix({ result, questions = [], questionTimes = {} }) {
  const qById = Object.fromEntries((questions || []).map((q) => [q.id, q]))
  const rows = TOUGHNESS_ORDER.map((level) => ({
    level,
    label: TOUGHNESS_NAMES[level],
    total: 0,
    correct: 0,
    incorrect: 0,
    unattempted: 0,
    time: 0,
    score: 0,
    maxScore: 0,
  }))
  const byLevel = Object.fromEntries(rows.map((r) => [r.level, r]))

  for (const pq of result?.perQuestion ?? []) {
    const q = qById[pq.questionId]
    const level = resolveToughnessLevel(
      q?.toughnessLevel ?? pq.toughnessLevel,
      q?.difficulty ?? pq.difficulty,
    )
    const row = byLevel[level] || byLevel[3]
    row.total++
    row.score += pq.marks ?? 0
    row.maxScore += pq.maxMarks ?? 0
    row.time += Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0)
    if (pq.grade === 'correct' || pq.grade === 'partial') row.correct++
    else if (pq.grade === 'unattempted') row.unattempted++
    else row.incorrect++
  }

  return rows
    .filter((r) => r.total > 0)
    .map((r) => ({
      ...r,
      accuracy: r.correct + r.incorrect > 0 ? Math.round((r.correct / (r.correct + r.incorrect)) * 100) : 0,
      timeLabel: formatTime(r.time),
    }))
}

/**
 * Critical question telemetry rows (wrong / slow / skip highlights).
 */
function buildQuestionHighlights({
  result,
  questions = [],
  questionTimes = {},
  wrongReasons = {},
  peerMap = null,
  sessionTelemetry = null,
  demoPeers = false,
  limit = 18,
}) {
  const qById = Object.fromEntries((questions || []).map((q) => [q.id, q]))
  const perQ = result?.perQuestion ?? []
  const idealFallback = 90

  const scored = perQ.map((pq) => {
    const q = qById[pq.questionId] || {}
    const sec = Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0)
    const ideal = resolveIdealTimeSeconds(q).seconds || idealFallback
    const tough = toughnessLabel(q.toughnessLevel ?? pq.toughnessLevel, q.difficulty ?? pq.difficulty)
    const peer = peerMap?.get?.(pq.questionId) || null
    const reason = wrongReasons[pq.questionId] ?? pq.wrongReason
    const timeline = buildQuestionVisitTimeline({
      questionId: pq.questionId,
      sessionTelemetry,
      totalSeconds: sec,
      demo: demoPeers,
    })
    const overIdeal = ideal > 0 ? sec / ideal : 0
    let priority = 0
    if (pq.grade === 'wrong' || pq.grade === 'partial') priority += 40 + Math.min(30, overIdeal * 10)
    if (pq.grade === 'unattempted' && sec > ideal) priority += 25
    if (pq.grade === 'unattempted' && sec === 0) priority += 12
    if (pq.grade === 'correct' && overIdeal > 1.6) priority += 18
    priority += Math.min(15, (peer?.wrongPct || 0) / 10)

    return {
      index: pq.index,
      questionId: pq.questionId,
      subject: pq.subject,
      chapter: pq.chapter || '—',
      grade: pq.grade,
      status: selfStatusLabel(pq.grade),
      seconds: sec,
      timeLabel: formatDiagDuration(sec),
      idealSeconds: ideal,
      idealLabel: formatDiagDuration(ideal),
      toughness: tough,
      reason: wrongReasonLabel(reason),
      reasonRaw: reason || null,
      visits: timeline.segments?.length || 1,
      visitSource: timeline.source,
      peerCorrectPct: peer?.correctPct ?? null,
      peerTop10: peer?.accuracyBands?.top10?.correctPct ?? null,
      peerTop25: peer?.accuracyBands?.top25?.correctPct ?? null,
      peerAll: peer?.accuracyBands?.all?.correctPct ?? peer?.correctPct ?? null,
      marksLost: Math.max(0, (pq.maxMarks ?? 0) - (pq.marks ?? 0)),
      priority,
      stemSnippet: String(q.text || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90),
    }
  })

  return scored
    .filter((r) => r.priority >= 12)
    .sort((a, b) => b.priority - a.priority || a.index - b.index)
    .slice(0, limit)
}

/**
 * Priority chapter ROI quadrants (P1–P4) from weak + strong chapters.
 */
function buildChapterRoi({ result, questions = [] }) {
  const weak = buildWeakTopics(result?.byChapter ?? {})
  const chapters = result?.byChapter ?? {}
  const qByChapter = {}
  for (const q of questions || []) {
    const ch = q.chapter || 'General'
    if (!qByChapter[ch]) qByChapter[ch] = []
    qByChapter[ch].push(q)
  }

  const p1 = weak.slice(0, 5).map((w) => ({
    quadrant: 'P1',
    title: 'Urgent Fix',
    chapter: w.chapter,
    detail: `${w.accuracy}% accuracy · ${w.wrong} wrong · ${w.unattempted} skip`,
    action: 'Revise concept + 20–25 timed PYQs this week',
  }))

  const strong = Object.entries(chapters)
    .map(([chapter, stats]) => {
      const attempted = (stats.correct ?? 0) + (stats.wrong ?? 0) + (stats.partial ?? 0)
      const accuracy = attempted > 0 ? Math.round((stats.correct / attempted) * 100) : 0
      return { chapter, accuracy, wrong: stats.wrong ?? 0, correct: stats.correct ?? 0, attempted }
    })
    .filter((c) => c.attempted >= 2 && c.accuracy >= 85 && c.wrong === 0)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 4)
    .map((c) => ({
      quadrant: 'P4',
      title: 'Maintain',
      chapter: c.chapter,
      detail: `${c.accuracy}% accuracy · clean`,
      action: 'Monthly mixed revision only',
    }))

  const slowWins = (result?.perQuestion ?? [])
    .filter((pq) => pq.grade === 'correct')
    .reduce((acc, pq) => {
      const ch = pq.chapter || 'General'
      acc[ch] = (acc[ch] || 0) + 1
      return acc
    }, {})

  const p2 = Object.keys(slowWins)
    .filter((ch) => !p1.some((x) => x.chapter === ch) && (chapters[ch]?.wrong ?? 0) === 0)
    .slice(0, 3)
    .map((ch) => ({
      quadrant: 'P2',
      title: 'Speed Tune-Up',
      chapter: ch,
      detail: 'Strong concept — compress solve time',
      action: 'Timed 15-Q speed drill',
    }))

  const p3 = weak
    .filter((w) => w.accuracy >= 50 && w.wrong > 0 && w.wrong <= 2)
    .slice(0, 3)
    .map((w) => ({
      quadrant: 'P3',
      title: 'Fix Silly Traps',
      chapter: w.chapter,
      detail: `${w.wrong} avoidable slip(s) at ${w.accuracy}% accuracy`,
      action: 'Error-log review only (no full re-learn)',
    }))

  return [...p1, ...p2, ...p3, ...strong]
}

/**
 * 7-day recovery prescription from coach + matrix + weak chapters.
 */
function buildRecoveryPrescription(modelBits) {
  const { coach, buckets7, weakChapters, toughness, timeSinks, errorDna } = modelBits
  const days = []
  const p1 = (weakChapters || []).slice(0, 2).map((w) => w.chapter).filter(Boolean)
  const silly = buckets7?.matrix4?.potential?.sillyCount ?? 0
  const painful = buckets7?.overall?.painful ?? 0
  const topError = errorDna?.chart?.[0]?.name

  days.push({
    day: 'Day 1–2',
    title: p1.length ? `Patch P1 chapters (${p1.join(', ')})` : 'Patch weakest chapters',
    target: '+8 to +16 marks',
    detail:
      p1.length > 0
        ? `Re-derive the flagged micro-concepts in ${p1.join(' & ')}, then complete 20–25 timed PYQs. Log every wrong with a Why-wrong tag.`
        : 'Drill the lowest-accuracy chapters from this paper with timed sets.',
  })
  days.push({
    day: 'Day 3',
    title: silly >= 2 ? 'Kill rushed / silly errors' : 'Accuracy lockdown drill',
    target: silly >= 2 ? `+${buckets7?.matrix4?.potential?.sillyLost ?? 4} marks` : '+4 to +8 marks',
    detail:
      'Enforce a 5-second final check (units, NOT/always/only, sign) before locking. Re-solve every Wasted bucket question from this paper without looking at the key.',
  })
  days.push({
    day: 'Day 4',
    title: painful >= 2 ? 'Trap-exit speed (Painful / Confused)' : 'Skip discipline',
    target: 'Free 8–15 minutes',
    detail: `Hard 90-second checkpoint on tough items (L4–L5). If no algebraic reduction appears, flag and leave. Current Painful count: ${painful}.`,
  })
  days.push({
    day: 'Day 5',
    title: topError ? `Error DNA focus — ${topError}` : 'Error DNA review',
    target: '+4 to +10 marks',
    detail:
      coach?.focus?.[0] ||
      'Review every wrong from this mock with the tagged root cause. Convert at least half into Perfect on a short retest.',
  })
  const hardRow = (toughness || []).find((t) => t.level >= 4)
  days.push({
    day: 'Day 6–7',
    title: 'Full simulation + stamina',
    target: 'Hold accuracy in final third',
    detail: `Sit one full-length timed mock in the real exam clock window. Protect Easy/Moderate conversion; ${
      hardRow ? `treat L4–L5 selectively (your L${hardRow.level} accuracy ${hardRow.accuracy}%).` : 'skip traps early.'
    } Time sinks to watch: ${(timeSinks?.sinks || []).slice(0, 3).map((s) => `Q${s.index}`).join(', ') || 'slow+wrong items'}.`,
  })
  return days
}

/**
 * Parent / mentor executive brief.
 */
function buildParentBrief(modelBits) {
  const {
    studentName,
    score,
    maxScore,
    pct,
    percentile,
    estimatedAIR,
    coach,
    buckets7,
    grade,
  } = modelBits
  const recoverable = buckets7?.matrix4?.potential?.sillyLost ?? 0
  const potential = buckets7?.matrix4?.potential?.potentialScore ?? score
  return {
    standing: `${studentName} scored ${score}/${maxScore} (${pct}%) — grade ${grade?.grade || '—'} (${grade?.label || ''}). Estimated percentile ~${percentile}; estimated practice AIR ~${fmtMarks(estimatedAIR)}.`,
    bottleneck:
      recoverable > 0
        ? `Roughly ${recoverable} marks look recoverable from avoidable mistakes without new syllabus (potential ≈ ${potential}/${maxScore}). Primary leaks: ${(coach?.focus || []).slice(0, 2).join('; ') || 'time-temperament and chapter slips'}.`
        : `Primary focus areas: ${(coach?.focus || []).slice(0, 3).join('; ') || 'steady chapter practice and timed mocks'}.`,
    mentorAction:
      (coach?.actions || []).slice(0, 2).map((a) => a.label).join(' · ') ||
      'Review the P1 chapters and the question telemetry log together this week.',
    summary: coach?.summary || '',
  }
}

/**
 * Build the full diagnostic model from one attempt + test.
 * @param {{
 *   data: object
 *   test?: object | null
 *   studentName?: string
 *   attempts?: object[]
 *   attemptId?: string | null
 *   peerMapOverride?: Map<string, object> | null
 *   peerMeta?: { source?: string, studentCount?: number, capacity?: object, liveReady?: boolean } | null
 *   dualPaper?: object | null
 * }} opts
 */
export function buildDiagnosticReportModel(opts = {}) {
  const data = opts.data ?? {}
  const test = opts.test ?? null
  const result = data.result ?? {}
  const questions = test?.questions ?? []
  const questionTimes = data.questionTimes ?? {}
  const sessionTelemetry = data.sessionTelemetry ?? null
  const examPatternId = data.examPatternId ?? test?.examPatternId ?? 'jee-main'
  const paperDurationSec =
    Number(data.durationSeconds) ||
    Number(test?.durationMinutes ? test.durationMinutes * 60 : 0) ||
    0
  const wrongReasons = {
    ...(data.wrongReasons || {}),
  }
  for (const pq of result.perQuestion ?? []) {
    if (pq.wrongReason && !wrongReasons[pq.questionId]) {
      wrongReasons[pq.questionId] = pq.wrongReason
    }
  }

  const score = Number(result.score) || 0
  const maxScore = Number(result.maxScore) || 0
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 1000) / 10 : 0
  const percentile =
    data.percentile != null ? Number(data.percentile) : scoreToPercentile(score, maxScore)
  const estimatedAIR =
    data.estimatedAIR != null
      ? Number(data.estimatedAIR)
      : estimateAIR(percentile, examPatternId)
  const grade = computePerformanceGrade(score, maxScore)
  const studentName = opts.studentName || data.userName || 'Student'
  const demoMode = Boolean(data.demoAnalysis)

  const overview = buildPerformanceOverview({
    result,
    examPatternId,
    totalQuestions: questions.length || result.perQuestion?.length,
    visitedIds: data.visitedIds,
    questionTimes,
    questions,
  })

  const cohortCompare = test?.id
    ? buildCohortScoreComparison(test.id, result, examPatternId, 'overall')
    : { categories: [], series: [], studentCount: 0 }

  const timeBehaviour = buildTimeBehaviourAnalysis({
    result,
    questionTimes,
    examPatternId,
    subjectFilter: 'overall',
    testId: test?.id,
  })
  const timeAnalytics = buildTimeAnalytics({ result, questionTimes, examPatternId })
  const timeSinks = buildTimeSinks({
    result,
    questionTimes,
    avgSeconds: timeAnalytics.avgSeconds,
    subjectFilter: 'overall',
  })

  const difficultyBase = buildDifficultyAnalysis(result, test?.id, questions, 'overall')
  const difficultyPack = enrichDifficultyWithSitterConversion(difficultyBase, {
    result,
    questionTimes,
    questions,
    subjectFilter: 'overall',
  })
  const difficulty = Array.isArray(difficultyPack)
    ? difficultyPack
    : difficultyPack?.rows || difficultyBase || []
  const difficultyInsight =
    [buildDifficultyInsight(difficulty), difficultyPack?.insightExtra].filter(Boolean).join(' ') ||
    null

  const staminaQuarters = buildStaminaQuarters(result, 'overall')
  const staminaInsight = buildStaminaInsight(staminaQuarters)
  const clockStamina = buildClockStaminaCurve({
    result,
    questionTimes,
    sessionTelemetry,
    paperDurationSec,
    subjectFilter: 'overall',
  })
  const skipIq = buildSkipIq({
    result,
    questionTimes,
    sessionTelemetry,
    paperDurationSec,
  })
  const errorDna = buildErrorDnaTypes({
    result,
    questionTimes,
    paperDurationSec,
    questions,
    wrongReasons,
  })
  const passTimeline = buildPassTimeline({
    result,
    sessionTelemetry,
    examPatternId,
  })
  const buckets7 = buildSevenBucketMatrix({
    result,
    questionTimes,
    questions,
    paperDurationSec,
  })
  const formatSplit = buildFormatSplit({ result, questions, questionTimes })
  const toughness = buildToughnessMix({ result, questions, questionTimes })
  const chapters = buildChapterLevelAnalysis(result, test?.id, 'overall')
  const weakChapters = buildWeakTopics(result.byChapter ?? {})
  const chapterRoi = buildChapterRoi({ result, questions })

  let peerMap = opts.peerMapOverride || null
  let peerSource = opts.peerMeta?.source || 'device'
  let peerCapacity = opts.peerMeta?.capacity || null
  if (!peerMap) {
    peerMap = test?.id ? buildPerQuestionPeerStats(test.id, questions) : new Map()
    peerSource = 'device'
    const peerSample = peerMap.size ? [...peerMap.values()][0] : null
    if (demoMode || !peerSample || (peerSample.studentCount ?? 0) < 2) {
      peerMap = buildDemoPeerStatsForQuestions(questions, result.perQuestion ?? [])
      peerSource = demoMode ? 'demo_cohort' : 'illustrative_fallback'
    }
  }
  const peerSample = peerMap.size ? [...peerMap.values()][0] : null

  const highlights = buildQuestionHighlights({
    result,
    questions,
    questionTimes,
    wrongReasons,
    peerMap,
    sessionTelemetry,
    demoPeers: peerSource !== 'device' && peerSource !== 'live_server',
    limit: 20,
  })

  const flipForensics = buildAnswerFlipForensics(sessionTelemetry, result.perQuestion ?? [])
  const dualPaper = opts.dualPaper || null

  const coach = buildResultCoachInsights(data, test || { examPatternId }, opts.attempts || [])
  const dream = buildDreamCollegeGapTeaser({
    result,
    questionTimes,
    paperDurationSec,
    questions,
    examPatternId,
    estimatedAIR,
  })
  const floorCeil = buildScoreFloorCeilingBand({
    result,
    questionTimes,
    paperDurationSec,
    questions,
  })

  const whatIf = simulateWhatIfScore(
    {
      actual: buckets7.matrix4?.potential?.actual ?? score,
      maxScore,
      sillyLost: buckets7.matrix4?.potential?.sillyLost ?? 0,
      overtimeCorrect: buckets7.overall?.slowWin ?? 0,
    },
    { sillyFixPct: 100, overtimeFixPct: 40 },
  )

  // Marks-left waterfall layers
  const fixWasted = buckets7.matrix4?.potential?.sillyLost ?? 0
  const abortPainful = Math.min(
    12,
    Math.round(
      (buckets7.overall.painful || 0) *
        Math.max(1, Math.round((maxScore || 300) / Math.max((result.perQuestion || []).length || 75, 1))),
    ) * 0.15,
  )
  const skipRecover =
    Math.min(
      maxScore - score - fixWasted,
      (result.unattempted || 0) *
        Math.max(1, Math.round((maxScore || 300) / Math.max((result.perQuestion || []).length || 75, 1) / 2)),
    ) || 0
  const waterfall = [
    {
      layer: 'Actual score achieved',
      gain: 0,
      cumulative: score,
      note: `~${Math.round(percentile * 10) / 10} %ile · AIR ~${fmtMarks(estimatedAIR)}`,
    },
    {
      layer: `+ Fix ${buckets7.matrix4?.potential?.sillyCount ?? 0} wasted / rushed errors`,
      gain: fixWasted,
      cumulative: Math.min(maxScore, score + fixWasted),
      note: 'Wrong → Right on avoidable slips',
    },
    {
      layer: `+ Abort ${buckets7.overall.painful || 0} painful traps (cut negative / free time)`,
      gain: Math.round(abortPainful),
      cumulative: Math.min(maxScore, score + fixWasted + Math.round(abortPainful)),
      note: 'Stop sunk-cost wrestling',
    },
    {
      layer: `+ Convert scorable unattempted (${result.unattempted || 0}) with freed time`,
      gain: Math.round(Math.max(0, skipRecover)),
      cumulative: Math.min(
        maxScore,
        score + fixWasted + Math.round(abortPainful) + Math.round(Math.max(0, skipRecover)),
      ),
      note: 'Reinvest skip time into Easy/Moderate leftovers',
    },
  ]

  const attempted = (result.correct || 0) + (result.wrong || 0) + (result.partial || 0)
  const attemptRate = pctOf(attempted, (result.perQuestion || []).length || attempted)
  const totalTimeSec =
    paperDurationSec ||
    timeAnalytics.totalSeconds ||
    Object.values(questionTimes).reduce((a, b) => a + Number(b || 0), 0)

  const subjectTabs = getAnalysisSubjectTabs(examPatternId)
  const subjectRows = overview.filter((r) => r.label !== 'Overall').map((row) => {
    const timeCat = timeBehaviour.categories?.find(
      (c) => c.label === row.label || subjectLabelOf(c.id, examPatternId) === row.label,
    )
    const mpm =
      timeCat?.totalSeconds > 0
        ? Math.round((row.score / (timeCat.totalSeconds / 60)) * 100) / 100
        : null
    return {
      ...row,
      timeLabel: timeCat?.totalLabel || '—',
      avgSec: timeCat?.avgSeconds ?? null,
      mpm,
    }
  })

  const trajectory = (opts.attempts || [])
    .filter((a) => a && a.testId === (test?.id || data.testId))
    .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
    .slice(-5)
    .map((a) => ({
      date: a.submittedAt
        ? new Date(a.submittedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
        : '—',
      score: a.score ?? a.result?.score ?? 0,
      maxScore: a.maxScore ?? a.result?.maxScore ?? maxScore,
      accuracy: a.accuracy ?? a.result?.accuracy ?? null,
      title: a.title || 'Prior mock',
    }))

  const prescription = buildRecoveryPrescription({
    coach,
    buckets7,
    weakChapters,
    toughness,
    timeSinks,
    errorDna,
  })
  const parentBrief = buildParentBrief({
    studentName,
    score,
    maxScore,
    pct,
    percentile: Math.round(percentile * 10) / 10,
    estimatedAIR,
    coach,
    buckets7,
    grade,
  })

  const headline =
    waterfall[waterfall.length - 1].cumulative > score
      ? `Your present mastery already supports about ${waterfall[waterfall.length - 1].cumulative}/${maxScore}. The gap to that ceiling is mostly exam temperament (rushed slips, sunk-cost traps, and under-converted leftovers) — not missing syllabus.`
      : coach?.summary ||
        'Steady attempt. Use the chapter ROI and question telemetry below to plan the next 7 days.'

  return {
    generatedAt: new Date().toISOString(),
    title: data.title || test?.title || 'Diagnostic Performance Report',
    productLine: 'TESTVANTAGES PSYCHOMETRIC & ACADEMIC ANALYTICS',
    reportName: 'Flagship Diagnostic Performance Report',
    studentName,
    studentEmail: data.userEmail || '',
    studentId: data.userId || data.studentId || null,
    batch: data.batchLabel || data.classLabel || null,
    examPatternId,
    patternLabel: subjectTabs
      .filter((t) => t.id !== 'overall')
      .map((t) => t.label)
      .join(' · '),
    submittedAt: data.submittedAt || null,
    durationLabel: totalTimeSec ? formatTime(totalTimeSec) : '—',
    paperMinutes: test?.durationMinutes || Math.round((paperDurationSec || 0) / 60) || null,
    questionCount: (result.perQuestion || []).length || questions.length || 0,
    score,
    maxScore,
    pct,
    accuracy: result.accuracy ?? 0,
    correct: result.correct ?? 0,
    wrong: result.wrong ?? 0,
    unattempted: result.unattempted ?? 0,
    partial: result.partial ?? 0,
    attempted,
    attemptRate,
    percentile: Math.round(percentile * 10) / 10,
    estimatedAIR,
    grade,
    overview,
    subjectRows,
    cohortCompare,
    timeBehaviour,
    timeAnalytics,
    timeSinks,
    difficulty,
    difficultyInsight,
    staminaQuarters,
    staminaInsight,
    clockStamina,
    skipIq,
    errorDna,
    passTimeline,
    buckets7,
    formatSplit,
    toughness,
    chapters,
    weakChapters,
    chapterRoi,
    highlights,
    peerSource,
    peerStudentCount:
      opts.peerMeta?.studentCount ??
      peerSample?.studentCount ??
      (peerSource === 'device' ? cohortCompare.studentCount : 40),
    peerCapacity,
    livePeersReady: peerSource === 'live_server',
    flipForensics,
    dualPaper,
    coach,
    dream,
    floorCeil,
    whatIf,
    waterfall,
    headline,
    trajectory,
    prescription,
    parentBrief,
    demoMode,
    hasPerQuestion: (result.perQuestion || []).length > 0,
  }
}

/**
 * Same as buildDiagnosticReportModel but prefers live server peer bands after go-live.
 * @param {Parameters<typeof buildDiagnosticReportModel>[0]} opts
 */
export async function buildDiagnosticReportModelAsync(opts = {}) {
  const test = opts.test ?? null
  const data = opts.data ?? {}
  const questions = test?.questions ?? []
  const peerResolved = await resolvePeerStatsForDiagnostics({
    testId: test?.id || data.testId,
    questions,
    perQuestion: data.result?.perQuestion ?? [],
    demoMode: Boolean(data.demoAnalysis),
    preferLive: true,
  })
  return buildDiagnosticReportModel({
    ...opts,
    peerMapOverride: peerResolved.map,
    peerMeta: {
      source: peerResolved.source,
      studentCount: peerResolved.studentCount,
      capacity: peerResolved.capacity,
      liveReady: peerResolved.liveReady,
    },
  })
}

function pageFooter(model, page, total) {
  return `<footer class="page-foot">${escapeHtml(model.reportName)} — ${escapeHtml(model.studentName)}${model.studentId ? ` (${escapeHtml(model.studentId)})` : ''} · Page ${page} of ${total}</footer>`
}

/**
 * @param {ReturnType<typeof buildDiagnosticReportModel>} model
 */
export function buildDiagnosticReportHtml(model) {
  const when = model.submittedAt
    ? new Date(model.submittedAt).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—'
  const gen = new Date(model.generatedAt).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const totalPages = 6

  const kpiRow = `
    <div class="kpi-grid">
      <div class="kpi"><strong>${model.score} / ${model.maxScore}</strong><span>Net score (${model.pct}%)</span></div>
      <div class="kpi"><strong>${model.accuracy}%</strong><span>Accuracy</span></div>
      <div class="kpi"><strong>~${model.percentile}</strong><span>Percentile (est.)</span></div>
      <div class="kpi"><strong>~${fmtMarks(model.estimatedAIR)}</strong><span>Est. AIR</span></div>
      <div class="kpi"><strong>${model.correct} / ${model.wrong} / ${model.unattempted}</strong><span>Right / wrong / skip</span></div>
      <div class="kpi"><strong>${escapeHtml(model.grade?.grade || '—')}</strong><span>${escapeHtml(model.grade?.label || 'Grade')}</span></div>
    </div>`

  const scorecardRows = `
    <tr><td>Net Score</td><td>${model.score} / ${model.maxScore}</td><td>${model.pct}%</td><td>${escapeHtml(model.grade?.label || '—')}</td></tr>
    <tr><td>Predicted Percentile (AIR band)</td><td>~${model.percentile} %ile</td><td>AIR ~${fmtMarks(model.estimatedAIR)}</td><td>Practice curve — not NTA</td></tr>
    <tr><td>Attempt Rate</td><td>${model.attemptRate}% (${model.attempted} / ${model.questionCount || '—'})</td><td>${model.unattempted} unattempted</td><td>${model.attemptRate < 80 ? 'Under-attempted zone' : 'Healthy coverage'}</td></tr>
    <tr><td>Accuracy (on attempted)</td><td>${model.accuracy}%</td><td>${model.correct} correct · ${model.wrong} wrong</td><td>${model.accuracy >= 85 ? 'Strong' : model.accuracy >= 70 ? 'Solid' : 'Needs tightening'}</td></tr>
    <tr><td>Time Utilized</td><td>${escapeHtml(model.durationLabel)}</td><td>${model.paperMinutes ? `${model.paperMinutes} min paper` : '—'}</td><td>—</td></tr>
    <tr><td>Skip IQ band</td><td colspan="2">${escapeHtml(model.skipIq?.band || '—')}</td><td>${escapeHtml(model.skipIq?.takeaway || '')}</td></tr>
  `

  const waterfallRows = model.waterfall
    .map(
      (w) =>
        `<tr><td>${escapeHtml(w.layer)}</td><td>${w.gain ? `+${w.gain}` : '—'}</td><td>${w.cumulative} / ${model.maxScore}</td><td>${escapeHtml(w.note)}</td></tr>`,
    )
    .join('')

  const subjectTable = model.subjectRows.length
    ? model.subjectRows
        .map((s) => {
          const bar = barHtml(s.scorePct, '#2563eb')
          return `<tr>
            <td>${escapeHtml(s.label)}</td>
            <td>${s.score} / ${s.maxScore}</td>
            <td>${s.correct}</td>
            <td>${s.incorrect}</td>
            <td>${s.unattempted}</td>
            <td>${s.notVisited ?? '—'}</td>
            <td>${escapeHtml(s.timeLabel)}</td>
            <td>${s.accuracyPct}%</td>
            <td>${s.mpm != null ? s.mpm : '—'}</td>
            <td class="bar-cell">${bar}<span class="bar-lbl">${s.scorePct}%</span></td>
          </tr>`
        })
        .join('')
    : `<tr><td colspan="10">No subject breakdown on this attempt.</td></tr>`

  const formatRows = model.formatSplit.length
    ? model.formatSplit
        .map((f) => {
          const acc =
            f.correct + f.incorrect > 0
              ? Math.round((f.correct / (f.correct + f.incorrect)) * 1000) / 10
              : 0
          return `<tr>
            <td>${escapeHtml(f.label)}</td>
            <td>${f.total}</td>
            <td>${f.attempted}</td>
            <td>${f.correct}</td>
            <td>${f.incorrect}</td>
            <td>${acc}%</td>
            <td>${formatTime(f.time)}</td>
            <td>${f.score} / ${f.maxScore}</td>
          </tr>`
        })
        .join('')
    : `<tr><td colspan="8">Format tags unavailable for this paper.</td></tr>`

  const bucketKeys = ['perfect', 'slowWin', 'wasted', 'painful', 'smartSkip', 'confused', 'notVisited']
  const subjectIds = Object.keys(model.buckets7.bySubject || {})
  const bucketHead = bucketKeys.map((k) => `<th>${escapeHtml(BUCKET7_META[k].label)}</th>`).join('')
  const bucketBody = [
    ...subjectIds.map((id) => {
      const row = model.buckets7.bySubject[id]
      const total = bucketKeys.reduce((s, k) => s + (row[k] || 0), 0)
      return `<tr><td>${escapeHtml(subjectLabelOf(id, model.examPatternId))}</td>${bucketKeys
        .map((k) => `<td>${row[k] || 0}</td>`)
        .join('')}<td>${total}</td></tr>`
    }),
    `<tr class="total-row"><td>Overall</td>${bucketKeys
      .map((k) => `<td>${model.buckets7.overall[k] || 0}</td>`)
      .join('')}<td>${model.questionCount}</td></tr>`,
  ].join('')

  const errorDnaRows = (model.errorDna?.chart || [])
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.name)}</td><td>${c.value}</td><td>~${c.marks}</td><td>${escapeHtml(c.hint || '')}</td></tr>`,
    )
    .join('') || `<tr><td colspan="4">No wrong answers to classify.</td></tr>`

  const diffRows = (model.difficulty || [])
    .map((d) => {
      const total = d.correct + d.incorrect + d.unattempted
      return `<tr>
        <td>${escapeHtml(d.label)}</td>
        <td>${total}</td>
        <td>${d.correct}</td>
        <td>${d.incorrect}</td>
        <td>${d.unattempted}</td>
        <td>${d.accuracy}%</td>
        <td>${d.score} / ${d.maxScore}</td>
        <td>${d.sitterConversion != null ? `${d.sitterConversion}% sitters` : '—'}</td>
      </tr>`
    })
    .join('')

  const toughRows = (model.toughness || [])
    .map(
      (t) =>
        `<tr>
          <td>${escapeHtml(t.label)}</td>
          <td>${t.total}</td>
          <td>${t.correct}</td>
          <td>${t.incorrect}</td>
          <td>${t.unattempted}</td>
          <td>${t.accuracy}%</td>
          <td>${escapeHtml(t.timeLabel)}</td>
          <td class="bar-cell">${barHtml(t.accuracy, t.level >= 4 ? '#e11d48' : '#0d9488')}<span class="bar-lbl">${t.accuracy}%</span></td>
        </tr>`,
    )
    .join('') || `<tr><td colspan="8">Toughness levels not tagged on this paper.</td></tr>`

  const staminaRows = (model.clockStamina?.buckets?.length
    ? model.clockStamina.buckets
    : model.staminaQuarters || []
  )
    .map((b) => {
      const acc = b.accuracy != null ? b.accuracy : b.total ? Math.round((b.correct / b.total) * 100) : 0
      const range = b.range || b.label
      return `<tr>
        <td>${escapeHtml(range)}</td>
        <td>${b.correct ?? 0}</td>
        <td>${b.incorrect ?? 0}</td>
        <td>${acc}%</td>
        <td>${b.unattempted ?? 0}</td>
        <td class="bar-cell">${barHtml(acc, acc >= 80 ? '#0d9488' : acc >= 60 ? '#d97706' : '#e11d48')}</td>
      </tr>`
    })
    .join('') || `<tr><td colspan="6">Stamina curve needs timed question data.</td></tr>`

  const timeSubjRows = (model.timeBehaviour?.categories || [])
    .filter((c) => c.id !== 'overall')
    .map(
      (c) =>
        `<tr>
          <td>${escapeHtml(c.label)}</td>
          <td>${escapeHtml(c.totalLabel)}</td>
          <td>${c.avgSeconds}s</td>
          <td>${c.attempted}</td>
          <td class="bar-cell">${barHtml(Math.min(100, (c.avgSeconds / 180) * 100), '#6366f1')}</td>
        </tr>`,
    )
    .join('') || `<tr><td colspan="5">No per-subject timings.</td></tr>`

  const sinkRows = (model.timeSinks?.sinks || [])
    .map(
      (s) =>
        `<tr><td>Q${s.index}</td><td>${escapeHtml(subjectLabelOf(s.subject, model.examPatternId))}</td><td>${escapeHtml(s.chapter || '—')}</td><td>${formatDiagDuration(s.seconds)}</td><td>${escapeHtml(s.grade)}</td></tr>`,
    )
    .join('') || `<tr><td colspan="5">No slow+wrong sinks flagged.</td></tr>`

  const passPath =
    (model.passTimeline?.subjectPath || [])
      .map((p, i) => `${i + 1}. ${escapeHtml(p.subject)} (${escapeHtml(p.label)})`)
      .join(' → ') || 'Subject path estimated from question order.'

  const chapterRoiRows = (model.chapterRoi || [])
    .map(
      (r) =>
        `<tr>
          <td><strong>${escapeHtml(r.quadrant)}</strong><br/><span class="muted">${escapeHtml(r.title)}</span></td>
          <td>${escapeHtml(r.chapter)}</td>
          <td>${escapeHtml(r.detail)}</td>
          <td>${escapeHtml(r.action)}</td>
        </tr>`,
    )
    .join('') || `<tr><td colspan="4">No chapter ROI rows.</td></tr>`

  const weakRows = (model.weakChapters || [])
    .slice(0, 10)
    .map(
      (w) =>
        `<tr><td>${escapeHtml(w.chapter)}</td><td>${w.accuracy}%</td><td>${w.wrong}</td><td>${w.unattempted}</td><td class="bar-cell">${barHtml(w.accuracy, '#e11d48')}</td></tr>`,
    )
    .join('') || `<tr><td colspan="5">No weak chapters flagged.</td></tr>`

  const highlightRows = (model.highlights || [])
    .map((h) => {
      const peerBits =
        h.peerAll != null
          ? `Top10 ${h.peerTop10 ?? '—'}% · Top25 ${h.peerTop25 ?? '—'}% · All ${h.peerAll}%`
          : '—'
      return `<tr>
        <td>Q${h.index}</td>
        <td>${escapeHtml(subjectLabelOf(h.subject, model.examPatternId))}</td>
        <td>${escapeHtml(h.chapter)}</td>
        <td>${escapeHtml(h.status)}</td>
        <td>${escapeHtml(h.toughness.label)} (L${h.toughness.level})</td>
        <td>${escapeHtml(h.timeLabel)}</td>
        <td>${escapeHtml(h.idealLabel)}</td>
        <td>${h.visits}</td>
        <td>${escapeHtml(h.reason)}</td>
        <td>${escapeHtml(peerBits)}</td>
      </tr>`
    })
    .join('') || `<tr><td colspan="10">No high-impact question highlights.</td></tr>`

  const peerNote =
    model.peerSource === 'live_server'
      ? `Live server peers: ${model.peerStudentCount || 0} attempt(s) on this paper. Top 1% / Top 10% / Top 25% / Top 500 / All bands active${model.peerCapacity?.top500Ready ? '' : ' (Top 500 uses available cohort until 500+ submits)'}.`
      : model.peerSource === 'device'
        ? `Peer bands use ${model.peerStudentCount || 0} stored attempt(s) on this device for the same paper. After go-live, bands switch to all students who sat this paper (Top 1% / Top 500).`
        : model.peerSource === 'demo_cohort'
          ? 'Peer Top 10% / 25% / All bands are demo cohort illustrations for this sample paper.'
          : 'Fewer than 2 device peers — illustrative peer bands shown for layout; treat as directional only.'

  const flip = model.flipForensics
  const flipRows =
    flip?.rows?.length
      ? flip.rows
          .slice(0, 15)
          .map(
            (r) =>
              `<tr><td>Q${r.index ?? '—'}</td><td>${escapeHtml(r.grade || '—')}</td><td>${r.flipCount}</td><td>${escapeHtml(String(r.lastFrom ?? '—'))} → ${escapeHtml(String(r.lastTo ?? '—'))}</td></tr>`,
          )
          .join('')
      : '<tr><td colspan="4">No answer changes logged on this attempt (new sittings after this build capture flips).</td></tr>'
  const flipBlock = `
    <h2>14b · Answer-change &amp; OMR forensics</h2>
    <p class="muted">${escapeHtml(flip?.capacityNote || '')} Total flips: <strong>${flip?.totalFlips ?? 0}</strong> across <strong>${flip?.questionsFlipped ?? 0}</strong> questions · flipped→wrong ${flip?.flippedThenWrong ?? 0} · flipped→correct ${flip?.flippedThenCorrect ?? 0}${flip?.omrReady ? ` · OMR events ${flip.omrEventCount}` : ' · OMR bubble log ready when OMR path is used'}.</p>
    <table>
      <thead><tr><th>Q</th><th>Final</th><th>Flips</th><th>Last change</th></tr></thead>
      <tbody>${flipRows}</tbody>
    </table>`

  const dual = model.dualPaper
  const dualBlock =
    dual?.ok
      ? `<h2>14c · JEE Advanced dual paper (P1 + P2)</h2>
    <p class="muted">Merged pack — Paper 1 and Paper 2 combined standing.</p>
    <table>
      <thead><tr><th>Paper</th><th>Score</th><th>Accuracy</th><th>Right / wrong / skip</th></tr></thead>
      <tbody>
        <tr><td>Paper 1</td><td>${dual.paper1.data.result.score}/${dual.paper1.data.result.maxScore}</td><td>${dual.paper1.data.result.accuracy}%</td><td>${dual.paper1.data.result.correct} / ${dual.paper1.data.result.wrong} / ${dual.paper1.data.result.unattempted}</td></tr>
        <tr><td>Paper 2</td><td>${dual.paper2.data.result.score}/${dual.paper2.data.result.maxScore}</td><td>${dual.paper2.data.result.accuracy}%</td><td>${dual.paper2.data.result.correct} / ${dual.paper2.data.result.wrong} / ${dual.paper2.data.result.unattempted}</td></tr>
        <tr><td><strong>Combined</strong></td><td><strong>${dual.combined.score}/${dual.combined.maxScore}</strong> (${dual.combined.pct}%)</td><td>—</td><td>${dual.combined.correct} / ${dual.combined.wrong} / ${dual.combined.unattempted}</td></tr>
      </tbody>
    </table>`
      : ''

  const trajRows = (model.trajectory || []).length
    ? model.trajectory
        .map(
          (t) =>
            `<tr><td>${escapeHtml(t.date)}</td><td>${escapeHtml(t.title)}</td><td>${t.score} / ${t.maxScore}</td><td>${t.accuracy != null ? `${t.accuracy}%` : '—'}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="4">Single-test view — sit more mocks on this paper to unlock a trajectory strip.</td></tr>`

  const rxRows = (model.prescription || [])
    .map(
      (d) =>
        `<tr><td>${escapeHtml(d.day)}</td><td><strong>${escapeHtml(d.title)}</strong><br/><span class="muted">Target ${escapeHtml(d.target)}</span><br/>${escapeHtml(d.detail)}</td></tr>`,
    )
    .join('')

  const strengths = (model.coach?.strengths || [])
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join('')
  const focus = (model.coach?.focus || [])
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join('')

  const cohortSeries = model.cohortCompare?.series || []
  const cohortCats = model.cohortCompare?.categories || []
  const cohortTable =
    cohortCats.length && cohortSeries.length
      ? `<table>
          <thead><tr><th>Category</th>${cohortSeries.map((s) => `<th>${escapeHtml(s.label || s.key)}</th>`).join('')}</tr></thead>
          <tbody>
            ${cohortCats
              .map(
                (c) =>
                  `<tr><td>${escapeHtml(c.label)}</td>${cohortSeries
                    .map((s) => `<td>${s.values?.[c.id] ?? '—'}</td>`)
                    .join('')}</tr>`,
              )
              .join('')}
          </tbody>
        </table>
        <p class="muted">Device cohort size: ${model.cohortCompare.studentCount || 0}. Topper / Top10 / Top25 need multiple attempts on this device.</p>`
      : `<p class="muted">Cohort score bars unlock after more students attempt this paper on this device.</p>`

  const dreamBlock = model.dream?.ready
    ? `<div class="callout"><strong>Score-recovery teaser</strong><p>${escapeHtml(model.dream.headline || '')}</p><p class="muted">${escapeHtml(model.dream.detail || '')}</p></div>`
    : model.whatIf?.delta
      ? `<div class="callout"><strong>What-If ceiling</strong><p>Cleaning avoidable mistakes projects ≈ ${model.whatIf.score}/${model.maxScore} (${model.whatIf.pct}%) — about +${model.whatIf.delta} marks from temperament alone.</p></div>`
      : ''

  const floorBlock =
    model.floorCeil?.ready
      ? `<p class="muted">Score band (behavioural floor → ceiling): ${model.floorCeil.floor?.score ?? '—'} → ${model.floorCeil.ceiling?.score ?? '—'} / ${model.maxScore}${model.floorCeil.takeaway ? ` — ${escapeHtml(model.floorCeil.takeaway)}` : ''}</p>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.reportName)} — ${escapeHtml(model.studentName)}</title>
<style>
  :root {
    --ink: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --brand: #0f4c81;
    --accent: #c2410c;
    --soft: #f8fafc;
    --good: #0d9488;
    --warn: #d97706;
    --bad: #e11d48;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--ink);
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 11.5px;
    line-height: 1.45;
    background: #e8eef5;
  }
  .sheet {
    width: 210mm;
    min-height: 297mm;
    margin: 12px auto;
    padding: 14mm 14mm 16mm;
    background: #fff;
    box-shadow: 0 8px 30px rgba(15, 23, 42, 0.12);
    position: relative;
    page-break-after: always;
    break-after: page;
  }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .mast {
    border-bottom: 3px solid var(--brand);
    padding-bottom: 0.65rem;
    margin-bottom: 0.85rem;
  }
  .eyebrow {
    color: var(--brand);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 0 0 0.2rem;
  }
  h1 {
    font-size: 1.45rem;
    margin: 0 0 0.15rem;
    letter-spacing: -0.02em;
    color: var(--brand);
  }
  .subtitle { margin: 0; color: var(--muted); font-size: 0.86rem; }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem 1rem;
    margin: 0.75rem 0 0.5rem;
    font-size: 0.86rem;
  }
  .meta-grid div { display: flex; gap: 0.4rem; }
  .meta-grid span { color: var(--muted); font-weight: 700; min-width: 5.5rem; text-transform: uppercase; font-size: 0.68rem; letter-spacing: 0.04em; padding-top: 0.15rem; }
  h2 {
    font-size: 0.95rem;
    margin: 1rem 0 0.35rem;
    color: var(--brand);
    border-left: 4px solid var(--accent);
    padding-left: 0.45rem;
  }
  h3 { font-size: 0.82rem; margin: 0.75rem 0 0.3rem; color: #334155; }
  p { margin: 0.35rem 0; }
  .muted { color: var(--muted); font-size: 0.8rem; }
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.45rem;
    margin: 0.6rem 0 0.8rem;
  }
  .kpi {
    background: linear-gradient(180deg, #f8fafc, #eef2ff);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 0.55rem 0.65rem;
  }
  .kpi strong { display: block; font-size: 1.05rem; color: var(--brand); }
  .kpi span { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.35rem 0 0.7rem;
    font-size: 0.78rem;
  }
  th, td {
    border-bottom: 1px solid var(--line);
    padding: 0.32rem 0.35rem;
    text-align: left;
    vertical-align: top;
  }
  th {
    color: var(--muted);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--soft);
  }
  tr.total-row td { font-weight: 700; background: #f1f5f9; }
  .bar {
    height: 7px;
    background: #e2e8f0;
    border-radius: 99px;
    overflow: hidden;
    min-width: 48px;
  }
  .bar span { display: block; height: 100%; border-radius: 99px; }
  .bar-cell { white-space: nowrap; }
  .bar-lbl { font-size: 0.68rem; color: var(--muted); margin-left: 0.25rem; }
  .callout {
    background: #fff7ed;
    border: 1px solid #fed7aa;
    border-left: 4px solid var(--accent);
    border-radius: 8px;
    padding: 0.55rem 0.7rem;
    margin: 0.5rem 0 0.75rem;
  }
  .callout strong { color: #9a3412; }
  .headline {
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    border-radius: 8px;
    padding: 0.6rem 0.75rem;
    margin: 0.5rem 0 0.8rem;
    font-size: 0.88rem;
  }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  ul.compact { margin: 0.2rem 0 0.5rem; padding-left: 1.1rem; }
  ul.compact li { margin: 0.15rem 0; }
  .page-foot {
    position: absolute;
    left: 14mm;
    right: 14mm;
    bottom: 8mm;
    font-size: 0.68rem;
    color: var(--muted);
    border-top: 1px solid var(--line);
    padding-top: 0.35rem;
  }
  .disclaimer {
    background: #f8fafc;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    padding: 0.55rem 0.7rem;
    font-size: 0.78rem;
    color: #475569;
  }
  .no-print { margin: 0.75rem auto; max-width: 210mm; text-align: center; }
  .btn-print {
    display: inline-block;
    background: var(--brand);
    color: #fff;
    border: 0;
    border-radius: 8px;
    padding: 0.55rem 1rem;
    font-weight: 700;
    cursor: pointer;
  }
  @media print {
    body { background: #fff; }
    .sheet {
      margin: 0;
      box-shadow: none;
      width: auto;
      min-height: auto;
      padding: 10mm 12mm 14mm;
    }
    .no-print { display: none !important; }
    .page-foot { position: running(footer); }
  }
  @page { size: A4; margin: 10mm; }
</style>
</head>
<body>
  <div class="no-print">
    <button type="button" class="btn-print" onclick="window.print()">Print / Save as PDF</button>
    <p class="muted">Tip: choose “Save as PDF” as the printer. Enable background graphics for bars.</p>
  </div>

  <!-- PAGE 1: Cover + Scorecard + Waterfall -->
  <section class="sheet" data-page="1">
    <header class="mast">
      <p class="eyebrow">${escapeHtml(model.productLine)}</p>
      <h1>${escapeHtml(model.reportName)}</h1>
      <p class="subtitle">Comprehensive Exam Temperament, Attempt Quality &amp; Score-Recovery Audit · Generated ${escapeHtml(gen)}</p>
    </header>
    <div class="meta-grid">
      <div><span>Student</span><strong>${escapeHtml(model.studentName)}${model.studentEmail ? ` · ${escapeHtml(model.studentEmail)}` : ''}</strong></div>
      <div><span>Test</span><strong>${escapeHtml(model.title)}</strong></div>
      <div><span>Pattern</span><strong>${escapeHtml(model.patternLabel || model.examPatternId)} · ${model.questionCount} Qs · ${model.maxScore} marks</strong></div>
      <div><span>When</span><strong>${escapeHtml(when)} · ${escapeHtml(model.durationLabel)} utilized</strong></div>
      ${model.batch ? `<div><span>Batch</span><strong>${escapeHtml(model.batch)}</strong></div>` : ''}
    </div>
    ${kpiRow}
    <h2>01 · Executive Scorecard</h2>
    <p class="muted">Benchmarks core vitals for this attempt. Cohort deltas use device peers when available.</p>
    <table>
      <thead><tr><th>Metric</th><th>Your score</th><th>Detail</th><th>Verdict</th></tr></thead>
      <tbody>${scorecardRows}</tbody>
    </table>
    <h2>02 · Potential Score &amp; Marks Left on the Table</h2>
    <table>
      <thead><tr><th>Score layer</th><th>Gain</th><th>Cumulative</th><th>Note</th></tr></thead>
      <tbody>${waterfallRows}</tbody>
    </table>
    <div class="headline"><strong>Diagnostic headline.</strong> ${escapeHtml(model.headline)}</div>
    ${dreamBlock}
    ${floorBlock}
    ${pageFooter(model, 1, totalPages)}
  </section>

  <!-- PAGE 2: Subjects + Format + 7-bucket -->
  <section class="sheet" data-page="2">
    <h2>03 · Subject-Wise Score, Time &amp; ROI</h2>
    <p class="muted">Marks / Min (MPM) exposes where time investment stops paying off.</p>
    <table>
      <thead>
        <tr>
          <th>Subject</th><th>Score</th><th>Correct</th><th>Incorrect</th><th>Skip</th><th>Not vis.</th>
          <th>Time</th><th>Acc.</th><th>MPM</th><th>%</th>
        </tr>
      </thead>
      <tbody>${subjectTable}</tbody>
    </table>
    <h2>04 · Question-Format Split</h2>
    <table>
      <thead><tr><th>Format</th><th>Total</th><th>Att.</th><th>Correct</th><th>Incorrect</th><th>Acc.</th><th>Time</th><th>Score</th></tr></thead>
      <tbody>${formatRows}</tbody>
    </table>
    <h2>05 · Complete 7-Bucket Attempt Quality Matrix</h2>
    <p class="muted">Perfect · Slow Win · Wasted · Painful · Smart Skip · Confused · Not Visited. Ideal pace ≈ ${model.buckets7.idealSeconds}s/Q (Hybrid ideal when saved, else estimate).</p>
    <table>
      <thead><tr><th>Subject</th>${bucketHead}<th>Total</th></tr></thead>
      <tbody>${bucketBody}</tbody>
    </table>
    <p class="muted">Sunk-cost time (Painful + Confused): ${formatDiagDuration(model.buckets7.sunkSec)} invested for roughly −${model.buckets7.sunkMarks} net marks swing on wrongs.</p>
    ${model.buckets7.matrix4?.takeaway ? `<div class="callout"><strong>Attempt-quality note</strong><p>${escapeHtml(model.buckets7.matrix4.takeaway)}</p></div>` : ''}
    ${pageFooter(model, 2, totalPages)}
  </section>

  <!-- PAGE 3: Error DNA + Difficulty + Toughness -->
  <section class="sheet" data-page="3">
    <h2>06 · Cognitive Error Taxonomy (Error DNA)</h2>
    <p class="muted">${escapeHtml(model.errorDna?.takeaway || '')}</p>
    <table>
      <thead><tr><th>Root cause</th><th>Count</th><th>Marks swing</th><th>Hint</th></tr></thead>
      <tbody>${errorDnaRows}</tbody>
    </table>
    <h3>Flagged wrongs</h3>
    <table>
      <thead><tr><th>Q</th><th>Subject</th><th>Chapter</th><th>Type</th><th>Time</th><th>Lost</th></tr></thead>
      <tbody>
        ${(model.errorDna?.items || [])
          .slice(0, 12)
          .map(
            (it) =>
              `<tr><td>Q${it.index}</td><td>${escapeHtml(subjectLabelOf(it.subject, model.examPatternId))}</td><td>${escapeHtml(it.chapter || '—')}</td><td>${escapeHtml(it.type)}</td><td>${formatDiagDuration(it.seconds)}</td><td>${it.marksLost}</td></tr>`,
          )
          .join('') || '<tr><td colspan="6">—</td></tr>'}
      </tbody>
    </table>
    <h2>07 · Difficulty Conversion</h2>
    ${model.difficultyInsight ? `<p class="muted">${escapeHtml(model.difficultyInsight)}</p>` : ''}
    <table>
      <thead><tr><th>Difficulty</th><th>Total</th><th>Correct</th><th>Incorrect</th><th>Unans.</th><th>Your acc.</th><th>Score</th><th>Sitter note</th></tr></thead>
      <tbody>${diffRows}</tbody>
    </table>
    <h2>08 · Toughness Mix (L1–L5)</h2>
    <table>
      <thead><tr><th>Level</th><th>Total</th><th>Correct</th><th>Incorrect</th><th>Skip</th><th>Acc.</th><th>Time</th><th>Bar</th></tr></thead>
      <tbody>${toughRows}</tbody>
    </table>
    ${pageFooter(model, 3, totalPages)}
  </section>

  <!-- PAGE 4: Time + Stamina + Skip + Navigation -->
  <section class="sheet" data-page="4">
    <h2>09 · Time Behaviour Summary</h2>
    <p class="muted">Total dwell ${escapeHtml(model.timeAnalytics?.totalLabel || model.durationLabel)} · avg ${model.timeAnalytics?.avgSeconds ?? '—'}s / attempted Q · sink threshold ≥ ${model.timeSinks?.threshold ?? '—'}s</p>
    <div class="two-col">
      <div>
        <h3>Subject avg time</h3>
        <table>
          <thead><tr><th>Subject</th><th>Total</th><th>Avg/Q</th><th>Att.</th><th>Pace</th></tr></thead>
          <tbody>${timeSubjRows}</tbody>
        </table>
      </div>
      <div>
        <h3>Time sinks (slow + wrong)</h3>
        <table>
          <thead><tr><th>Q</th><th>Subj</th><th>Chapter</th><th>Time</th><th>Grade</th></tr></thead>
          <tbody>${sinkRows}</tbody>
        </table>
      </div>
    </div>
    <h2>10 · Cognitive Stamina &amp; Fatigue</h2>
    <p class="muted">${escapeHtml(model.clockStamina?.insight || model.staminaInsight || '')} · Mode: ${escapeHtml(model.clockStamina?.mode || 'quarters')}</p>
    <table>
      <thead><tr><th>Window</th><th>Correct</th><th>Incorrect</th><th>Accuracy</th><th>Skip</th><th>Bar</th></tr></thead>
      <tbody>${staminaRows}</tbody>
    </table>
    <h2>11 · Skip IQ &amp; Navigation</h2>
    <p>${escapeHtml(model.skipIq?.takeaway || '')}</p>
    <table>
      <thead><tr><th>Skip rate</th><th>Avg skip time</th><th>Quick</th><th>Long</th><th>Never opened</th><th>Revisited skips</th></tr></thead>
      <tbody>
        <tr>
          <td>${model.skipIq?.skipRate ?? '—'}%</td>
          <td>${model.skipIq ? formatDiagDuration(model.skipIq.avgSkipSec) : '—'}</td>
          <td>${model.skipIq?.quickSkip ?? '—'}</td>
          <td>${model.skipIq?.longSkip ?? '—'}</td>
          <td>${model.skipIq?.neverVisited ?? '—'}</td>
          <td>${model.skipIq?.revisitedSkip ?? '—'}</td>
        </tr>
      </tbody>
    </table>
    <h3>Subject navigation</h3>
    <p>${passPath}</p>
    <table>
      <thead><tr><th>Pass</th><th>Qs</th><th>Correct</th><th>Accuracy</th></tr></thead>
      <tbody>
        <tr><td>Round 1 / first sweep</td><td>${model.passTimeline?.firstPass?.count ?? '—'}</td><td>${model.passTimeline?.firstPass?.correct ?? '—'}</td><td>${model.passTimeline?.firstPass?.accuracy ?? '—'}%</td></tr>
        <tr><td>Round 2 / revisits</td><td>${model.passTimeline?.revisit?.count ?? '—'}</td><td>${model.passTimeline?.revisit?.correct ?? '—'}</td><td>${model.passTimeline?.revisit?.accuracy ?? '—'}%</td></tr>
      </tbody>
    </table>
    ${model.passTimeline?.takeaway ? `<p class="muted">${escapeHtml(model.passTimeline.takeaway)}</p>` : ''}
    ${pageFooter(model, 4, totalPages)}
  </section>

  <!-- PAGE 5: Chapters + Question telemetry -->
  <section class="sheet" data-page="5">
    <h2>12 · Chapter ROI Priority Matrix &amp; Focus Areas</h2>
    <table>
      <thead><tr><th>Priority</th><th>Chapter</th><th>Detail</th><th>Action</th></tr></thead>
      <tbody>${chapterRoiRows}</tbody>
    </table>
    <h3>Weak chapters (accuracy-sorted)</h3>
    <table>
      <thead><tr><th>Chapter</th><th>Accuracy</th><th>Wrong</th><th>Skip</th><th>Bar</th></tr></thead>
      <tbody>${weakRows}</tbody>
    </table>
    <h2>13 · Question-Level Highlights (Critical Excerpt)</h2>
    <p class="muted">Wrong, slow, skip, and overtime items — actual vs ideal time, toughness, why-wrong, peer accuracy. Not every stem (print budget). ${escapeHtml(peerNote)}</p>
    <table>
      <thead>
        <tr>
          <th>Q</th><th>Subj</th><th>Chapter</th><th>Status</th><th>Toughness</th>
          <th>Your time</th><th>Ideal</th><th>Visits</th><th>Why</th><th>Peers Correct%</th>
        </tr>
      </thead>
      <tbody>${highlightRows}</tbody>
    </table>
    ${pageFooter(model, 5, totalPages)}
  </section>

  <!-- PAGE 6: Peers + Trajectory + Prescription + Parent brief + Disclaimer -->
  <section class="sheet" data-page="6">
    <h2>14 · Accuracy vs Peers (Top 1% / 10% / 25% / 500 / All)</h2>
    <p class="muted">${escapeHtml(peerNote)}</p>
    ${cohortTable}
    <h3>Per-question peer snapshot (from highlights)</h3>
    <table>
      <thead><tr><th>Q</th><th>You</th><th>Top 10%</th><th>Top 25%</th><th>All</th></tr></thead>
      <tbody>
        ${(model.highlights || [])
          .filter((h) => h.peerAll != null)
          .slice(0, 12)
          .map(
            (h) =>
              `<tr><td>Q${h.index}</td><td>${escapeHtml(h.status)}</td><td>${h.peerTop10 ?? '—'}%</td><td>${h.peerTop25 ?? '—'}%</td><td>${h.peerAll}%</td></tr>`,
          )
          .join('') || '<tr><td colspan="5">Peer bands unavailable.</td></tr>'}
      </tbody>
    </table>
    ${flipBlock}
    ${dualBlock}

    <h2>15 · Trajectory &amp; Consistency</h2>
    <table>
      <thead><tr><th>Date</th><th>Test</th><th>Score</th><th>Accuracy</th></tr></thead>
      <tbody>${trajRows}</tbody>
    </table>

    <h2>16 · 7-Day Score-Recovery Prescription</h2>
    <table>
      <thead><tr><th>Window</th><th>Plan</th></tr></thead>
      <tbody>${rxRows}</tbody>
    </table>

    <div class="two-col">
      <div>
        <h2>17 · Insight Coach</h2>
        <h3>Strengths</h3>
        <ul class="compact">${strengths || '<li>See scorecard above.</li>'}</ul>
        <h3>Focus</h3>
        <ul class="compact">${focus || '<li>Keep practising timed full mocks.</li>'}</ul>
      </div>
      <div>
        <h2>18 · Parent &amp; Mentor Brief</h2>
        <p><strong>Standing.</strong> ${escapeHtml(model.parentBrief.standing)}</p>
        <p><strong>Bottleneck.</strong> ${escapeHtml(model.parentBrief.bottleneck)}</p>
        <p><strong>Mentor action.</strong> ${escapeHtml(model.parentBrief.mentorAction)}</p>
      </div>
    </div>

    <h2>19 · Disclaimers</h2>
    <div class="disclaimer">
      <p><strong>Estimates only.</strong> Percentile and AIR are practice-curve estimates from this attempt’s marks — <em>not</em> official NTA ranks or cutoffs.</p>
      <p><strong>Peer bands.</strong> ${
        model.livePeersReady
          ? 'Live server peers for this paper — Top 1% / Top 10% / Top 25% / Top 500 / All (Top 500 uses available cohort until 500+ submits).'
          : 'Device or demo peers until go-live. After <code>npm run live:deploy</code>, bands use all students who sat this paper (Top 1% / Top 500 unlock with volume).'
      }</p>
      <p><strong>Answer flips.</strong> Option-change forensics are logged on new exam sittings. OMR bubble events attach when an OMR path is used.</p>
      <p><strong>Advanced dual pack.</strong> Link Paper 1 + Paper 2 attempts for a merged P1+P2 standing section when both are available.</p>
      <p><strong>Ideal time &amp; toughness.</strong> Prefer Hybrid AI–saved fields when present; otherwise local toughness heuristics. Visit timelines use session telemetry when recorded.</p>
      <p><strong>Pilot print pack.</strong> Open in browser → Print → Save as PDF. Full interactive charts remain on the Result page in TestVantages.</p>
    </div>
    ${pageFooter(model, 6, totalPages)}
  </section>
</body>
</html>`
}

/**
 * @param {string} html
 * @param {string} [filename]
 */
export function downloadDiagnosticReportHtml(
  html,
  filename = 'testvantages-diagnostic-report.html',
) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/**
 * Open printable window and trigger Print dialog.
 * @param {ReturnType<typeof buildDiagnosticReportModel>} model
 */
export function openDiagnosticReportPrint(model) {
  const html = buildDiagnosticReportHtml(model)
  const w = window.open('', '_blank', 'noopener,noreferrer,width=920,height=1000')
  if (!w) return { ok: false, reason: 'popup_blocked' }
  w.document.open()
  w.document.write(html)
  w.document.close()
  setTimeout(() => {
    try {
      w.focus()
      w.print()
    } catch {
      /* ignore */
    }
  }, 350)
  return { ok: true }
}

/**
 * Convenience: build + download from attempt payload.
 */
export function downloadFullDiagnosticReport(opts = {}) {
  const model = buildDiagnosticReportModel(opts)
  const html = buildDiagnosticReportHtml(model)
  const safe = String(model.studentName || 'student')
    .replace(/[^\w\-]+/g, '-')
    .slice(0, 28)
  const safeTitle = String(model.title || 'diagnostic')
    .replace(/[^\w\-]+/g, '-')
    .slice(0, 36)
  downloadDiagnosticReportHtml(html, `testvantages-${safe}-${safeTitle}-diagnostic.html`)
  return model
}
