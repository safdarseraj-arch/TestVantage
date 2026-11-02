import { getPool, usePostgres } from './pg.js'

/**
 * @param {object} attempt
 */
export async function saveAttemptPg(attempt) {
  const p = getPool()
  if (!p) throw new Error('Postgres not configured')
  if (!attempt?.id) throw new Error('attempt id is required')
  const now = Date.now()
  const submittedAt = Number(attempt.submittedAt) || now
  await p.query(
    `INSERT INTO attempts (id, owner_key, test_id, submitted_at, data, saved_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (id) DO UPDATE SET
       data = EXCLUDED.data,
       saved_at = EXCLUDED.saved_at`,
    [
      attempt.id,
      attempt.ownerKey,
      attempt.testId,
      submittedAt,
      JSON.stringify({ ...attempt, savedAt: now }),
      now,
    ],
  )
  return attempt
}

/** @returns {Promise<number>} */
export async function countAttemptsPg() {
  if (!usePostgres()) return 0
  const p = getPool()
  if (!p) return 0
  const { rows } = await p.query(`SELECT COUNT(*)::int AS n FROM attempts`)
  return rows[0]?.n ?? 0
}

/**
 * @param {{ ownerKeys?: string[], limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function listAttemptsPg(opts = {}) {
  if (!usePostgres()) return []
  const p = getPool()
  if (!p) return []
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500)
  const ownerKeys = opts.ownerKeys?.filter(Boolean) ?? []

  if (ownerKeys.length) {
    const { rows } = await p.query(
      `SELECT data FROM attempts
       WHERE owner_key = ANY($1::text[])
       ORDER BY submitted_at DESC
       LIMIT $2`,
      [ownerKeys, limit],
    )
    return rows.map((r) => r.data)
  }

  const { rows } = await p.query(
    `SELECT data FROM attempts ORDER BY submitted_at DESC LIMIT $1`,
    [limit],
  )
  return rows.map((r) => r.data)
}

export { usePostgres }
