/**
 * AI session pick — smart question selection for calibrated papers and practice.
 * Scores readiness, difficulty fit, and chapter diversity (local, no cloud API).
 */

import { hierarchyFields } from './bankListFilters.js'
import { validateQuestionReadiness } from './questionReadiness.js'
import { computeChapterDiversityScore, computeDifficultyFitScore } from './aiPaperTuning.js'
import { masteryPickBonus, recommendedToughnessFromMastery } from './aiMastery.js'
import { getEffectiveQuestionToughness } from './itemResponseStats.js'
import { isPyqLike, countPyqQuestions } from './pyqDetect.js'
import { computePyqQuotaTargets, pyqSlotScoreAdjust, pyqQuotaReport, filterCandidatesForPyqQuota } from './pyqQuotaPick.js'
import {
  filterCandidatesExcludingFamilies,
  markQuestionFamilyUsed,
} from './questionFamily.js'
import { enforce_parent_child_exclusion } from './parentChildExclusion.js'

/** @typedef {'easy' | 'medium' | 'hard'} DifficultyBand */

/** @returns {DifficultyBand[]} */
function getBandOrder() {
  return ['easy', 'medium', 'hard']
}

/** @param {import('../data/tests').Question} q */
function readinessPenalty(q) {
  const { ok, issues } = validateQuestionReadiness(q)
  if (ok && !issues.some((i) => i.severity === 'warn')) return 0
  const errs = issues.filter((i) => i.severity === 'error').length
  const warns = issues.filter((i) => i.severity === 'warn').length
  return errs * 40 + warns * 12
}

/** @param {DifficultyBand} band */
function idealToughnessForBand(band) {
  if (band === 'easy') return 2.5
  if (band === 'hard') return 8
  return 5
}

/**
 * @param {import('../data/tests').Question} q
 * @param {{ band: DifficultyBand, chapterCounts: Map<string, number>, pickIndex: number, seed: number, ci: number, toughnessTarget?: number, masteryGraph?: import('./aiMastery.js').MasteryGraph | null }} ctx
 */
function scoreQuestionForPick(q, ctx) {
  const ideal = ctx.toughnessTarget ?? idealToughnessForBand(ctx.band)
  const t = getEffectiveQuestionToughness(q)
  const dist = Number.isFinite(t) ? Math.abs(t - ideal) : 3.5
  const { chapter, section } = hierarchyFields(q)
  const chKey = String(chapter || section || q.subject || 'general').toLowerCase()
  const repeat = ctx.chapterCounts.get(chKey) ?? 0
  const diversity = repeat * 7
  const ready = readinessPenalty(q)
  const mastery = masteryPickBonus(q, ctx.masteryGraph ?? null)
  const rand = (((ctx.seed * 17 + ctx.ci * 31 + ctx.pickIndex * 13) % 100) / 100) * 1.8
  return dist * 6 + diversity + ready - mastery + rand
}

/**
 * @param {import('../data/tests').Question[]} picked
 * @param {DifficultyBand} difficulty
 */
function scoreSectionQuality(picked, difficulty) {
  if (!picked.length) return 0
  const target = idealToughnessForBand(difficulty)
  const difficultyFit = computeDifficultyFitScore(picked, target)
  const diversity = computeChapterDiversityScore(picked)
  let readySum = 0
  for (const q of picked) {
    readySum += Math.max(0, 100 - readinessPenalty(q))
  }
  const readiness = Math.round(readySum / picked.length)
  return Math.round(difficultyFit * 0.35 + diversity * 0.3 + readiness * 0.35)
}

/**
 * One greedy AI pick for an adaptive section.
 * @param {Record<string, { easy: import('../data/tests').Question[], medium: import('../data/tests').Question[], hard: import('../data/tests').Question[] }>} pools
 * @param {string} subjectId
 * @param {DifficultyBand} difficulty
 * @param {number} count
 * @param {Set<string>} excludeIds
 * @param {number} seed
 */
function pickAdaptiveSectionAttempt(pools, subjectId, difficulty, count, excludeIds, seed) {
  const bucket = pools[subjectId]
  if (!bucket) return []

  const order = [difficulty, ...getBandOrder().filter((b) => b !== difficulty)]
  /** @type {import('../data/tests').Question[]} */
  const picked = []
  const used = new Set(excludeIds)
  const usedFamilies = new Set()
  const chapterCounts = new Map()

  for (const band of order) {
    const list = bucket[band] ?? []
    while (picked.length < count) {
      let candidates = list.filter((q) => !used.has(q.id))
      candidates = filterCandidatesExcludingFamilies(candidates, usedFamilies)
      if (!candidates.length) break

      const scored = candidates.map((q, ci) => ({
        q,
        score: scoreQuestionForPick(q, {
          band,
          chapterCounts,
          pickIndex: picked.length,
          seed,
          ci,
        }),
      }))
      scored.sort((a, b) => a.score - b.score)
      const pick = scored[0]?.q
      if (!pick) break

      picked.push(pick)
      used.add(pick.id)
      markQuestionFamilyUsed(usedFamilies, pick)
      const { chapter, section } = hierarchyFields(pick)
      const chKey = String(chapter || section || pick.subject || 'general').toLowerCase()
      chapterCounts.set(chKey, (chapterCounts.get(chKey) ?? 0) + 1)
    }
    if (picked.length >= count) break
  }

  return enforce_parent_child_exclusion(picked)
}

/**
 * AI-scored adaptive section pick (replaces random shuffle in adaptiveTest).
 * @param {Record<string, { easy: import('../data/tests').Question[], medium: import('../data/tests').Question[], hard: import('../data/tests').Question[] }>} pools
 * @param {string} subjectId
 * @param {DifficultyBand} difficulty
 * @param {number} count
 * @param {Set<string>} excludeIds
 * @param {{ attempts?: number }} [opts]
 */
export function pickAiAdaptiveSectionQuestions(pools, subjectId, difficulty, count, excludeIds, opts = {}) {
  const attempts = opts.attempts ?? 10
  /** @type {import('../data/tests').Question[] | null} */
  let best = null
  let bestScore = -1

  for (let seed = 0; seed < attempts; seed += 1) {
    const picked = pickAdaptiveSectionAttempt(pools, subjectId, difficulty, count, excludeIds, seed)
    const quality = scoreSectionQuality(picked, difficulty)
    const lenBonus = picked.length * 0.01
    const total = quality + lenBonus
    if (
      total > bestScore ||
      (total === bestScore && picked.length > (best?.length ?? 0))
    ) {
      bestScore = total
      best = picked
    }
  }

  return best ?? pickAdaptiveSectionAttempt(pools, subjectId, difficulty, count, excludeIds, 0)
}

/**
 * @param {import('../data/tests').Question[]} picked
 * @param {number} [toughnessTarget]
 * @param {import('./aiMastery.js').MasteryGraph | null} [masteryGraph]
 */
export function scorePracticePick(picked, toughnessTarget = 5, masteryGraph = null) {
  if (!picked.length) {
    return { aiScore: 0, readiness: 0, diversity: 0, difficultyFit: 0 }
  }
  const difficultyFit = computeDifficultyFitScore(picked, toughnessTarget)
  const diversity = computeChapterDiversityScore(picked)
  let readySum = 0
  for (const q of picked) {
    readySum += Math.max(0, 100 - readinessPenalty(q))
  }
  const readiness = Math.round(readySum / picked.length)
  let masteryBoost = 0
  if (masteryGraph) {
    for (const q of picked) {
      masteryBoost += masteryPickBonus(q, masteryGraph)
    }
    masteryBoost = Math.min(15, Math.round(masteryBoost / picked.length))
  }
  const aiScore = Math.round(
    difficultyFit * 0.32 + diversity * 0.33 + readiness * 0.35 + masteryBoost,
  )
  return { aiScore, readiness, diversity, difficultyFit, masteryBoost }
}

/**
 * @param {import('../data/tests').Question[]} pool
 * @param {number} count
 * @param {number} seed
 * @param {number} toughnessTarget
 * @param {import('./aiMastery.js').MasteryGraph | null} [masteryGraph]
 */
function pickPracticeAttempt(pool, count, seed, toughnessTarget, masteryGraph = null) {
  /** @type {import('../data/tests').Question[]} */
  const picked = []
  const used = new Set()
  const usedFamilies = new Set()
  const chapterCounts = new Map()
  const pyqAvailable = countPyqQuestions(pool)
  const pyqQuota = computePyqQuotaTargets(count, pyqAvailable)
  let pyqPicked = 0

  for (let i = 0; i < count; i += 1) {
    const remaining = count - i
    let candidates = pool.filter((q) => !used.has(q.id))
    candidates = filterCandidatesForPyqQuota(candidates, pyqPicked, pyqQuota, remaining)
    candidates = filterCandidatesExcludingFamilies(candidates, usedFamilies)
    if (!candidates.length) break

    const scored = candidates.map((q, ci) => ({
      q,
      score:
        scoreQuestionForPick(q, {
          band: 'medium',
          chapterCounts,
          pickIndex: i,
          seed,
          ci,
          toughnessTarget,
          masteryGraph,
        }) +
        pyqSlotScoreAdjust(q, pyqPicked, { min: pyqQuota.min, max: pyqQuota.max }),
    }))
    scored.sort((a, b) => a.score - b.score)
    const pick = scored[0]?.q
    if (!pick) break

    picked.push(pick)
    used.add(pick.id)
    markQuestionFamilyUsed(usedFamilies, pick)
    if (isPyqLike(pick)) pyqPicked += 1
    const { chapter, section } = hierarchyFields(pick)
    const chKey = String(chapter || section || pick.subject || 'general').toLowerCase()
    chapterCounts.set(chKey, (chapterCounts.get(chKey) ?? 0) + 1)
  }

  return enforce_parent_child_exclusion(picked)
}

/**
 * AI pick for practice sessions — balanced difficulty, chapter spread, readiness.
 * @param {import('../data/tests').Question[]} pool
 * @param {number} count
 * @param {{ attempts?: number, toughnessTarget?: number, masteryGraph?: import('./aiMastery.js').MasteryGraph | null }} [opts]
 */
export function pickAiPracticeQuestions(pool, count, opts = {}) {
  const attempts = opts.attempts ?? 12
  const masteryGraph = opts.masteryGraph ?? null
  const toughnessTarget =
    opts.toughnessTarget ??
    (masteryGraph ? recommendedToughnessFromMastery(masteryGraph) : 5)
  const want = Math.min(Math.max(1, count), pool.length)

  /** @type {import('../data/tests').Question[] | null} */
  let best = null
  /** @type {ReturnType<typeof scorePracticePick> | null} */
  let bestReport = null
  let bestScore = -1

  for (let seed = 0; seed < attempts; seed += 1) {
    const picked = pickPracticeAttempt(pool, want, seed, toughnessTarget, masteryGraph)
    const report = scorePracticePick(picked, toughnessTarget, masteryGraph)
    if (report.aiScore > bestScore || (report.aiScore === bestScore && picked.length > (best?.length ?? 0))) {
      bestScore = report.aiScore
      best = picked
      bestReport = report
    }
  }

  const questions = enforce_parent_child_exclusion(best ?? pool.slice(0, want))
  const report = bestReport ?? scorePracticePick(questions, toughnessTarget, masteryGraph)
  const pyqAvailable = countPyqQuestions(pool)
  const pyqMix = pyqQuotaReport(questions, questions.length, pyqAvailable)
  const pyqNote = pyqMix.pyqAvailable && pyqMix.pyqMin ? ` · ${pyqMix.pyqSummary}` : ''
  return {
    questions,
    report: {
      ...report,
      toughnessTarget,
      masteryAware: !!masteryGraph,
      pyqMix,
      summary: masteryGraph
        ? `AI smart pick — score ${report.aiScore}/100 · targets weak chapters · toughness ~${toughnessTarget}${pyqNote}`
        : `AI practice pick — score ${report.aiScore}/100 · mixed chapters · toughness ~${toughnessTarget}${pyqNote}`,
    },
  }
}

/**
 * @param {import('../data/tests').Question[]} picked
 * @param {DifficultyBand} difficulty
 * @param {number} [attemptsRun]
 */
export function buildAiSectionPickReport(picked, difficulty, attemptsRun = 10) {
  const quality = scoreSectionQuality(picked, difficulty)
  return {
    mode: 'calibrated',
    aiScore: quality,
    difficulty,
    questionCount: picked.length,
    attemptsRun,
    summary: `AI picked ${picked.length} ready question(s) for ${difficulty} section (score ${quality}/100).`,
  }
}

/**
 * Pick one next item targeting the student's live ability (GRE-style item-level CAT).
 * @param {Record<string, { easy: import('../data/tests').Question[], medium: import('../data/tests').Question[], hard: import('../data/tests').Question[] }>} pools
 * @param {string} subjectId
 * @param {number} ability 1–10 live ability estimate
 * @param {Set<string>} excludeIds bank ids already used
 * @param {Map<string, number>} [chapterCounts]
 */
export function pickNextAiItemByAbility(pools, subjectId, ability, excludeIds, chapterCounts = new Map()) {
  const bucket = pools[subjectId]
  if (!bucket) return null

  const band = ability <= 3.5 ? 'easy' : ability >= 7 ? 'hard' : 'medium'
  /** @type {import('../data/tests').Question[]} */
  const candidates = []
  for (const b of getBandOrder()) {
    for (const q of bucket[b] ?? []) {
      if (!excludeIds.has(q.id)) candidates.push(q)
    }
  }
  if (!candidates.length) return null

  const seed = Math.round(ability * 10)
  const scored = candidates.map((q, ci) => ({
    q,
    score: scoreQuestionForPick(q, {
      band,
      chapterCounts,
      pickIndex: chapterCounts.size,
      seed,
      ci,
      toughnessTarget: ability,
    }),
  }))
  scored.sort((a, b) => a.score - b.score)
  return scored[0]?.q ?? null
}
