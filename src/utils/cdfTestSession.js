import { getExamPattern } from '../data/examPatterns.js'
import { getAnswerableQuestions } from './passage.js'
import { loadPublishedUploadedQuestions } from './questionBank.js'
import { prepareQuestionsForTest } from './testQuestionClone.js'
import {
  filterQuestionsByExam,
  filterQuestionsByPracticeSyllabus,
} from './practiceTest.js'
import { buildCdfPaperForDuration, filterQuestionsForCdfTest } from './cdfTest.js'
import { loadDynamicTestMap, saveDynamicTestMap } from './dynamicTestStorage.js'

const STORAGE_KEY = 'testvantage-cdf-sessions'

function loadSessions() {
  return loadDynamicTestMap(STORAGE_KEY)
}

function saveSessions(/** @type {Record<string, import('../data/tests').Test>} */ map) {
  saveDynamicTestMap(STORAGE_KEY, map)
}

/** @param {string} testId */
export function getCdfTestById(testId) {
  if (!testId?.startsWith('cdf-')) return null
  return loadSessions()[testId] ?? null
}

/**
 * @param {import('../data/tests').Question[]} bank
 * @param {string} examPatternId
 * @param {import('./syllabusMeta.js').SyllabusSelection} syllabus
 */
export function getCdfEligiblePool(bank, examPatternId, syllabus) {
  const byExam = filterQuestionsByExam(bank, examPatternId)
  const bySyllabus = filterQuestionsByPracticeSyllabus(byExam, syllabus, examPatternId)
  return filterQuestionsForCdfTest(bySyllabus)
}

/**
 * Preview AI CDF paper without saving a session.
 * @param {{ syllabus: import('./syllabusMeta.js').SyllabusSelection, examPatternId: string, durationMinutes: number, bank?: import('../data/tests').Question[] }} config
 */
export function previewCdfPaper(config) {
  const bank = config.bank ?? loadPublishedUploadedQuestions()
  const pool = getCdfEligiblePool(bank, config.examPatternId, config.syllabus)
  if (!pool.length) {
    return {
      questions: [],
      slots: [],
      durationMinutes: config.durationMinutes,
      effectiveDurationMinutes: config.durationMinutes,
      plannedQuestionCount: 0,
      tuneReport: null,
    }
  }
  return buildCdfPaperForDuration(
    config.durationMinutes,
    pool,
    config.syllabus,
    config.examPatternId,
  )
}

/**
 * @param {{
 *   syllabus: import('./syllabusMeta.js').SyllabusSelection
 *   examPatternId: string
 *   durationMinutes: number
 * }} config
 */
export function createCdfSession(config) {
  const bank = loadPublishedUploadedQuestions()
  const examId = config.examPatternId
  if (!examId) throw new Error('Exam is required.')
  if (!config.syllabus?.subjects?.length) throw new Error('Select at least one subject.')

  const pool = getCdfEligiblePool(bank, examId, config.syllabus)
  if (!pool.length) {
    throw new Error('No toughness level 1 SCQ or T/F questions match this exam and syllabus.')
  }

  const plan = buildCdfPaperForDuration(
    config.durationMinutes,
    pool,
    config.syllabus,
    examId,
  )
  if (!plan.questions.length) {
    throw new Error(
      'Could not build a CDF paper for this duration. Try shorter time or wider syllabus.',
    )
  }

  const prepared = prepareQuestionsForTest(bank, plan.questions, `cdf-q-${Date.now()}`)
  const answerable = getAnswerableQuestions(prepared)
  const effectiveDuration =
    plan.effectiveDurationMinutes ?? plan.durationMinutes ?? config.durationMinutes

  const exam = getExamPattern(examId)
  const labelParts = [
    exam.shortName,
    config.syllabus.subjects.join(', '),
    config.syllabus.sections?.length ? config.syllabus.sections.join(', ') : null,
    config.syllabus.chapters.length ? config.syllabus.chapters.join(', ') : null,
  ].filter(Boolean)

  const id = `cdf-${Date.now()}`

  /** @type {import('../data/tests').Test} */
  const test = {
    id,
    title: `Concept Definition and Formula Test — ${config.durationMinutes} min · ${labelParts.join(' · ') || 'Syllabus'}`,
    description: `${exam.name} CDF (Concept, Definition & Formula) — level-1 SCQ & T/F with per-question timer`,
    examPatternId: examId,
    testTypeId: 'cdf',
    cdfDurationMinutes: config.durationMinutes,
    durationMinutes: effectiveDuration,
    cdfPlannedQuestionCount: plan.plannedQuestionCount ?? answerable.length,
    totalQuestions: answerable.length,
    paperBlueprint: plan.slots,
    syllabusFilter: config.syllabus,
    questions: prepared,
    antiCheatShuffle: false,
    status: 'published',
  }

  const sessions = loadSessions()
  sessions[id] = test
  saveSessions(sessions)
  return test
}
