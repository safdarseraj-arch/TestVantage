import { SCALE, FEATURES } from '../config.js'

/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map()

/**
 * Simple in-memory rate limiter (per API instance).
 * Production: replace with Redis + nginx/Cloudflare at edge for 10L+ concurrent users.
 * @param {string} key
 * @param {number} [limitPerMinute]
 */
export function checkRateLimit(key, limitPerMinute = SCALE.rateLimitPerMinute) {
  if (!FEATURES.rateLimit) return { ok: true, remaining: limitPerMinute }

  const now = Date.now()
  const windowMs = 60_000
  let bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(key, bucket)
  }
  bucket.count += 1
  const remaining = Math.max(0, limitPerMinute - bucket.count)
  if (bucket.count > limitPerMinute) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  return { ok: true, remaining }
}

/** Prune stale buckets periodically. */
setInterval(() => {
  const now = Date.now()
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k)
  }
}, 120_000).unref?.()
