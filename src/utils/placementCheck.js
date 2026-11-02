/**
 * Placement check — short mixed diagnostic from your bank.
 * Suggests Today’s Target chapters. Not a scholarship product.
 */
import { getExamPattern } from '../data/examPatterns.js'
import { loadPublishedUploadedQuestions } from './questionBank.js'
import { filterQuestionsForNonCdfUse } from './cdfOnlyQuestions.js'
import { filterQuestionsByExam } from './practiceFilters.js'
import { getAnswerableQuestions } from './passage.js'
import { prepareQuestionsForTest } from './testQuestionClone.js'
import { loadDynamicTestMap, saveDynamicTestMap } from './dynamicTestStorage.js'
import { getAttemptsForTest, getOwnerKey } from './attemptHistory.js'
import { saveDailyTarget } from './meritStrideStore.js'
import { DRILL_FALLBACK_QUESTIONS } from './todaysDrillStore.js'

const SESSIONS_KEY = 'testvantage-placement-sessions'
const LAST_KEY = 'testvantage-placement-last'

function loadLast() {
  try {
    const raw = localStorage.getItem(LAST_KEY)
    return raw ? JSON.parse(raw) : { byOwner: {} }
  } catch {
    return { byOwner: {} }
  }
}

function saveLast(data) {
  localStorage.setItem(LAST_KEY, JSON.stringify(data))
}

export function getPlacementTestById(testId) {
  if (!testId?.startsWith('place-')) return null
  return loadDynamicTestMap(SESSIONS_KEY)[testId] ?? null
}

/** @param {string} ownerKey */
export function getLastPlacement(ownerKey) {
  return loadLast().byOwner[ownerKey] ?? null
}

/**
 * @param {{ examPatternId: string, userId?: string, questionCount?: number }} config
 */
export function createPlacementCheck(config) {
  const examId = config.examPatternId || 'jee-main'
  const ownerKey = getOwnerKey(config.userId)
  const bank = filterQuestionsForNonCdfUse(loadPublishedUploadedQuestions())
  let examBank = filterQuestionsByExam(bank, examId)
  let answerable = getAnswerableQuestions(examBank)
  let usedFallback = false
  if (answerable.length < 6) {
    answerable = getAnswerableQuestions(DRILL_FALLBACK_QUESTIONS)
    usedFallback = true
  }
  if (answerable.length < 6) {
    return {
      ok: false,
      error: 'Need at least six published questions for a placement check. Publish a few in Question Bank.',
    }
  }

  const count = Math.min(config.questionCount ?? 15, answerable.length, 20)
  const shuffled = [...answerable].sort(() => Math.random() - 0.5)
  /** @type {Map<string, typeof answerable>} */
  const bySubject = new Map()
  for (const q of shuffled) {
    const sub = q.subject || q.syllabusSubject || 'General'
    if (!bySubject.has(sub)) bySubject.set(sub, [])
    bySubject.get(sub).push(q)
  }
  /** @type {typeof answerable} */
  const mixed = []
  const subjects = [...bySubject.keys()]
  let i = 0
  while (mixed.length < count && subjects.length) {
    const sub = subjects[i % subjects.length]
    const bucket = bySubject.get(sub)
    if (bucket?.length) mixed.push(bucket.shift())
    else subjects.splice(i % subjects.length, 1)
    i++
  }

  const clonePool = bank.length ? bank : [...DRILL_FALLBACK_QUESTIONS, ...mixed]
  const prepared = prepareQuestionsForTest(clonePool, mixed.slice(0, count), `place-q-${Date.now()}`)
  const exam = getExamPattern(examId)
  const id = `place-${examId}-${Date.now()}`

  /** @type {import('../data/tests').Test} */
  const test = {
    id,
    title: `Placement check — ${exam?.shortName ?? examId}`,
    description: 'Short mixed paper to see where you stand, then a weak-chapter plan.',
    examPatternId: examId,
    testTypeId: 'practice',
    durationMinutes: Math.max(25, Math.ceil(prepared.length * 2)),
    totalQuestions: getAnswerableQuestions(prepared).length,
    questions: prepared,
    placementMeta: { examPatternId: examId, usedFallback },
  }

  const map = loadDynamicTestMap(SESSIONS_KEY)
  map[id] = test
  saveDynamicTestMap(SESSIONS_KEY, map)

  const last = loadLast()
  last.byOwner[ownerKey] = { testId: id, examPatternId: examId, startedAt: Date.now() }
  saveLast(last)

  return { ok: true, test, usedFallback }
}

/**
 * @param {string} ownerKey
 * @param {string} testId
 */
export function summarizePlacementAttempt(ownerKey, testId) {
  const attempts = getAttemptsForTest(testId, ownerKey)
  const attempt = attempts[0]
  if (!attempt) return null

  /** @type {Record<string, { correct: number, total: number }>} */
  const bySubject = {}
  /** @type {Record<string, { correct: number, total: number, subject?: string }>} */
  const byChapter = {}
  const rows = attempt.perQuestion ?? attempt.result?.perQuestion ?? []
  for (const row of rows) {
    if (row.grade === 'unattempted') continue
    const sub = row.subject || 'General'
    const ch = row.chapter || 'General'
    if (!bySubject[sub]) bySubject[sub] = { correct: 0, total: 0 }
    if (!byChapter[ch]) byChapter[ch] = { correct: 0, total: 0, subject: sub }
    bySubject[sub].total += 1
    byChapter[ch].total += 1
    if (row.grade === 'correct') {
      bySubject[sub].correct += 1
      byChapter[ch].correct += 1
    }
  }

  const weakChapters = Object.entries(byChapter)
    .filter(([, s]) => s.total >= 1)
    .map(([chapter, s]) => ({
      chapter,
      subject: s.subject,
      accuracy: Math.round((s.correct / Math.max(1, s.total)) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 3)

  const subjects = Object.entries(bySubject).map(([subject, s]) => ({
    subject,
    accuracy: Math.round((s.correct / Math.max(1, s.total)) * 100),
    total: s.total,
    correct: s.correct,
  }))

  return {
    attempt,
    score: attempt.score ?? attempt.result?.score,
    maxScore: attempt.maxScore ?? attempt.result?.maxScore,
    subjects,
    weakChapters,
  }
}

/**
 * @param {string} ownerKey
 * @param {string} examId
 * @param {{ chapter: string, accuracy?: number, subject?: string }[]} chapters
 */
export function lockPlacementAsTodaysTarget(ownerKey, examId, chapters) {
  return saveDailyTarget(ownerKey, {
    examId,
    goalQuestions: 25,
    chapters: chapters.slice(0, 3),
  })
}
