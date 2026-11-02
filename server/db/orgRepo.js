import { getPool, usePostgres } from './pg.js'

const ORG_KEYS = ['schools', 'classes', 'assignments', 'users']

/** @returns {Promise<{ schools: object[], classes: object[], assignments: object[], users: object[], updatedAt: number }>} */
export async function loadOrgPg() {
  const p = getPool()
  if (!p) throw new Error('Postgres not configured')

  const { rows } = await p.query(
    `SELECT key, data, updated_at FROM org_snapshots WHERE key = ANY($1::text[])`,
    [ORG_KEYS],
  )

  const out = {
    schools: [],
    classes: [],
    assignments: [],
    users: [],
    updatedAt: 0,
  }

  for (const row of rows) {
    const key = row.key
    const data = row.data
    if (key === 'schools' && Array.isArray(data)) out.schools = data
    if (key === 'classes' && Array.isArray(data)) out.classes = data
    if (key === 'assignments' && Array.isArray(data)) out.assignments = data
    if (key === 'users' && Array.isArray(data)) out.users = data
    out.updatedAt = Math.max(out.updatedAt, Number(row.updated_at) || 0)
  }

  return out
}

/**
 * @param {{ schools?: object[], classes?: object[], assignments?: object[], users?: object[] }} payload
 */
export async function saveOrgPg(payload) {
  const p = getPool()
  if (!p) throw new Error('Postgres not configured')
  const now = Date.now()
  const current = await loadOrgPg()

  const next = {
    schools: payload.schools ?? current.schools,
    classes: payload.classes ?? current.classes,
    assignments: payload.assignments ?? current.assignments,
    users: payload.users ?? current.users,
    updatedAt: now,
  }

  const entries = [
    ['schools', next.schools],
    ['classes', next.classes],
    ['assignments', next.assignments],
    ['users', next.users],
  ]

  for (const [key, data] of entries) {
    await p.query(
      `INSERT INTO org_snapshots (key, data, updated_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
      [key, JSON.stringify(data), now],
    )
  }

  return next
}

export { usePostgres }
