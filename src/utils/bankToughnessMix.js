/**
 * Gemini practice-batch toughness mix (not used for PYQ).
 * Bank stores toughnessLevel 1-10 (T1-T10).
 * Easy = T1-T3. Moderate = T4-T7. Tough = T8-T10.
 * Practice batches: Easy 40% / Moderate 30% / Tough 30%.
 * 10 practice questions -> 4 easy + 3 moderate + 3 tough, rotating levels inside each band.
 */

/** @typedef {'easy' | 'moderate' | 'tough'} ToughnessBandId */

export const TOUGHNESS_MIX_SHARES = { easy: 0.4, moderate: 0.3, tough: 0.3 }

export const TOUGHNESS_BANDS = [
  { id: 'easy', label: 'Easy', levels: [1, 2, 3], hint: 'T1-T3' },
  { id: 'moderate', label: 'Moderate', levels: [4, 5, 6, 7], hint: 'T4-T7' },
  { id: 'tough', label: 'Tough', levels: [8, 9, 10], hint: 'T8-T10' },
]

/** @param {number | string | null | undefined} level */
export function parseToughnessLevel(level) {
  if (level == null || level === '') return NaN
  if (typeof level === 'string') {
    const m = /^T?\s*(\d{1,2})$/i.exec(level.trim())
    if (m) return Number(m[1])
  }
  return Number(level)
}

/**
 * Clamp to T1-T10. Invalid values fall back to a moderate T5.
 * @param {number | string | null | undefined} raw
 * @param {number} [fallback]
 */
export function clampToughnessLevel(raw, fallback = 5) {
  const n = parseToughnessLevel(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(10, Math.max(1, Math.round(n)))
}

/**
 * @param {number | string | null | undefined} level
 * @returns {ToughnessBandId | ''}
 */
export function toughnessBandFromLevel(level) {
  const n = parseToughnessLevel(level)
  if (!Number.isFinite(n) || n < 1) return ''
  if (n <= 3) return 'easy'
  if (n <= 7) return 'moderate'
  return 'tough'
}

/** @param {ToughnessBandId | ''} band */
export function toughnessBandLabel(band) {
  if (band === 'easy') return 'Easy'
  if (band === 'moderate') return 'Moderate'
  if (band === 'tough') return 'Tough'
  return ''
}

/**
 * Everyday chip: "Easy (T2)".
 * @param {number | string | null | undefined} level
 */
export function formatMixToughnessLabel(level) {
  const n = parseToughnessLevel(level)
  if (!Number.isFinite(n) || n < 1) return ''
  const band = toughnessBandFromLevel(n)
  const name = toughnessBandLabel(band)
  return name ? `${name} (T${Math.round(n)})` : `T${Math.round(n)}`
}

/**
 * @param {number} count
 * @returns {{ easy: number, moderate: number, tough: number }}
 */
export function toughnessQuotaForCount(count) {
  const n = Math.max(0, Math.round(Number(count) || 0))
  if (n === 0) return { easy: 0, moderate: 0, tough: 0 }
  let easy = Math.round(n * TOUGHNESS_MIX_SHARES.easy)
  let moderate = Math.round(n * TOUGHNESS_MIX_SHARES.moderate)
  let tough = n - easy - moderate
  if (tough < 0) {
    moderate += tough
    tough = 0
  }
  while (easy + moderate + tough < n) easy += 1
  while (easy + moderate + tough > n) {
    if (easy > 0) easy -= 1
    else if (moderate > 0) moderate -= 1
    else tough -= 1
  }
  return { easy, moderate, tough }
}

/** @param {number[]} bandLevels @param {number} count */
function rotateBandLevels(bandLevels, count) {
  const out = []
  for (let i = 0; i < count; i++) out.push(bandLevels[i % bandLevels.length])
  return out
}

/**
 * Planned toughnessLevel 1-10 for a practice batch, Easy then Moderate then Tough.
 * Rotates T1/T2/T3, T4-T7, T8-T10 so a batch is not all T1 or all T8.
 * @param {number} count
 * @returns {number[]}
 */
export function plannedToughnessLevels(count) {
  const quota = toughnessQuotaForCount(count)
  return [
    ...rotateBandLevels(TOUGHNESS_BANDS[0].levels, quota.easy),
    ...rotateBandLevels(TOUGHNESS_BANDS[1].levels, quota.moderate),
    ...rotateBandLevels(TOUGHNESS_BANDS[2].levels, quota.tough),
  ]
}

/**
 * Force a parsed Gemini practice list onto the 40/30/30 plan (by index).
 * Do not use this for PYQ batches — those keep the model's actual toughness.
 * @param {unknown[]} items
 * @param {number} [count]
 * @returns {unknown[]}
 */
export function applyToughnessMixToItems(items, count) {
  const list = Array.isArray(items) ? items : []
  const n = Number(count) > 0 ? Math.min(list.length, Math.round(Number(count))) : list.length
  const plan = plannedToughnessLevels(n)
  return list.map((item, i) => {
    if (!item || typeof item !== 'object') return item
    return {
      ...item,
      toughness: plan[i] ?? item?.toughness ?? 5,
    }
  })
}

/** Alias used by Gemini SCQ trial parse. */
export const enforceTrialToughnessMix = applyToughnessMixToItems

/** @param {number} count */
export function toughnessMixHint(count = 10) {
  const q = toughnessQuotaForCount(count)
  return `Practice batches mix Easy 40% (T1-T3) / Moderate 30% (T4-T7) / Tough 30% (T8-T10). ${count} questions -> ${q.easy} easy + ${q.moderate} moderate + ${q.tough} tough. PYQ batches keep each item's actual toughness.`
}
