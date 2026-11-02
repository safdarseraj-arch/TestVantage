/**
 * Precision Map — time × chapter × question-type surgical insights.
 * Tags: under pressure · slow but accurate · fast but wrong · paced correct.
 */

import { getQuestionType } from '../data/questionTypes.js'

/** @typedef {'under_pressure' | 'slow_accurate' | 'fast_wrong' | 'paced_correct' | 'skipped'} PrecisionTag */

const TAG_META = {
  under_pressure: {
    id: 'under_pressure',
    label: 'Under pressure',
    hint: 'Slow and wrong — concepts break when the clock bites',
    tone: 'warn',
  },
  slow_accurate: {
    id: 'slow_accurate',
    label: 'Slow but accurate',
    hint: 'You get it right — trim seconds without rushing',
    tone: 'info',
  },
  fast_wrong: {
    id: 'fast_wrong',
    label: 'Fast but wrong',
    hint: 'Rushing or guess traps — slow the first read',
    tone: 'danger',
  },
  paced_correct: {
    id: 'paced_correct',
    label: 'Paced & correct',
    hint: 'Healthy timing with accuracy — protect this pattern',
    tone: 'good',
  },
  skipped: {
    id: 'skipped',
    label: 'Skipped / blank',
    hint: 'Left unattempted — decide skip strategy vs knowledge gap',
    tone: 'muted',
  },
}

/**
 * @param {number} seconds
 * @param {string} grade
 * @param {number} medianSec
 * @returns {PrecisionTag}
 */
export function classifyPrecisionTag(seconds, grade, medianSec) {
  if (grade === 'unattempted') return 'skipped'
  const slowCut = Math.max(45, medianSec * 1.35)
  const fastCut = Math.max(12, medianSec * 0.55)
  const slow = seconds >= slowCut
  const fast = seconds > 0 && seconds <= fastCut
  const correct = grade === 'correct' || grade === 'partial'

  if (slow && !correct) return 'under_pressure'
  if (slow && correct) return 'slow_accurate'
  if (fast && !correct) return 'fast_wrong'
  if (correct) return 'paced_correct'
  return 'fast_wrong'
}

/**
 * Collect per-question rows from attempts (newest first, capped).
 * @param {import('./attemptHistory.js').Attempt[]} attempts
 * @param {number} [maxAttempts]
 */
function collectPerQuestions(attempts, maxAttempts = 15) {
  /** @type {{ chapter: string, questionType: string, subject?: string, seconds: number, grade: string, attemptId: string, testId: string }[]} */
  const rows = []
  for (const a of attempts.slice(0, maxAttempts)) {
    const result = a.resultSnapshot?.result ?? a.resultSnapshot
    const perQ = result?.perQuestion ?? []
    const times = a.resultSnapshot?.questionTimes ?? result?.questionTimes ?? {}
    for (const pq of perQ) {
      const seconds = Number(times[pq.questionId] ?? pq.timeSpentSeconds ?? 0) || 0
      rows.push({
        chapter: String(pq.chapter || 'General').trim() || 'General',
        questionType: String(pq.questionType || 'scq'),
        subject: pq.subject,
        seconds,
        grade: pq.grade || 'unattempted',
        attemptId: a.id,
        testId: a.testId,
      })
    }
  }
  return rows
}

/**
 * @param {number[]} values
 */
function median(values) {
  if (!values.length) return 60
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Build Precision Map from attempt history.
 * @param {import('./attemptHistory.js').Attempt[]} attempts newest first
 */
export function buildPrecisionMap(attempts = []) {
  const rows = collectPerQuestions(attempts)
  if (!rows.length) {
    return {
      ready: false,
      totalTagged: 0,
      medianSeconds: 0,
      tagCounts: {},
      tagMeta: TAG_META,
      insights: [],
      cells: [],
      topAlerts: [],
      summary: 'Finish a timed mock with per-question timing to unlock Precision Map.',
    }
  }

  const timed = rows.filter((r) => r.seconds > 0 || r.grade !== 'unattempted')
  const med = median(timed.map((r) => r.seconds).filter((s) => s > 0))

  /** @type {Record<string, number>} */
  const tagCounts = {
    under_pressure: 0,
    slow_accurate: 0,
    fast_wrong: 0,
    paced_correct: 0,
    skipped: 0,
  }

  /** @type {Map<string, { chapter: string, questionType: string, typeLabel: string, tags: Record<string, number>, total: number, avgSeconds: number, correct: number, wrong: number }>} */
  const cellMap = new Map()

  for (const r of rows) {
    const tag = classifyPrecisionTag(r.seconds, r.grade, med)
    tagCounts[tag] = (tagCounts[tag] ?? 0) + 1

    const typeLabel = getQuestionType(r.questionType)?.label ?? r.questionType
    const key = `${r.chapter.toLowerCase()}::${r.questionType}`
    if (!cellMap.has(key)) {
      cellMap.set(key, {
        chapter: r.chapter,
        questionType: r.questionType,
        typeLabel,
        tags: {
          under_pressure: 0,
          slow_accurate: 0,
          fast_wrong: 0,
          paced_correct: 0,
          skipped: 0,
        },
        total: 0,
        avgSeconds: 0,
        correct: 0,
        wrong: 0,
        _secSum: 0,
      })
    }
    const cell = cellMap.get(key)
    cell.tags[tag] = (cell.tags[tag] ?? 0) + 1
    cell.total += 1
    cell._secSum += r.seconds
    if (r.grade === 'correct' || r.grade === 'partial') cell.correct += 1
    else if (r.grade === 'wrong') cell.wrong += 1
  }

  const cells = [...cellMap.values()]
    .map((c) => {
      const { _secSum, ...rest } = c
      const dominant =
        Object.entries(c.tags).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'paced_correct'
      return {
        ...rest,
        avgSeconds: c.total > 0 ? Math.round(_secSum / c.total) : 0,
        accuracy:
          c.correct + c.wrong > 0 ? Math.round((c.correct / (c.correct + c.wrong)) * 100) : 0,
        dominantTag: /** @type {PrecisionTag} */ (dominant),
        pressureScore: (c.tags.under_pressure ?? 0) + (c.tags.fast_wrong ?? 0) * 0.85,
      }
    })
    .filter((c) => c.total >= 1)
    .sort((a, b) => b.pressureScore - a.pressureScore || a.accuracy - b.accuracy)

  /** Surgical alerts — highest value cells */
  const topAlerts = cells
    .filter((c) => c.tags.under_pressure > 0 || c.tags.fast_wrong > 0 || c.tags.slow_accurate >= 2)
    .slice(0, 8)
    .map((c) => {
      const tag = c.dominantTag
      const meta = TAG_META[tag] ?? TAG_META.under_pressure
      return {
        chapter: c.chapter,
        typeLabel: c.typeLabel,
        tag,
        tagLabel: meta.label,
        tone: meta.tone,
        detail: `${c.total} Q · ${c.accuracy}% acc · ~${c.avgSeconds}s · ${meta.hint}`,
        underPressure: c.tags.under_pressure,
        fastWrong: c.tags.fast_wrong,
        slowAccurate: c.tags.slow_accurate,
      }
    })

  const insights = [
    tagCounts.under_pressure > 0
      ? {
          id: 'pressure',
          title: 'Under pressure hotspots',
          detail: `${tagCounts.under_pressure} slow+wrong — drill those chapters untimed first, then timed.`,
        }
      : null,
    tagCounts.fast_wrong > 0
      ? {
          id: 'rush',
          title: 'Fast but wrong',
          detail: `${tagCounts.fast_wrong} rushed misses — force a 5-second stem read before options.`,
        }
      : null,
    tagCounts.slow_accurate > 0
      ? {
          id: 'slow',
          title: 'Slow but accurate',
          detail: `${tagCounts.slow_accurate} correct but heavy — keep accuracy, shave method steps.`,
        }
      : null,
  ].filter(Boolean)

  const totalTagged = rows.length
  const summary =
    topAlerts.length > 0
      ? `Precision Map spotted ${topAlerts.length} chapter×type hotspots. Fix pressure and rush patterns before the next full mock.`
      : `Precision Map tagged ${totalTagged} questions — form looks paced. Keep monitoring under pressure cells.`

  return {
    ready: true,
    totalTagged,
    medianSeconds: Math.round(med),
    tagCounts,
    tagMeta: TAG_META,
    insights,
    cells: cells.slice(0, 24),
    topAlerts,
    summary,
  }
}

export { TAG_META as PRECISION_TAG_META }
