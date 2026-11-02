/**
 * Paper publish gate:
 * - Test Quality Score (0–100)
 * - Strict pre-publish checklist (errors + missing answer keys)
 * - Blueprint slot fulfillment
 */

import { validateQuestionReadiness } from './questionReadiness.js'
import { getAnswerableQuestions } from './passage.js'
import { selectionProgressBySlot, totalSlotCount } from './paperAssembly.js'

/** @typedef {import('./questionReadiness.js').ReadinessIssue} ReadinessIssue */

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {{ slots?: import('../data/examPatterns').QuestionTypeSlot[], strictKeys?: boolean }} [opts]
 */
export function validatePaperForPublish(questions, opts = {}) {
  const { slots = [], strictKeys = true } = opts
  const answerable = getAnswerableQuestions(questions ?? [])
  /** @type {{ index: number, id?: string, text: string, issues: ReadinessIssue[] }[]} */
  const problems = []
  /** @type {{ index: number, id?: string, message: string }[]} */
  const warnings = []

  if (!answerable.length) {
    return {
      ok: false,
      problems: [
        {
          index: 0,
          text: '',
          issues: [{ id: 'empty-paper', severity: 'error', message: 'Paper has no questions.' }],
        },
      ],
      warnings: [],
      total: 0,
      blueprintOk: false,
      blueprintGaps: ['Add at least one question.'],
    }
  }

  answerable.forEach((q, i) => {
    const { issues } = validateQuestionReadiness(q)
    for (const issue of issues) {
      const row = {
        index: i + 1,
        id: q.id,
        text: String(q.text ?? '').slice(0, 72),
        issues: [issue],
      }
      if (issue.severity === 'error') {
        problems.push(row)
      } else if (strictKeys && issue.severity === 'warn') {
        problems.push(row)
      } else if (issue.severity === 'warn') {
        warnings.push({ index: i + 1, id: q.id, message: issue.message })
      }
    }
  })

  /** @type {string[]} */
  const blueprintGaps = []
  if (slots?.length && totalSlotCount(slots) > 0) {
    const progress = selectionProgressBySlot(answerable, slots)
    for (const row of progress) {
      if (row.have < row.need) {
        blueprintGaps.push(`Need ${row.need} ${row.slot.questionTypeId}, have ${row.have}`)
      }
    }
    if (blueprintGaps.length) {
      problems.push({
        index: 0,
        text: 'Blueprint',
        issues: [
          {
            id: 'blueprint-gap',
            severity: 'error',
            message: blueprintGaps[0],
          },
        ],
      })
    }
  }

  const need = slots?.length ? totalSlotCount(slots) : answerable.length
  if (need > 0 && answerable.length < need) {
    const gap = `Paper has ${answerable.length}/${need} questions for the blueprint.`
    if (!blueprintGaps.includes(gap)) blueprintGaps.push(gap)
    if (!problems.some((p) => p.issues[0]?.id === 'count-gap')) {
      problems.push({
        index: 0,
        text: 'Count',
        issues: [{ id: 'count-gap', severity: 'error', message: gap }],
      })
    }
  }

  return {
    ok: problems.length === 0,
    problems,
    warnings,
    total: answerable.length,
    blueprintOk: blueprintGaps.length === 0,
    blueprintGaps,
  }
}

/**
 * Test Quality Score (0–100).
 * @param {import('../data/tests').Question[]} questions
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} [slots]
 */
export function computePaperQualityScore(questions, slots = []) {
  const answerable = getAnswerableQuestions(questions ?? [])
  if (!answerable.length) return 0

  let complete = 0
  let keyed = 0
  for (const q of answerable) {
    const { ok, issues } = validateQuestionReadiness(q)
    if (ok) complete += 1
    const keyWarnings = issues.filter(
      (i) => i.severity === 'warn' && /key|answer|grid|integer|numerical/i.test(i.message),
    )
    if (keyWarnings.length === 0) keyed += 1
  }

  const completeness = (complete / answerable.length) * 40
  const keys = (keyed / answerable.length) * 30

  let blueprint = 15
  if (slots?.length && totalSlotCount(slots) > 0) {
    const progress = selectionProgressBySlot(answerable, slots)
    const need = progress.reduce((s, r) => s + r.need, 0)
    const have = progress.reduce((s, r) => s + Math.min(r.have, r.need), 0)
    blueprint = need > 0 ? (have / need) * 15 : 15
  }

  const target = slots?.length ? totalSlotCount(slots) : answerable.length
  const countScore =
    target > 0 ? Math.min(1, answerable.length / target) * 15 : answerable.length >= 1 ? 15 : 0

  return Math.round(Math.min(100, completeness + keys + blueprint + countScore))
}

/** @param {number} score */
export function qualityScoreLabel(score) {
  if (score >= 90) return { label: 'Excellent', tone: 'good' }
  if (score >= 75) return { label: 'Good', tone: 'ok' }
  if (score >= 55) return { label: 'Needs work', tone: 'warn' }
  return { label: 'Not ready', tone: 'bad' }
}

/**
 * @param {ReturnType<typeof validatePaperForPublish>} result
 * @param {number} [score]
 */
export function buildPublishChecklist(result, score = 0) {
  const items = []
  const ql = qualityScoreLabel(score)

  items.push({
    id: 'quality',
    ok: score >= 75,
    label: `Test Quality Score: ${score}/100 (${ql.label})`,
  })
  items.push({
    id: 'questions',
    ok: result.total > 0 && result.problems.every((p) => p.index > 0),
    label:
      result.total > 0
        ? `${result.total} question(s) in paper`
        : 'At least one question required',
  })
  items.push({
    id: 'complete',
    ok: result.problems.filter((p) => p.index > 0).length === 0,
    label:
      result.problems.filter((p) => p.index > 0).length === 0
        ? 'All questions complete (stem, options, matrix columns)'
        : `${result.problems.filter((p) => p.index > 0).length} question(s) need fixes`,
  })
  items.push({
    id: 'keys',
    ok: !result.problems.some((p) =>
      p.issues.some((i) => /key|answer|grid|integer|numerical/i.test(i.message)),
    ),
    label: 'Answer keys set for SCQ / MSQ / matrix / integer',
  })
  if (result.blueprintGaps?.length) {
    items.push({
      id: 'blueprint',
      ok: result.blueprintOk,
      label: `Blueprint: ${result.blueprintGaps[0]}`,
    })
  } else {
    items.push({
      id: 'blueprint',
      ok: true,
      label: 'Blueprint question counts met',
    })
  }

  return items
}

/**
 * Calibrated (GRE-style) papers deliver questions live — validate pool + starters, not static blueprint slots.
 * @param {import('../data/tests').Test | null} draft
 * @param {{ targetTotal?: number, minPerSubject?: number }} [opts]
 */
export function validateCalibratedPaperForPublish(draft, opts = {}) {
  const minPerSubject = opts.minPerSubject ?? 2
  const targetTotal = opts.targetTotal ?? draft?.totalQuestions ?? 0
  const meta = draft?.calibratedMeta
  const starters = getAnswerableQuestions(draft?.questions ?? [])
  /** @type {{ index: number, id?: string, text: string, issues: ReadinessIssue[] }[]} */
  const problems = []
  /** @type {string[]} */
  const poolGaps = []

  if (!meta || !starters.length) {
    return {
      ok: false,
      problems: [
        {
          index: 0,
          text: '',
          issues: [
            {
              id: 'no-starter',
              severity: 'error',
              message: 'Could not load a starter question from the syllabus pool.',
            },
          ],
        },
      ],
      warnings: [],
      total: starters.length,
      targetTotal,
      activeSubjects: meta?.subjectOrder?.length ?? 0,
      blueprintOk: true,
      blueprintGaps: [],
      poolGaps: ['Add more ready questions to your syllabus pool.'],
    }
  }

  starters.forEach((q, i) => {
    const { issues } = validateQuestionReadiness(q)
    for (const issue of issues) {
      if (issue.severity === 'error') {
        problems.push({
          index: i + 1,
          id: q.id,
          text: String(q.text ?? '').slice(0, 72),
          issues: [issue],
        })
      }
    }
  })

  const subjectOrder = meta.subjectOrder ?? []
  for (const sid of subjectOrder) {
    const bucket = meta.pools?.[sid]
    const count = bucket ? bucket.easy.length + bucket.medium.length + bucket.hard.length : 0
    if (count < minPerSubject) {
      poolGaps.push(`${sid}: need at least ${minPerSubject} bank questions, have ${count}`)
    }
  }

  if (poolGaps.length) {
    problems.push({
      index: 0,
      text: 'Pool',
      issues: [{ id: 'pool-gap', severity: 'error', message: poolGaps[0] }],
    })
  }

  return {
    ok: problems.length === 0,
    problems,
    warnings: [],
    total: starters.length,
    targetTotal,
    activeSubjects: subjectOrder.length,
    blueprintOk: true,
    blueprintGaps: [],
    poolGaps,
  }
}

/**
 * @param {import('../data/tests').Test | null} draft
 * @param {{ targetTotal?: number, minPerSubject?: number }} [opts]
 */
export function computeCalibratedPaperQualityScore(draft, opts = {}) {
  if (!draft?.calibratedMeta) return 0
  const starters = getAnswerableQuestions(draft.questions ?? [])
  if (!starters.length) return 0

  let complete = 0
  for (const q of starters) {
    if (validateQuestionReadiness(q).ok) complete += 1
  }
  const starterScore = (complete / starters.length) * 35

  const subjectOrder = draft.calibratedMeta.subjectOrder ?? []
  const minPer = opts.minPerSubject ?? 2
  let poolOk = 0
  let totalInPool = 0
  for (const sid of subjectOrder) {
    const bucket = draft.calibratedMeta.pools?.[sid]
    const n = bucket ? bucket.easy.length + bucket.medium.length + bucket.hard.length : 0
    totalInPool += n
    if (n >= minPer) poolOk += 1
  }
  const poolScore = subjectOrder.length ? (poolOk / subjectOrder.length) * 45 : 0

  const target = opts.targetTotal ?? draft.totalQuestions ?? 12
  const volumeScore = Math.min(1, totalInPool / Math.max(1, target)) * 20

  return Math.round(Math.min(100, starterScore + poolScore + volumeScore))
}

/**
 * @param {ReturnType<typeof validateCalibratedPaperForPublish>} result
 * @param {number} [score]
 */
export function buildCalibratedPublishChecklist(result, score = 0) {
  const items = []
  const ql = qualityScoreLabel(score)

  items.push({
    id: 'quality',
    ok: score >= 75,
    label: `Test Quality Score: ${score}/100 (${ql.label})`,
  })
  items.push({
    id: 'questions',
    ok: result.total > 0,
    label:
      result.total > 0
        ? `${result.total} starter question(s) loaded — up to ${result.targetTotal} delivered live during exam`
        : 'Starter question required',
  })
  items.push({
    id: 'complete',
    ok: result.problems.filter((p) => p.index > 0).length === 0,
    label:
      result.problems.filter((p) => p.index > 0).length === 0
        ? 'Starter question(s) complete (stem, options, keys)'
        : `${result.problems.filter((p) => p.index > 0).length} starter(s) need fixes`,
  })
  items.push({
    id: 'pool',
    ok: !result.poolGaps?.length,
    label: result.poolGaps?.length
      ? `Syllabus pool: ${result.poolGaps[0]}`
      : `${result.activeSubjects} subject(s) ready in syllabus pool`,
  })
  items.push({
    id: 'blueprint',
    ok: true,
    label: `Blueprint (${result.targetTotal} question types) sets timing — items are chosen live, not pre-listed`,
  })

  return items
}

/** @param {import('../data/tests').Test} test */
export function isCustomTestPaper(test) {
  return Boolean(test?.id?.startsWith('custom-'))
}

/** @param {import('../data/tests').Test} test */
export function getTestPublishStatus(test) {
  if (!isCustomTestPaper(test)) return 'published'
  return test?.status === 'draft' ? 'draft' : 'published'
}

/** @param {import('../data/tests').Test} test */
export function isTestPublished(test) {
  return getTestPublishStatus(test) === 'published'
}

/**
 * Per-question SME review manifest (QC list).
 * @param {import('../data/tests').Question[]} questions
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} [slots]
 */
export function buildPaperReviewManifest(questions, _slots = []) {
  const answerable = getAnswerableQuestions(questions ?? [])
  return answerable.map((q, i) => {
    const { ok, issues } = validateQuestionReadiness(q)
    const type = q.questionType ?? 'single_correct'
    const toughness = Number(q.toughnessLevel)
    return {
      index: i + 1,
      id: q.id,
      question: q,
      type,
      subject: q.subject ?? '',
      chapter: q.chapter ?? '',
      toughness: Number.isFinite(toughness) ? toughness : null,
      stemPreview: String(q.text ?? '').slice(0, 120),
      ready: ok && !issues.some((x) => x.severity === 'warn'),
      issues: issues.map((x) => x.message),
    }
  })
}

/**
 * @param {import('../data/tests').Question[]} questions
 */
export function analyzeDifficultyProfile(questions) {
  const answerable = getAnswerableQuestions(questions ?? [])
  const buckets = { easy: 0, medium: 0, hard: 0, unknown: 0 }
  const values = []
  for (const q of answerable) {
    const t = Number(q.toughnessLevel)
    if (!Number.isFinite(t)) {
      buckets.unknown += 1
      continue
    }
    values.push(t)
    if (t <= 4) buckets.easy += 1
    else if (t <= 7) buckets.medium += 1
    else buckets.hard += 1
  }
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  return { buckets, average: avg, count: answerable.length }
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {import('../data/examPatterns').QuestionTypeSlot[]} [slots]
 */
export function computeQualityBreakdown(questions, slots = []) {
  const answerable = getAnswerableQuestions(questions ?? [])
  const n = answerable.length || 1
  let complete = 0
  let keyed = 0
  for (const q of answerable) {
    const { ok, issues } = validateQuestionReadiness(q)
    if (ok) complete += 1
    if (!issues.some((i) => i.severity === 'warn' && /key|answer|grid|integer|numerical/i.test(i.message))) {
      keyed += 1
    }
  }
  let blueprintPct = 100
  if (slots?.length && totalSlotCount(slots) > 0) {
    const progress = selectionProgressBySlot(answerable, slots)
    const need = progress.reduce((s, r) => s + r.need, 0)
    const have = progress.reduce((s, r) => s + Math.min(r.have, r.need), 0)
    blueprintPct = need > 0 ? Math.round((have / need) * 100) : 100
  }
  const target = slots?.length ? totalSlotCount(slots) : answerable.length
  const countPct = target > 0 ? Math.round(Math.min(100, (answerable.length / target) * 100)) : 100
  return {
    completeness: Math.round((complete / n) * 100),
    answerKeys: Math.round((keyed / n) * 100),
    blueprint: blueprintPct,
    questionCount: countPct,
    total: computePaperQualityScore(questions, slots),
  }
}

/**
 * Immutable publish record (versioning for assignment integrity).
 * @param {import('../data/tests').Test} test
 * @param {import('../data/tests').Question[]} questions
 */
export function createPublishSnapshot(test, questions) {
  const slots = test?.paperBlueprint ?? []
  const answerable = getAnswerableQuestions(questions ?? [])
  const breakdown = computeQualityBreakdown(answerable, slots)
  return {
    publishVersion: (test?.publishVersion ?? 0) + 1,
    publishedAt: Date.now(),
    qualityScore: breakdown.total,
    qualityBreakdown: breakdown,
    difficultyProfile: analyzeDifficultyProfile(answerable),
    questionIds: answerable.map((q) => q.id).filter(Boolean),
    questionCount: answerable.length,
  }
}
