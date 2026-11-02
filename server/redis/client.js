import { createClient } from 'redis'
import { REDIS_CFG } from '../config.js'

/** @type {import('redis').RedisClientType | null} */
let client = null

export function useRedis() {
  return Boolean(REDIS_CFG.url?.trim())
}

/** @returns {Promise<boolean>} */
export async function connectRedis() {
  if (!useRedis()) return false
  if (client?.isOpen) return true
  try {
    client = createClient({ url: REDIS_CFG.url })
    client.on('error', (err) => {
      console.error('[redis]', err.message)
    })
    await client.connect()
    await client.ping()
    return true
  } catch (err) {
    console.error('[redis] connect failed:', err instanceof Error ? err.message : err)
    client = null
    return false
  }
}

export function getRedis() {
  return client?.isOpen ? client : null
}

/** @returns {Promise<boolean>} */
export async function pingRedis() {
  if (!useRedis()) return false
  try {
    const c = getRedis() ?? (await connectRedis() ? getRedis() : null)
    if (!c) return false
    await c.ping()
    return true
  } catch {
    return false
  }
}

/** @returns {Promise<void>} */
export async function closeRedis() {
  if (client?.isOpen) {
    await client.quit()
  }
  client = null
}
