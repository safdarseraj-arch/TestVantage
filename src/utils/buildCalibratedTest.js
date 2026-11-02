import { getExamPattern } from '../data/examPatterns.js'
import { getSubjectsForPattern } from '../data/subjects.js'
import { getAnswerableQuestions } from './passage.js'
import {
  buildAdaptivePools,
  startingSectionDifficulty,
  enrichPoolToughness } from './adaptiveTest.js'
import { initAbilityBySubject, DEFAULT_ABILITY } from './aiAdaptiveEngine.js'
import { deliverCalibratedItems } from './calibratedExam.js'
import { computeCalibratedDurationMinutes } from './calibratedPaperPlan.js'

const DEFAULT_PER_SECTION = 8
const MIN_POOL_PER_SUBJECT = 2

/**
 * @param {import('../data/tests').Question[]} pool
 * @param {string} examPatternId
 * @param {import('./syllabusMeta.js').SyllabusSelection} [syllabus]
 */
export function resolveCalibratedSubjectOrder(pool, examPatternId, syllabus) {
  const patternSubjects = getSubjectsForPattern(examPatternId).map((s) => s.id)
  let subjectOrder = patternSubjects
  if (syllabus?.subjects?.length) {
    subjectOrder = subjectOrder.filter((id) => syllabus.subjects.includes(id))
  }
  const answerable = getAnswerableQuestions(enrichPoolToughness(pool))
  const pools = buildAdaptivePools(answerable, subjectOrder.length ? subjectOrder : patternSubjects)
  const order = (subjectOrder.length ? subjectOrder : patternSubjects).filter((id) => {
    const bucket = pools[id]
    return bucket && bucket.easy.length + bucket.medium.length + bucket.hard.length >= MIN_POOL_PER_SUBJECT
  })
  return { subjectOrder: order, pools, answerable }
}

/**
 * @param {import('../data/tests').Question[]} pool
 * @param {string} examPatternId
 * @param {{ questionsPerSection?: number, questionsPerSectionBySubject?: Record<string, number>, title?: string, syllabus?: import('./syllabusMeta.js').SyllabusSelection, targetTotal?: number }} [opts]
 */
export function buildCalibratedTestFromPool(pool, examPatternId, opts = {}) {
  const pattern = getExamPattern(examPatternId)
  const perSection = Math.max(4, Math.min(20, opts.questionsPerSection ?? DEFAULT_PER_SECTION))
  const { subjectOrder, pools, answerable } = resolveCalibratedSubjectOrder(
    pool,
    examPatternId,
    opts.syllabus,
  )
  if (!subjectOrder.length) {
    return null
  }

  const abilityBySubject = initAbilityBySubject(subjectOrder)

  const firstSubject = subjectOrder[0]
  const firstDiff = startingSectionDifficulty()
  const id = `calibrated-${examPatternId}-${Date.now()}`

  const targetTotal =
    opts.targetTotal && opts.targetTotal > 0
      ? opts.targetTotal
      : subjectOrder.length * perSection

  /** @type {import('../data/tests').CalibratedMeta} */
  const calibratedMeta = {
    subjectOrder,
    questionsPerSection: perSection,
    questionsPerSectionBySubject: opts.questionsPerSectionBySubject ?? undefined,
    pools,
    sourcePool: answerable,
    deliveredBankIds: [],
    deliveredIds: [],
    sectionPlan: subjectOrder.map((subjectId, index) => ({
      subjectId,
      difficulty: index === 0 ? firstDiff : null })),
    adaptiveMode: 'item',
    abilityBySubject,
    sectionItemsDelivered: {},
    itemHistory: [],
    gradedDeliveredIds: [] }

  const firstAbility = abilityBySubject[firstSubject] ?? DEFAULT_ABILITY
  const delivered = deliverCalibratedItems(calibratedMeta, id, firstSubject, firstAbility, [], 1)

  if (!delivered.questions.length) {
    return null
  }

  const test = {
    id,
    title: opts.title ?? `${pattern?.name ?? 'Exam'} — Real-Time Calibrated Paper`,
    description:
      'AI item-level adaptive test (GRE-style): after each answer, the next question is chosen to pinpoint your true level. Sections adjust difficulty as you progress.',
    examPatternId,
    testTypeId: 'calibrated',
    durationMinutes: 0,
    totalQuestions: targetTotal,
    questions: delivered.questions,
    calibratedMeta: {
      ...calibratedMeta,
      deliveredIds: delivered.deliveredIds,
      deliveredBankIds: delivered.deliveredBankIds,
      sectionItemsDelivered: delivered.sectionItemsDelivered } }

  test.durationMinutes = computeCalibratedDurationMinutes(subjectOrder.length, examPatternId)
  return test
}

/**
 * @param {import('../data/tests').Test} test
 * @param {string} subjectId
 * @param {import('./adaptiveTest.js').DifficultyBand} difficulty
 */
export function appendCalibratedSection(test, subjectId, _difficulty) {
  const meta = test.calibratedMeta
  if (!meta) return []
  const ability = meta.abilityBySubject?.[subjectId] ?? DEFAULT_ABILITY
  const { questions } = deliverCalibratedItems(
    meta,
    test.id,
    subjectId,
    ability,
    test.questions ?? [],
    meta.questionsPerSection,
  )
  return questions
}
