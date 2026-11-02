import { getEffectiveQuestionToughness } from './itemResponseStats.js'

/**
 * Item-level adaptive engine (GRE-style computer-adaptive testing).
 * Uses calibrated item difficulty when enough response data exists.
 */

/** @typedef {'correct' | 'partial' | 'wrong' | 'unattempted'} ItemGrade */
/** @typedef {{ questionId: string, subjectId: string, grade: ItemGrade, abilityAfter: number, toughness?: number }} AdaptiveItemRecord */

export const DEFAULT_ABILITY = 5

/** @param {string[]} subjectOrder */
export function initAbilityBySubject(subjectOrder) {
  /** @type {Record<string, number>} */
  const abilityBySubject = {}
  for (const id of subjectOrder) {
    abilityBySubject[id] = DEFAULT_ABILITY
  }
  return abilityBySubject
}

/** @param {number} ability */
export function clampAbility(ability) {
  return Math.min(10, Math.max(1, Math.round(ability * 100) / 100))
}

/**
 * @param {number} ability 1–10
 * @param {import('../data/tests').Question} question
 * @param {ItemGrade} grade
 */
export function updateAbilityAfterItem(ability, question, grade) {
  const toughness = getEffectiveQuestionToughness(question)
  const lr = 0.38

  if (grade === 'correct') {
    return clampAbility(ability + lr * (Math.max(toughness, ability) - ability + 0.4))
  }
  if (grade === 'partial') {
    return clampAbility(ability + lr * 0.2 * (toughness - ability))
  }
  if (grade === 'wrong') {
    return clampAbility(ability - lr * (ability - Math.min(toughness, ability) + 0.4))
  }
  return clampAbility(ability + (DEFAULT_ABILITY - ability) * 0.1)
}

/** @param {number} ability */
export function abilityToLevelScore(ability) {
  return Math.round(((clampAbility(ability) - 1) / 9) * 100)
}

/** @param {number} levelScore */
function tierFromLevelScore(levelScore) {
  if (levelScore >= 82) {
    return {
      tier: 'Exam ready',
      headline: 'AI estimates you are at a strong mock-test level.',
      summary:
        'Your responses on calibrated items suggest you can handle standard and challenge questions. Keep full-length mocks for stamina.',
    }
  }
  if (levelScore >= 65) {
    return {
      tier: 'Proficient',
      headline: 'Solid grasp — AI is pushing slightly harder items.',
      summary:
        'You are above midpoint on this calibrated paper. Fix recurring errors on harder blocks.',
    }
  }
  if (levelScore >= 45) {
    return {
      tier: 'Developing',
      headline: 'Building foundation — AI is calibrating difficulty.',
      summary:
        'Mixed performance so far. The system adjusts each next question to find your true level.',
    }
  }
  return {
    tier: 'Foundation',
    headline: 'Strengthen basics — AI assigned easier items.',
    summary:
      'Responses suggest fundamentals need work. Master core concepts, then retake a calibrated paper.',
  }
}

/**
 * Live standing from in-section ability (before any section is submitted).
 * @param {number} ability
 * @param {AdaptiveItemRecord[]} [itemHistory]
 */
export function standingFromLiveAbility(ability, itemHistory = []) {
  const levelScore = abilityToLevelScore(ability)
  const standing = tierFromLevelScore(levelScore)
  const answered = itemHistory.filter((i) => i.grade !== 'unattempted')
  const correct = itemHistory.filter((i) => i.grade === 'correct').length
  const acc = answered.length ? Math.round((correct / answered.length) * 100) : 0

  return {
    tier: standing.tier,
    headline: standing.headline,
    summary: standing.summary,
    levelScore,
    recommendedDifficulty: ability >= 7 ? 'hard' : ability <= 3.5 ? 'easy' : 'medium',
    bySubject: {},
    itemsAnswered: answered.length,
    liveAccuracy: acc,
  }
}

/**
 * Blend completed sections with live in-section ability.
 * @param {import('./adaptiveTest.js').StandingEstimate} sectionStanding
 * @param {number} liveAbility
 */
export function blendStandingWithLiveAbility(sectionStanding, liveAbility) {
  const liveScore = abilityToLevelScore(liveAbility)
  const levelScore = Math.round(sectionStanding.levelScore * 0.55 + liveScore * 0.45)
  const standing = tierFromLevelScore(levelScore)
  return {
    ...sectionStanding,
    tier: standing.tier,
    headline: standing.headline,
    summary: standing.summary,
    levelScore,
    recommendedDifficulty:
      liveAbility >= 7 ? 'hard' : liveAbility <= 3.5 ? 'easy' : sectionStanding.recommendedDifficulty,
  }
}

/**
 * Seed ability for the next subject after a section completes.
 * @param {number} sectionAbility ability at end of completed section
 * @param {number} sectionAccuracy 0–1
 * @param {import('./adaptiveTest.js').DifficultyBand} nextDifficulty
 */
export function abilityForNextSubject(sectionAbility, sectionAccuracy, nextDifficulty) {
  const accBoost = sectionAccuracy * 10
  const diffShift = nextDifficulty === 'hard' ? 0.8 : nextDifficulty === 'easy' ? -0.8 : 0
  return clampAbility(sectionAbility * 0.55 + accBoost * 0.35 + diffShift + DEFAULT_ABILITY * 0.1)
}

/** @param {import('../data/tests').Question[]} questions @param {string} subjectId */
export function chapterCountsForSubject(questions, subjectId) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const q of questions) {
    if (q.subject !== subjectId) continue
    const ch = String(q.chapter || q.section || q.subject || 'general').toLowerCase()
    counts.set(ch, (counts.get(ch) ?? 0) + 1)
  }
  return counts
}
