import { getExamPattern } from '../data/examPatterns.js'
import { getAnswerableQuestions } from './passage.js'
import { prepareQuestionsForTest } from './testQuestionClone.js'
import { loadPublishedUploadedQuestions } from './questionBank.js'
import { pickAiPracticeQuestions } from './aiSessionPick.js'
import { buildMasteryGraph } from './aiMastery.js'
import { getAttemptsByOwner, getOwnerKey } from './attemptHistory.js'
import { filterQuestionsForNonCdfUse } from './cdfOnlyQuestions.js'
import { buildPracticePickPoolAnswerable } from './practicePickPool.js'

export {
  collectPracticeSubjects,
  filterQuestionsByExam,
  filterQuestionsForPracticeSyllabusTree,
  filterQuestionsByPracticeSyllabus,
} from './practiceFilters.js'

/** @typedef {import('./syllabusMeta.js').SyllabusSelection} PracticeSyllabus */

import { loadDynamicTestMap, saveDynamicTestMap } from './dynamicTestStorage.js'

const STORAGE_KEY = 'testvantage-practice-sessions'

function loadSessions() {
  return loadDynamicTestMap(STORAGE_KEY)
}

function saveSessions(/** @type {Record<string, import('../data/tests').Test>} */ map) {
  saveDynamicTestMap(STORAGE_KEY, map)
}

/** @param {string} testId */
export function getPracticeTestById(testId) {
  if (!testId?.startsWith('practice-')) return null
  return loadSessions()[testId] ?? null
}

/** @param {import('../data/tests').Test} test */
export function updatePracticeSession(test) {
  if (!test?.id?.startsWith('practice-')) return
  const sessions = loadSessions()
  sessions[test.id] = test
  saveSessions(sessions)
}

/**
 * @param {import('../data/tests').Test} test
 */
export function countPracticePoolRemaining(test) {
  const meta = test?.practiceMeta
  if (!meta?.syllabus || !meta.examPatternId) return 0
  const bank = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())
  const pool = buildPracticePickPoolAnswerable(bank, meta.syllabus, meta.examPatternId, meta.bloomLevels)
  const used = new Set(meta.usedBankIds ?? [])
  return pool.filter((q) => !used.has(q.id)).length
}

/**
 * Pick the next practice batch and append to the session.
 * @param {string} testId
 * @param {{ userId?: string }} [opts]
 */
export function extendPracticeSession(testId, opts = {}) {
  const sessions = loadSessions()
  const test = sessions[testId]
  const meta = test?.practiceMeta
  if (!test || !meta?.syllabus || !meta.examPatternId) {
    return { ok: false, error: 'Practice session not found.' }
  }

  const bank = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())
  const pool = buildPracticePickPoolAnswerable(bank, meta.syllabus, meta.examPatternId, meta.bloomLevels)
  const used = new Set(meta.usedBankIds ?? [])
  const remaining = pool.filter((q) => !used.has(q.id))
  if (!remaining.length) {
    return { ok: false, error: 'No more questions in this syllabus.' }
  }

  const batchSize = Math.max(1, meta.batchSize ?? 10)
  const count = Math.min(batchSize, remaining.length)
  const attempts = getAttemptsByOwner(getOwnerKey(opts.userId))
  const masteryGraph = buildMasteryGraph(attempts)
  const { questions: picked, report: aiPickReport } = pickAiPracticeQuestions(remaining, count, {
    masteryGraph,
  })
  const prepared = prepareQuestionsForTest(bank, picked, `practice-q-${Date.now()}`)
  const added = getAnswerableQuestions(prepared)

  const updated = {
    ...test,
    questions: [...test.questions, ...prepared],
    totalQuestions: getAnswerableQuestions([...test.questions, ...prepared]).length,
    durationMinutes: test.durationMinutes + Math.max(5, Math.ceil(added.length * 2.5)),
    practiceMeta: {
      ...meta,
      usedBankIds: [...(meta.usedBankIds ?? []), ...picked.map((q) => q.id)],
      batchesCompleted: (meta.batchesCompleted ?? 1) + 1,
      aiPickReport,
    },
  }

  sessions[testId] = updated
  saveSessions(sessions)
  return { ok: true, test: updated, addedQuestions: prepared, addedCount: added.length }
}

/**
 * Preview AI practice pick without creating a session.
 * @param {import('../data/tests').Question[]} answerable
 * @param {number} count
 * @param {{ userId?: string }} [opts]
 */
export function previewAiPracticePick(answerable, count, opts = {}) {
  const attempts = getAttemptsByOwner(getOwnerKey(opts.userId))
  const masteryGraph = buildMasteryGraph(attempts)
  return pickAiPracticeQuestions(answerable, count, { masteryGraph })
}

/**
 * @param {{
 *   syllabus: PracticeSyllabus
 *   questionCount: number
 *   examPatternId?: string
 *   userId?: string
 * }} config
 */
export function createPracticeSession(config) {
  const bank = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())
  const examId = config.examPatternId
  if (!examId) throw new Error('Exam is required for practice.')
  const answerable = buildPracticePickPoolAnswerable(bank, config.syllabus, examId, config.bloomLevels)
  const count = Math.min(Math.max(1, config.questionCount), answerable.length)
  const attempts = getAttemptsByOwner(getOwnerKey(config.userId))
  const masteryGraph = buildMasteryGraph(attempts)
  const { questions: picked, report: aiPickReport } = pickAiPracticeQuestions(answerable, count, {
    masteryGraph,
  })
  const prepared = prepareQuestionsForTest(bank, picked, `practice-q-${Date.now()}`)

  const exam = getExamPattern(examId)
  const labelParts = [
    exam.shortName,
    config.syllabus.subjects.join(', '),
    config.syllabus.sections?.length ? config.syllabus.sections.join(', ') : null,
    config.syllabus.chapters.length ? config.syllabus.chapters.join(', ') : null,
    config.syllabus.topics.length ? config.syllabus.topics.join(', ') : null,
  ].filter(Boolean)

  const id = `practice-${Date.now()}`
  const minutes = Math.max(10, Math.ceil(prepared.length * 2.5))

  /** @type {import('../data/tests').Test} */
  const test = {
    id,
    title: `Practice — ${labelParts.join(' · ') || 'Syllabus'}`,
    description: `${exam.name} syllabus practice`,
    examPatternId: examId,
    testTypeId: 'practice',
    durationMinutes: minutes,
    totalQuestions: getAnswerableQuestions(prepared).length,
    questions: prepared,
    practiceMeta: {
      examPatternId: examId,
      syllabus: config.syllabus,
      sourcePoolSize: answerable.length,
      batchSize: count,
      usedBankIds: picked.map((q) => q.id),
      batchesCompleted: 1,
      aiPickReport,
      masteryOverall: masteryGraph.overallMastery,
      bloomLevels: config.bloomLevels ?? null,
    },
  }

  const sessions = loadSessions()
  sessions[id] = test
  saveSessions(sessions)
  return test
}
