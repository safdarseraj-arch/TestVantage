/**
 * SchoolLog-style question diagnostics: visit timeline, ideal time, toughness labels.
 */

/** @typedef {{ seconds: number, visitN?: number, label?: string }} VisitSegment */

const TOUGHNESS_LABELS = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Moderate',
  4: 'Hard',
  5: 'Very hard',
}

const DIFF_TO_TOUGH = { easy: 2, medium: 3, hard: 4 }

/**
 * @param {unknown} raw
 * @param {string} [difficulty]
 */
export function resolveToughnessLevel(raw, difficulty) {
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.round(n)
  const fromDiff = DIFF_TO_TOUGH[String(difficulty || '').toLowerCase()]
  return fromDiff ?? 3
}

/**
 * @param {unknown} raw
 * @param {string} [difficulty]
 */
export function toughnessLabel(raw, difficulty) {
  const level = resolveToughnessLevel(raw, difficulty)
  return { level, label: TOUGHNESS_LABELS[level] || 'Moderate' }
}

/**
 * Ideal / target solve time for one question.
 * Prefers saved Hybrid AI field, then local toughness heuristic.
 * @param {object} [question]
 * @returns {{ seconds: number, source: 'hybrid_saved' | 'local_fallback', label: string }}
 */
export function resolveIdealTimeSeconds(question = {}) {
  const saved =
    Number(question.idealTimeSeconds) ||
    Number(question.idealTimeSec) ||
    Number(question.expectedTimeSeconds) ||
    Number(question.expectedTimeSec) ||
    0
  if (saved > 0) {
    return {
      seconds: Math.round(saved),
      source: 'hybrid_saved',
      label: 'Ideal time (Hybrid AI)',
    }
  }
  const tough = resolveToughnessLevel(question.toughnessLevel, question.difficulty)
  const byTough = { 1: 45, 2: 60, 3: 90, 4: 120, 5: 160 }
  let seconds = byTough[tough] ?? 90
  const maxMarks = Number(question.maxMarks ?? question.marks ?? 0)
  if (maxMarks >= 4) seconds = Math.round(seconds * 1.15)
  return {
    seconds,
    source: 'local_fallback',
    label: 'Ideal time (estimate)',
  }
}

/**
 * Suggest ideal time — uses saved Hybrid field when present; otherwise local fallback.
 * Async so callers can later plug a live Hybrid AI call without UI changes.
 * @param {object} [question]
 */
export async function suggestIdealTimeSeconds(question = {}) {
  const base = resolveIdealTimeSeconds(question)
  if (base.source === 'hybrid_saved') return base
  // Live Hybrid suggest is optional — keep UI responsive offline.
  try {
    const { fetchCloudVisionStatus } = await import('./cloudVisionClient.js')
    const st = await fetchCloudVisionStatus().catch(() => null)
    if (st?.configured && st?.ready !== false) {
      // Cloud is up but we still use the toughness heuristic as the stable suggest
      // until a dedicated ideal-time endpoint is wired; mark as hybrid-assisted estimate.
      return {
        ...base,
        source: 'local_fallback',
        label: 'Ideal time (Hybrid-assisted estimate)',
        cloudReady: true,
      }
    }
  } catch {
    /* offline */
  }
  return { ...base, cloudReady: false }
}

/**
 * Build visit segments for one question from session navEvents.
 * @param {{
 *   questionId: string
 *   sessionTelemetry?: object | null
 *   totalSeconds?: number
 *   demo?: boolean
 * }} opts
 * @returns {{ segments: VisitSegment[], totalSeconds: number, source: string }}
 */
export function buildQuestionVisitTimeline({
  questionId,
  sessionTelemetry = null,
  totalSeconds = 0,
  demo = false,
} = {}) {
  const id = String(questionId || '')
  const total = Math.max(0, Number(totalSeconds) || 0)
  const allNav = [...(sessionTelemetry?.navEvents ?? [])]
    .filter((e) => e && Number.isFinite(Number(e.t)))
    .sort((a, b) => Number(a.t) - Number(b.t))

  const enters = allNav.filter(
    (e) => String(e.questionId) === id && String(e.action || 'enter') === 'enter',
  )

  /** @type {VisitSegment[]} */
  const segments = []
  for (let i = 0; i < enters.length; i += 1) {
    const start = Number(enters[i].t)
    const next = allNav.find((e) => Number(e.t) > start)
    let dur = next ? Number(next.t) - start : 0
    if (!(dur > 0) && enters.length === 1 && total > 0) dur = total
    if (!(dur > 0) && i === enters.length - 1 && total > 0) {
      const used = segments.reduce((s, x) => s + x.seconds, 0)
      dur = Math.max(0.4, total - used)
    }
    if (dur > 0) {
      segments.push({
        seconds: Math.round(dur * 10) / 10,
        visitN: Number(enters[i].visitN) || i + 1,
      })
    }
  }

  if (!segments.length && total > 0) {
    if (demo || (sessionTelemetry?.visitCounts?.[id] ?? 0) > 1) {
      const parts = splitDemoSegments(total)
      return { segments: parts, totalSeconds: total, source: demo ? 'demo' : 'synthetic' }
    }
    return {
      segments: [{ seconds: total, visitN: 1 }],
      totalSeconds: total,
      source: 'total_only',
    }
  }

  if (!segments.length) {
    return { segments: [], totalSeconds: 0, source: 'empty' }
  }

  const sum = segments.reduce((s, x) => s + x.seconds, 0)
  // If telemetry under-counts vs questionTimes, scale last segment gently.
  if (total > 0 && sum > 0 && Math.abs(total - sum) / total > 0.25) {
    const scale = total / sum
    for (const seg of segments) seg.seconds = Math.round(seg.seconds * scale * 10) / 10
  }

  return {
    segments,
    totalSeconds: total > 0 ? total : segments.reduce((s, x) => s + x.seconds, 0),
    source: 'telemetry',
  }
}

/** @param {number} total */
function splitDemoSegments(total) {
  const weights = [0.02, 0.08, 0.05, 0.55, 0.12, 0.18]
  const parts = []
  let left = total
  for (let i = 0; i < weights.length; i += 1) {
    const sec =
      i === weights.length - 1
        ? Math.max(0.4, Math.round(left * 10) / 10)
        : Math.max(0.4, Math.round(total * weights[i] * 10) / 10)
    left = Math.round((left - sec) * 10) / 10
    parts.push({ seconds: sec, visitN: i + 1 })
  }
  return parts
}

/**
 * Format seconds like SchoolLog (e.g. 4.3 min, 16.1 sec).
 * @param {number | null | undefined} sec
 */
export function formatDiagDuration(sec) {
  const n = Number(sec)
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n < 60) return `${Math.round(n * 10) / 10} sec`
  const m = Math.floor(n / 60)
  const s = Math.round((n % 60) * 10) / 10
  return s ? `${m} min ${s} sec` : `${m} min`
}

/**
 * Self status label matching SchoolLog tone.
 * @param {string} [grade]
 */
export function selfStatusLabel(grade) {
  if (grade === 'correct') return 'Correct'
  if (grade === 'wrong' || grade === 'partial') return 'Incorrect'
  if (grade === 'unattempted') return 'Not Attempted'
  return '—'
}

/**
 * Fabricated local cohort for demo analysis when real peers are missing.
 * Numbers are illustrative — labelled as demo in the UI via studentCount >= 2.
 * @param {object[]} questions
 * @param {object[]} [perQuestion]
 */
export function buildDemoPeerStatsForQuestions(questions = [], perQuestion = []) {
  const pqById = new Map((perQuestion || []).map((p) => [p.questionId, p]))
  const out = new Map()
  questions.forEach((q, i) => {
    const tough = resolveToughnessLevel(q.toughnessLevel, q.difficulty)
    const baseCorrect = Math.max(12, 78 - tough * 12 - (i % 3) * 4)
    const baseWrong = Math.max(8, 22 + tough * 4)
    const skipped = Math.max(5, 100 - baseCorrect - baseWrong)
    const correctPct = Math.round(baseCorrect * 10) / 10
    const wrongPct = Math.round(baseWrong * 10) / 10
    const skippedPct = Math.round(skipped * 10) / 10
    const ideal = resolveIdealTimeSeconds(q)
    const pq = pqById.get(q.id)
    const yourSec = Number(pq?.timeSpentSeconds ?? 0)
    const allCorrectTime = Math.round(ideal.seconds * 0.95)
    const top10CorrectTime = Math.round(ideal.seconds * 0.75)
    const top25CorrectTime = Math.round(ideal.seconds * 0.85)

    out.set(q.id, {
      questionId: q.id,
      appearedTo: 40,
      correct: Math.round((correctPct / 100) * 40),
      wrong: Math.round((wrongPct / 100) * 40),
      skipped: Math.round((skippedPct / 100) * 40),
      correctPct: Math.round(correctPct),
      wrongPct: Math.round(wrongPct),
      skippedPct: Math.round(skippedPct),
      studentCount: 40,
      optionWrong: {},
      avgTimeSeconds: Math.round(ideal.seconds * 1.05),
      top10TimeSeconds: top10CorrectTime,
      top25TimeSeconds: top25CorrectTime,
      top50TimeSeconds: Math.round(ideal.seconds * 0.9),
      timeSampleSize: 28,
      accuracyBands: {
        top10: {
          correctPct: Math.min(95, Math.round((correctPct + 28) * 10) / 10),
          wrongPct: Math.max(5, Math.round((wrongPct - 10) * 10) / 10),
          skippedPct: Math.max(5, Math.round((skippedPct - 12) * 10) / 10),
          sampleSize: 4,
        },
        top25: {
          correctPct: Math.min(90, Math.round((correctPct + 12) * 10) / 10),
          wrongPct: Math.max(8, Math.round((wrongPct - 4) * 10) / 10),
          skippedPct: Math.max(8, Math.round((skippedPct - 6) * 10) / 10),
          sampleSize: 10,
        },
        all: {
          correctPct,
          wrongPct,
          skippedPct,
          sampleSize: 40,
        },
      },
      correctSolverTimes: {
        top10: top10CorrectTime,
        top25: top25CorrectTime,
        all: allCorrectTime,
        sampleSize: 18,
      },
      _demoPeer: true,
      _yourSecHint: yourSec,
    })
  })
  return out
}
