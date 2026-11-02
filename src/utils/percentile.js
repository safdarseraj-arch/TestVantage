/** NTA-style percentile estimate from % of max marks (demo curve) */
export function estimatePercentile(scorePct) {
  const p = Math.max(0, Math.min(100, scorePct))
  if (p >= 99) return 99.5 + (p - 99) * 0.1
  if (p >= 95) return 97 + (p - 95) * 0.5
  if (p >= 90) return 92 + (p - 90) * 1
  if (p >= 80) return 78 + (p - 80) * 1.4
  if (p >= 70) return 62 + (p - 70) * 1.6
  if (p >= 60) return 48 + (p - 60) * 1.4
  if (p >= 50) return 35 + (p - 50) * 1.3
  if (p >= 40) return 22 + (p - 40) * 1.3
  if (p >= 25) return 10 + (p - 25) * 0.8
  return Math.max(0.1, p * 0.35)
}

/** Official-style aspirant pools for estimated AIR (per exam). */
export const EXAM_AIR_POOL_SIZES = {
  'jee-main': 1_800_000,
  'jee-advanced': 200_000,
  neet: 2_000_000,
}

/** @param {string} [examPatternId] */
export function getExamAirPoolSize(examPatternId) {
  if (examPatternId && EXAM_AIR_POOL_SIZES[examPatternId]) {
    return EXAM_AIR_POOL_SIZES[examPatternId]
  }
  return EXAM_AIR_POOL_SIZES['jee-main']
}

/**
 * Estimated AIR from percentile for a given exam pool.
 * @param {number} percentile
 * @param {string} [examPatternId]
 */
export function estimateAIR(percentile, examPatternId) {
  const poolSize = getExamAirPoolSize(examPatternId)
  const pct = Math.max(0.01, Math.min(99.99, percentile))
  return Math.max(1, Math.round(((100 - pct) / 100) * poolSize))
}

export function scoreToPercentile(score, maxScore) {
  if (!maxScore) return 0
  return estimatePercentile((score / maxScore) * 100)
}
