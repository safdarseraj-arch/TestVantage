/**
 * 1-click “practice only wrong questions” timed session from a Result attempt.
 * Saves into the practice-session map so /exam/practice-* resolves via getTestById.
 */

import { getAnswerableQuestions } from './passage.js'
import { loadDynamicTestMap, saveDynamicTestMap } from './dynamicTestStorage.js'

const PRACTICE_STORAGE_KEY = 'testvantage-practice-sessions'

/**
 * Collect wrong / partial question ids from a result.
 * @param {object} result
 * @returns {string[]}
 */
export function listWrongQuestionIds(result) {
  return (result?.perQuestion ?? [])
    .filter((pq) => pq.grade === 'wrong' || pq.grade === 'partial')
    .map((pq) => String(pq.questionId))
    .filter(Boolean)
}

/**
 * Include passage parents when a child is wrong.
 * @param {import('../data/tests').Question[]} allQuestions
 * @param {Set<string>} wrongIds
 */
function pickQuestionsWithPassages(allQuestions, wrongIds) {
  /** @type {import('../data/tests').Question[]} */
  const out = []
  const seen = new Set()

  for (const q of allQuestions) {
    const id = String(q.id)
    if (wrongIds.has(id)) {
      if (!seen.has(id)) {
        out.push(q)
        seen.add(id)
      }
      continue
    }
    const children = Array.isArray(q.questions) ? q.questions : []
    if (children.some((c) => wrongIds.has(String(c.id))) && !seen.has(id)) {
      out.push(q)
      seen.add(id)
    }
  }

  for (const q of getAnswerableQuestions(allQuestions)) {
    const id = String(q.id)
    if (wrongIds.has(id) && !seen.has(id)) {
      out.push(q)
      seen.add(id)
    }
  }
  return out
}

/**
 * Create a short timed retest of only missed questions from this paper.
 * @param {{
 *   test: import('../data/tests').Test
 *   result: object
 *   secondsPerQuestion?: number
 * }} opts
 * @returns {{ ok: true, test: import('../data/tests').Test, count: number } | { ok: false, error: string }}
 */
export function createMistakeOnlyRetest(opts) {
  const test = opts.test
  const result = opts.result
  if (!test?.questions?.length) {
    return { ok: false, error: 'This paper’s questions are not available to rebuild a retest.' }
  }
  const wrongIds = new Set(listWrongQuestionIds(result))
  if (!wrongIds.size) {
    return { ok: false, error: 'No wrong answers on this attempt — nothing to retest.' }
  }

  const picked = pickQuestionsWithPassages(test.questions, wrongIds)
  const answerable = getAnswerableQuestions(picked)
  if (!answerable.length) {
    return { ok: false, error: 'Could not load the missed questions for a retest.' }
  }

  const count = answerable.length
  const secEach = Math.max(45, Number(opts.secondsPerQuestion) || 90)
  const minutes = Math.max(5, Math.ceil((count * secEach) / 60))
  const id = `practice-mistake-${Date.now()}`

  /** @type {import('../data/tests').Test} */
  const session = {
    id,
    title: `Mistake retest — ${test.title}`,
    description: `Timed practice of ${count} question${count === 1 ? '' : 's'} you missed on this paper.`,
    examPatternId: test.examPatternId,
    testTypeId: 'practice',
    durationMinutes: minutes,
    totalQuestions: count,
    questions: picked,
    practiceMeta: {
      examPatternId: test.examPatternId,
      syllabus: { subjects: [], sections: [], chapters: [], topics: [] },
      sourcePoolSize: count,
      batchSize: count,
      usedBankIds: answerable.map((q) => q.id),
      batchesCompleted: 1,
      mistakeOnly: true,
      sourceTestId: test.id,
    },
    mistakeRetestMeta: {
      sourceTestId: test.id,
      wrongCount: wrongIds.size,
      createdAt: Date.now(),
    },
  }

  const map = loadDynamicTestMap(PRACTICE_STORAGE_KEY)
  map[id] = session
  saveDynamicTestMap(PRACTICE_STORAGE_KEY, map)

  return { ok: true, test: session, count }
}
