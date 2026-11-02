import { computeTestDuration } from './testConfig.js'
import { getAnswerableQuestions } from './passage.js'
import { dedupeQuestionsForExam, refreshTestQuestionsFromBank } from './testQuestionClone.js'
import { loadPublishedUploadedQuestions } from './questionBank.js'
import { persistQuestionForBank } from './persistUpload.js'
import { validatePaperForPublish, computePaperQualityScore, createPublishSnapshot } from './paperPublish.js'

const STORAGE_KEY = 'testvantage-custom-tests'

/**
 * @typedef {import('../data/tests').Test} Test
 */

/** @returns {string} */
function newCustomTestId() {
  return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** @param {Test[]} tests */
function dedupeCustomTestIds(tests) {
  const seen = new Set()
  let changed = false
  const out = tests.map((t) => {
    let id = t.id
    if (!id || seen.has(id)) {
      id = newCustomTestId()
      changed = true
    }
    seen.add(id)
    return id === t.id ? t : { ...t, id }
  })
  if (changed) saveCustomTests(out)
  return out
}

/** @param {Test[]} tests */
function refreshCustomTestsFromBank(tests) {
  const bank = loadPublishedUploadedQuestions()
  if (!bank.length) return tests
  let changed = false
  const out = tests.map((t) => {
    if (!t?.questions?.length) return t
    const questions = refreshTestQuestionsFromBank(t.questions, bank)
    if (questions === t.questions) return t
    changed = true
    return {
      ...t,
      questions,
      totalQuestions: getAnswerableQuestions(questions).length,
    }
  })
  if (changed) saveCustomTests(out)
  return out
}

/** @param {Test[]} tests */
function dedupeCustomTestQuestions(tests) {
  let changed = false
  const out = tests.map((t) => {
    if (!t?.questions?.length) return t
    const questions = dedupeQuestionsForExam(t.questions)
    if (questions.length === t.questions.length) return t
    changed = true
    return {
      ...t,
      questions,
      totalQuestions: getAnswerableQuestions(questions).length,
    }
  })
  if (changed) saveCustomTests(out)
  return out
}

/** Re-run bank migrate/heal on saved paper rows (fixes blank MCQ options after code updates). */
function migrateCustomTestQuestions(tests) {
  const bank = loadPublishedUploadedQuestions()
  const pool = bank.length ? bank : []
  let changed = false
  const out = tests.map((t) => {
    if (!t?.questions?.length) return t
    const questions = t.questions.map((q) =>
      persistQuestionForBank(q, pool.length ? pool : t.questions),
    )
    const same =
      questions.length === t.questions.length &&
      questions.every((q, i) => JSON.stringify(q) === JSON.stringify(t.questions[i]))
    if (same) return t
    changed = true
    return {
      ...t,
      questions,
      totalQuestions: getAnswerableQuestions(questions).length,
    }
  })
  if (changed) saveCustomTests(out)
  return out
}

/** @returns {Test[]} */
export function loadCustomTests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    const tests = Array.isArray(data.tests) ? data.tests : []
    return migrateCustomTestQuestions(
      refreshCustomTestsFromBank(dedupeCustomTestQuestions(dedupeCustomTestIds(tests))),
    )
  } catch {
    return []
  }
}

/** @param {Test[]} tests */
function saveCustomTests(tests) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ tests }))
  import('./testsServerSync.js')
    .then((m) => m.notifyTestsChanged())
    .catch(() => {})
}

/**
 * @param {Omit<Test, 'id' | 'durationMinutes' | 'totalQuestions'> & { questions: Test['questions'] }} config
 */
export function addCustomTest(config) {
  const tests = loadCustomTests()
  const answerableCount = getAnswerableQuestions(config.questions).length
  const totalQuestions =
    config.totalQuestions ??
    (config.calibratedMeta
      ? config.calibratedMeta.subjectOrder.length * config.calibratedMeta.questionsPerSection
      : answerableCount)
  const test = {
    ...config,
    id: newCustomTestId(),
    status: config.status === 'draft' ? 'draft' : 'published',
    publishedAt: config.status === 'draft' ? config.publishedAt : (config.publishedAt ?? Date.now()),
    qualityScore:
      config.qualityScore ??
      (config.status === 'draft'
        ? undefined
        : computePaperQualityScore(config.questions ?? [], config.paperBlueprint ?? [])),
    totalQuestions,
    durationMinutes:
      config.durationMinutes ??
      computeTestDuration(
        config.examPatternId,
        config.testTypeId,
        totalQuestions,
        config.paperPatternId,
      ),
  }
  tests.push(test)
  saveCustomTests(tests)
  return test
}

/** @param {string} id */
export function removeCustomTest(id) {
  saveCustomTests(loadCustomTests().filter((t) => t.id !== id))
}

/** @param {string} id @returns {Test | null} */
export function getCustomTestById(id) {
  if (!id) return null
  return loadCustomTests().find((t) => t.id === id) ?? null
}

/**
 * Update an existing custom paper (keeps the same id).
 * @param {string} id
 * @param {Partial<Test> & { questions?: Test['questions'] }} config
 * @returns {Test | null}
 */
export function updateCustomTest(id, config) {
  const tests = loadCustomTests()
  const idx = tests.findIndex((t) => t.id === id)
  if (idx < 0) return null
  const prev = tests[idx]
  const questions = config.questions ?? prev.questions
  const answerableCount = getAnswerableQuestions(questions).length
  const totalQuestions =
    config.totalQuestions ??
    (config.calibratedMeta
      ? config.calibratedMeta.subjectOrder.length * config.calibratedMeta.questionsPerSection
      : answerableCount)
  const updated = {
    ...prev,
    ...config,
    id,
    questions,
    status: config.status ?? prev.status ?? 'published',
    publishedAt:
      config.publishedAt ??
      (config.status === 'published' ? Date.now() : prev.publishedAt),
    qualityScore:
      config.qualityScore ??
      (config.status === 'draft'
        ? prev.qualityScore
        : computePaperQualityScore(questions, config.paperBlueprint ?? prev.paperBlueprint ?? [])),
    totalQuestions,
    durationMinutes:
      config.durationMinutes ??
      computeTestDuration(
        config.examPatternId ?? prev.examPatternId,
        config.testTypeId ?? prev.testTypeId,
        totalQuestions,
        config.paperPatternId ?? prev.paperPatternId,
      ),
  }
  tests[idx] = updated
  saveCustomTests(tests)
  return updated
}

/**
 * Publish a draft paper after validation (assign-ready gate).
 * @param {string} id
 * @returns {{ ok: boolean, error?: string, test?: Test }}
 */
export function publishCustomTest(id) {
  const test = getCustomTestById(id)
  if (!test) return { ok: false, error: 'Paper not found.' }
  const check = validatePaperForPublish(test.questions ?? [], {
    slots: test.paperBlueprint ?? [],
    strictKeys: true,
  })
  if (!check.ok) {
    const first = check.problems[0]
    return {
      ok: false,
      error: `${first?.index ? `Q${first.index}: ` : ''}${first?.issues[0]?.message ?? 'Paper not ready.'}`,
    }
  }
  const snapshot = createPublishSnapshot(test, test.questions ?? [])
  const published = updateCustomTest(id, {
    status: 'published',
    ...snapshot,
    qualityScore: snapshot.qualityScore,
  })
  return published ? { ok: true, test: published } : { ok: false, error: 'Could not publish.' }
}

export { isTestPublished, getTestPublishStatus, isCustomTestPaper } from './paperPublish.js'
