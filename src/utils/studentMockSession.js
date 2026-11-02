import { getExamPattern } from '../data/examPatterns.js'
import { getTestType } from '../data/testTypes.js'
import { getAnswerableQuestions } from './passage.js'
import { prepareQuestionsForTest } from './testQuestionClone.js'
import { loadPublishedUploadedQuestions } from './questionBank.js'
import { buildStudentMockPaper } from './studentMockTest.js'
import { filterQuestionsForNonCdfUse } from './cdfOnlyQuestions.js'

import { loadDynamicTestMap, saveDynamicTestMap } from './dynamicTestStorage.js'

const STORAGE_KEY = 'testvantage-student-mock-sessions'

function loadSessions() {
  return loadDynamicTestMap(STORAGE_KEY)
}

function saveSessions(/** @type {Record<string, import('../data/tests').Test>} */ map) {
  saveDynamicTestMap(STORAGE_KEY, map)
}

/** @param {string} testId */
export function getStudentMockTestById(testId) {
  if (!testId?.startsWith('smock-')) return null
  return loadSessions()[testId] ?? null
}

/**
 * @param {{
 *   testTypeId: import('./studentMockTest.js').StudentMockTypeId
 *   examPatternId: string
 *   syllabus: import('./syllabusMeta.js').SyllabusSelection
 *   paperPatternId?: string
 * }} config
 */
export function createStudentMockSession(config) {
  const bank = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())
  const examId = config.examPatternId
  if (!examId) throw new Error('Exam is required.')
  if (!config.syllabus?.subjects?.length) throw new Error('Select at least one subject.')

  const plan = buildStudentMockPaper({
    ...config,
    bank,
  })
  if (!plan) {
    throw new Error('Could not build this paper. Add more ready questions for your syllabus.')
  }

  const exam = getExamPattern(examId)
  const type = getTestType(config.testTypeId)
  const labelParts = [
    exam.shortName,
    type.shortName,
    config.syllabus.subjects.join(', '),
    config.syllabus.chapters.length ? config.syllabus.chapters.join(', ') : null,
  ].filter(Boolean)

  const id = `smock-${Date.now()}`

  if (plan.kind === 'calibrated' && plan.test) {
    /** @type {import('../data/tests').Test} */
    const test = {
      ...plan.test,
      id,
      title: `${type.name} — ${labelParts.join(' · ')}`,
      description: `${exam.name} adaptive paper (AI picks next question after each answer)`,
      examPatternId: examId,
      testTypeId: 'calibrated',
      syllabusFilter: config.syllabus,
      antiCheatShuffle: true,
      status: 'published',
      durationMinutes: plan.durationMinutes,
      paperPatternId: plan.paperPatternId || undefined,
      paperBlueprint: plan.slots,
    }
    const sessions = loadSessions()
    sessions[id] = test
    saveSessions(sessions)
    return test
  }

  if (!plan.questions?.length) {
    throw new Error('AI could not fill this paper. Widen your syllabus or add more tagged questions.')
  }

  const prepared = prepareQuestionsForTest(bank, plan.questions, `smock-q-${Date.now()}`)
  const answerable = getAnswerableQuestions(prepared)

  /** @type {import('../data/tests').Test} */
  const test = {
    id,
    title: `${type.name} — ${labelParts.join(' · ')}`,
    description: `${exam.name} — AI-built from your syllabus (${plan.durationMinutes} min)`,
    examPatternId: examId,
    testTypeId: config.testTypeId,
    durationMinutes: plan.durationMinutes,
    totalQuestions: answerable.length,
    paperBlueprint: plan.slots,
    paperPatternId: plan.paperPatternId || undefined,
    syllabusFilter: config.syllabus,
    questions: prepared,
    antiCheatShuffle: true,
    status: 'published',
  }

  const sessions = loadSessions()
  sessions[id] = test
  saveSessions(sessions)
  return test
}

/**
 * Preview without saving.
 * @param {Parameters<typeof createStudentMockSession>[0] & { bank?: import('../data/tests').Question[] }} config
 */
export function previewStudentMockPaper(config) {
  const bank = filterQuestionsForNonCdfUse(config.bank ?? loadPublishedUploadedQuestions())
  return buildStudentMockPaper({ ...config, bank })
}
