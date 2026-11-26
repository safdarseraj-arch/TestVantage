/**
 * Diagnostic Analytics for Student Question Performance (Phase 1 MVP).
 * Live mistake / skip / combined-struggle tabs, sample floor, hysteresis,
 * attempt-adjusted error, discrimination, triage badges, student trap metrics.
 *
 * Pure helpers — pass attempt rows in; no localStorage side effects.
 */

/** Min exposures before Tab A/B routing (PDF suggests 15–20; 10 keeps classroom demos usable). */
export const DEFAULT_SAMPLE_FLOOR = 10
export const ENTER_THRESHOLD_PCT = 50
export const EXIT_THRESHOLD_PCT = 45
export const QUICK_SKIP_SEC = 15
export const TIME_SINK_SKIP_SEC = 90
export const EMPIRICAL_MIN_EXPOSURES = 25

/** @typedef {'high_mistake'|'high_skip'|'combined_struggle'} DiagnosticTabId */
/** @typedef {'suspect_key'|'check_ambiguity'|'render_syllabus'|'time_sink'|'toughness_mismatch'|null} TriageBadgeId */

/**
 * @param {number} n
 * @param {number} [digits]
 */
export function roundPct(n, digits = 1) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  const f = 10 ** digits
  return Math.round(x * f) / f
}

/** Live Mistake % = (Wrong / Total Served) × 100 */
export function liveMistakePct(wrong, totalServed) {
  const t = Number(totalServed) || 0
  if (t <= 0) return 0
  return roundPct(((Number(wrong) || 0) / t) * 100)
}

/** Live Skip % = (Skipped / Total Served) × 100 */
export function liveSkipPct(skipped, totalServed) {
  const t = Number(totalServed) || 0
  if (t <= 0) return 0
  return roundPct(((Number(skipped) || 0) / t) * 100)
}

/** Combined Struggle % = ((Wrong + Skipped) / Total Served) × 100 */
export function combinedStrugglePct(wrong, skipped, totalServed) {
  const t = Number(totalServed) || 0
  if (t <= 0) return 0
  return roundPct((((Number(wrong) || 0) + (Number(skipped) || 0)) / t) * 100)
}

/** Attempt-Adjusted Error % = Wrong / (Correct + Wrong) × 100 */
export function attemptAdjustedErrorPct(wrong, correct) {
  const w = Number(wrong) || 0
  const c = Number(correct) || 0
  const att = c + w
  if (att <= 0) return 0
  return roundPct((w / att) * 100)
}

/** Solve Rate P = Correct / Total Served (0–1) */
export function solveRate(correct, totalServed) {
  const t = Number(totalServed) || 0
  if (t <= 0) return 0
  return roundPct((Number(correct) || 0) / t, 4)
}

/** Discrimination Index D = P_top20 − P_bottom20 */
export function discriminationIndex(pTop20, pBottom20) {
  const top = Number(pTop20)
  const bot = Number(pBottom20)
  if (!Number.isFinite(top) || !Number.isFinite(bot)) return null
  return roundPct(top - bot, 4)
}

/** Dominant Distractor Share = (Highest Wrong Option Count / Total Wrong) × 100 */
export function dominantDistractorShare(highestWrongOptionCount, totalWrong) {
  const tw = Number(totalWrong) || 0
  if (tw <= 0) return 0
  return roundPct(((Number(highestWrongOptionCount) || 0) / tw) * 100)
}

/** Time Ratio = Median Time / Expected Question Time */
export function timeRatio(medianTimeSec, expectedTimeSec) {
  const exp = Number(expectedTimeSec) || 0
  if (exp <= 0) return null
  const med = Number(medianTimeSec)
  if (!Number.isFinite(med) || med < 0) return null
  return roundPct(med / exp, 3)
}

/**
 * Hysteresis: enter at ≥ enterPct, exit only below exitPct.
 * @param {number} pct
 * @param {boolean} currentlyIn
 * @param {{ enterPct?: number, exitPct?: number }} [opts]
 */
export function applyHysteresis(pct, currentlyIn, opts = {}) {
  const enter = opts.enterPct ?? ENTER_THRESHOLD_PCT
  const exit = opts.exitPct ?? EXIT_THRESHOLD_PCT
  const p = Number(pct) || 0
  if (currentlyIn) return p >= exit
  return p >= enter
}

/**
 * Empirical difficulty band once exposures clear the floor.
 * Easy ≥65% solve; Medium 35–64%; Hard &lt;35% (or &lt;50% with high time ratio).
 * @param {number} solveRateP 0–1
 * @param {number | null} [ratio]
 * @returns {'Easy'|'Medium'|'Hard'|null}
 */
export function empiricalDifficultyBand(solveRateP, ratio = null) {
  const p = Number(solveRateP)
  if (!Number.isFinite(p)) return null
  const highTime = ratio != null && Number(ratio) >= 1.5
  if (p >= 0.65 && !highTime) return 'Easy'
  if (p < 0.35 || (p < 0.5 && highTime)) return 'Hard'
  if (p >= 0.35) return 'Medium'
  return 'Hard'
}

/**
 * @param {number[]} values
 * @returns {number | null}
 */
export function medianOf(values) {
  const nums = (values || []).map(Number).filter((n) => Number.isFinite(n) && n >= 0)
  if (!nums.length) return null
  nums.sort((a, b) => a - b)
  const mid = Math.floor(nums.length / 2)
  if (nums.length % 2) return nums[mid]
  return Math.round((nums[mid - 1] + nums[mid]) / 2)
}

/**
 * Classify skip timing for Tab B insight.
 * @param {number | null} medianSkipSec
 * @returns {'quick_skip'|'time_sink'|'normal'|null}
 */
export function classifySkipTiming(medianSkipSec) {
  if (medianSkipSec == null || !Number.isFinite(medianSkipSec)) return null
  if (medianSkipSec < QUICK_SKIP_SEC) return 'quick_skip'
  if (medianSkipSec >= TIME_SINK_SKIP_SEC) return 'time_sink'
  return 'normal'
}

/**
 * Auto-triage badge after sample floor (PDF §11).
 * @param {{
 *   mistakePct: number
 *   skipPct: number
 *   discrimination: number | null
 *   top20AccuracyPct: number | null
 *   dominantDistractorPct: number | null
 *   top20SplitTwoOptions?: boolean
 *   medianSkipSec?: number | null
 *   top20SkipPct?: number | null
 *   timeRatio?: number | null
 *   authorDifficulty?: string | null
 * }} row
 * @returns {{ badge: TriageBadgeId, priority: 'P0'|'P1'|'P2'|null, label: string, action: string }}
 */
export function assignTriageBadge(row) {
  const mistake = Number(row.mistakePct) || 0
  const skip = Number(row.skipPct) || 0
  const d = row.discrimination
  const topAcc = row.top20AccuracyPct
  const dom = row.dominantDistractorPct
  const ratio = row.timeRatio
  const medSkip = row.medianSkipSec
  const topSkip = row.top20SkipPct
  const author = String(row.authorDifficulty || '')
    .trim()
    .toLowerCase()

  if (
    mistake >= 50 &&
    ((d != null && d < 0) || (topAcc != null && topAcc < 35)) &&
    dom != null &&
    dom >= 60
  ) {
    return {
      badge: 'suspect_key',
      priority: 'P0',
      label: 'Suspect key',
      action: 'Send to admin QA — pause auto-include in new tests.',
    }
  }

  if (
    mistake >= 50 &&
    d != null &&
    d >= -0.1 &&
    d <= 0.15 &&
    row.top20SplitTwoOptions
  ) {
    return {
      badge: 'check_ambiguity',
      priority: 'P1',
      label: 'Check ambiguity',
      action: 'Review wording, units, and boundary conditions.',
    }
  }

  if (
    skip >= 50 &&
    medSkip != null &&
    medSkip < QUICK_SKIP_SEC &&
    topSkip != null &&
    topSkip >= 40
  ) {
    return {
      badge: 'render_syllabus',
      priority: 'P1',
      label: 'Render / syllabus check',
      action: 'Preview the student view and check syllabus mapping.',
    }
  }

  if (
    skip >= 50 &&
    ((ratio != null && ratio >= 1.75) || (medSkip != null && medSkip >= TIME_SINK_SKIP_SEC))
  ) {
    return {
      badge: 'time_sink',
      priority: 'P2',
      label: 'Time-sink alert',
      action: 'Tag as a time trap; review toughness.',
    }
  }

  if (
    (mistake >= 50 || skip >= 50) &&
    d != null &&
    d >= 0.3 &&
    (author === 'easy' || author === 'e')
  ) {
    return {
      badge: 'toughness_mismatch',
      priority: 'P2',
      label: 'Toughness mismatch',
      action: 'Keep content; review Author Difficulty tag.',
    }
  }

  return { badge: null, priority: null, label: '', action: '' }
}

/**
 * Easy-friendly crowd-benchmark line for one student’s outcome vs peers.
 * @param {{
 *   grade?: string
 *   peerCorrectPct?: number
 *   peerStrugglePct?: number
 *   peerStudentCount?: number
 * }} opts
 */
export function buildCrowdBenchmarkHint(opts = {}) {
  const count = Number(opts.peerStudentCount) || 0
  if (count < 3) {
    return {
      tone: 'neutral',
      title: 'Peer stats warming up',
      message: 'When more classmates finish this paper, you will see how your answer compares.',
    }
  }
  const grade = String(opts.grade || '')
  const correctPct = Number(opts.peerCorrectPct) || 0
  const strugglePct = Number(opts.peerStrugglePct) || 0

  if (grade === 'wrong' || grade === 'partial') {
    if (correctPct >= 65) {
      return {
        tone: 'urgent',
        title: 'Rank-bleeding gap',
        message: `You missed a question that about ${Math.round(correctPct)}% of peers solved — fix this soon.`,
      }
    }
    if (strugglePct >= 55) {
      return {
        tone: 'ok',
        title: 'Commonly tough',
        message: `Many peers also struggled here (~${Math.round(strugglePct)}% wrong or skipped). Still worth a redo.`,
      }
    }
    return {
      tone: 'warn',
      title: 'Worth a rewrite',
      message: `About ${Math.round(correctPct)}% of peers got this right. Review the trap, then retry.`,
    }
  }

  if (grade === 'unattempted') {
    if (strugglePct >= 55) {
      return {
        tone: 'ok',
        title: 'Smart skip signal',
        message: `Skipping here looks sensible — about ${Math.round(strugglePct)}% of peers also missed or skipped.`,
      }
    }
    if (correctPct >= 60) {
      return {
        tone: 'urgent',
        title: 'Missed recoverable marks',
        message: `Peers solved this ~${Math.round(correctPct)}% of the time. Next mock, attempt similar sitters sooner.`,
      }
    }
    return {
      tone: 'warn',
      title: 'Skipped',
      message: 'Check whether this was time pressure or a real knowledge gap.',
    }
  }

  if (grade === 'correct' && strugglePct >= 55) {
    return {
      tone: 'ok',
      title: 'Strong relative pick',
      message: `You solved a question most peers struggled with (~${Math.round(strugglePct)}% wrong/skip). Keep that edge.`,
    }
  }

  return {
    tone: 'neutral',
    title: 'On track',
    message: `Peers: ~${Math.round(correctPct)}% correct on this question.`,
  }
}

/**
 * Extract per-question outcomes from an attempt row (handles snapshot nesting).
 * @param {object} attempt
 * @returns {object[]}
 */
export function perQuestionFromAttempt(attempt) {
  return (
    attempt?.resultSnapshot?.result?.perQuestion ??
    attempt?.result?.perQuestion ??
    attempt?.perQuestion ??
    []
  )
}

/**
 * @param {object} attempt
 * @returns {Record<string, number>}
 */
function questionTimesFromAttempt(attempt) {
  return (
    attempt?.resultSnapshot?.questionTimes ??
    attempt?.questionTimes ??
    {}
  )
}

/**
 * Build per-question rollups + psychometric extras from cohort attempts.
 *
 * @param {object[]} attempts
 * @param {{
 *   testId?: string
 *   sampleFloor?: number
 *   expectedSecondsPerQ?: number
 *   previousFlags?: Record<string, { inTabA?: boolean, inTabB?: boolean, inTabCombined?: boolean }>
 * }} [opts]
 */
export function buildQuestionRollupsFromAttempts(attempts = [], opts = {}) {
  let rows = Array.isArray(attempts) ? attempts : []
  if (opts.testId) {
    rows = rows.filter((a) => a.testId === opts.testId)
  }
  const sampleFloor = opts.sampleFloor ?? DEFAULT_SAMPLE_FLOOR
  const expectedSec = opts.expectedSecondsPerQ ?? 120
  const prev = opts.previousFlags ?? {}

  /** @type {Map<string, {
   *   questionId: string
   *   subject: string
   *   chapter: string
   *   index: number | null
   *   authorDifficulty: string | null
   *   correct: number
   *   wrong: number
   *   skipped: number
   *   totalServed: number
   *   times: number[]
   *   skipTimes: number[]
   *   optionWrong: Record<string, number>
   *   outcomesByStudent: { score: number, grade: string }[]
   * }>} */
  const map = new Map()

  const scored = rows
    .map((a) => ({
      attempt: a,
      score: Number(a.score ?? a.resultSnapshot?.result?.score ?? 0) || 0,
    }))
    .sort((a, b) => b.score - a.score)

  for (const { attempt, score } of scored) {
    const perQ = perQuestionFromAttempt(attempt)
    const qTimes = questionTimesFromAttempt(attempt)
    for (const pq of perQ) {
      const id = pq?.questionId
      if (!id) continue
      if (!map.has(id)) {
        map.set(id, {
          questionId: id,
          subject: pq.subject || '',
          chapter: pq.chapter || '',
          index: pq.index != null ? Number(pq.index) : null,
          authorDifficulty: pq.difficulty || pq.authorDifficulty || null,
          correct: 0,
          wrong: 0,
          skipped: 0,
          totalServed: 0,
          times: [],
          skipTimes: [],
          optionWrong: {},
          outcomesByStudent: [],
        })
      }
      const row = map.get(id)
      row.totalServed += 1
      if (row.index == null && pq.index != null) row.index = Number(pq.index)
      if (!row.subject && pq.subject) row.subject = pq.subject
      if (!row.chapter && pq.chapter) row.chapter = pq.chapter
      if (!row.authorDifficulty && (pq.difficulty || pq.authorDifficulty)) {
        row.authorDifficulty = pq.difficulty || pq.authorDifficulty
      }

      const grade = String(pq.grade || '')
      if (grade === 'correct') row.correct += 1
      else if (grade === 'unattempted') row.skipped += 1
      else row.wrong += 1

      const sec = Number(qTimes[id] ?? pq.timeSpentSeconds ?? 0)
      if (sec > 0) {
        row.times.push(sec)
        if (grade === 'unattempted') row.skipTimes.push(sec)
      }

      if (grade !== 'correct' && grade !== 'unattempted') {
        const opt = pq.userAnswerLabel || pq.selectedOption || pq.userAnswer
        if (opt != null && String(opt).trim()) {
          const key = String(opt).trim()
          row.optionWrong[key] = (row.optionWrong[key] || 0) + 1
        }
      }

      row.outcomesByStudent.push({ score, grade })
    }
  }

  const nStudents = scored.length
  const topN = Math.max(1, Math.ceil(nStudents * 0.2))
  const bottomStart = Math.max(0, nStudents - topN)

  /** @type {object[]} */
  const rollups = []

  for (const raw of map.values()) {
    const total = raw.totalServed
    const mistakePct = liveMistakePct(raw.wrong, total)
    const skipPct = liveSkipPct(raw.skipped, total)
    const strugglePct = combinedStrugglePct(raw.wrong, raw.skipped, total)
    const attemptErrorPct = attemptAdjustedErrorPct(raw.wrong, raw.correct)
    const p = solveRate(raw.correct, total)
    const medianTime = medianOf(raw.times)
    const medianSkip = medianOf(raw.skipTimes)
    const ratio = timeRatio(medianTime, expectedSec)
    const empirical =
      total >= EMPIRICAL_MIN_EXPOSURES ? empiricalDifficultyBand(p, ratio) : null

    const topSlice = raw.outcomesByStudent.slice(0, topN)
    const botSlice = raw.outcomesByStudent.slice(bottomStart)
    const topSolve =
      topSlice.length > 0
        ? topSlice.filter((o) => o.grade === 'correct').length / topSlice.length
        : null
    const botSolve =
      botSlice.length > 0
        ? botSlice.filter((o) => o.grade === 'correct').length / botSlice.length
        : null
    const d =
      topSolve != null && botSolve != null ? discriminationIndex(topSolve, botSolve) : null
    const top20AccuracyPct = topSolve != null ? roundPct(topSolve * 100) : null
    const top20SkipPct =
      topSlice.length > 0
        ? roundPct(
            (topSlice.filter((o) => o.grade === 'unattempted').length / topSlice.length) * 100,
          )
        : null

    const wrongOpts = Object.entries(raw.optionWrong).sort((a, b) => b[1] - a[1])
    const topWrongCount = wrongOpts[0]?.[1] ?? 0
    const domShare = dominantDistractorShare(topWrongCount, raw.wrong)
    const secondShare =
      wrongOpts[1] && raw.wrong > 0
        ? roundPct((wrongOpts[1][1] / raw.wrong) * 100)
        : 0
    const top20SplitTwoOptions = domShare >= 30 && secondShare >= 30

    const flagsPrev = prev[raw.questionId] || {}
    const meetsFloor = total >= sampleFloor
    const inTabA = meetsFloor
      ? applyHysteresis(mistakePct, !!flagsPrev.inTabA)
      : false
    const inTabB = meetsFloor ? applyHysteresis(skipPct, !!flagsPrev.inTabB) : false
    const inTabCombined = meetsFloor
      ? applyHysteresis(strugglePct, !!flagsPrev.inTabCombined)
      : false

    const triage = meetsFloor
      ? assignTriageBadge({
          mistakePct,
          skipPct,
          discrimination: d,
          top20AccuracyPct,
          dominantDistractorPct: wrongOpts.length ? domShare : null,
          top20SplitTwoOptions,
          medianSkipSec: medianSkip,
          top20SkipPct,
          timeRatio: ratio,
          authorDifficulty: raw.authorDifficulty,
        })
      : { badge: null, priority: null, label: '', action: '' }

    rollups.push({
      questionId: raw.questionId,
      subject: raw.subject,
      chapter: raw.chapter,
      index: raw.index,
      authorDifficulty: raw.authorDifficulty,
      correct: raw.correct,
      wrong: raw.wrong,
      skipped: raw.skipped,
      totalServed: total,
      mistakePct,
      skipPct,
      strugglePct,
      attemptErrorPct,
      solveRate: p,
      solvePct: roundPct(p * 100),
      discrimination: d,
      top20AccuracyPct,
      top20SkipPct,
      medianTimeSec: medianTime,
      medianSkipSec: medianSkip,
      skipTiming: classifySkipTiming(medianSkip),
      timeRatio: ratio,
      empiricalDifficulty: empirical,
      dominantDistractorPct: wrongOpts.length ? domShare : null,
      dominantDistractor: wrongOpts[0]?.[0] ?? null,
      optionWrong: { ...raw.optionWrong },
      meetsSampleFloor: meetsFloor,
      inTabA,
      inTabB,
      inTabCombined,
      triage,
      studentCount: nStudents,
    })
  }

  rollups.sort((a, b) => {
    const ia = a.index ?? 9999
    const ib = b.index ?? 9999
    if (ia !== ib) return ia - ib
    return String(a.questionId).localeCompare(String(b.questionId))
  })

  return {
    ready: nStudents > 0 && rollups.length > 0,
    studentCount: nStudents,
    attemptCount: rows.length,
    sampleFloor,
    questions: rollups,
  }
}

/**
 * Split rollups into diagnostic tabs (after sample floor + hysteresis).
 * @param {ReturnType<typeof buildQuestionRollupsFromAttempts>} pack
 */
export function routeDiagnosticTabs(pack) {
  const questions = pack?.questions ?? []
  const waitingSample = questions.filter((q) => !q.meetsSampleFloor)
  const tabA = questions
    .filter((q) => q.inTabA)
    .sort((a, b) => b.mistakePct - a.mistakePct || b.attemptErrorPct - a.attemptErrorPct)
  const tabB = questions
    .filter((q) => q.inTabB)
    .sort((a, b) => b.skipPct - a.skipPct)
  const tabCombined = questions
    .filter((q) => q.inTabCombined && !q.inTabA && !q.inTabB)
    .sort((a, b) => b.strugglePct - a.strugglePct)

  const suspect = questions
    .filter((q) => q.triage?.badge === 'suspect_key')
    .sort((a, b) => b.mistakePct - a.mistakePct)

  return {
    ready: !!pack?.ready,
    studentCount: pack?.studentCount ?? 0,
    sampleFloor: pack?.sampleFloor ?? DEFAULT_SAMPLE_FLOOR,
    tabA,
    tabB,
    tabCombined,
    waitingSample,
    suspect,
    summary: {
      highMistake: tabA.length,
      highSkip: tabB.length,
      combinedOnly: tabCombined.length,
      belowFloor: waitingSample.length,
      suspectKey: suspect.length,
    },
  }
}

/**
 * Student Trap Fall Rate + Time-Sink Rate vs cohort Tab A / Tab B sets.
 *
 * @param {{
 *   perQuestion?: object[]
 *   questionTimes?: Record<string, number>
 *   tabAIds?: Set<string> | string[]
 *   tabBIds?: Set<string> | string[]
 * }} opts
 */
export function buildStudentTrapMetrics(opts = {}) {
  const perQ = opts.perQuestion || []
  const times = opts.questionTimes || {}
  const tabA = opts.tabAIds instanceof Set ? opts.tabAIds : new Set(opts.tabAIds || [])
  const tabB = opts.tabBIds instanceof Set ? opts.tabBIds : new Set(opts.tabBIds || [])

  let tabASeen = 0
  let tabAWrongAttempt = 0
  let tabBSeen = 0
  let tabBTimeSinkSkip = 0

  for (const pq of perQ) {
    const id = pq.questionId
    if (!id) continue
    const sec = Number(times[id] ?? pq.timeSpentSeconds ?? 0)
    const grade = String(pq.grade || '')

    if (tabA.has(id)) {
      tabASeen += 1
      if (grade === 'wrong' || grade === 'partial') tabAWrongAttempt += 1
    }
    if (tabB.has(id)) {
      tabBSeen += 1
      if (grade === 'unattempted' && sec >= TIME_SINK_SKIP_SEC) tabBTimeSinkSkip += 1
    }
  }

  const trapFallRate = tabASeen > 0 ? roundPct((tabAWrongAttempt / tabASeen) * 100) : null
  const timeSinkRate = tabBSeen > 0 ? roundPct((tabBTimeSinkSkip / tabBSeen) * 100) : null

  let takeaway =
    'Finish this paper with more classmates so high-mistake and high-skip lists can coach your next mock.'
  if (trapFallRate != null && trapFallRate >= 40) {
    takeaway = `Trap fall ${trapFallRate}% — you attempted high-mistake questions and still lost marks. Next mock: skip faster when unsure.`
  } else if (timeSinkRate != null && timeSinkRate >= 30) {
    takeaway = `Time-sink rate ${timeSinkRate}% — you burned 90s+ on high-skip items before leaving. Cap first pass at ~60s.`
  } else if (trapFallRate != null && trapFallRate < 25 && tabASeen >= 2) {
    takeaway = `Trap fall only ${trapFallRate}% on high-mistake items — solid negative-marking discipline.`
  } else if (trapFallRate != null || timeSinkRate != null) {
    takeaway = 'Use Trap fall and Time-sink rates to train selection skill, not just syllabus coverage.'
  }

  return {
    ready: tabASeen > 0 || tabBSeen > 0,
    tabASeen,
    tabAWrongAttempt,
    trapFallRate,
    tabBSeen,
    tabBTimeSinkSkip,
    timeSinkRate,
    takeaway,
  }
}

/**
 * Personal Fix Queue — student’s high Trap-Fall / Combined Struggle items to redo.
 *
 * @param {{
 *   perQuestion?: object[]
 *   tabs?: ReturnType<typeof routeDiagnosticTabs>
 *   limit?: number
 * }} opts
 */
export function buildPersonalFixQueue(opts = {}) {
  const perQ = opts.perQuestion || []
  const tabs = opts.tabs
  const limit = Math.max(1, Number(opts.limit) || 12)
  if (!tabs?.ready || !perQ.length) {
    return { ready: false, items: [], takeaway: 'Need classmates on this paper before a Fix Queue appears.' }
  }

  const tabA = new Map((tabs.tabA || []).map((q) => [q.questionId, q]))
  const combined = new Map((tabs.tabCombined || []).map((q) => [q.questionId, q]))
  /** @type {object[]} */
  const items = []

  for (const pq of perQ) {
    const id = pq?.questionId
    if (!id) continue
    const grade = String(pq.grade || '')
    const struggled = grade === 'wrong' || grade === 'partial' || grade === 'unattempted'
    if (!struggled) continue

    const inA = tabA.get(id)
    const inC = combined.get(id)
    if (!inA && !inC) continue

    const reason = inA ? 'trap_fall' : 'combined_struggle'
    const rollup = inA || inC
    items.push({
      questionId: id,
      index: pq.index ?? rollup.index ?? null,
      subject: pq.subject || rollup.subject || '',
      chapter: pq.chapter || rollup.chapter || '',
      grade,
      reason,
      reasonLabel: reason === 'trap_fall' ? 'High-mistake trap' : 'Combined struggle',
      peerMistakePct: rollup.mistakePct,
      peerSkipPct: rollup.skipPct,
      peerStrugglePct: rollup.strugglePct,
      priority: reason === 'trap_fall' ? 0 : 1,
    })
  }

  items.sort(
    (a, b) =>
      a.priority - b.priority ||
      (b.peerStrugglePct || 0) - (a.peerStrugglePct || 0) ||
      (a.index ?? 9999) - (b.index ?? 9999),
  )
  const sliced = items.slice(0, limit)
  let takeaway = 'Nice — you avoided the batch’s highest-cost traps on this attempt.'
  if (sliced.length) {
    takeaway = `${sliced.length} fix-first item${sliced.length === 1 ? '' : 's'} — open Question-wise or retry similar practice.`
  }

  return { ready: true, items: sliced, takeaway }
}

/**
 * Distractor / option breakdown from wrong-option counts.
 * @param {Record<string, number> | null | undefined} optionWrong
 * @param {number} totalWrong
 */
export function buildDistractorBreakdown(optionWrong, totalWrong) {
  const entries = Object.entries(optionWrong || {}).sort((a, b) => b[1] - a[1])
  if (!entries.length || !(Number(totalWrong) > 0)) {
    return { ready: false, rows: [], dominant: null, dominantPct: null }
  }
  const rows = entries.map(([label, count]) => ({
    label: String(label),
    count: Number(count) || 0,
    pct: roundPct(((Number(count) || 0) / Number(totalWrong)) * 100),
  }))
  return {
    ready: true,
    rows,
    dominant: rows[0]?.label ?? null,
    dominantPct: rows[0]?.pct ?? null,
  }
}

/**
 * Re-test delta — same question IDs across a student’s prior attempts on this paper.
 *
 * @param {{
 *   currentPerQuestion?: object[]
 *   priorAttempts?: object[]
 * }} opts
 */
export function buildRetestDelta(opts = {}) {
  const current = opts.currentPerQuestion || []
  const priors = Array.isArray(opts.priorAttempts) ? opts.priorAttempts : []
  if (!current.length || !priors.length) {
    return {
      ready: false,
      comparable: 0,
      improved: 0,
      regressed: 0,
      held: 0,
      improvementPct: null,
      items: [],
      takeaway: 'Retake this paper later to see which questions you fixed.',
    }
  }

  /** @type {Map<string, string>} last prior grade per Q */
  const priorGrade = new Map()
  const sorted = [...priors].sort(
    (a, b) => (Number(a.submittedAt) || 0) - (Number(b.submittedAt) || 0),
  )
  for (const att of sorted) {
    for (const pq of perQuestionFromAttempt(att)) {
      if (pq?.questionId) priorGrade.set(pq.questionId, String(pq.grade || ''))
    }
  }

  const wasMiss = (g) => g === 'wrong' || g === 'partial' || g === 'unattempted'
  /** @type {object[]} */
  const items = []
  let improved = 0
  let regressed = 0
  let held = 0

  for (const pq of current) {
    const id = pq?.questionId
    if (!id || !priorGrade.has(id)) continue
    const prev = priorGrade.get(id)
    const now = String(pq.grade || '')
    let change = 'held'
    if (wasMiss(prev) && now === 'correct') {
      change = 'improved'
      improved += 1
    } else if (prev === 'correct' && wasMiss(now)) {
      change = 'regressed'
      regressed += 1
    } else if (wasMiss(prev) && wasMiss(now)) {
      change = 'still_miss'
      held += 1
    } else {
      held += 1
    }
    items.push({
      questionId: id,
      index: pq.index ?? null,
      subject: pq.subject || '',
      chapter: pq.chapter || '',
      previousGrade: prev,
      currentGrade: now,
      change,
    })
  }

  const comparable = items.length
  if (!comparable) {
    return {
      ready: false,
      comparable: 0,
      improved: 0,
      regressed: 0,
      held: 0,
      improvementPct: null,
      items: [],
      takeaway: 'No overlapping question IDs with your earlier attempt yet.',
    }
  }

  const improvementPct = roundPct((improved / comparable) * 100)
  let takeaway = `Re-test delta: ${improvementPct}% of overlapping questions improved (${improved}/${comparable}).`
  if (improved === 0 && regressed === 0) {
    takeaway = 'Same outcomes on overlapping questions — pick Fix Queue items for a focused redo.'
  } else if (regressed > improved) {
    takeaway = `Watch slippage: ${regressed} regressed vs ${improved} improved on re-test.`
  }

  return {
    ready: true,
    comparable,
    improved,
    regressed,
    held,
    improvementPct,
    items: items.filter((x) => x.change === 'improved' || x.change === 'regressed').slice(0, 12),
    takeaway,
  }
}

/**
 * Lightweight paper-leak / coaching anomaly flags from rollup peer stats (no ML).
 * Hard-tagged items that the whole class solves unusually fast & accurately.
 *
 * @param {object[]} questions rollup rows
 * @param {{ sampleFloor?: number }} [opts]
 */
export function detectAnomalyFlags(questions = [], opts = {}) {
  const floor = opts.sampleFloor ?? DEFAULT_SAMPLE_FLOOR
  /** @type {object[]} */
  const flags = []

  for (const q of questions) {
    if (!q?.meetsSampleFloor && (q?.totalServed || 0) < floor) continue
    const author = String(q.authorDifficulty || '')
      .trim()
      .toLowerCase()
    const isHard = author === 'hard' || author === 'h'
    const solvePct = Number(q.solvePct) || 0
    const ratio = q.timeRatio
    const med = q.medianTimeSec
    const topAcc = q.top20AccuracyPct
    const botAcc =
      q.discrimination != null && topAcc != null
        ? roundPct(topAcc - (Number(q.discrimination) || 0) * 100)
        : null

    if (
      isHard &&
      solvePct >= 85 &&
      ((ratio != null && ratio < 0.45) || (med != null && med > 0 && med < 35))
    ) {
      flags.push({
        questionId: q.questionId,
        index: q.index,
        subject: q.subject,
        chapter: q.chapter,
        code: 'fast_hard_solve',
        label: 'Fast hard-item anomaly',
        message:
          'Class solved a Hard-tagged item unusually fast and accurately — check prior exposure or paper sharing.',
        solvePct,
        medianTimeSec: med,
        timeRatio: ratio,
      })
      continue
    }

    if (
      isHard &&
      solvePct >= 80 &&
      topAcc != null &&
      topAcc >= 90 &&
      botAcc != null &&
      botAcc >= 70
    ) {
      flags.push({
        questionId: q.questionId,
        index: q.index,
        subject: q.subject,
        chapter: q.chapter,
        code: 'uniform_hard_solve',
        label: 'Uniform hard-item spike',
        message:
          'Top and bottom bands both crush a Hard item — possible coaching leak or over-shared solution.',
        solvePct,
        top20AccuracyPct: topAcc,
        bottomBandAccuracyPct: botAcc,
      })
    }
  }

  return {
    ready: flags.length > 0,
    flags,
    takeaway: flags.length
      ? `${flags.length} anomaly flag${flags.length === 1 ? '' : 's'} — review before trusting the Hard tags.`
      : 'No fast/uniform hard-item anomalies from current peer stats.',
  }
}

/**
 * Compact rollup point for teacher trend snapshots.
 * @param {ReturnType<typeof routeDiagnosticTabs>} tabs
 * @param {{ testId?: string, testTitle?: string }} [meta]
 */
export function summarizeDiagnosticTrendPoint(tabs, meta = {}) {
  return {
    at: Date.now(),
    testId: meta.testId || '',
    testTitle: meta.testTitle || '',
    studentCount: tabs?.studentCount ?? 0,
    highMistake: tabs?.summary?.highMistake ?? 0,
    highSkip: tabs?.summary?.highSkip ?? 0,
    combinedOnly: tabs?.summary?.combinedOnly ?? 0,
    suspectKey: tabs?.summary?.suspectKey ?? 0,
    belowFloor: tabs?.summary?.belowFloor ?? 0,
  }
}

/**
 * Smart paper balancing (local MVP) — suggest drop/swap/keep for high-struggle items.
 * @param {ReturnType<typeof routeDiagnosticTabs>} tabs
 * @param {{ maxSuggestions?: number }} [opts]
 */
export function suggestSmartPaperBalance(tabs, opts = {}) {
  const max = Math.max(3, Number(opts.maxSuggestions) || 8)
  if (!tabs?.ready) {
    return {
      ready: false,
      suggestions: [],
      takeaway: 'Need a class cohort before paper-balance tips appear.',
    }
  }

  /** @type {Map<string, object>} */
  const byId = new Map()
  const bump = (q, action, reason, priority) => {
    if (!q?.questionId) return
    const prev = byId.get(q.questionId)
    if (prev && prev.priority <= priority) return
    byId.set(q.questionId, {
      questionId: q.questionId,
      index: q.index,
      subject: q.subject,
      chapter: q.chapter,
      action,
      reason,
      priority,
      mistakePct: q.mistakePct,
      skipPct: q.skipPct,
      strugglePct: q.strugglePct,
      triageBadge: q.triageBadge,
    })
  }

  for (const q of tabs.suspect || []) {
    bump(
      q,
      'hold_or_fix_key',
      'Suspect Key — verify the answer before the next print run.',
      1,
    )
  }
  for (const q of tabs.tabCombined || []) {
    bump(
      q,
      'swap',
      'Combined struggle — swap for a same-topic item with cleaner history.',
      2,
    )
  }
  for (const q of tabs.tabA || []) {
    bump(
      q,
      q.triageBadge === 'time_sink' ? 'shorten_or_move' : 'review_or_swap',
      'High mistake — keep only if it matches the blueprint; else swap.',
      3,
    )
  }
  for (const q of tabs.tabB || []) {
    bump(
      q,
      'clarify_or_drop',
      'High skip — clarify wording/time or drop if it is not a must-test skill.',
      4,
    )
  }

  const suggestions = [...byId.values()]
    .sort((a, b) => a.priority - b.priority || (a.index ?? 0) - (b.index ?? 0))
    .slice(0, max)

  const dropLike = suggestions.filter((s) =>
    ['swap', 'clarify_or_drop', 'hold_or_fix_key'].includes(s.action),
  ).length

  return {
    ready: suggestions.length > 0,
    suggestions,
    takeaway: suggestions.length
      ? `${suggestions.length} balance tip${suggestions.length === 1 ? '' : 's'} · ${dropLike} need a closer look before the next paper.`
      : 'Paper looks balanced on current Tab A/B/Combined flags.',
  }
}

/**
 * Lightweight school / B2B ROI-style summary from diagnostics + verification (local only).
 * @param {ReturnType<typeof routeDiagnosticTabs>} tabs
 * @param {Record<string, { status?: string }>} [verificationByQuestion]
 */
export function buildSchoolDiagnosticRoiSummary(tabs, verificationByQuestion = {}) {
  if (!tabs?.ready) {
    return {
      ready: false,
      takeaway: 'Load a class batch to see the school diagnostic summary.',
    }
  }
  const flagged =
    (tabs.summary?.highMistake || 0) +
    (tabs.summary?.highSkip || 0) +
    (tabs.summary?.combinedOnly || 0) +
    (tabs.summary?.suspectKey || 0)
  const verified = Object.values(verificationByQuestion || {}).filter(
    (v) => v?.status === 'verified' || v?.status === 'wrong_key',
  ).length
  const wrongKey = Object.values(verificationByQuestion || {}).filter(
    (v) => v?.status === 'wrong_key',
  ).length
  const students = tabs.studentCount || 0
  // Rough “marks rescued” heuristic: ~2 marks × students × verified/fixed items (MVP story only).
  const estimatedMarksTouched = students * Math.max(flagged, 1) * 0.15

  return {
    ready: true,
    students,
    questionsFlagged: flagged,
    highMistake: tabs.summary?.highMistake ?? 0,
    highSkip: tabs.summary?.highSkip ?? 0,
    suspectKey: tabs.summary?.suspectKey ?? 0,
    verifiedReviewed: verified,
    wrongKeysCaught: wrongKey,
    estimatedMarksTouched: roundPct(estimatedMarksTouched, 0),
    takeaway: wrongKey
      ? `Caught ${wrongKey} wrong-key item${wrongKey === 1 ? '' : 's'} before the next print — that is real QA ROI.`
      : flagged
        ? `${flagged} struggle flag${flagged === 1 ? '' : 's'} across ${students} student${students === 1 ? '' : 's'} — use Fix Queue + paper-balance tips next.`
        : 'No struggle flags yet — keep collecting attempts.',
  }
}

/**
 * One-shot builder: rollups → tabs (+ optional student trap pack).
 * @param {object[]} attempts
 * @param {{
 *   testId?: string
 *   sampleFloor?: number
 *   expectedSecondsPerQ?: number
 *   previousFlags?: Record<string, object>
 *   studentPerQuestion?: object[]
 *   studentQuestionTimes?: Record<string, number>
 * }} [opts]
 */
export function buildDiagnosticAnalyticsPack(attempts = [], opts = {}) {
  const rollups = buildQuestionRollupsFromAttempts(attempts, opts)
  const tabs = routeDiagnosticTabs(rollups)
  const student =
    opts.studentPerQuestion != null
      ? buildStudentTrapMetrics({
          perQuestion: opts.studentPerQuestion,
          questionTimes: opts.studentQuestionTimes,
          tabAIds: tabs.tabA.map((q) => q.questionId),
          tabBIds: tabs.tabB.map((q) => q.questionId),
        })
      : null
  const anomalies = detectAnomalyFlags(rollups.questions, { sampleFloor: opts.sampleFloor })
  const paperBalance = suggestSmartPaperBalance(tabs)
  const roi = buildSchoolDiagnosticRoiSummary(tabs)

  return { rollups, tabs, student, anomalies, paperBalance, roi }
}
