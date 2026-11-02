import { createHash } from 'crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { SCALE } from './config.js'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const SESSION_ROOT = join(SERVER_DIR, 'data', 'exam-sessions')
const ATTEMPT_ROOT = join(SERVER_DIR, 'data', 'attempts')

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/** @param {string} ownerKey */
function shardFor(ownerKey) {
  const hash = createHash('sha256').update(String(ownerKey)).digest('hex')
  const num = parseInt(hash.slice(0, 8), 16) % SCALE.sessionShards
  return String(num).padStart(3, '0')
}

/** @param {string} ownerKey @param {string} testId */
export function sessionKey(ownerKey, testId) {
  return `${String(ownerKey)}::${String(testId)}`
}

/** @param {string} key */
function sessionPath(key) {
  const [ownerKey] = key.split('::')
  return join(SESSION_ROOT, shardFor(ownerKey), `${encodeURIComponent(key)}.json`)
}

/**
 * @param {object} snapshot
 */
export function saveExamSession(snapshot) {
  if (!snapshot?.testId || !snapshot?.ownerKey) {
    throw new Error('testId and ownerKey are required')
  }
  const key = sessionKey(snapshot.ownerKey, snapshot.testId)
  const path = sessionPath(key)
  ensureDir(dirname(path))
  const entry = {
    ...snapshot,
    sessionKey: key,
    updatedAt: Date.now(),
  }
  writeFileSync(path, JSON.stringify(entry))
  return entry
}

/**
 * @param {string} ownerKey
 * @param {string} testId
 */
export function loadExamSession(ownerKey, testId) {
  const path = sessionPath(sessionKey(ownerKey, testId))
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** @param {string} ownerKey @param {string} testId */
export function clearExamSession(ownerKey, testId) {
  const path = sessionPath(sessionKey(ownerKey, testId))
  if (existsSync(path)) unlinkSync(path)
}

/** @param {string} ownerKey */
export function listExamSessionsForOwner(ownerKey) {
  const dir = join(SESSION_ROOT, shardFor(ownerKey))
  if (!existsSync(dir)) return []
  const prefix = encodeURIComponent(`${ownerKey}::`)
  const out = []
  for (const file of readdirSync(dir)) {
    if (!file.startsWith(prefix) || !file.endsWith('.json')) continue
    try {
      out.push(JSON.parse(readFileSync(join(dir, file), 'utf8')))
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

/**
 * @param {object} attempt
 */
export function saveAttemptRecord(attempt) {
  if (!attempt?.id) throw new Error('attempt id is required')
  ensureDir(ATTEMPT_ROOT)
  const shard = shardFor(attempt.ownerKey ?? attempt.id)
  const dir = join(ATTEMPT_ROOT, shard)
  ensureDir(dir)
  const path = join(dir, `${attempt.id}.json`)
  writeFileSync(path, JSON.stringify({ ...attempt, savedAt: Date.now() }))
  return attempt
}

export function countExamSessions() {
  if (!existsSync(SESSION_ROOT)) return 0
  let n = 0
  for (const shard of readdirSync(SESSION_ROOT)) {
    const dir = join(SESSION_ROOT, shard)
    try {
      n += readdirSync(dir).filter((f) => f.endsWith('.json')).length
    } catch {
      /* skip */
    }
  }
  return n
}

export function countAttempts() {
  if (!existsSync(ATTEMPT_ROOT)) return 0
  let n = 0
  for (const shard of readdirSync(ATTEMPT_ROOT)) {
    const dir = join(ATTEMPT_ROOT, shard)
    try {
      n += readdirSync(dir).filter((f) => f.endsWith('.json')).length
    } catch {
      /* skip */
    }
  }
  return n
}

/**
 * @param {{ ownerKeys?: string[], limit?: number }} [opts]
 * @returns {object[]}
 */
export function listAttemptRecords(opts = {}) {
  if (!existsSync(ATTEMPT_ROOT)) return []
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 500)
  const ownerSet = opts.ownerKeys?.length ? new Set(opts.ownerKeys) : null
  const out = []

  for (const shard of readdirSync(ATTEMPT_ROOT)) {
    const dir = join(ATTEMPT_ROOT, shard)
    let files = []
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'))
    } catch {
      continue
    }
    for (const file of files) {
      try {
        const row = JSON.parse(readFileSync(join(dir, file), 'utf8'))
        if (ownerSet && !ownerSet.has(row.ownerKey)) continue
        out.push(row)
      } catch {
        /* skip corrupt */
      }
    }
  }

  return out
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
    .slice(0, limit)
}

export { SESSION_ROOT, ATTEMPT_ROOT }
