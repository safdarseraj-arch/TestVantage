/**
 * PYQ-only papers — mirrors student mock / practice but 100% from PYQ catalog.
 */

import { getExamPattern } from '../data/examPatterns.js'
import { getTestType } from '../data/testTypes.js'
import { getAnswerableQuestions } from './passage.js'
import { aiTunePaper } from './aiPaperTuning.js'
import { buildCalibratedTestFromPool, resolveCalibratedSubjectOrder } from './buildCalibratedTest.js'
import { planCalibratedPaperFromExam } from './calibratedPaperPlan.js'
import { pyqCatalogPickPool } from './pyqPoolMerge.js'
import { poolForSubBankPathway } from './subBankPathways.js'
import { pickAiPracticeQuestions } from './aiSessionPick.js'
import {
  resolveStudentMockBaseSlots,
  STUDENT_MOCK_PART_CHAPTER_FRACTION,
} from './studentMockTest.js'
import { totalSlotCount } from './paperAssembly.js'
import { computeTestDuration } from './testConfig.js'
import { enforce_parent_child_exclusion } from './parentChildExclusion.js'
import { SUB_BANK_TYPE_PYQ } from './subBankType.js'

/** @typedef {'syllabus-practice' | 'full' | 'part' | 'chapter' | 'calibrated' | 'year-wise-paper'} PyqStudyModeId */

export const PYQ_STUDY_MODES = /** @type {const} */ ([
  'syllabus-practice',
  'full',
  'part',
  'chapter',
  'calibrated',
  'year-wise-paper',
])

/**
 * @param {string} examPatternId
 * @param {import('./syllabusMeta.js').SyllabusSelection} syllabus
 * @param {import('../data/tests').Question[]} [sourcePool]
 * @param {import('./subBankType.js').SubBankType} [subBankType]
 */
export function getPyqStudyPool(examPatternId, syllabus, sourcePool, subBankType = SUB_BANK_TYPE_PYQ, bloomLevels) {
  if (sourcePool?.length) {
    return poolForSubBankPathway(subBankType, examPatternId, syllabus, bloomLevels, sourcePool)
  }
  return pyqCatalogPickPool(examPatternId, syllabus, sourcePool, subBankType, bloomLevels)
}

/**
 * @param {{
 *   mode: PyqStudyModeId
 *   examPatternId: string
 *   syllabus: import('./syllabusMeta.js').SyllabusSelection
 *   questionCount?: number
 *   paperPatternId?: string
 *   userId?: string
 *   masteryGraph?: import('./aiMastery.js').MasteryGraph | null
 *   subBankType?: import('./subBankType.js').SubBankType
 * }} config
 */
export function buildPyqStudyPaper(config) {
  const subBankType = config.subBankType ?? SUB_BANK_TYPE_PYQ
  const pool = getPyqStudyPool(config.examPatternId, config.syllabus, config.pool, subBankType, config.bloomLevels)
  if (!pool.length) return null

  if (config.mode === 'syllabus-practice') {
    const count = Math.max(1, Math.min(config.questionCount ?? 10, pool.length))
    const { questions, report } = pickAiPracticeQuestions(pool, count, {
      masteryGraph: config.masteryGraph ?? null,
    })
    const picked = enforce_parent_child_exclusion(questions)
    return {
      kind: 'practice',
      questions: picked,
      durationMinutes: Math.max(10, Math.ceil(count * 2.5)),
      targetTotal: picked.length,
      aiPickReport: report,
      poolSize: pool.length,
    }
  }

  const mockType =
    config.mode === 'syllabus-practice'
      ? 'chapter'
      : config.mode === 'calibrated'
        ? 'calibrated'
        : config.mode

  const { slots, targetTotal, paperPatternId } = resolveStudentMockBaseSlots(
    mockType,
    config.examPatternId,
    config.paperPatternId,
  )

  if (config.mode === 'calibrated') {
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
      },
      slots: plan.slots,
      durationMinutes: plan.durationMinutes,
      paperPatternId,
      targetTotal: plan.targetTotal,
      questions: built.questions ?? [],
      poolSize: pool.length,
    }
  }

  if (!totalSlotCount(slots)) return null

  const tuned = aiTunePaper(pool, slots, config.syllabus, {
    profileId: 'pyq_focus',
    examPatternId: config.examPatternId,
    toughnessTarget: config.mode === 'chapter' ? 4 : 5,
    pyqPercent: 100,
  })

  const answerable = getAnswerableQuestions(
    enforce_parent_child_exclusion(tuned.questions ?? []),
  )
  const qCount = answerable.length || targetTotal
  const scaledDuration = computeTestDuration(
    config.examPatternId,
    config.mode,
    qCount,
    paperPatternId,
  )

  return {
    kind: 'fixed',
    questions: answerable,
    slots,
    durationMinutes: scaledDuration,
    paperPatternId,
    targetTotal: qCount,
    tuneReport: tuned.tuneReport ?? null,
    poolSize: pool.length,
  }
}

/** @param {ReturnType<typeof buildPyqStudyPaper>} plan */
export function pyqStudyPlanReady(plan) {
  if (!plan) return false
  if (plan.kind === 'practice') return getAnswerableQuestions(plan.questions ?? []).length > 0
  if (plan.kind === 'calibrated') return Boolean(plan.test?.calibratedMeta)
  return getAnswerableQuestions(plan.questions ?? []).length > 0
}

/**
 * @param {PyqStudyModeId} mode
 */
export function pyqStudyModeLabel(mode) {
  switch (mode) {
    case 'syllabus-practice':
      return 'Syllabus Practice'
    case 'full':
      return 'Comprehensive PYQ Test'
    case 'part':
      return 'Subject PYQ Proficiency'
    case 'chapter':
      return 'Chapter PYQ Proficiency'
    case 'calibrated':
      return 'Real-Time Calibrated PYQ'
    case 'year-wise-paper':
      return 'Year-wise Paper'
    default:
      return 'PYQ Study'
  }
}

/**
 * @param {PyqStudyModeId} mode
 * @param {string} examPatternId
 */
export function pyqStudyModeHint(mode, examPatternId) {
  switch (mode) {
    case 'syllabus-practice':
      return 'Untimed PYQ batches by syllabus.'
    case 'full':
      return `Full exam duration · all subjects · ${getExamPattern(examPatternId)?.shortName ?? 'exam'}.`
    case 'part':
      return `Subject paper · ~${Math.round(STUDENT_MOCK_PART_CHAPTER_FRACTION * 100)}% length & time.`
    case 'chapter':
      return 'Chapter/topics focus · shorter timed paper.'
    case 'calibrated':
      return 'Adaptive PYQ — level adjusts after each answer.'
    case 'year-wise-paper':
      return examPatternId === 'jee-advanced'
        ? 'Pick year · Paper 1 or 2 (or AI pick).'
        : examPatternId === 'jee-main'
          ? 'Pick year · date & shift (or AI pick).'
          : 'Pick year · one NEET paper.'
    default:
      return ''
  }
}

/** @param {PyqStudyModeId} mode */
export function pyqStudyTestTypeId(mode) {
  if (mode === 'syllabus-practice') return 'practice'
  if (mode === 'calibrated') return 'calibrated'
  return mode
}

/** @param {PyqStudyModeId} mode */
export function pyqStudyMockTypeForPreview(mode) {
  if (mode === 'syllabus-practice') return null
  return mode
}

/** @param {PyqStudyModeId} mode */
export function pyqStudyUsesTestTypeCard(mode) {
  return mode !== 'syllabus-practice'
}

/** @param {PyqStudyModeId} mode */
export function getTestTypeForPyqMode(mode) {
  return getTestType(pyqStudyTestTypeId(mode))
}
