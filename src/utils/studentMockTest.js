import { getExamPattern } from '../data/examPatterns.js'
import { getTestType } from '../data/testTypes.js'
import { getAnswerableQuestions } from './passage.js'
import { aiTunePaper } from './aiPaperTuning.js'
import { buildCalibratedTestFromPool, resolveCalibratedSubjectOrder } from './buildCalibratedTest.js'
import { defaultSlotsForExam, totalSlotCount } from './paperAssembly.js'
import { getPaperPattern, listPaperPatterns } from './paperPatternStore.js'
import { filterQuestionsByExam } from './practiceFilters.js'
import { buildPracticePickPoolAnswerable } from './practicePickPool.js'
import { loadPublishedUploadedQuestions } from './questionBank.js'
import { scaleSlotsToQuestionBudget } from './speedTest.js'
import { filterQuestionsForNonCdfUse } from './cdfOnlyQuestions.js'
import { computeExamProportionalDuration, computeTestDuration, computeCalibratedDurationMinutes } from './testConfig.js'
import { planCalibratedPaperFromExam } from './calibratedPaperPlan.js'

/** @typedef {'full' | 'part' | 'chapter' | 'calibrated'} StudentMockTypeId */

export const STUDENT_MOCK_TYPE_IDS = /** @type {const} */ (['full', 'part', 'chapter', 'calibrated'])

/** Subject / chapter mocks use ~⅓ of a full exam paper (time scales with question count). */
export const STUDENT_MOCK_PART_CHAPTER_FRACTION = 1 / 3

const JEE_ADV_PAPER1_IDS = ['jee-adv-p1-standard', 'jee-adv-p1-2023-style']
const JEE_ADV_PAPER2_IDS = ['jee-adv-p2-comprehension']

/**
 * Pick one JEE Advanced paper (Paper 1 or Paper 2) from built-in recent-year style templates.
 * @param {string} [forcedPaperPatternId] — reuse same template for preview + session
 */
export function pickJeeAdvancedPaperTemplate(forcedPaperPatternId) {
  const patterns = listPaperPatterns('jee-advanced')
  if (forcedPaperPatternId) {
    const fixed = patterns.find((p) => p.id === forcedPaperPatternId) ?? getPaperPattern(forcedPaperPatternId)
    if (fixed) {
      return { paperPatternId: fixed.id, paperLabel: fixed.name }
    }
  }

  const paper1Pool = patterns.filter(
    (p) => JEE_ADV_PAPER1_IDS.includes(p.id) || /\bpaper\s*1\b/i.test(p.name),
  )
  const paper2Pool = patterns.filter(
    (p) => JEE_ADV_PAPER2_IDS.includes(p.id) || /\bpaper\s*2\b/i.test(p.name),
  )
  const usePaper1 = Math.random() < 0.5
  const pool =
    usePaper1 && paper1Pool.length
      ? paper1Pool
      : !usePaper1 && paper2Pool.length
        ? paper2Pool
        : patterns

  const pick = pool[Math.floor(Math.random() * pool.length)] ?? patterns[0]
  if (!pick) {
    return { paperPatternId: '', paperLabel: 'JEE Advanced' }
  }
  return { paperPatternId: pick.id, paperLabel: pick.name }
}

/**
 * @param {StudentMockTypeId} testTypeId
 * @param {string} examPatternId
 * @param {number} [questionCount]
 * @param {string} [paperPatternId]
 */
export function resolveStudentMockDurationMinutes(
  testTypeId,
  examPatternId,
  questionCount = 0,
  paperPatternId,
  subjectCount = 0,
) {
  if (testTypeId === 'calibrated') {
    const n = Math.max(1, subjectCount || 3)
    return computeCalibratedDurationMinutes(n, examPatternId)
  }
  if (questionCount > 0) {
    return computeTestDuration(examPatternId, testTypeId, questionCount, paperPatternId)
  }
  const pattern = getExamPattern(examPatternId)
  const fullQ = Math.max(1, totalSlotCount(defaultSlotsForExam(examPatternId, pattern)))
  if (testTypeId === 'full') {
    return pattern?.totalMinutes ?? 180
  }
  const estimateQ = Math.max(5, Math.round(fullQ * STUDENT_MOCK_PART_CHAPTER_FRACTION))
  return computeExamProportionalDuration(examPatternId, estimateQ, paperPatternId)
}

/** Human label for the duration step. */
export function formatStudentMockDurationLabel(
  testTypeId,
  examPatternId,
  questionCount = 0,
  paperPatternId,
  subjectCount = 0,
) {
  const pattern = getExamPattern(examPatternId)
  const type = getTestType(testTypeId)
  if (testTypeId === 'calibrated') {
    const n = Math.max(1, subjectCount)
    const mins = computeCalibratedDurationMinutes(n, examPatternId)
    const qNote = questionCount > 0 ? `${questionCount} Q` : 'exam-pattern Q count'
    return `Real-Time Calibrated: ${mins} min · ${n} subject${n === 1 ? '' : 's'} · ${qNote} (${pattern?.shortName ?? 'exam'} pattern)`
  }
  const mins = resolveStudentMockDurationMinutes(testTypeId, examPatternId, questionCount, paperPatternId, subjectCount)
  if (questionCount > 0) {
    return `${type.shortName}: ${mins} min (${questionCount} Q — same pace as real ${pattern?.shortName ?? 'exam'})`
  }
  return `${type.shortName}: scales with question count (real ${pattern?.name ?? 'exam'} time)`
}

/**
 * @param {StudentMockTypeId} testTypeId
 * @param {string} examPatternId
 * @param {string} [paperPatternId]
 */
export function resolveStudentMockBaseSlots(testTypeId, examPatternId, paperPatternId) {
  const pattern = getExamPattern(examPatternId)
  let resolvedPaperId = paperPatternId || undefined
  /** @type {import('../data/examPatterns').QuestionTypeSlot[]} */
  let slots

  if (examPatternId === 'jee-advanced') {
    if (!resolvedPaperId) {
      resolvedPaperId = pickJeeAdvancedPaperTemplate().paperPatternId
    }
    const paper = getPaperPattern(resolvedPaperId)
    if (paper?.slots?.length) {
      slots = paper.slots.map((s) => ({
        ...s,
        marking: { ...s.marking },
      }))
    }
  }

  if (!slots?.length) {
    slots = defaultSlotsForExam(examPatternId, pattern)
  }

  const fullQ = totalSlotCount(slots)

  if (testTypeId === 'full' || testTypeId === 'calibrated') {
    const targetTotal = fullQ
    return {
      slots,
      paperPatternId: resolvedPaperId,
      durationMinutes: computeTestDuration(
        examPatternId,
        testTypeId,
        targetTotal,
        resolvedPaperId,
      ),
      targetTotal,
    }
  }

  const budget = Math.max(5, Math.round(fullQ * STUDENT_MOCK_PART_CHAPTER_FRACTION))
  const scaled = scaleSlotsToQuestionBudget(slots, budget).filter((s) => s.count > 0)
  const targetTotal = totalSlotCount(scaled)
  return {
    slots: scaled,
    paperPatternId: resolvedPaperId,
    durationMinutes: computeTestDuration(examPatternId, testTypeId, targetTotal, resolvedPaperId),
    targetTotal,
  }
}

/**
 * @param {import('../data/tests').Question[]} bank
 * @param {string} examPatternId
 * @param {import('./syllabusMeta.js').SyllabusSelection} syllabus
 */
export function getStudentMockEligiblePool(bank, examPatternId, syllabus, bloomLevels) {
  const byExam = filterQuestionsByExam(filterQuestionsForNonCdfUse(bank), examPatternId)
  return buildPracticePickPoolAnswerable(byExam, syllabus, examPatternId, bloomLevels)
}

/**
 * @param {string} examPatternId
 * @param {StudentMockTypeId} testTypeId
 * @param {number} questionCount
 * @param {string} [paperPatternId]
 */
export function durationForQuestionCount(examPatternId, testTypeId, questionCount, paperPatternId) {
  return computeTestDuration(examPatternId, testTypeId, questionCount, paperPatternId)
}

/**
 * @param {{
 *   testTypeId: StudentMockTypeId
 *   examPatternId: string
 *   syllabus: import('./syllabusMeta.js').SyllabusSelection
 *   bank?: import('../data/tests').Question[]
 *   paperPatternId?: string
 * }} config
 */
export function buildStudentMockPaper(config) {
  const bank = filterQuestionsForNonCdfUse(config.bank ?? loadPublishedUploadedQuestions())
  const pool = getStudentMockEligiblePool(bank, config.examPatternId, config.syllabus, config.bloomLevels)
  const { slots, targetTotal, paperPatternId } = resolveStudentMockBaseSlots(
    config.testTypeId,
    config.examPatternId,
    config.paperPatternId,
  )

  if (config.testTypeId === 'calibrated') {
    const { subjectOrder } = resolveCalibratedSubjectOrder(
      pool,
      config.examPatternId,
      config.syllabus,
    )
    if (!subjectOrder.length) return null
    const plan = planCalibratedPaperFromExam(slots, subjectOrder, config.examPatternId)
    const built = buildCalibratedTestFromPool(pool, config.examPatternId, {
      syllabus: config.syllabus,
      questionsPerSection: plan.questionsPerSection,
      questionsPerSectionBySubject: plan.questionsPerSectionBySubject,
      targetTotal: plan.targetTotal,
    })
    if (!built) return null
    return {
      kind: 'calibrated',
      test: {
        ...built,
        durationMinutes: plan.durationMinutes,
        totalQuestions: plan.targetTotal,
        paperPatternId: paperPatternId || undefined,
        paperBlueprint: plan.slots,
        calibratedMeta: built.calibratedMeta
          ? {
              ...built.calibratedMeta,
              questionsPerSectionBySubject: plan.questionsPerSectionBySubject,
              questionsPerSection: plan.questionsPerSection,
            }
          : built.calibratedMeta,
      },
      slots: plan.slots,
      durationMinutes: plan.durationMinutes,
      paperPatternId,
      targetTotal: plan.targetTotal,
      questions: built.questions ?? [],
      tuneReport: null,
    }
  }

  if (!pool.length || totalSlotCount(slots) < 1) {
    return {
      kind: 'fixed',
      questions: [],
      slots,
      durationMinutes: computeTestDuration(
        config.examPatternId,
        config.testTypeId,
        targetTotal,
        paperPatternId,
      ),
      paperPatternId,
      targetTotal,
      tuneReport: null,
    }
  }

  const profileId =
    config.testTypeId === 'full' ? 'jee_main' : config.testTypeId === 'part' ? 'balanced' : 'revision'
  const tuned = aiTunePaper(pool, slots, config.syllabus, {
    profileId,
    examPatternId: config.examPatternId,
    toughnessTarget: config.testTypeId === 'chapter' ? 4 : 5,
  })

  const answerable = getAnswerableQuestions(tuned.questions ?? [])
  const qCount = answerable.length || targetTotal
  const scaledDuration = computeTestDuration(
    config.examPatternId,
    config.testTypeId,
    qCount,
    paperPatternId,
  )

  return {
    kind: 'fixed',
    questions: tuned.questions ?? [],
    slots,
    durationMinutes: scaledDuration,
    paperPatternId,
    targetTotal: qCount,
    tuneReport: tuned.tuneReport ?? null,
  }
}

/** @param {ReturnType<typeof buildStudentMockPaper>} plan */
export function studentMockPlanReady(plan) {
  if (!plan) return false
  if (plan.kind === 'calibrated') return Boolean(plan.test?.calibratedMeta)
  return getAnswerableQuestions(plan.questions ?? []).length > 0
}

