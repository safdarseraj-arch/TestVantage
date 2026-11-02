import { getPool, usePostgres } from './pg.js'

/** @returns {Promise<{ questions: object[], updatedAt: number }>} */
export async function loadQuestionsPg() {
  const p = getPool()
  if (!p) throw new Error('Postgres not configured')
  const { rows } = await p.query(
    `SELECT data, updated_at FROM questions ORDER BY updated_at DESC`,
  )
  const questions = rows.map((r) => r.data)
  const updatedAt = rows.length
    ? Math.max(...rows.map((r) => Number(r.updated_at) || 0))
    : 0
  return { questions, updatedAt }
}

/**
 * @param {object} question
 */
export async function upsertQuestionPg(question) {
  const p = getPool()
  if (!p) throw new Error('Postgres not configured')
  if (!question?.id) throw new Error('Question id is required')
  const row = {
    ...question,
    syncStatus: 'live',
    serverSyncedAt: Date.now(),
  }
  const now = Date.now()
  await p.query(
    `INSERT INTO questions (id, subject, data, updated_at)
     VALUES ($1, $2, $3::jsonb, $4)
     ON CONFLICT (id) DO UPDATE SET
       subject = EXCLUDED.subject,
       data = EXCLUDED.data,
       updated_at = EXCLUDED.updated_at`,
    [row.id, row.subject ?? null, JSON.stringify(row), now],
  )
  return row
}

/**
 * @param {object[]} questions
 */
export async function bulkUpsertQuestionsPg(questions) {
  const results = []
  for (const q of questions ?? []) {
    if (!q?.id) continue
    results.push(await upsertQuestionPg(q))
  }
  return { synced: results.length, questions: results }
}

/** @returns {Promise<number>} */
export async function countQuestionsPg() {
  if (!usePostgres()) return 0
  const p = getPool()
  if (!p) return 0
  const { rows } = await p.query(`SELECT COUNT(*)::int AS n FROM questions`)
  return rows[0]?.n ?? 0
}

export { usePostgres }
