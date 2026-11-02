import { FEATURES, SCALE } from '../config.js'
import { checkRateLimit as checkMemory } from '../lib/rateLimit.js'
import { checkRateLimitRedis, useRedis } from '../redis/rateLimit.js'

/** @type {'redis' | 'memory'} */
let backend = 'memory'

export function rateLimitBackend() {
  return backend
}

/** @param {'redis' | 'memory'} mode */
export function setRateLimitBackend(mode) {
  backend = mode
}

/**
 * @param {string} ip
 */
export async function checkRateLimit(ip) {
  if (!FEATURES.rateLimit) return { ok: true, remaining: SCALE.rateLimitPerMinute }
  if (backend === 'redis') return checkRateLimitRedis(ip)
  return checkMemory(ip)
}

export { useRedis }
