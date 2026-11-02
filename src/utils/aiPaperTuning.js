/**
 * AI paper tuning — optimizes difficulty, syllabus spread, and TQS.
 * Runs multiple smart assemblies and picks the best candidate.
 */

import { getAllowedQuestionTypeIdsForExams } from '../data/examPatterns.js'
import { filterQuestionsBySyllabus } from './syllabusMeta.js'
import { effectiveQuestionTypeId, hierarchyFields } from './bankListFilters.js'
import { normalizeSlotTypeId, applySlotMarkingToQuestion } from './paperAssembly.js'
import { ensurePassageParentsIncluded } from './testQuestionClone.js'
import { enforce_parent_child_exclusion } from './parentChildExclusion.js'
import { getAnswerableQuestions } from './passage.js'
import { validateQuestionReadiness } from './questionReadiness.js'
import { computePaperQualityScore, analyzeDifficultyProfile } from './paperPublish.js'
import { isPyqLike } from './pyqDetect.js'
import { computePyqQuotaTargets, pyqSlotScoreAdjust, pyqQuotaReport, filterCandidatesForPyqQuota } from './pyqQuotaPick.js'
import { teacherPyqQuotaFromPercent } from './pyqTeacherPool.js'

/** @typedef {'balanced' | 'jee_main' | 'challenge' | 'revision' | 'pyq_focus'} AiTuneProfileId */

/** @type {Record<AiTuneProfileId, { label: string, description: string, toughnessTarget: number, difficultySpread: 'balanced' | 'target', diversityWeight: number, pyqWeight: number, readinessWeight: number }>} */
export const AI_TUNE_PROFILES = {
  balanced: {
    label: 'Balanced (recommended)',
    description: 'Mix of easy, medium, and hard — recommended default mock.',
    toughnessTarget: 5,
    difficultySpread: 'balanced',
    diversityWeight: 1,
    pyqWeight: 0.4,
    readinessWeight: 1.2,
  },
  jee_main: {
    label: 'JEE Main exam-like',
    description: 'Medium-heavy difficulty with wide chapter spread.',
    toughnessTarget: 6,
    difficultySpread: 'balanced',
    diversityWeight: 1.3,
    pyqWeight: 0.8,
    readinessWeight: 1.3,
  },
  challenge: {
    label: 'Challenge drill',
    description: 'Harder paper for toppers — toughness 7–9.',
    toughnessTarget: 8,
    difficultySpread: 'target',
    diversityWeight: 0.9,
    pyqWeight: 0.5,
    readinessWeight: 1.1,
  },
  revision: {
    label: 'Easy revision',
    description: 'Lighter paper for concept recap before exams.',
    toughnessTarget: 4,
    difficultySpread: 'balanced',
    diversityWeight: 1,
    pyqWeight: 0.2,
    readinessWeight: 1,
  },
  pyq_focus: {
    label: 'PYQ-style focus',
    description: 'Prefers previous-year tagged questions from your bank.',
    toughnessTarget: 6,
    difficultySpread: 'balanced',
    diversityWeight: 1,
    pyqWeight: 2.5,
    readinessWeight: 1.2,
  },
}

/**
 * @param {import('../data/tests').Question[]} answerable
 * @param {import('./syllabusMeta').SyllabusSelection} syllabus
 */
export function computeSyllabusCoverageScore(answerable, syllabus) {
  if (!syllabus?.chapters?.length) return 100
  const target = syllabus.chapters.map((c) => c.toLowerCase())
  const hit = new Set()
  for (const q of answerable) {
    const { chapter } = hierarchyFields(q)
    const c = String(chapter ?? '').toLowerCase()
    if (target.includes(c)) hit.add(c)
  }
  return Math.round((hit.size / target.length) * 100)
}

/**
 * @param {import('../data/tests').Question[]} answerable
 * @param {number} target
 */
export function computeDifficultyFitScore(answerable, target) {
  if (!answerable.length) return 0
  let sum = 0
  let n = 0
  for (const q of answerable) {
    const t = Number(q.toughnessLevel)
    if (!Number.isFinite(t)) continue
    n += 1
    sum += Math.max(0, 10 - Math.abs(t - target) * 1.5)
  }
  if (!n) return 50
  return Math.round((sum / n / 10) * 100)
}

/** @param {import('../data/tests').Question[]} answerable */
export function computeChapterDiversityScore(answerable) {
  if (answerable.length < 2) return 100
  const counts = new Map()
  for (const q of answerable) {
    const { chapter, section } = hierarchyFields(q)
    const key = String(chapter || section || q.subject || 'general').toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const maxRepeat = Math.max(...counts.values())
  const unique = counts.size
  const spread = Math.min(100, (unique / answerable.length) * 120)
  const repeatPenalty = maxRepeat > 2 ? (maxRepeat - 2) * 12 : 0
  return Math.max(0, Math.round(spread - repeatPenalty))
}

/** @param {import('../data/tests').Question} q */
function readinessPenalty(q) {
  const { ok, issues } = validateQuestionReadiness(q)
  if (ok && !issues.some((i) => i.severity === 'warn')) return 0
  const errs = issues.filter((i) => i.severity === 'error').length
  const warns = issues.filter((i) => i.severity === 'warn').length
  return errs * 40 + warns * 15
}

/**
 * @param {import('../data/tests').Question[]} pool
 * @param {import('../data/examPatterns').QuestionTypeSlot} slot
 * @param {Set<string>} usedIds
 * @param {Map<string, number>} chapterCounts
 * @param {{ toughnessTarget: number, difficultySpread: string, profile: typeof AI_TUNE_PROFILES.balanced, slotIndex: number, seed: number, pyqPicked?: number, pyqQuota?: { min: number, max: number } }} opts
 */
function pickForSlotAi(pool, slot, usedIds, chapterCounts, opts) {
  const count = slot.count || 0
  const batch = []
  const spread = opts.difficultySpread === 'balanced'
  let pyqPicked = opts.pyqPicked ?? 0
  const pyqQuota = opts.pyqQuota ?? { min: 0, max: 0 }

  for (let i = 0; i < count; i += 1) {
    const remaining = count - i
    const ideal = spread
      ? Math.max(1, Math.min(10, opts.toughnessTarget + [-2, 0, 2, -1, 1][i % 5]))
      : opts.toughnessTarget

    let candidates = pool.filter((q) => {
      if (usedIds.has(q.id)) return false
      const types = normalizeSlotTypeId(slot.questionTypeId)
      return types.includes(effectiveQuestionTypeId(q))
    })
    candidates = filterCandidatesForPyqQuota(candidates, pyqPicked, pyqQuota, remaining)
    if (!candidates.length) break

    const scored = candidates.map((q, ci) => {
      const t = Number(q.toughnessLevel)
      const dist = Number.isFinite(t) ? Math.abs(t - ideal) : 4
      const { chapter, section } = hierarchyFields(q)
      const chKey = String(chapter || section || 'x').toLowerCase()
      const repeat = chapterCounts.get(chKey) ?? 0
      const diversity = repeat * 6 * opts.profile.diversityWeight
      const ready = readinessPenalty(q) * opts.profile.readinessWeight
      const pyqBonus = pyqSlotScoreAdjust(q, pyqPicked, {
        min: pyqQuota.min,
        max: pyqQuota.max,
        pyqWeight: opts.profile.pyqWeight,
      })
      const rand = (((opts.seed * 17 + ci * 31 + i * 13) % 100) / 100) * 1.5
      return { q, score: dist * 8 + diversity + ready + pyqBonus + rand }
    })

    scored.sort((a, b) => a.score - b.score)
    const pick = scored[0]?.q
    if (!pick) break
    usedIds.add(pick.id)
    const { chapter, section } = hierarchyFields(pick)
    const chKey = String(chapter || section || 'x').toLowerCase()
    chapterCounts.set(chKey, (chapterCounts.get(chKey) ?? 0) + 1)
    batch.push(pick)
    if (isPyqLike(pick)) pyqPicked += 1
  }

  return { batch, pyqPicked }
}

/**
 * @param {import('../data/tests').Question[]} pool
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} slots
 * @param {import('./syllabusMeta').SyllabusSelection} syllabus
 * @param {{ profile: typeof AI_TUNE_PROFILES.balanced, examPatternId?: string, seed?: number, pyqPercent?: number }} opts
 */
function assembleWithProfile(pool, slots, syllabus, opts) {
  let filtered = filterQuestionsBySyllabus(pool, syllabus)
  if (opts.examPatternId) {
    const allowed = getAllowedQuestionTypeIdsForExams([opts.examPatternId])
    if (allowed?.length) {
      filtered = filtered.filter((q) => allowed.includes(effectiveQuestionTypeId(q)))
    }
  }

  const used = new Set()
  const chapterCounts = new Map()
  const picked = []
  const gaps = []
  const totalSlots = slots.reduce((n, s) => n + (s.count || 0), 0)
  const pyqAvailable = filtered.filter(isPyqLike).length
  const pyqQuota =
    opts.pyqPercent != null
      ? teacherPyqQuotaFromPercent(totalSlots, pyqAvailable, opts.pyqPercent)
      : computePyqQuotaTargets(totalSlots, pyqAvailable)
  let pyqPicked = 0

  for (const slot of slots) {
    if (!slot.count) continue
    const { batch, pyqPicked: nextPyq } = pickForSlotAi(filtered, slot, used, chapterCounts, {
      toughnessTarget: opts.profile.toughnessTarget,
      difficultySpread: opts.profile.difficultySpread,
      profile: opts.profile,
      slotIndex: picked.length,
      seed: opts.seed ?? 0,
      pyqPicked,
      pyqQuota,
    })
    pyqPicked = nextPyq
    batch.forEach((q) => {
      used.add(q.id)
      picked.push(applySlotMarkingToQuestion(q, slot))
    })
    if (batch.length < slot.count) {
      gaps.push({ slot, short: slot.count - batch.length })
    }
  }

  const withParents = ensurePassageParentsIncluded([...pool, ...picked], picked)
  const answerable = getAnswerableQuestions(
    withParents.map((q) => picked.find((p) => p.id === q.id) ?? q),
  )
  const pyqMeta = pyqQuotaReport(answerable, answerable.length, pyqAvailable)
  const questions = enforce_parent_child_exclusion(
    withParents.map((q) => picked.find((p) => p.id === q.id) ?? q),
  )
  return {
    questions,
    gaps,
    pyqMeta,
  }
}

/**
 * @param {import('../data/tests').Question[]} answerable
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} slots
 * @param {typeof AI_TUNE_PROFILES.balanced} profile
 * @param {import('./syllabusMeta').SyllabusSelection} syllabus
 */
export function scoreTunedPaper(answerable, slots, profile, syllabus) {
  const tqs = computePaperQualityScore(answerable, slots)
  const coverage = computeSyllabusCoverageScore(answerable, syllabus)
  const difficultyFit = computeDifficultyFitScore(answerable, profile.toughnessTarget)
  const diversity = computeChapterDiversityScore(answerable)
  const aiScore = Math.round(tqs * 0.42 + coverage * 0.22 + difficultyFit * 0.22 + diversity * 0.14)
  return { tqs, coverage, difficultyFit, diversity, aiScore }
}

/**
 * @param {{
 *   result: { tqs: number, coverage: number, difficultyFit: number, diversity: number, aiScore: number }
 *   profileId: AiTuneProfileId
 *   difficulty: ReturnType<typeof analyzeDifficultyProfile>
 *   gaps: { slot: import('../data/examPatterns').QuestionTypeSlot, short: number }[]
 * }} data
 */
export function buildAiTuneSuggestions(data) {
  /** @type {string[]} */
  const tips = []
  if (data.gaps?.length) {
    for (const g of data.gaps) {
      tips.push(`Upload ${g.short} more ${g.slot.questionTypeId} question(s) in Question Bank.`)
    }
  }
  if (data.result.coverage < 70) {
    tips.push('Add questions for more syllabus chapters to improve coverage.')
  }
  if (data.result.tqs < 75) {
    tips.push('Fix incomplete options or answer keys in Question Bank before publishing.')
  }
  if (data.difficulty.buckets.unknown > 2) {
    tips.push('Tag toughness level (1–10) on more bank questions for sharper AI tuning.')
  }
  if (data.result.aiScore >= 80) {
    tips.push('Paper looks strong — proceed to Review & publish.')
  }
  return tips
}

/**
 * AI tune: try many assemblies, return best paper + report.
 * @param {import('../data/tests').Question[]} pool
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} slots
 * @param {import('./syllabusMeta').SyllabusSelection} syllabus
 * @param {{ profileId?: AiTuneProfileId, examPatternId?: string, attempts?: number, toughnessTarget?: number, pyqPercent?: number }} [opts]
 */
export function aiTunePaper(pool, slots, syllabus, opts = {}) {
  const profileId = opts.profileId ?? 'balanced'
  const baseProfile = AI_TUNE_PROFILES[profileId] ?? AI_TUNE_PROFILES.balanced
  const profile = {
    ...baseProfile,
    toughnessTarget: opts.toughnessTarget ?? baseProfile.toughnessTarget,
  }
  const attempts = opts.attempts ?? 16

  /** @type {{ questions: import('../data/tests').Question[], gaps: { slot: import('../data/examPatterns').QuestionTypeSlot, short: number }[], tuneReport: object } | null} */
  let best = null
  let bestAi = -1

  for (let seed = 0; seed < attempts; seed += 1) {
    const { questions, gaps, pyqMeta } = assembleWithProfile(pool, slots, syllabus, {
      profile,
      examPatternId: opts.examPatternId,
      seed,
      pyqPercent: opts.pyqPercent,
    })
    const answerable = getAnswerableQuestions(questions)
    const result = scoreTunedPaper(answerable, slots, profile, syllabus)
    const difficulty = analyzeDifficultyProfile(answerable)
    const pyqBonus = pyqMeta?.pyqQuotaMet ? 3 : pyqMeta?.pyqAvailable ? -4 : 0
    const aiScoreAdj = Math.min(100, Math.max(0, result.aiScore + pyqBonus))

    if (aiScoreAdj > bestAi || (aiScoreAdj === bestAi && gaps.length < (best?.gaps?.length ?? 99))) {
      bestAi = aiScoreAdj
      best = {
        questions,
        gaps,
        tuneReport: {
          profileId,
          profileLabel: profile.label,
          ...result,
          aiScore: aiScoreAdj,
          difficulty,
          attemptsRun: seed + 1,
          pyqMix: pyqMeta,
          suggestions: buildAiTuneSuggestions({ result, profileId, difficulty, gaps }),
        },
      }
    }
  }

  if (!best) {
    const fallback = assembleWithProfile(pool, slots, syllabus, { profile, examPatternId: opts.examPatternId, seed: 0 })
    const answerable = getAnswerableQuestions(fallback.questions)
    const result = scoreTunedPaper(answerable, slots, profile, syllabus)
    return {
      ...fallback,
      tuneReport: {
        profileId,
        profileLabel: profile.label,
        ...result,
        difficulty: analyzeDifficultyProfile(answerable),
        attemptsRun: 1,
        suggestions: buildAiTuneSuggestions({
          result,
          profileId,
          difficulty: analyzeDifficultyProfile(answerable),
          gaps: fallback.gaps,
        }),
      },
    }
  }

  return best
}
