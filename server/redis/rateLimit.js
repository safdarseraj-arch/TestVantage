import { SCALE } from '../config.js'
import { getRedis, useRedis } from './client.js'

const PREFIX = 'tv:rl:'

/**
 * @param {string} ip
 * @param {number} [limitPerMinute]
 */
export async function checkRateLimitRedis(ip, limitPerMinute = SCALE.rateLimitPerMinute) {
  const c = getRedis()
  if (!c) return { ok: true, remaining: limitPerMinute }

  const key = `${PREFIX}${ip}`
  const count = await c.incr(key)
  if (count === 1) {
    await c.expire(key, 60)
  }
  const ttl = await c.ttl(key)
  const remaining = Math.max(0, limitPerMinute - count)
  if (count > limitPerMinute) {
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, ttl) }
  }
  return { ok: true, remaining }
}

export { useRedis }
