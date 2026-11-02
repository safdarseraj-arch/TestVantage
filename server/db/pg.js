import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { DB } from '../config.js'

const { Pool } = pg

/** @type {import('pg').Pool | null} */
let pool = null

export function usePostgres() {
  return Boolean(DB.url?.trim())
}

export function getPool() {
  if (!usePostgres()) return null
  if (!pool) {
    pool = new Pool({
      connectionString: DB.url,
      max: Number(process.env.PG_POOL_MAX) || 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
    pool.on('error', (err) => {
      console.error('[postgres] pool error', err.message)
    })
  }
  return pool
}

/** @returns {Promise<boolean>} */
export async function migrate() {
  if (!usePostgres()) return false
  const p = getPool()
  if (!p) return false
  const schemaPath = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql')
  const sql = readFileSync(schemaPath, 'utf8')
  await p.query(sql)
  return true
}

/** @returns {Promise<boolean>} */
export async function pingPostgres() {
  if (!usePostgres()) return false
  try {
    const p = getPool()
    if (!p) return false
    await p.query('SELECT 1')
    return true
  } catch {
    return false
  }
}

/** @returns {Promise<void>} */
export async function closePostgres() {
  if (pool) {
    await pool.end()
    pool = null
  }
}
