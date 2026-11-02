import { existsSync } from 'fs'
import { DB, REDIS_CFG } from './config.js'
import { migrate, pingPostgres } from './db/pg.js'
import { connectRedis, pingRedis } from './redis/client.js'
import { setAttemptsBackend } from './stores/attempts.js'
import { setExamSessionsBackend } from './stores/examSessions.js'
import { setOrgDataBackend } from './stores/orgData.js'
import { setQuestionsBackend } from './stores/questions.js'
import { setRateLimitBackend } from './stores/rateLimit.js'

/** @type {{
 *   questions: 'postgres' | 'file',
 *   sessions: 'redis' | 'file',
 *   attempts: 'postgres' | 'file',
 *   orgData: 'postgres' | 'file',
 *   rateLimit: 'redis' | 'memory',
 *   postgresOk: boolean,
 *   redisOk: boolean,
 * }} */
const storage = {
  questions: 'file',
  sessions: 'file',
  attempts: 'file',
  orgData: 'file',
  rateLimit: 'memory',
  postgresOk: false,
  redisOk: false,
}

export function getStorageInfo() {
  return { ...storage }
}

function runningInDocker() {
  return existsSync('/.dockerenv') || process.env.TESTVANTAGE_IN_DOCKER === '1'
}

/** Docker Compose service names — DNS hangs ~100s on a Windows desktop. */
function isDockerInternalUrl(urlStr) {
  if (!urlStr?.trim()) return false
  try {
    const host = new URL(urlStr).hostname
    return host === 'postgres' || host === 'redis'
  } catch {
    return /@postgres(?::|\/)|\/\/redis(?::|\/)/i.test(urlStr)
  }
}

/** @returns {Promise<typeof storage>} */
export async function initPlatformStores() {
  if (DB.url?.trim() && isDockerInternalUrl(DB.url) && !runningInDocker()) {
    console.warn('[bootstrap] Skipping Docker DATABASE_URL (host postgres) — using files')
  } else if (DB.url?.trim()) {
    try {
      const migrated = await migrate()
      storage.postgresOk = migrated && (await pingPostgres())
      if (storage.postgresOk) {
        setQuestionsBackend('postgres')
        setAttemptsBackend('postgres')
        setOrgDataBackend('postgres')
        storage.questions = 'postgres'
        storage.attempts = 'postgres'
        storage.orgData = 'postgres'
        console.log('[bootstrap] PostgreSQL ready — questions + attempts + org data')
      } else if (DB.required) {
        throw new Error('PostgreSQL required but connection failed')
      } else {
        console.warn('[bootstrap] PostgreSQL URL set but not reachable — using files')
      }
    } catch (err) {
      if (DB.required) throw err
      console.warn('[bootstrap] PostgreSQL skipped:', err instanceof Error ? err.message : err)
    }
  }

  if (REDIS_CFG.url?.trim() && isDockerInternalUrl(REDIS_CFG.url) && !runningInDocker()) {
    console.warn('[bootstrap] Skipping Docker REDIS_URL (host redis) — using files')
  } else if (REDIS_CFG.url?.trim()) {
    try {
      storage.redisOk = await connectRedis()
      if (storage.redisOk && (await pingRedis())) {
        setExamSessionsBackend('redis')
        setRateLimitBackend('redis')
        storage.sessions = 'redis'
        storage.rateLimit = 'redis'
        console.log('[bootstrap] Redis ready — exam sessions + rate limits')
      } else if (REDIS_CFG.required) {
        throw new Error('Redis required but connection failed')
      } else {
        console.warn('[bootstrap] Redis URL set but not reachable — using files')
      }
    } catch (err) {
      if (REDIS_CFG.required) throw err
      console.warn('[bootstrap] Redis skipped:', err instanceof Error ? err.message : err)
    }
  }

  return getStorageInfo()
}

export function isPlatformReady() {
  if (DB.required && !storage.postgresOk) return false
  if (REDIS_CFG.required && !storage.redisOk) return false
  return true
}
