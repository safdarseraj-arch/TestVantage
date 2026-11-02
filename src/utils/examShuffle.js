/** Anti-cheat: per-student question order + MCQ option order (deterministic from test + student). */

import { dedupeQuestionsForExam } from './testQuestionClone.js'

/**
 * @typedef {{
 *   questionIds: string[]
 *   optionPerms: Record<string, number[]>
 *   enabled: boolean
 * }} ExamShuffleLayout
 */

/** @param {string} str */
export function hashStringToSeed(str) {
  let h = 2166136261
  const s = String(str ?? '')
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** @param {number} seed */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * @template T
 * @param {T[]} items
 * @param {number} seed
 */
export function seededShuffle(items, seed) {
  const rand = mulberry32(seed)
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

/** @param {import('../data/tests').Question} q */
export function questionOptionsAreShuffleable(q) {
  const type = q.questionType ?? 'single_correct'
  if (!['single_correct', 'multiple_correct', 'passage_scq'].includes(type)) return false
  const opts = (q.options ?? []).filter((o) => String(o ?? '').trim())
  if (opts.length < 2) return false
  if (q.optionsImage && !(q.optionImages ?? []).some((img) => String(img ?? '').trim())) {
    return false
  }
  return true
}

/**
 * @param {number} count
 * @param {number} seed
 */
export function buildOptionPermutation(count, seed) {
  const indices = Array.from({ length: count }, (_, i) => i)
  if (count < 2) return indices
  const shuffled = seededShuffle(indices, seed)
  if (shuffled.every((v, i) => v === i)) {
    ;[shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]]
  }
  return shuffled
}

/**
 * Group passage sub-questions so they stay together when shuffling.
 * @param {import('../data/tests').Question[]} questions
 */
export function buildShuffleUnits(questions) {
  /** @type {import('../data/tests').Question[][]} */
  const units = []
  const used = new Set()

  for (const q of questions) {
    if (used.has(q.id)) continue
    if (q.passageId) {
      const group = questions.filter((x) => x.passageId === q.passageId)
      group.forEach((g) => used.add(g.id))
      units.push(group)
    } else {
      used.add(q.id)
      units.push([q])
    }
  }
  return units
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {string} seedKey
 */
export function shuffleQuestionBatch(questions, seedKey) {
  const units = buildShuffleUnits(questions)
  const shuffledUnits = seededShuffle(units, hashStringToSeed(seedKey))
  const flat = shuffledUnits.flat()
  /** @type {Record<string, number[]>} */
  const optionPerms = {}
  for (const q of flat) {
    if (questionOptionsAreShuffleable(q)) {
      const n = (q.options ?? []).length
      optionPerms[q.id] = buildOptionPermutation(n, hashStringToSeed(`${seedKey}::opt::${q.id}`))
    }
  }
  return { questions: flat, optionPerms }
}

/**
 * @param {import('../data/tests').Test | { testTypeId?: string; antiCheatShuffle?: boolean }} test
 */
export function shouldShuffleExamForTest(test) {
  if (test?.testTypeId === 'practice') return false
  if (test?.antiCheatShuffle === false) return false
  return true
}

/**
 * @param {{
 *   testId: string
 *   ownerKey: string
 *   questions: import('../data/tests').Question[]
 *   sectionMode?: boolean
 *   sectionOrder?: string[]
 *   enabled?: boolean
 * }} opts
 * @returns {ExamShuffleLayout}
 */
export function buildExamShuffleLayout({
  testId,
  ownerKey,
  questions,
  sectionMode = false,
  sectionOrder = [],
  enabled = true,
}) {
  if (!enabled || !questions.length) {
    return {
      questionIds: questions.map((q) => q.id),
      optionPerms: {},
      enabled: false,
    }
  }

  const baseSeed = `${testId}::${ownerKey}`
  /** @type {import('../data/tests').Question[]} */
  let ordered = []
  /** @type {Record<string, number[]>} */
  const optionPerms = {}

  if (sectionMode && sectionOrder.length) {
    const seen = new Set()
    for (const sid of sectionOrder) {
      const sectionQs = questions.filter((q) => q.subject === sid)
      sectionQs.forEach((q) => seen.add(q.id))
      if (!sectionQs.length) continue
      const batch = shuffleQuestionBatch(sectionQs, `${baseSeed}::section::${sid}`)
      ordered.push(...batch.questions)
      Object.assign(optionPerms, batch.optionPerms)
    }
    const rest = questions.filter((q) => !seen.has(q.id))
    if (rest.length) {
      const batch = shuffleQuestionBatch(rest, `${baseSeed}::section::other`)
      ordered.push(...batch.questions)
      Object.assign(optionPerms, batch.optionPerms)
    }
  } else {
    const batch = shuffleQuestionBatch(questions, baseSeed)
    ordered = batch.questions
    Object.assign(optionPerms, batch.optionPerms)
  }

  return {
    questionIds: dedupeQuestionsForExam(ordered).map((q) => q.id),
    optionPerms,
    enabled: true,
  }
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {ExamShuffleLayout | null | undefined} layout
 */
export function applyExamQuestionOrder(questions, layout) {
  if (!layout?.enabled || !layout.questionIds?.length) {
    return dedupeQuestionsForExam(questions)
  }
  const byId = new Map(questions.map((q) => [q.id, q]))
  const used = new Set()
  /** @type {import('../data/tests').Question[]} */
  const ordered = []
  for (const id of layout.questionIds) {
    if (used.has(id)) continue
    const q = byId.get(id)
    if (!q) continue
    used.add(id)
    ordered.push(q)
  }
  const missing = questions.filter((q) => !used.has(q.id))
  return dedupeQuestionsForExam([...ordered, ...missing])
}

/**
 * Merge shuffle layout when adaptive sections add more questions.
 * @param {ExamShuffleLayout} layout
 * @param {import('../data/tests').Question[]} newQuestions
 * @param {string} seedKey
 */
export function extendExamShuffleLayout(layout, newQuestions, seedKey) {
  if (!layout.enabled || !newQuestions.length) return layout
  const batch = shuffleQuestionBatch(newQuestions, seedKey)
  return {
    enabled: true,
    questionIds: [...layout.questionIds, ...batch.questions.map((q) => q.id)],
    optionPerms: { ...layout.optionPerms, ...batch.optionPerms },
  }
}

/** @param {ExamShuffleLayout | null | undefined} layout @param {string} questionId */
export function getOptionPermForQuestion(layout, questionId) {
  return layout?.optionPerms?.[questionId] ?? null
}
