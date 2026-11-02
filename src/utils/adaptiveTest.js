/**
 * Item-level + section-level adaptive testing (GRE-style CAT).
 * Within a section, each next question targets the student's live ability estimate.
 * Between sections, block difficulty shifts from section score.
 */

/** @typedef {'easy' | 'medium' | 'hard'} DifficultyBand */
/**
 * @typedef {Object} SectionResult
 * @property {string} subjectId
 * @property {DifficultyBand} difficulty
 * @property {number} correct
 * @property {number} total
 * @property {number} accuracy
 * @property {number} maxScore
 * @property {number} score
 */
/** @typedef {{ tier: string, headline: string, summary: string, levelScore: number, recommendedDifficulty: DifficultyBand, bySubject: Record<string, { tier: string, accuracy: number, difficultyUsed: DifficultyBand }> }} StandingEstimate */

import { enforce_parent_child_exclusion } from './parentChildExclusion.js'

const BAND_ORDER = /** @type {DifficultyBand[]} */ (['easy', 'medium', 'hard'])

/**
 * @param {import('../data/tests').Question[]} questions
 */
export function enrichPoolToughness(questions) {
  const counts = /** @type {Record<string, number>} */ ({})
  const levels = [2, 5, 8, 3, 6, 9, 4, 7, 10]
  return questions.map((q) => {
    if (q.toughnessLevel != null && q.toughnessLevel > 0) return q
    const sub = q.subject ?? 'default'
    const c = counts[sub] ?? 0
    counts[sub] = c + 1
    return { ...q, toughnessLevel: levels[c % levels.length] }
  })
}

/** @param {number | string | null | undefined} level */
export function difficultyBand(level) {
  const n = Number(level)
  if (!n || n < 1) return 'medium'
  if (n <= 3) return 'easy'
  if (n <= 7) return 'medium'
  return 'hard'
}

/** @param {DifficultyBand} band */
export function difficultyLabel(band) {
  if (band === 'easy') return 'Foundation'
  if (band === 'hard') return 'Challenge'
  return 'Standard'
}

/** @param {DifficultyBand} [prev] */
export function startingSectionDifficulty(prev) {
  return prev ?? 'medium'
}

/**
 * GRE-style section adaptation: strong section → harder next block; weak → easier.
 * @param {number} accuracy 0–1
 * @param {DifficultyBand} currentDifficulty difficulty used for the section just completed
 */
export function nextSectionDifficulty(accuracy, currentDifficulty) {
  const idx = BAND_ORDER.indexOf(currentDifficulty)
  const i = idx >= 0 ? idx : 1
  if (accuracy >= 0.72) return BAND_ORDER[Math.min(2, i + 1)]
  if (accuracy <= 0.38) return BAND_ORDER[Math.max(0, i - 1)]
  return currentDifficulty
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {string[]} subjectOrder
 */
export function buildAdaptivePools(questions, subjectOrder) {
  /** @type {Record<string, { easy: import('../data/tests').Question[], medium: import('../data/tests').Question[], hard: import('../data/tests').Question[] }>} */
  const pools = {}
  for (const id of subjectOrder) {
    pools[id] = { easy: [], medium: [], hard: [] }
  }
  for (const q of questions) {
    const sub = q.subject
    if (!sub || !pools[sub]) continue
    const band = difficultyBand(q.toughnessLevel)
    pools[sub][band].push(q)
  }
  return pools
}

/**
 * @param {{ easy: import('../data/tests').Question[], medium: import('../data/tests').Question[], hard: import('../data/tests').Question[] }} bucket
 * @param {DifficultyBand} primary
 * @param {number} count
 * @param {Set<string>} excludeIds
 */
function drawFromBucket(bucket, primary, count, excludeIds) {
  const order = [
    primary,
    ...BAND_ORDER.filter((b) => b !== primary),
  ]
  const picked = []
  const used = new Set(excludeIds)
  for (const band of order) {
    const list = [...(bucket[band] ?? [])].sort(() => Math.random() - 0.5)
    for (const q of list) {
      if (picked.length >= count) break
      if (used.has(q.id)) continue
      picked.push(q)
      used.add(q.id)
    }
    if (picked.length >= count) break
  }
  return enforce_parent_child_exclusion(picked)
}

/**
 * @param {Record<string, { easy: import('../data/tests').Question[], medium: import('../data/tests').Question[], hard: import('../data/tests').Question[] }>} pools
 * @param {string} subjectId
 * @param {DifficultyBand} difficulty
 * @param {number} count
 * @param {Set<string>} excludeIds
 */
export function pickAdaptiveSectionQuestions(pools, subjectId, difficulty, count, excludeIds) {
  const bucket = pools[subjectId]
  if (!bucket) return []
  return drawFromBucket(bucket, difficulty, count, excludeIds)
}

/**
 * @param {SectionResult[]} sectionResults
 * @param {number} totalScore
 * @param {number} totalMax
 * @returns {StandingEstimate}
 */
export function estimateStudentStanding(sectionResults, totalScore, totalMax) {
  const overallAcc = totalMax > 0 ? totalScore / totalMax : 0
  const diffWeights = { easy: 1, medium: 2, hard: 3 }
  let weighted = 0
  let weightSum = 0
  /** @type {StandingEstimate['bySubject']} */
  const bySubject = {}

  for (const s of sectionResults) {
    const w = diffWeights[s.difficulty] ?? 2
    weighted += s.accuracy * w
    weightSum += w
    bySubject[s.subjectId] = {
      tier: tierFromAccuracy(s.accuracy, s.difficulty).tier,
      accuracy: Math.round(s.accuracy * 100),
      difficultyUsed: s.difficulty,
    }
  }

  const avgDiff = weightSum > 0 ? weighted / weightSum : overallAcc
  const levelScore = Math.round(
    Math.min(100, Math.max(0, overallAcc * 55 + avgDiff * 45)),
  )
  const standing = tierFromScore(levelScore)
  const last = sectionResults[sectionResults.length - 1]
  const recommendedDifficulty = last
    ? nextSectionDifficulty(last.accuracy, last.difficulty)
    : 'medium'

  return {
    tier: standing.tier,
    headline: standing.headline,
    summary: standing.summary,
    levelScore,
    recommendedDifficulty,
    bySubject,
  }
}

/** @param {number} accuracy @param {DifficultyBand} difficulty */
function tierFromAccuracy(accuracy, difficulty) {
  const boost = difficulty === 'hard' ? 8 : difficulty === 'easy' ? -6 : 0
  return tierFromScore(Math.round(accuracy * 100 + boost))
}

/** @param {number} levelScore */
function tierFromScore(levelScore) {
  if (levelScore >= 82) {
    return {
      tier: 'Exam ready',
      headline: 'You are performing at a strong mock-test level.',
      summary:
        'Accuracy and adaptive sections suggest you can handle standard and challenge blocks. Keep full-length mocks for stamina.',
    }
  }
  if (levelScore >= 65) {
    return {
      tier: 'Proficient',
      headline: 'Solid grasp — refine weak topics and speed.',
      summary:
        'You are above the midpoint on this calibrated paper. Push challenge sections after fixing recurring errors.',
    }
  }
  if (levelScore >= 45) {
    return {
      tier: 'Developing',
      headline: 'Building foundation — focus on medium-difficulty drills.',
      summary:
        'Mixed performance across sections. Repeat chapter proficiency tests on topics with low accuracy below.',
    }
  }
  return {
    tier: 'Foundation',
    headline: 'Strengthen basics before full mocks.',
    summary:
      'The system assigned easier blocks based on responses. Master fundamentals, then retake a calibrated paper.',
  }
}
