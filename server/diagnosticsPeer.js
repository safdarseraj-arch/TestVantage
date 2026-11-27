/**
 * Aggregate per-question peer bands from stored attempts (live go-live capacity).
 * Includes Top 1%, Top 10%, Top 25%, Top 500, and All.
 */

/**
 * @param {object[]} attempts
 * @param {string} testId
 * @returns {{ testId: string, studentCount: number, capacity: object, questions: object[] }}
 */
export function buildPeerStatsPayload(attempts, testId) {
  const forTest = (attempts || []).filter((a) => a && String(a.testId) === String(testId))
  const ranked = []
  /** @type {Map<string, { correct: number, wrong: number, unattempted: number, total: number, optionWrong: Record<string, number>, times: number[], correctTimes: number[] }>} */
  const byQ = new Map()

  for (const attempt of forTest) {
    const snap = attempt.resultSnapshot || attempt
    const result = snap.result || attempt
    const perQ = result?.perQuestion || attempt.perQuestion || []
    const qTimes = snap.questionTimes || attempt.questionTimes || {}
    const score = Number(result?.score ?? attempt.score ?? 0)
    ranked.push({ score, perQ, qTimes, attempt })

    for (const pq of perQ) {
      const id = String(pq.questionId || '')
      if (!id) continue
      if (!byQ.has(id)) {
        byQ.set(id, {
          correct: 0,
          wrong: 0,
          unattempted: 0,
          total: 0,
          optionWrong: {},
          times: [],
          correctTimes: [],
        })
      }
      const row = byQ.get(id)
      row.total += 1
      if (pq.grade === 'correct') row.correct += 1
      else if (pq.grade === 'unattempted') row.unattempted += 1
      else {
        row.wrong += 1
        const opt = pq.userAnswerLabel || pq.selectedOption || pq.userAnswer
        if (opt != null && String(opt).trim()) {
          const key = String(opt).trim()
          row.optionWrong[key] = (row.optionWrong[key] || 0) + 1
        }
      }
      const sec = Number(qTimes[id] ?? pq.timeSpentSeconds ?? 0)
      if (sec > 0) row.times.push(sec)
      if (sec > 0 && pq.grade === 'correct') row.correctTimes.push(sec)
    }
  }

  ranked.sort((a, b) => b.score - a.score)
  const n = ranked.length
  const topPct = (pct) => {
    if (!n) return []
    const count = Math.max(1, Math.ceil((pct / 100) * n))
    return ranked.slice(0, count)
  }
  const topCount = (count) => ranked.slice(0, Math.min(count, n))

  const bandFromSlice = (slice, questionId) => {
    if (!slice.length) {
      return { correctPct: null, wrongPct: null, skippedPct: null, sampleSize: 0 }
    }
    let correct = 0
    let wrong = 0
    let unattempted = 0
    for (const att of slice) {
      const pq = (att.perQ || []).find((p) => String(p.questionId) === String(questionId))
      if (!pq || pq.grade === 'unattempted') unattempted += 1
      else if (pq.grade === 'correct') correct += 1
      else wrong += 1
    }
    const total = slice.length
    const correctPct = Math.round((correct / total) * 1000) / 10
    const wrongPct = Math.round((wrong / total) * 1000) / 10
    let skippedPct = Math.round((unattempted / total) * 1000) / 10
    if (Math.abs(correctPct + wrongPct + skippedPct - 100) > 0.2) {
      skippedPct = Math.max(0, Math.round((100 - correctPct - wrongPct) * 10) / 10)
    }
    return { correctPct, wrongPct, skippedPct, sampleSize: total }
  }

  const avg = (arr) => {
    const vals = (arr || []).filter((x) => Number(x) > 0)
    if (!vals.length) return null
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
  }

  const correctTimesInBand = (slice, questionId) => {
    const secs = []
    for (const att of slice) {
      const pq = (att.perQ || []).find((p) => String(p.questionId) === String(questionId))
      if (pq?.grade !== 'correct') continue
      const sec = Number(att.qTimes?.[questionId] ?? pq.timeSpentSeconds ?? 0)
      if (sec > 0) secs.push(sec)
    }
    return avg(secs)
  }

  const top1 = topPct(1)
  const top10 = topPct(10)
  const top25 = topPct(25)
  const top500 = topCount(500)
  const all = ranked

  const questions = []
  for (const [questionId, row] of byQ.entries()) {
    const denom = row.total > 0 ? row.total : n || 1
    const correctPct = Math.round((row.correct / denom) * 100)
    const wrongPct = Math.round((row.wrong / denom) * 100)
    let skippedPct = Math.round((row.unattempted / denom) * 100)
    if (correctPct + wrongPct + skippedPct !== 100 && denom > 0) {
      skippedPct = Math.max(0, 100 - correctPct - wrongPct)
    }
    questions.push({
      questionId,
      appearedTo: row.total,
      correct: row.correct,
      wrong: row.wrong,
      skipped: row.unattempted,
      correctPct,
      wrongPct,
      skippedPct,
      studentCount: n,
      optionWrong: { ...row.optionWrong },
      avgTimeSeconds: avg(row.times),
      top10TimeSeconds: avg(row.times.slice().sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(row.times.length * 0.1)))),
      top25TimeSeconds: avg(row.times.slice().sort((a, b) => a - b).slice(0, Math.max(1, Math.ceil(row.times.length * 0.25)))),
      timeSampleSize: row.times.length,
      accuracyBands: {
        top1: bandFromSlice(top1, questionId),
        top10: bandFromSlice(top10, questionId),
        top25: bandFromSlice(top25, questionId),
        top500: bandFromSlice(top500, questionId),
        all: bandFromSlice(all, questionId),
      },
      correctSolverTimes: {
        top1: correctTimesInBand(top1, questionId),
        top10: correctTimesInBand(top10, questionId),
        top25: correctTimesInBand(top25, questionId),
        top500: correctTimesInBand(top500, questionId),
        all: avg(row.correctTimes),
        sampleSize: row.correctTimes.length,
      },
      source: 'live_server',
    })
  }

  return {
    testId: String(testId),
    studentCount: n,
    capacity: {
      nationalPeers: n >= 50,
      top1Ready: n >= 100,
      top500Ready: n >= 50,
      note:
        n >= 500
          ? 'National-style Top 1% / Top 500 bands available from live attempts.'
          : n >= 50
            ? 'Peer bands live from server attempts; Top 500 uses available cohort until 500+ sit the paper.'
            : 'Collecting live attempts — bands unlock as more students submit this paper.',
    },
    questions,
    generatedAt: new Date().toISOString(),
  }
}
