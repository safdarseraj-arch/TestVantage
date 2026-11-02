import { evaluateTest } from './scoring.js'
import {
  estimateStudentStanding,
  enrichPoolToughness,
} from './adaptiveTest.js'
import { chapterCountsForSubject } from './aiAdaptiveEngine.js'
import { calibratedSectionQuota } from './calibratedPaperPlan.js'
import { pickAiAdaptiveSectionQuestions, pickNextAiItemByAbility } from './aiSessionPick.js'
import { cloneQuestionsForTest, ensurePassageParentsIncluded } from './testQuestionClone.js'
import { enforce_parent_child_exclusion } from './parentChildExclusion.js'

export { enrichPoolToughness }

/**
 * @param {import('../data/tests').Test} test
 * @param {import('../data/tests').Question} question
 * @param {unknown} answer
 * @returns {import('./aiAdaptiveEngine.js').ItemGrade}
 */
export function gradeCalibratedItem(test, question, answer) {
  const partial = evaluateTest(
    { ...test, questions: [question] },
    { [question.id]: answer },
    { answerableOnly: false },
  )
  const row = partial.perQuestion.find((p) => p.questionId === question.id)
  return row?.grade ?? 'unattempted'
}

/**
 * @param {import('../data/tests').Test} test
 * @param {import('../data/tests').Question[]} sectionQuestions
 * @param {Record<string, unknown>} answers
 * @param {{ marked?: string[], questionTimes?: Record<string, number> }} [opts]
 */
export function evaluateCalibratedSection(test, sectionQuestions, answers, opts = {}) {
  const partial = evaluateTest(
    { ...test, questions: sectionQuestions },
    answers,
    {
      answerableOnly: false,
      marked: opts.marked,
      questionTimes: opts.questionTimes,
    },
  )
  const subjectId = sectionQuestions[0]?.subject ?? ''
  const maxScore = partial.maxScore
  const score = partial.score
  return {
    subjectId,
    correct: partial.correct,
    total: sectionQuestions.length,
    accuracy: maxScore > 0 ? score / maxScore : 0,
    maxScore,
    score,
  }
}

/**
 * Deliver one or more adaptive items for a subject (item-level CAT).
 * @param {NonNullable<import('../data/tests').Test['calibratedMeta']>} meta
 * @param {string} testId
 * @param {string} subjectId
 * @param {number} ability live ability 1–10
 * @param {import('../data/tests').Question[]} [deliveredQuestions] already delivered (for chapter spread)
 * @param {number} [count]
 */
export function deliverCalibratedItems(
  meta,
  testId,
  subjectId,
  ability,
  deliveredQuestions = [],
  count = 1,
) {
  const exclude = new Set(meta.deliveredBankIds ?? [])
  const chapterCounts = chapterCountsForSubject(
    deliveredQuestions.filter((q) => q.subject === subjectId),
    subjectId,
  )
  /** @type {import('../data/tests').Question[]} */
  const picked = []

  for (let i = 0; i < count; i += 1) {
    const q = pickNextAiItemByAbility(meta.pools, subjectId, ability, exclude, chapterCounts)
    if (!q) break
    picked.push(q)
    exclude.add(q.id)
    const ch = String(q.chapter || q.section || q.subject || 'general').toLowerCase()
    chapterCounts.set(ch, (chapterCounts.get(ch) ?? 0) + 1)
  }

  if (!picked.length) {
    return { questions: [], deliveredIds: meta.deliveredIds, deliveredBankIds: meta.deliveredBankIds ?? [] }
  }

  const pool = meta.sourcePool ?? []
  const filtered = enforce_parent_child_exclusion(picked)
  const withParents = ensurePassageParentsIncluded([...pool, ...filtered], filtered)
  const stamped = cloneQuestionsForTest(withParents, `${testId}-q`, meta.deliveredIds.length)
  const deliveredBankIds = [...(meta.deliveredBankIds ?? []), ...filtered.map((q) => q.id)]
  const deliveredIds = [...meta.deliveredIds, ...stamped.map((q) => q.id)]
  const sectionItemsDelivered = {
    ...(meta.sectionItemsDelivered ?? {}),
    [subjectId]: (meta.sectionItemsDelivered?.[subjectId] ?? 0) + stamped.length,
  }

  return { questions: stamped, deliveredIds, deliveredBankIds, sectionItemsDelivered }
}

/**
 * Legacy batch pick for full section (fallback if item pool exhausted).
 * @param {NonNullable<import('../data/tests').Test['calibratedMeta']>} meta
 * @param {string} testId
 * @param {string} subjectId
 * @param {import('./adaptiveTest.js').DifficultyBand} difficulty
 */
export function pickNextCalibratedSection(meta, testId, subjectId, difficulty) {
  const quota = calibratedSectionQuota(meta, subjectId)
  const remaining =
    quota - (meta.sectionItemsDelivered?.[subjectId] ?? 0)
  if (meta.adaptiveMode === 'item' && remaining > 0) {
    const ability = meta.abilityBySubject?.[subjectId] ?? 5
    return deliverCalibratedItems(meta, testId, subjectId, ability, [], Math.min(1, remaining))
  }

  const picked = pickAiAdaptiveSectionQuestions(
    meta.pools,
    subjectId,
    difficulty,
    quota,
    new Set(meta.deliveredBankIds ?? meta.deliveredIds ?? []),
  )
  const pool = meta.sourcePool ?? []
  const filtered = enforce_parent_child_exclusion(picked)
  const withParents = ensurePassageParentsIncluded([...pool, ...filtered], filtered)
  const stamped = cloneQuestionsForTest(withParents, `${testId}-q`, meta.deliveredIds.length)
  const deliveredBankIds = [...(meta.deliveredBankIds ?? []), ...filtered.map((q) => q.id)]
  const deliveredIds = [...meta.deliveredIds, ...stamped.map((q) => q.id)]
  return { questions: stamped, deliveredIds, deliveredBankIds }
}

/**
 * @param {import('./adaptiveTest.js').SectionResult[]} sectionResults
 */
export function standingFromSections(sectionResults) {
  const totalScore = sectionResults.reduce((s, r) => s + r.score, 0)
  const totalMax = sectionResults.reduce((s, r) => s + r.maxScore, 0)
  return estimateStudentStanding(sectionResults, totalScore, totalMax)
}
