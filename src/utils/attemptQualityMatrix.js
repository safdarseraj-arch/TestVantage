/**
 * Behavioural attempt-quality analytics (4-quadrant matrix, potential score, What-If).
 * Uses real per-question grades + dwell times only — no invented marks.
 */

/**
 * Ideal seconds for a question: paper average when timed, else duration/n, else 90s.
 * @param {object[]} perQ
 * @param {Record<string, number>} questionTimes
 * @param {number} [paperDurationSec]
 */
export function estimateIdealSeconds(perQ = [], questionTimes = {}, paperDurationSec = 0) {
  const times = perQ
    .map((pq) => Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0))
    .filter((t) => t > 0)
  if (times.length >= 4) {
    const avg = times.reduce((s, t) => s + t, 0) / times.length
    return Math.max(45, Math.round(avg))
  }
  const n = Math.max(perQ.length, 1)
  if (paperDurationSec > 0) return Math.max(45, Math.round(paperDurationSec / n))
  return 90
}

/**
 * @typedef {'perfect' | 'overtimeCorrect' | 'wasted' | 'painful' | 'other'} QuadrantKey
 */

/**
 * Classify one question into the 4-quadrant attempt matrix (+ other).
 * @param {{ grade?: string, seconds?: number, maxMarks?: number }} row
 * @param {number} ideal
 */
export function classifyAttemptQuadrant(row, ideal) {
  const sec = Math.max(0, Number(row.seconds) || 0)
  const grade = String(row.grade || 'unattempted')
  const idealSec = Math.max(30, Number(ideal) || 90)
  const correct = grade === 'correct' || grade === 'partial'
  const wrong = grade === 'wrong'
  const skipped = grade === 'unattempted'

  if (correct && (sec === 0 || sec <= idealSec)) return 'perfect'
  if (correct && sec > idealSec) return 'overtimeCorrect'
  if ((wrong || skipped) && sec > 0 && sec < idealSec * 0.25) return 'wasted'
  if (wrong && sec > idealSec * 1.5) return 'painful'
  return 'other'
}

const QUADRANT_META = {
  perfect: {
    key: 'perfect',
    label: 'Perfect',
    hint: 'Correct within ideal time',
    color: '#0d9488',
  },
  overtimeCorrect: {
    key: 'overtimeCorrect',
    label: 'Overtime correct',
    hint: 'Right, but slower than ideal',
    color: '#d97706',
  },
  wasted: {
    key: 'wasted',
    label: 'Wasted glance',
    hint: 'Wrong/skipped with almost no time invested',
    color: '#94a3b8',
  },
  painful: {
    key: 'painful',
    label: 'Painful / confused',
    hint: 'Wrong after spending too long',
    color: '#e11d48',
  },
  other: {
    key: 'other',
    label: 'Other',
    hint: 'Normal wrong / skip with moderate time',
    color: '#64748b',
  },
}

/**
 * Build 4-quadrant counts + chart rows + plain-English takeaway.
 * @param {{
 *   result?: { perQuestion?: object[], score?: number, maxScore?: number, correct?: number, wrong?: number }
 *   questionTimes?: Record<string, number>
 *   paperDurationSec?: number
 *   questions?: { id: string, difficulty?: string }[]
 * }} opts
 */
export function buildAttemptQualityMatrix({
  result,
  questionTimes = {},
  paperDurationSec = 0,
  questions = [],
} = {}) {
  const perQ = result?.perQuestion ?? []
  if (!perQ.length) {
    return {
      idealSeconds: 90,
      counts: { perfect: 0, overtimeCorrect: 0, wasted: 0, painful: 0, other: 0 },
      chart: [],
      items: [],
      takeaway: null,
      potential: null,
    }
  }

  const ideal = estimateIdealSeconds(perQ, questionTimes, paperDurationSec)
  const diffMap = Object.fromEntries(
    (questions || []).map((q) => [q.id, String(q.difficulty || q.level || '').toLowerCase()]),
  )

  const counts = { perfect: 0, overtimeCorrect: 0, wasted: 0, painful: 0, other: 0 }
  /** @type {object[]} */
  const items = []

  for (const pq of perQ) {
    const seconds = Number(questionTimes[pq.questionId] ?? pq.timeSpentSeconds ?? 0)
    const key = classifyAttemptQuadrant(
      { grade: pq.grade, seconds, maxMarks: pq.maxMarks },
      ideal,
    )
    counts[key]++
    const diff = diffMap[pq.questionId] || ''
    const easyWrong =
      pq.grade === 'wrong' && (diff === 'easy' || diff === 'sitter' || diff === 'simple')
    items.push({
      index: pq.index,
      questionId: pq.questionId,
      chapter: pq.chapter,
      subject: pq.subject,
      grade: pq.grade,
      seconds,
      quadrant: key,
      maxMarks: pq.maxMarks ?? 0,
      marks: pq.marks ?? 0,
      easyWrong,
    })
  }

  let sillyLost = 0
  let sillyCount = 0
  for (const it of items) {
    if (!it.easyWrong) continue
    sillyCount++
    sillyLost += Math.max(0, (it.maxMarks || 0) - (it.marks || 0))
  }
  // If difficulty tags missing, treat quick wrongs as proxy avoidable mistakes.
  if (sillyCount === 0) {
    for (const it of items) {
      if (it.grade !== 'wrong') continue
      if (it.quadrant === 'wasted' || (it.seconds > 0 && it.seconds <= ideal * 0.6)) {
        sillyCount++
        sillyLost += Math.max(0, (it.maxMarks || 0) - (it.marks || 0))
      }
    }
  }

  const actual = Number(result?.score) || 0
  const potentialScore = actual + sillyLost
  const maxScore = Number(result?.maxScore) || 0

  const chart = ['perfect', 'overtimeCorrect', 'wasted', 'painful', 'other']
    .map((key) => ({
      key,
      name: QUADRANT_META[key].label,
      hint: QUADRANT_META[key].hint,
      color: QUADRANT_META[key].color,
      value: counts[key],
    }))
    .filter((r) => r.value > 0)

  const n = perQ.length
  const takeaway = (() => {
    if (counts.painful >= 3) {
      return `You spent too long on ${counts.painful} questions that still went wrong — use a 90-second skip rule next mock.`
    }
    if (counts.overtimeCorrect >= 5) {
      return `${counts.overtimeCorrect} overtime corrects — drill timed shortcuts so speed matches accuracy.`
    }
    if (sillyCount >= 3) {
      return `About ${sillyLost} marks sit in avoidable mistakes — a 5-second final re-read before locking answers helps.`
    }
    if (counts.perfect / n >= 0.45) {
      return `Strong execution: ${counts.perfect} perfect attempts. Keep Pass-1 focused on sitters.`
    }
    return `Ideal pace ~${ideal}s/Q. Aim to grow the Perfect bucket and shrink Painful ones.`
  })()

  return {
    idealSeconds: ideal,
    counts,
    chart,
    items,
    takeaway,
    potential: {
      actual,
      potentialScore: Math.min(maxScore || potentialScore, potentialScore),
      maxScore,
      sillyCount,
      sillyLost,
      recoverable: sillyLost,
    },
    meta: QUADRANT_META,
  }
}

/**
 * What-If simulation: recover marks from silly + convert overtime corrects' time tax into a soft boost label.
 * @param {{ actual: number, maxScore: number, sillyLost: number, overtimeCorrect?: number }} base
 * @param {{ sillyFixPct?: number, overtimeFixPct?: number }} levers 0–100
 */
export function simulateWhatIfScore(base, levers = {}) {
  const actual = Number(base?.actual) || 0
  const maxScore = Number(base?.maxScore) || 0
  const sillyLost = Math.max(0, Number(base?.sillyLost) || 0)
  const overtimeN = Math.max(0, Number(base?.overtimeCorrect) || 0)
  const sillyFix = Math.min(100, Math.max(0, Number(levers.sillyFixPct) || 0)) / 100
  const overtimeFix = Math.min(100, Math.max(0, Number(levers.overtimeFixPct) || 0)) / 100
  // Overtime fix: soft +1 mark equivalent per overtime correct converted (capped), representing fewer panic skips later.
  const overtimeBoost = Math.round(overtimeN * overtimeFix * 1)
  const recovered = Math.round(sillyLost * sillyFix) + overtimeBoost
  const next = Math.min(maxScore || actual + recovered, actual + recovered)
  const pct = maxScore > 0 ? Math.round((next / maxScore) * 100) : 0
  const delta = next - actual
  return {
    score: next,
    pct,
    delta,
    recoveredSilly: Math.round(sillyLost * sillyFix),
    recoveredOvertime: overtimeBoost,
  }
}
