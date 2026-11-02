/**
 * PYQ study sessions — syllabus practice & timed PYQ mocks from catalog only.
 */

import { getExamPattern } from '../data/examPatterns.js'
import { getAnswerableQuestions } from './passage.js'
import { prepareQuestionsForTest } from './testQuestionClone.js'
import { buildMasteryGraph } from './aiMastery.js'
import { getAttemptsByOwner, getOwnerKey } from './attemptHistory.js'
import {
  buildPyqStudyPaper,
  pyqStudyModeLabel,
  pyqStudyTestTypeId,
  pyqStudyMockTypeForPreview,
} from './pyqStudentTest.js'
import { getPyqStudyPool } from './pyqStudentTest.js'
import { pickAiPracticeQuestions } from './aiSessionPick.js'
import { SUB_BANK_TYPE_PYQ } from './subBankType.js'

import { loadDynamicTestMap, saveDynamicTestMap } from './dynamicTestStorage.js'

const STORAGE_KEY = 'testvantage-pyq-study-sessions'

function loadSessions() {
  return loadDynamicTestMap(STORAGE_KEY)
}

function saveSessions(/** @type {Record<string, import('../data/tests').Test>} */ map) {
  saveDynamicTestMap(STORAGE_KEY, map)
}

/** @param {string} testId */
export function getPyqStudyTestById(testId) {
  if (!testId?.startsWith('pystudy-')) return null
  return loadSessions()[testId] ?? null
}

/**
 * @param {Parameters<typeof buildPyqStudyPaper>[0]} config
 */
export function previewPyqStudyPaper(config) {
  const attempts = getAttemptsByOwner(getOwnerKey(config.userId))
  const masteryGraph = buildMasteryGraph(attempts)
  return buildPyqStudyPaper({ ...config, masteryGraph })
}

/**
 * @param {Parameters<typeof buildPyqStudyPaper>[0]} config
 */
export function createPyqStudySession(config) {
  const examId = config.examPatternId
  if (!examId) throw new Error('Exam is required.')
  if (!config.syllabus?.subjects?.length) throw new Error('Select at least one subject.')

  const attempts = getAttemptsByOwner(getOwnerKey(config.userId))
  const masteryGraph = buildMasteryGraph(attempts)
  const plan = buildPyqStudyPaper({ ...config, masteryGraph })
  if (!plan) {
    throw new Error('No PYQ questions match this exam and syllabus. Import more PYQs or widen selection.')
  }

  const exam = getExamPattern(examId)
  const labelParts = [
    exam.shortName,
    config.syllabus.subjects.join(', '),
    config.syllabus.chapters.length ? config.syllabus.chapters.join(', ') : null,
  ].filter(Boolean)

  const id = `pystudy-${Date.now()}`
  const subBankType = config.subBankType ?? SUB_BANK_TYPE_PYQ
  const pool = getPyqStudyPool(examId, config.syllabus, config.pool, subBankType)
  const modeLabel = pyqStudyModeLabel(config.mode)

  if (plan.kind === 'practice') {
    const prepared = prepareQuestionsForTest(pool, plan.questions, `pystudy-q-${Date.now()}`)
    /** @type {import('../data/tests').Test} */
    const test = {
      id,
      title: `${modeLabel} — ${labelParts.join(' · ')}`,
      description: `${exam.name} — 100% PYQ syllabus practice`,
      examPatternId: examId,
      testTypeId: 'practice',
      durationMinutes: plan.durationMinutes,
      totalQuestions: getAnswerableQuestions(prepared).length,
      questions: prepared,
      practiceMeta: {
        examPatternId: examId,
        syllabus: config.syllabus,
        sourcePoolSize: plan.poolSize,
        batchSize: config.questionCount ?? 10,
        usedBankIds: plan.questions.map((q) => q.id),
        batchesCompleted: 1,
        aiPickReport: plan.aiPickReport,
        pyqOnly: true,
        subBankType,
      },
      pyqStudyMeta: {
        mode: config.mode,
        pyqOnly: true,
        subBankType,
      },
    }
    const sessions = loadSessions()
    sessions[id] = test
    saveSessions(sessions)
    return test
  }

  if (plan.kind === 'calibrated' && plan.test) {
    /** @type {import('../data/tests').Test} */
    const test = {
      ...plan.test,
      id,
      title: `${modeLabel} — ${labelParts.join(' · ')}`,
      description: `${exam.name} adaptive PYQ paper (100% previous-year)`,
      examPatternId: examId,
      testTypeId: 'calibrated',
      syllabusFilter: config.syllabus,
      antiCheatShuffle: true,
      status: 'published',
      durationMinutes: plan.durationMinutes,
      paperPatternId: plan.paperPatternId || undefined,
      paperBlueprint: plan.slots,
      pyqStudyMeta: { mode: config.mode, pyqOnly: true, subBankType },
    }
    const sessions = loadSessions()
    sessions[id] = test
    saveSessions(sessions)
    return test
  }

  if (!plan.questions?.length) {
    throw new Error('AI could not fill this PYQ paper. Widen syllabus or import more PYQs.')
  }

  const prepared = prepareQuestionsForTest(pool, plan.questions, `pystudy-q-${Date.now()}`)
  const answerable = getAnswerableQuestions(prepared)
  const mockType = pyqStudyMockTypeForPreview(config.mode) ?? 'full'

  /** @type {import('../data/tests').Test} */
  const test = {
    id,
    title: `${modeLabel} — ${labelParts.join(' · ')}`,
    description: `${exam.name} — 100% PYQ (${plan.durationMinutes} min)`,
    examPatternId: examId,
    testTypeId: pyqStudyTestTypeId(config.mode),
    durationMinutes: plan.durationMinutes,
    totalQuestions: answerable.length,
    paperBlueprint: plan.slots,
    paperPatternId: plan.paperPatternId || undefined,
    syllabusFilter: config.syllabus,
    questions: prepared,
    antiCheatShuffle: true,
    status: 'published',
    pyqStudyMeta: {
      mode: config.mode,
      pyqOnly: true,
      subBankType,
      mockType,
      pyqMix: plan.tuneReport?.pyqMix ?? '100% PYQ',
    },
  }

  const sessions = loadSessions()
  sessions[id] = test
  saveSessions(sessions)
  return test
}

/**
 * Continue PYQ-only practice batch.
 * @param {string} testId
 * @param {{ userId?: string }} [opts]
 */
export function extendPyqPracticeSession(testId, opts = {}) {
  const sessions = loadSessions()
  const test = sessions[testId]
  const meta = test?.practiceMeta
  if (!test || !meta?.pyqOnly || !meta?.syllabus || !meta.examPatternId) {
    return { ok: false, error: 'PYQ practice session not found.' }
  }

  const pool = getPyqStudyPool(
    meta.examPatternId,
    meta.syllabus,
    undefined,
    meta.subBankType ?? SUB_BANK_TYPE_PYQ,
  )
  const used = new Set(meta.usedBankIds ?? [])
  const remaining = pool.filter((q) => !used.has(q.id))
  if (!remaining.length) {
    return { ok: false, error: 'No more PYQ questions in this syllabus.' }
  }

  const batchSize = Math.max(1, meta.batchSize ?? 10)
  const count = Math.min(batchSize, remaining.length)
  const attempts = getAttemptsByOwner(getOwnerKey(opts.userId))
  const masteryGraph = buildMasteryGraph(attempts)
  const { questions: picked, report: aiPickReport } = pickAiPracticeQuestions(remaining, count, {
    masteryGraph,
  })
  const prepared = prepareQuestionsForTest(pool, picked, `pystudy-q-${Date.now()}`)
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
