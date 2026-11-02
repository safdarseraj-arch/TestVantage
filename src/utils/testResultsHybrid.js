/**
 * Persist per-question scores to FastAPI (Postgres test_results) for Bloom analytics.
 */

/**
 * @param {{
 *   attemptId: string
 *   testId: string
 *   studentId: string
 *   perQuestion: Array<{ questionId?: string, grade?: string, marks?: number, maxMarks?: number, subject?: string, chapter?: string, topic?: string, timeSpentSeconds?: number, bloom_level?: string, bloomLevel?: string }>
 * }} payload
 */
export async function postTestResultsForBloomAnalytics(payload) {
  const rows = (payload.perQuestion ?? [])
    .filter((pq) => pq?.questionId)
    .map((pq) => ({
      question_id: String(pq.questionId),
      is_correct: pq.grade === 'correct',
      score: Number(pq.marks ?? 0),
      max_score: Number(pq.maxMarks ?? 0),
      bloom_level: pq.bloom_level ?? pq.bloomLevel ?? null,
      time_spent_ms:
        pq.timeSpentSeconds != null && pq.timeSpentSeconds > 0
          ? Math.round(Number(pq.timeSpentSeconds) * 1000)
          : null,
      subject: pq.subject ?? null,
      chapter: pq.chapter ?? null,
      topic: pq.topic ?? null,
    }))
  if (!rows.length) return { ok: false, skipped: true }

  const res = await fetch('/api/test-results/attempt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attempt_id: payload.attemptId,
      test_id: payload.testId,
      student_id: payload.studentId,
      rows,
      refresh_performance_cache: true,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(detail || `test-results HTTP ${res.status}`)
  }
  return res.json()
}
