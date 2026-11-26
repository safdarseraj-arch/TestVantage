/**
 * Advanced Result analytics — clock stamina, Skip IQ, Error DNA by type,
 * Pass-1 / subject-switch timeline, dream-college gap teaser, sitter conversion.
 * Uses real attempt + optional sessionTelemetry only (no invented marks).
 */

import { getSubjectsForPattern, ALL_SUBJECTS } from '../data/subjects.js'
import { estimateAIR, scoreToPercentile } from './percentile.js'
import {
  buildAttemptQualityMatrix,
  classifyAttemptQuadrant,
  estimateIdealSeconds,
  simulateWhatIfScore,
} from './attemptQualityMatrix.js'
import { filterPerQuestionForSubject } from './testAnalysis.js'
import { predictColleges } from './careerCompassPredict.js'
import {
  ERROR_DNA_CHART_META,
  isWrongReasonTagId,
  suggestWrongReasonFromAuto,
} from './wrongReasonTags.js'

const SUBJECT_LABEL = Object.fromEntries(
  [...ALL_SUBJECTS, { id: 'biology', label: 'Biology' }].map((s) => [s.id, s.label]),
)

function subjectLabel(id) {
  return SUBJECT_LABEL[id] || id || '—'
}

function formatClockLabel(sec) {
  const m = Math.max(0, Math.round(sec / 60))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}m` : `${h}h`
}

/**
 * Choose bucket count: prefer 30-min slices; otherwise split paper into ≤6 buckets.
 * @param {number} paperDurationSec
 */
export function chooseStaminaBucketSeconds(paperDurationSec = 0) {
  const dur = Math.max(0, Number(paperDurationSec) || 0)
  if (dur >= 150 * 60) return 30 * 60 // 2.5h+ → classic 30-min buckets
  if (dur >= 90 * 60) return 30 * 60
  if (dur >= 45 * 60) return 15 * 60
  if (dur >= 20 * 60) return 10 * 60
  if (dur > 0) return Math.max(5 * 60, Math.ceil(dur / 6))
  return 30 * 60
}

/**
 * Build empty clock buckets covering [0, paperDurationSec].
 * @param {number} paperDurationSec
 * @param {number} [bucketSec]
 */
export function makeClockBuckets(paperDurationSec, bucketSec) {
  const dur = Math.max(bucketSec || 30 * 60, Number(paperDurationSec) || bucketSec || 30 * 60)
  const size = bucketSec || chooseStaminaBucketSeconds(dur)
  const n = Math.min(8, Math.max(3, Math.ceil(dur / size)))
  /** @type {object[]} */
  const buckets = []
  for (let i = 0; i < n; i++) {
    const start = i * size
    const end = i === n - 1 ? dur : Math.min(dur, (i + 1) * size)
    if (start >= dur && i > 0) break
    buckets.push({
      id: `b${i + 1}`,
      index: i,
      label: formatClockLabel(start),
      range: `${formatClockLabel(start)}–${formatClockLabel(end)}`,
      startSec: start,
      endSec: end,
      correct: 0,
      incorrect: 0,
      unattempted: 0,
      attempted: 0,
      total: 0,
      accuracy: 0,
      marks: 0,
      maxMarks: 0,
    })
  }
  return buckets
}

/**
 * Map each question to an elapsed-sec midpoint for bucketing.
 * Prefer sessionTelemetry first-seen / answer times; else estimate from dwell order.
 *
 * @param {{
 *   perQ: object[]
 *   questionTimes?: Record<string, number>
 *   sessionTelemetry?: {
 *     firstSeenAt?: Record<string, number>
 *     answerAt?: Record<string, number>
 *     navEvents?: { t?: number, questionId?: string, action?: string }[]
 *   } | null
 *   paperDurationSec?: number
 * }} opts
 * @returns {Map<string, number>}
 */
export function mapQuestionElapsedSeconds({
  perQ = [],
  questionTimes = {},
  sessionTelemetry = null,
  paperDurationSec = 0,
} = {}) {
  /** @type {Map<string, number>} */
  const map = new Map()
  const firstSeen = sessionTelemetry?.firstSeenAt ?? {}
  const answerAt = sessionTelemetry?.answerAt ?? {}

  for (const pq of perQ) {
    const id = pq.questionId
    if (!id) continue
    const fromAnswer = Number(answerAt[id])
    const fromSeen = Number(firstSeen[id])
    if (Number.isFinite(fromAnswer) && fromAnswer >= 0) {
      map.set(id, fromAnswer)
      continue
    }
    if (Number.isFinite(fromSeen) && fromSeen >= 0) {
      map.set(id, fromSeen)
    }
  }

  if (map.size >= Math.max(3, Math.floor(perQ.length * 0.4))) {
    return map
  }

  // Estimate: walk questions in index order, accumulate dwell as a proxy clock path.
  const sorted = [...perQ].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  let cursor = 0
  const totalDwell = sorted.reduce(
    (s, pq) => s + Math.max(0, Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0)),
    0,
  )
  const scale =
    paperDurationSec > 0 && totalDwell > 0
      ? Math.min(1.25, paperDurationSec / totalDwell)
      : 1

  for (const pq of sorted) {
    const dwell = Math.max(0, Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0))
    const mid = cursor + dwell * scale * 0.5
    if (!map.has(pq.questionId)) map.set(pq.questionId, mid)
    cursor += Math.max(dwell * scale, paperDurationSec > 0 ? paperDurationSec / Math.max(sorted.length, 1) : 60)
  }
  return map
}

/**
 * True clock-based stamina curve (6×30-min style, or duration-fit buckets).
 * @param {{
 *   result?: { perQuestion?: object[] }
 *   questionTimes?: Record<string, number>
 *   sessionTelemetry?: object | null
 *   paperDurationSec?: number
 *   subjectFilter?: string
 * }} opts
 */
export function buildClockStaminaCurve({
  result,
  questionTimes = {},
  sessionTelemetry = null,
  paperDurationSec = 0,
  subjectFilter = 'overall',
} = {}) {
  const perQ = filterPerQuestionForSubject(result?.perQuestion ?? [], subjectFilter)
  if (!perQ.length) {
    return { buckets: [], mode: 'empty', insight: null, chart: [] }
  }

  const timedCount = Object.values(questionTimes || {}).filter((t) => Number(t) > 0).length
  const hasClock =
    sessionTelemetry &&
    ((sessionTelemetry.firstSeenAt && Object.keys(sessionTelemetry.firstSeenAt).length >= 3) ||
      (sessionTelemetry.navEvents && sessionTelemetry.navEvents.length >= 3))

  const dur =
    paperDurationSec > 0
      ? paperDurationSec
      : Math.max(
          60 * 60,
          ...[...mapQuestionElapsedSeconds({ perQ, questionTimes, sessionTelemetry }).values()],
        )

  const bucketSec = chooseStaminaBucketSeconds(dur)
  const buckets = makeClockBuckets(dur, bucketSec)
  const elapsedMap = mapQuestionElapsedSeconds({
    perQ,
    questionTimes,
    sessionTelemetry,
    paperDurationSec: dur,
  })

  for (const pq of perQ) {
    const t = elapsedMap.get(pq.questionId) ?? 0
    let b = buckets.find((x) => t >= x.startSec && t < x.endSec)
    if (!b) b = buckets[buckets.length - 1]
    if (!b) continue
    b.total++
    b.maxMarks += pq.maxMarks ?? 0
    b.marks += pq.marks ?? 0
    if (pq.grade === 'correct') {
      b.correct++
      b.attempted++
    } else if (pq.grade === 'unattempted') {
      b.unattempted++
    } else {
      b.incorrect++
      b.attempted++
    }
  }

  for (const b of buckets) {
    b.accuracy = b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0
  }

  const withAcc = buckets.filter((b) => b.total > 0)
  let insight = null
  if (withAcc.length >= 2) {
    const best = withAcc.reduce((a, c) => (a.accuracy >= c.accuracy ? a : c))
    const worst = withAcc.reduce((a, c) => (a.accuracy <= c.accuracy ? a : c))
    const late = withAcc.slice(Math.floor(withAcc.length / 2))
    const early = withAcc.slice(0, Math.ceil(withAcc.length / 2))
    const lateAvg =
      late.reduce((s, b) => s + b.accuracy, 0) / Math.max(late.length, 1)
    const earlyAvg =
      early.reduce((s, b) => s + b.accuracy, 0) / Math.max(early.length, 1)
    const fade = earlyAvg - lateAvg >= 12
    if (best.id === worst.id) {
      insight = `Steady stamina — about ${best.accuracy}% accuracy across the clock.`
    } else {
      insight = `Strongest at ${best.range} (${best.accuracy}%), softest at ${worst.range} (${worst.accuracy}%).${
        fade ? ' Accuracy dipped later — practise full-length timed mocks.' : ''
      }`
    }
  }

  const chart = buckets.map((b) => ({
    id: b.id,
    label: b.label,
    range: b.range,
    accuracy: b.accuracy,
    correct: b.correct,
    incorrect: b.incorrect,
    unattempted: b.unattempted,
    total: b.total,
  }))

  return {
    buckets,
    chart,
    mode: hasClock ? 'clock' : timedCount >= 3 ? 'estimated' : 'sparse',
    bucketMinutes: Math.round(bucketSec / 60),
    insight,
    paperDurationSec: dur,
  }
}

/**
 * Skip IQ — how you treat skips / unattempted time.
 * @param {{
 *   result?: { perQuestion?: object[], unattempted?: number, wrong?: number, correct?: number }
 *   questionTimes?: Record<string, number>
 *   sessionTelemetry?: { visitCounts?: Record<string, number> } | null
 *   paperDurationSec?: number
 * }} opts
 */
export function buildSkipIq({
  result,
  questionTimes = {},
  sessionTelemetry = null,
  paperDurationSec = 0,
} = {}) {
  const perQ = result?.perQuestion ?? []
  if (!perQ.length) return null

  const ideal = estimateIdealSeconds(perQ, questionTimes, paperDurationSec)
  const skipped = perQ.filter((pq) => pq.grade === 'unattempted')
  const visitCounts = sessionTelemetry?.visitCounts ?? {}

  let skipGlanceSec = 0
  let skipDwellSec = 0
  let neverVisited = 0
  let revisitedSkip = 0
  let quickSkip = 0
  let longSkip = 0

  for (const pq of skipped) {
    const sec = Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0)
    const visits = Number(visitCounts[pq.questionId] ?? (sec > 0 ? 1 : 0))
    if (visits === 0 && sec === 0) neverVisited++
    if (visits >= 2) revisitedSkip++
    if (sec > 0 && sec < ideal * 0.25) {
      quickSkip++
      skipGlanceSec += sec
    } else if (sec >= ideal * 1.2) {
      longSkip++
      skipDwellSec += sec
    } else {
      skipGlanceSec += Math.min(sec, ideal * 0.25)
      skipDwellSec += Math.max(0, sec - ideal * 0.25)
    }
  }

  const totalSkipSec = skipped.reduce(
    (s, pq) => s + Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0),
    0,
  )
  const avgSkipSec = skipped.length ? Math.round(totalSkipSec / skipped.length) : 0
  const attempted = perQ.filter((pq) => pq.grade !== 'unattempted').length
  const skipRate = Math.round((skipped.length / perQ.length) * 100)

  /** @type {'sharp' | 'hesitant' | 'stuck' | 'blind' | 'balanced'} */
  let band = 'balanced'
  if (neverVisited >= Math.max(3, Math.ceil(skipped.length * 0.6)) && skipped.length >= 3) {
    band = 'blind'
  } else if (longSkip >= Math.max(2, Math.ceil(skipped.length * 0.4))) {
    band = 'stuck'
  } else if (quickSkip >= Math.max(2, Math.ceil(skipped.length * 0.5)) && avgSkipSec <= ideal * 0.35) {
    band = 'sharp'
  } else if (revisitedSkip >= 2 || avgSkipSec > ideal * 0.7) {
    band = 'hesitant'
  }

  const bandCopy = {
    sharp: 'Sharp skip IQ — you leave doubtful items fast and protect the clock.',
    hesitant: 'Hesitant skips — you revisit or linger without converting. Decide once, move on.',
    stuck: 'Stuck-on-skips — long dwell on questions you still left blank. Cap at ~90s then flag.',
    blind: 'Blind zone — many questions never opened. Sweep the palette once in Pass-1.',
    balanced: 'Balanced skip pattern — fine-tune with a hard 90-second exit rule.',
  }

  const chart = [
    { key: 'quick', name: 'Quick skip', value: quickSkip, color: '#0d9488' },
    { key: 'long', name: 'Long skip', value: longSkip, color: '#e11d48' },
    { key: 'never', name: 'Never opened', value: neverVisited, color: '#94a3b8' },
    {
      key: 'other',
      name: 'Other skip',
      value: Math.max(0, skipped.length - quickSkip - longSkip - neverVisited),
      color: '#d97706',
    },
  ].filter((r) => r.value > 0)

  return {
    skipped: skipped.length,
    attempted,
    skipRate,
    avgSkipSec,
    totalSkipSec,
    neverVisited,
    revisitedSkip,
    quickSkip,
    longSkip,
    idealSeconds: ideal,
    band,
    takeaway: bandCopy[band],
    chart,
    insight:
      skipped.length === 0
        ? 'You attempted every question — watch accuracy, not skip rate.'
        : `${skipped.length} skipped (${skipRate}%). Avg ${avgSkipSec}s on skips. ${bandCopy[band]}`,
  }
}

/**
 * Error DNA — tag wrong answers by behavioural type, preferring student
 * “Why I got it wrong” tags when present.
 *
 * Auto types: silly | overtime | concept | calc | other
 * Student types: question_misread | question_misunderstanding | conceptual_error |
 *   calculation_error | formula_error | guess
 *
 * @param {{
 *   result?: { perQuestion?: object[], score?: number, maxScore?: number }
 *   questionTimes?: Record<string, number>
 *   paperDurationSec?: number
 *   questions?: { id: string, difficulty?: string, level?: string, questionType?: string }[]
 *   wrongReasons?: Record<string, string>
 * }} opts
 */
export function buildErrorDnaTypes({
  result,
  questionTimes = {},
  paperDurationSec = 0,
  questions = [],
  wrongReasons = {},
} = {}) {
  const perQ = result?.perQuestion ?? []
  const wrongs = perQ.filter((pq) => pq.grade === 'wrong' || pq.grade === 'partial')
  if (!wrongs.length) {
    return {
      counts: emptyErrorDnaCounts(),
      chart: [],
      items: [],
      takeaway: 'No wrong answers to DNA-tag — protect this accuracy.',
      marksLost: 0,
      studentTagged: 0,
    }
  }

  const ideal = estimateIdealSeconds(perQ, questionTimes, paperDurationSec)
  const diffMap = Object.fromEntries(
    (questions || []).map((q) => [q.id, String(q.difficulty || q.level || '').toLowerCase()]),
  )
  const typeMap = Object.fromEntries(
    (questions || []).map((q) => [q.id, String(q.questionType || '').toLowerCase()]),
  )

  /** @type {Record<string, number>} */
  const counts = emptyErrorDnaCounts()
  /** @type {object[]} */
  const items = []
  let marksLost = 0
  let studentTagged = 0

  for (const pq of wrongs) {
    const seconds = Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0)
    const lost = Math.max(0, (pq.maxMarks ?? 0) - (pq.marks ?? 0))
    marksLost += lost
    const diff = diffMap[pq.questionId] || ''
    const qType = typeMap[pq.questionId] || ''
    const quadrant = classifyAttemptQuadrant({ grade: pq.grade, seconds }, ideal)
    const easy =
      diff === 'easy' || diff === 'sitter' || diff === 'simple' || diff === 'very_easy'

    /** @type {'silly'|'overtime'|'concept'|'calc'|'other'} */
    let autoType = 'other'
    if (easy || quadrant === 'wasted' || (seconds > 0 && seconds <= ideal * 0.55 && pq.grade === 'wrong')) {
      autoType = 'silly'
    } else if (quadrant === 'painful' || seconds > ideal * 1.5) {
      autoType = 'overtime'
    } else if (
      /integer|numerical|nat|float/.test(qType) ||
      (seconds >= ideal * 0.8 && seconds <= ideal * 1.5 && !easy)
    ) {
      // Numerical / mid-length wrongs → calc-leaning when not clearly overtime
      autoType = /integer|numerical|nat|float/.test(qType) ? 'calc' : 'concept'
    } else if (seconds >= ideal * 0.5) {
      autoType = 'concept'
    }

    const studentRaw = wrongReasons[pq.questionId] ?? pq.wrongReason
    const studentTag = isWrongReasonTagId(studentRaw) ? studentRaw : null
    if (studentTag) studentTagged++
    const type = studentTag || autoType
    const suggested = suggestWrongReasonFromAuto(autoType)

    counts[type] = (counts[type] ?? 0) + 1
    items.push({
      index: pq.index,
      questionId: pq.questionId,
      chapter: pq.chapter,
      subject: pq.subject,
      seconds,
      type,
      autoType,
      studentTag,
      suggested,
      marksLost: lost,
    })
  }

  const META = ERROR_DNA_CHART_META

  const chart = Object.keys(META)
    .map((key) => ({
      key,
      name: META[key].name,
      hint: META[key].hint,
      color: META[key].color,
      value: counts[key] ?? 0,
      marks: items.filter((i) => i.type === key).reduce((s, i) => s + i.marksLost, 0),
      student: isWrongReasonTagId(key),
    }))
    .filter((r) => r.value > 0)

  const top = chart.reduce((a, b) => (a.value >= b.value ? a : b), chart[0])
  const taggedNote =
    studentTagged > 0
      ? ` Your tags cover ${studentTagged}/${wrongs.length} wrong.`
      : ' Tip: tag wrongs under Question-wise → Why I got it wrong.'
  const takeaway = top
    ? `Error DNA leans “${top.name}” (${top.value} Q, ~${top.marks} marks). ${top.hint}.${taggedNote}`
    : null

  return { counts, chart, items, takeaway, marksLost, meta: META, studentTagged }
}

function emptyErrorDnaCounts() {
  return {
    silly: 0,
    overtime: 0,
    concept: 0,
    calc: 0,
    other: 0,
    question_misread: 0,
    question_misunderstanding: 0,
    conceptual_error: 0,
    calculation_error: 0,
    formula_error: 0,
    guess: 0,
  }
}

/**
 * Subject-switch / Pass-1 timeline from session telemetry (or thin reconstruction).
 * @param {{
 *   result?: { perQuestion?: object[] }
 *   sessionTelemetry?: {
 *     subjectSwitches?: { t: number, from?: string, to: string }[]
 *     navEvents?: { t: number, questionId?: string, subject?: string, action?: string, visitN?: number }[]
 *     firstSeenAt?: Record<string, number>
 *     visitCounts?: Record<string, number>
 *   } | null
 *   examPatternId?: string
 * }} opts
 */
export function buildPassTimeline({ result, sessionTelemetry = null, examPatternId = '' } = {}) {
  const perQ = result?.perQuestion ?? []
  const byId = Object.fromEntries(perQ.map((pq) => [pq.questionId, pq]))
  const switches = sessionTelemetry?.subjectSwitches ?? []
  const navEvents = sessionTelemetry?.navEvents ?? []
  const visitCounts = sessionTelemetry?.visitCounts ?? {}
  const firstSeenAt = sessionTelemetry?.firstSeenAt ?? {}

  const hasTelemetry = switches.length > 0 || navEvents.length >= 3

  /** @type {object[]} */
  let events = []
  if (hasTelemetry) {
    for (const sw of switches) {
      events.push({
        kind: 'subject',
        t: Number(sw.t) || 0,
        label: `${subjectLabel(sw.from)} → ${subjectLabel(sw.to)}`,
        from: sw.from,
        to: sw.to,
      })
    }
    // Compact subject blocks from nav enter events
    let lastSub = null
    for (const ev of navEvents) {
      if (ev.action && ev.action !== 'enter') continue
      const sub = ev.subject || byId[ev.questionId]?.subject
      if (!sub || sub === lastSub) continue
      if (lastSub) {
        events.push({
          kind: 'subject',
          t: Number(ev.t) || 0,
          label: `${subjectLabel(lastSub)} → ${subjectLabel(sub)}`,
          from: lastSub,
          to: sub,
        })
      }
      lastSub = sub
    }
  }

  // Deduplicate subject switches by time+to
  const seen = new Set()
  events = events
    .filter((e) => {
      const key = `${e.kind}:${e.t}:${e.to || e.label}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.t - b.t)
    .slice(0, 24)

  const firstPassIds = new Set()
  const revisitIds = new Set()
  for (const [id, n] of Object.entries(visitCounts)) {
    if (Number(n) >= 2) revisitIds.add(id)
    else if (Number(n) === 1) firstPassIds.add(id)
  }
  if (!visitCounts || !Object.keys(visitCounts).length) {
    for (const pq of perQ) {
      if (firstSeenAt[pq.questionId] != null) firstPassIds.add(pq.questionId)
    }
  }

  const firstPass = [...firstPassIds]
    .map((id) => byId[id])
    .filter(Boolean)
  const revisit = [...revisitIds]
    .map((id) => byId[id])
    .filter(Boolean)

  const pass1Correct = firstPass.filter((p) => p.grade === 'correct').length
  const pass1Wrong = firstPass.filter((p) => p.grade === 'wrong' || p.grade === 'partial').length
  const revisitCorrect = revisit.filter((p) => p.grade === 'correct').length

  // Subject order path for chart
  const subjectPath = []
  if (events.length) {
    for (const e of events) {
      if (e.kind !== 'subject') continue
      subjectPath.push({
        t: e.t,
        label: formatClockLabel(e.t),
        subject: subjectLabel(e.to),
        subjectId: e.to,
      })
    }
  } else if (examPatternId) {
    // Thin fallback: order subjects by average first-seen / index
    const subjects = getSubjectsForPattern(examPatternId)
    const order = subjects
      .map((s) => {
        const qs = perQ.filter((pq) => pq.subject === s.id)
        if (!qs.length) return null
        const avgIndex =
          qs.reduce((sum, pq) => sum + (pq.index ?? 0), 0) / qs.length
        return { subjectId: s.id, subject: s.label, avgIndex, t: avgIndex * 60 }
      })
      .filter(Boolean)
      .sort((a, b) => a.avgIndex - b.avgIndex)
    order.forEach((row, i) => {
      subjectPath.push({
        t: row.t,
        label: `Block ${i + 1}`,
        subject: row.subject,
        subjectId: row.subjectId,
        estimated: true,
      })
    })
  }

  const switchCount = events.filter((e) => e.kind === 'subject').length
  let takeaway = null
  if (!hasTelemetry && subjectPath.every((p) => p.estimated)) {
    takeaway =
      'Subject path is estimated from question order. Take a new mock to record live switches.'
  } else if (switchCount >= 8) {
    takeaway = `You switched subjects ${switchCount} times — fewer jumps often keep focus sharper.`
  } else if (revisit.length >= 5) {
    takeaway = `${revisit.length} questions revisited. Pass-1 accuracy ${
      firstPass.length
        ? Math.round((pass1Correct / firstPass.length) * 100)
        : 0
    }% — lock sitters first, park tough ones.`
  } else if (hasTelemetry) {
    takeaway = `Pass-1 covered ${firstPass.length} questions (${pass1Correct} correct). Clean subject blocks look good.`
  }

  return {
    hasTelemetry,
    events,
    subjectPath,
    switchCount,
    firstPass: {
      count: firstPass.length,
      correct: pass1Correct,
      wrong: pass1Wrong,
      accuracy: firstPass.length ? Math.round((pass1Correct / firstPass.length) * 100) : 0,
    },
    revisit: {
      count: revisit.length,
      correct: revisitCorrect,
      accuracy: revisit.length ? Math.round((revisitCorrect / revisit.length) * 100) : 0,
    },
    takeaway,
  }
}

/**
 * Dream-college marks-gap teaser: “fix N silly → close gap”.
 * @param {{
 *   result?: { score?: number, maxScore?: number, perQuestion?: object[] }
 *   questionTimes?: Record<string, number>
 *   paperDurationSec?: number
 *   questions?: object[]
 *   examPatternId?: string
 *   estimatedAIR?: number | null
 * }} opts
 */
export function buildDreamCollegeGapTeaser({
  result,
  questionTimes = {},
  paperDurationSec = 0,
  questions = [],
  examPatternId = 'jee-main',
  estimatedAIR = null,
} = {}) {
  if (!result || !(result.maxScore > 0)) return null

  const matrix = buildAttemptQualityMatrix({
    result,
    questionTimes,
    paperDurationSec,
    questions,
  })
  const sillyCount = matrix.potential?.sillyCount ?? 0
  const sillyLost = matrix.potential?.sillyLost ?? 0
  if (sillyCount < 1 || sillyLost < 1) {
    return {
      ready: false,
      reason: 'No clear silly-mark recovery on this paper.',
      sillyCount,
      sillyLost,
    }
  }

  const whatIf = simulateWhatIfScore(
    {
      actual: matrix.potential.actual,
      maxScore: matrix.potential.maxScore,
      sillyLost,
      overtimeCorrect: matrix.counts?.overtimeCorrect ?? 0,
    },
    { sillyFixPct: 100, overtimeFixPct: 0 },
  )

  const examId =
    examPatternId === 'jee-advanced'
      ? 'jee-advanced'
      : examPatternId === 'neet'
        ? 'neet'
        : 'jee-main'

  const currentPct = scoreToPercentile(result.score, result.maxScore)
  const nextPct = scoreToPercentile(whatIf.score, result.maxScore)
  // Keep both AIRs on the same score→percentile curve so the gap math stays coherent.
  const currentAirFromScore = estimateAIR(currentPct, examPatternId)
  const currentAir =
    estimatedAIR &&
    estimatedAIR > 0 &&
    Math.abs(estimatedAIR - currentAirFromScore) / Math.max(currentAirFromScore, 1) <= 0.45
      ? estimatedAIR
      : currentAirFromScore
  const nextAir = Math.min(currentAir, estimateAIR(nextPct, examPatternId))

  let dream = null
  try {
    const matches = predictColleges(currentAir, examId, { limit: 25 })
    dream =
      matches.find((m) => m.band === 'dream' && m.preferredMatch) ||
      matches.find((m) => m.band === 'dream') ||
      matches.find((m) => m.band === 'reach') ||
      matches[0] ||
      null
  } catch {
    dream = null
  }

  if (!dream) {
    return {
      ready: true,
      sillyCount,
      sillyLost,
      currentScore: result.score,
      nextScore: whatIf.score,
      currentAir,
      nextAir,
      college: null,
      headline: `Fix ${sillyCount} silly → +${sillyLost} marks (≈ ${result.score} → ${whatIf.score})`,
      detail: `Estimated AIR ~${currentAir.toLocaleString('en-IN')} → ~${nextAir.toLocaleString('en-IN')}. Open Career Compass to map colleges.`,
      gapClosedPct: null,
    }
  }

  const cutoff = dream.avgCutoff || dream.latestCutoff
  // Lower AIR is better — gap = how far above the cutoff you sit
  const gapNow = Math.max(0, currentAir - cutoff)
  const gapNext = Math.max(0, nextAir - cutoff)
  const gapClosedPct =
    gapNow > 0
      ? Math.max(0, Math.min(100, Math.round(((gapNow - gapNext) / gapNow) * 100)))
      : nextAir <= cutoff
        ? 100
        : 0
  const collegeName = dream.college?.shortName || dream.college?.name || 'Dream college'
  const branchName = dream.branch?.name || ''

  return {
    ready: true,
    sillyCount,
    sillyLost,
    currentScore: result.score,
    nextScore: whatIf.score,
    currentAir,
    nextAir,
    cutoff,
    band: dream.band,
    college: { name: collegeName, branch: branchName, band: dream.band },
    gapNow,
    gapNext,
    gapClosedPct,
    headline: `Fix ${sillyCount} silly → close the gap to ${collegeName}`,
    detail:
      gapNow > 0
        ? `+${sillyLost} marks (≈ ${result.score} → ${whatIf.score}) moves AIR ~${currentAir.toLocaleString('en-IN')} → ~${nextAir.toLocaleString('en-IN')} — about ${gapClosedPct}% of the gap to ${branchName || 'your dream branch'} (cutoff ~${Math.round(cutoff).toLocaleString('en-IN')}).`
        : `You're already near ${collegeName}. Cleaning silly mistakes keeps you safely inside the band.`,
  }
}

/**
 * Enrich difficulty rows with sitter-conversion % when timings / difficulty exist.
 * @param {object[]} difficultyRows from buildDifficultyAnalysis
 * @param {{
 *   result?: { perQuestion?: object[] }
 *   questionTimes?: Record<string, number>
 *   questions?: { id: string, difficulty?: string }[]
 *   subjectFilter?: string
 *   cohortDiffMap?: Map<string, string>
 * }} opts
 */
export function enrichDifficultyWithSitterConversion(
  difficultyRows = [],
  { result, questionTimes = {}, questions = [], subjectFilter = 'overall', cohortDiffMap = null } = {},
) {
  const perQ = filterPerQuestionForSubject(result?.perQuestion ?? [], subjectFilter)
  const diffFromQ = Object.fromEntries(
    (questions || []).map((q) => [q.id, String(q.difficulty || q.level || '').toLowerCase()]),
  )

  const resolveDiff = (pq) => {
    if (cohortDiffMap?.get(pq.questionId)) return cohortDiffMap.get(pq.questionId)
    const d = diffFromQ[pq.questionId]
    if (d === 'easy' || d === 'sitter' || d === 'simple' || d === 'very_easy') return 'easy'
    if (d === 'hard' || d === 'tough') return 'hard'
    if (d === 'medium' || d === 'moderate') return 'medium'
    return null
  }

  const easy = perQ.filter((pq) => resolveDiff(pq) === 'easy')
  // Fall back: use cohort-tagged easy from difficulty rows' underlying questions
  const easyRows = easy.length
    ? easy
    : perQ.filter((pq) => {
        const d = cohortDiffMap?.get(pq.questionId)
        return d === 'easy'
      })

  const sitters = easyRows
  const sitterTotal = sitters.length
  const sitterCorrect = sitters.filter((pq) => pq.grade === 'correct').length
  const sitterWrong = sitters.filter((pq) => pq.grade === 'wrong' || pq.grade === 'partial').length
  const sitterSkipped = sitters.filter((pq) => pq.grade === 'unattempted').length
  const conversion = sitterTotal > 0 ? Math.round((sitterCorrect / sitterTotal) * 100) : null
  const attemptedAcc =
    sitterCorrect + sitterWrong > 0
      ? Math.round((sitterCorrect / (sitterCorrect + sitterWrong)) * 100)
      : null

  const timedSitters = sitters.filter(
    (pq) => Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0) > 0,
  )
  const avgSitterSec = timedSitters.length
    ? Math.round(
        timedSitters.reduce(
          (s, pq) => s + Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0),
          0,
        ) / timedSitters.length,
      )
    : null

  const enriched = difficultyRows.map((row) => {
    if (row.id !== 'easy') return { ...row, sitterConversion: null }
    return {
      ...row,
      sitterConversion: conversion,
      sitterAttemptedAcc: attemptedAcc,
      sitterTotal,
      sitterCorrect,
      sitterWrong,
      sitterSkipped,
      avgSitterSec,
    }
  })

  let insightExtra = null
  if (conversion != null) {
    if (conversion < 70 && sitterTotal >= 3) {
      insightExtra = `Sitter conversion ${conversion}% — easy marks are leaking (${sitterTotal - sitterCorrect} of ${sitterTotal} sitters missed).`
    } else if (conversion >= 85) {
      insightExtra = `Sitter conversion ${conversion}% — you’re banking easy marks well.`
    } else {
      insightExtra = `Sitter conversion ${conversion}% on ${sitterTotal} easy items.`
    }
  }

  return {
    rows: enriched,
    sitter: {
      total: sitterTotal,
      correct: sitterCorrect,
      wrong: sitterWrong,
      skipped: sitterSkipped,
      conversion,
      attemptedAcc,
      avgSitterSec,
    },
    insightExtra,
  }
}

/** Exam-slot biological clock — morning / afternoon / evening / night. */
export const BIO_CLOCK_SLOTS = [
  { id: 'morning', label: 'Morning', range: '6am–12pm', startHour: 6, endHour: 12 },
  { id: 'afternoon', label: 'Afternoon', range: '12–5pm', startHour: 12, endHour: 17 },
  { id: 'evening', label: 'Evening', range: '5–9pm', startHour: 17, endHour: 21 },
  { id: 'night', label: 'Night', range: '9pm–6am', startHour: 21, endHour: 6 },
]

/**
 * @param {number | Date | null | undefined} ts
 * @returns {typeof BIO_CLOCK_SLOTS[number] | null}
 */
export function bioClockSlotForTimestamp(ts) {
  if (ts == null) return null
  const d = ts instanceof Date ? ts : new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return null
  const h = d.getHours()
  for (const slot of BIO_CLOCK_SLOTS) {
    if (slot.startHour < slot.endHour) {
      if (h >= slot.startHour && h < slot.endHour) return slot
    } else if (h >= slot.startHour || h < slot.endHour) {
      return slot
    }
  }
  return BIO_CLOCK_SLOTS[0]
}

/**
 * Performance by time-of-day slot using attempt startedAt / submittedAt.
 * Honest empty state when timestamps missing.
 *
 * @param {{
 *   currentAttempt?: { startedAt?: number, submittedAt?: number, score?: number, maxScore?: number, accuracy?: number }
 *   attempts?: { startedAt?: number, submittedAt?: number, score?: number, maxScore?: number, accuracy?: number }[]
 * }} opts
 */
export function buildBioClockInsight(opts = {}) {
  const current = opts.currentAttempt
  const currentTs = current?.startedAt ?? current?.submittedAt ?? null
  const currentSlot = bioClockSlotForTimestamp(currentTs)

  /** @type {Record<string, { count: number, scoreSum: number, maxSum: number, accSum: number, accN: number }>} */
  const buckets = Object.fromEntries(
    BIO_CLOCK_SLOTS.map((s) => [s.id, { count: 0, scoreSum: 0, maxSum: 0, accSum: 0, accN: 0 }]),
  )

  const history = Array.isArray(opts.attempts) ? opts.attempts : []
  let stamped = 0
  for (const a of history) {
    const ts = a.startedAt ?? a.submittedAt
    const slot = bioClockSlotForTimestamp(ts)
    if (!slot) continue
    stamped++
    const b = buckets[slot.id]
    b.count++
    b.scoreSum += Number(a.score) || 0
    b.maxSum += Number(a.maxScore) || 0
    if (a.accuracy != null) {
      b.accSum += Number(a.accuracy) || 0
      b.accN++
    }
  }

  const chart = BIO_CLOCK_SLOTS.map((s) => {
    const b = buckets[s.id]
    const avgPct = b.maxSum > 0 ? Math.round((b.scoreSum / b.maxSum) * 100) : null
    const avgAcc = b.accN > 0 ? Math.round(b.accSum / b.accN) : null
    return {
      id: s.id,
      label: s.label,
      range: s.range,
      count: b.count,
      avgPct,
      avgAcc,
      isCurrent: currentSlot?.id === s.id,
    }
  })

  if (!currentTs && stamped === 0) {
    return {
      ready: false,
      currentSlot: null,
      chart,
      stampedCount: 0,
      takeaway:
        'No start/submit times on file yet — take a timed mock so we can show which exam slot fits you best.',
    }
  }

  const withData = chart.filter((c) => c.count > 0 && c.avgPct != null)
  const best = withData.length
    ? withData.reduce((a, b) => ((a.avgPct ?? 0) >= (b.avgPct ?? 0) ? a : b))
    : null

  let takeaway = ''
  if (currentSlot && stamped <= 1) {
    takeaway = `This paper was in the ${currentSlot.label.toLowerCase()} slot (${currentSlot.range}). Take a few more mocks at different times to spot your biological clock.`
  } else if (currentSlot && best) {
    takeaway =
      best.id === currentSlot.id
        ? `Your strongest slot so far is ${best.label} (~${best.avgPct}% avg) — this attempt matches that window.`
        : `This attempt: ${currentSlot.label}. Your best average so far is ${best.label} (~${best.avgPct}%).`
  } else if (best) {
    takeaway = `Best clock slot so far: ${best.label} (~${best.avgPct}% across ${best.count} attempt${best.count === 1 ? '' : 's'}).`
  } else {
    takeaway = 'Timestamps found, but not enough scored attempts to rank slots yet.'
  }

  return {
    ready: true,
    currentSlot,
    chart,
    stampedCount: stamped,
    bestSlotId: best?.id ?? null,
    takeaway,
  }
}

/**
 * Optimistic / pessimistic score & percentile band from What-If + consistency.
 *
 * @param {{
 *   result?: { score?: number, maxScore?: number, perQuestion?: object[] }
 *   questionTimes?: Record<string, number>
 *   paperDurationSec?: number
 *   questions?: { id: string, difficulty?: string }[]
 * }} opts
 */
export function buildScoreFloorCeilingBand(opts = {}) {
  const result = opts.result
  if (!result || result.maxScore == null) {
    return {
      ready: false,
      takeaway: 'No score yet for a floor / ceiling band.',
    }
  }

  const matrix = buildAttemptQualityMatrix({
    result,
    questionTimes: opts.questionTimes,
    paperDurationSec: opts.paperDurationSec,
    questions: opts.questions,
  })
  const actual = Number(result.score) || 0
  const maxScore = Number(result.maxScore) || 0
  const sillyLost = matrix.potential?.sillyLost ?? 0
  const overtimeN = matrix.counts?.overtimeCorrect ?? 0

  // Optimistic: fix all silly + convert overtime drag
  const ceiling = simulateWhatIfScore(
    { actual, maxScore, sillyLost, overtimeCorrect: overtimeN },
    { sillyFixPct: 100, overtimeFixPct: 100 },
  )
  // Pessimistic floor: if overtime corrects flip under pressure (~0.5 mark tax each, capped)
  const panicTax = Math.min(
    Math.round(overtimeN * 0.5) + Math.round((matrix.counts?.painful ?? 0) * 0.25),
    Math.max(0, actual),
  )
  const floorScore = Math.max(0, actual - panicTax)
  const floorPctile = scoreToPercentile(floorScore, maxScore)
  const actualPctile = scoreToPercentile(actual, maxScore)
  const ceilingPctile = scoreToPercentile(ceiling.score, maxScore)

  const bandWidth = Math.max(0, ceiling.score - floorScore)

  return {
    ready: true,
    actual,
    maxScore,
    floor: {
      score: floorScore,
      percentile: Math.round(floorPctile * 10) / 10,
      label: 'Pessimistic',
    },
    mid: {
      score: actual,
      percentile: Math.round(actualPctile * 10) / 10,
      label: 'This attempt',
    },
    ceiling: {
      score: ceiling.score,
      percentile: Math.round(ceilingPctile * 10) / 10,
      label: 'Optimistic',
    },
    bandWidth,
    chart: [
      { key: 'floor', name: 'Floor', score: floorScore, percentile: Math.round(floorPctile * 10) / 10, fill: '#94a3b8' },
      { key: 'actual', name: 'Actual', score: actual, percentile: Math.round(actualPctile * 10) / 10, fill: '#2563eb' },
      { key: 'ceiling', name: 'Ceiling', score: ceiling.score, percentile: Math.round(ceilingPctile * 10) / 10, fill: '#16a34a' },
    ],
    takeaway:
      bandWidth > 0
        ? `Your consistency band is about ${floorScore}–${ceiling.score} marks (~${Math.round(floorPctile)}–${Math.round(ceilingPctile)} %ile). Cleaning avoidable mistakes lifts the ceiling; overtime panic pulls the floor down.`
        : 'Floor and ceiling sit on the same mark — little recoverable swing from What-If on this paper.',
  }
}
