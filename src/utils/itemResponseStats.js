/**
 * Local item response stats — calibrates question difficulty from student attempts.
 * Lightweight IRT-style p-value → toughness (no cloud API).
 */

const STORAGE_KEY = 'testvantage-item-stats'

/** @typedef {{ correct: number, wrong: number, partial: number, skipped: number, attempts: number, lastAt: number }} ItemStats */

/** In-memory fallback when localStorage is unavailable (Node tests). */
let memoryStore = null

/** @returns {Record<string, ItemStats>} */
function loadAll() {
  if (memoryStore) return memoryStore
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/** @param {Record<string, ItemStats>} map */
function saveAll(map) {
  if (memoryStore) {
    memoryStore = map
    return
  }
  try {
    if (typeof localStorage === 'undefined') {
      memoryStore = map
      return
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    memoryStore = map
  }
}

/** Reset store (tests only). */
export function _resetItemStatsForTests() {
  memoryStore = {}
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** @param {import('./aiAdaptiveEngine.js').ItemGrade} grade */
function bump(stats, grade) {
  if (grade === 'correct') stats.correct += 1
  else if (grade === 'partial') stats.partial += 1
  else if (grade === 'wrong') stats.wrong += 1
  else stats.skipped += 1
  stats.attempts += 1
  stats.lastAt = Date.now()
}

/**
 * Record responses after an exam attempt (updates bank question stats by id).
 * @param {Array<{ questionId?: string, grade?: string }>} perQuestion
 */
export function recordItemResponsesFromResult(perQuestion = []) {
  if (!perQuestion.length) return
  const map = loadAll()
  for (const row of perQuestion) {
    const id = String(row.questionId ?? '').trim()
    if (!id) continue
    const grade = /** @type {import('./aiAdaptiveEngine.js').ItemGrade} */ (row.grade ?? 'unattempted')
    if (!map[id]) {
      map[id] = { correct: 0, wrong: 0, partial: 0, skipped: 0, attempts: 0, lastAt: 0 }
    }
    bump(map[id], grade)
  }
  saveAll(map)
}

/** @param {string} questionId */
export function getItemStats(questionId) {
  return loadAll()[questionId] ?? null
}

/**
 * Empirical difficulty 1–10 from response history (higher = harder).
 * @param {ItemStats | null} stats
 */
export function empiricalToughnessFromStats(stats) {
  if (!stats) return null
  const graded = stats.correct + stats.wrong + stats.partial
  if (graded < 5) return null
  const p = (stats.correct + stats.partial * 0.5) / graded
  return Math.min(10, Math.max(1, Math.round((10 - p * 9) * 10) / 10))
}

/**
 * Blend author toughness with calibrated value when enough data exists.
 * @param {import('../data/tests').Question} q
 */
export function getEffectiveQuestionToughness(q) {
  const author = Number(q?.toughnessLevel)
  const base = Number.isFinite(author) && author > 0 ? author : 5
  const empirical = empiricalToughnessFromStats(getItemStats(q?.id))
  if (empirical == null) return base
  return Math.round((base * 0.5 + empirical * 0.5) * 10) / 10
}

/** @param {string} questionId */
export function getItemCalibrationReport(questionId) {
  const stats = getItemStats(questionId)
  const empirical = empiricalToughnessFromStats(stats)
  if (!stats || empirical == null) {
    return { calibrated: false, attempts: stats?.attempts ?? 0 }
  }
  const graded = stats.correct + stats.wrong + stats.partial
  const p = graded > 0 ? Math.round(((stats.correct + stats.partial * 0.5) / graded) * 100) : 0
  return {
    calibrated: true,
    attempts: stats.attempts,
    pValue: p,
    empiricalToughness: empirical,
  }
}
