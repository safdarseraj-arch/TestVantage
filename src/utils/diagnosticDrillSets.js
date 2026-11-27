/**
 * Student High-mistake / High-skip question pools → Practice or timed Take-test sessions.
 */

import { getTestById } from '../data/tests.js'
import { getAllStudentAttempts, getAttemptsByOwner, getOwnerKey } from './attemptHistory.js'
import {
  buildDiagnosticAnalyticsPack,
  perQuestionFromAttempt,
} from './diagnosticQuestionAnalytics.js'
import { getAnswerableQuestions } from './passage.js'
import { loadDynamicTestMap, saveDynamicTestMap } from './dynamicTestStorage.js'
import { loadPublishedUploadedQuestions } from './questionBank.js'
import {
  dedupeQuestionsForExam,
  ensurePassageParentsIncluded,
} from './testQuestionClone.js'

const PRACTICE_STORAGE_KEY = 'testvantage-practice-sessions'

/** Pilot-friendly floor so small classes still unlock the sets. */
export const DIAGNOSTIC_DRILL_SAMPLE_FLOOR = 2

/** @typedef {'high_mistake' | 'high_skip'} DiagnosticDrillKind */
/** @typedef {'practice' | 'test'} DiagnosticDrillMode */

/**
 * @param {DiagnosticDrillKind} kind
 */
export function diagnosticDrillLabel(kind) {
  return kind === 'high_skip' ? 'High skip' : 'High mistake'
}

/**
 * @param {string} [userId]
 */
function attemptsForDrill(userId) {
  try {
    const all = getAllStudentAttempts()
    if (all.length) return all
    return getAttemptsByOwner(getOwnerKey(userId))
  } catch {
    return []
  }
}

/**
 * Personal wrong / skip rates when cohort tabs are still empty.
 * @param {object[]} attempts
 */
function personalStruggleRows(attempts) {
  /** @type {Map<string, { questionId: string, wrong: number, skip: number, seen: number, subject: string, chapter: string, index: number | null }>} */
  const map = new Map()
  for (const att of attempts) {
    for (const pq of perQuestionFromAttempt(att)) {
      const id = String(pq?.questionId ?? '')
      if (!id) continue
      const row = map.get(id) || {
        questionId: id,
        wrong: 0,
        skip: 0,
        seen: 0,
        subject: String(pq.subject || ''),
        chapter: String(pq.chapter || ''),
        index: pq.index ?? null,
      }
      row.seen += 1
      const grade = String(pq.grade || '')
      if (grade === 'wrong' || grade === 'partial') row.wrong += 1
      if (grade === 'unattempted') row.skip += 1
      if (!row.subject && pq.subject) row.subject = String(pq.subject)
      if (!row.chapter && pq.chapter) row.chapter = String(pq.chapter)
      if (row.index == null && pq.index != null) row.index = pq.index
      map.set(id, row)
    }
  }
  return [...map.values()]
}

/**
 * @param {DiagnosticDrillKind} kind
 * @param {{ userId?: string, sampleFloor?: number, limit?: number }} [opts]
 */
export function listDiagnosticDrillPool(kind, opts = {}) {
  const attempts = attemptsForDrill(opts.userId)
  const limit = Math.max(5, Math.min(40, Number(opts.limit) || 25))
  const sampleFloor = Math.max(1, Number(opts.sampleFloor) || DIAGNOSTIC_DRILL_SAMPLE_FLOOR)

  /** @type {{ questionId: string, subject?: string, chapter?: string, index?: number | null, mistakePct?: number, skipPct?: number, source: string }[]} */
  let rows = []

  if (attempts.length >= sampleFloor) {
    const pack = buildDiagnosticAnalyticsPack(attempts, { sampleFloor })
    const tabs = pack?.tabs
    const list = kind === 'high_skip' ? tabs?.tabB || [] : tabs?.tabA || []
    rows = list.map((q) => ({
      questionId: String(q.questionId),
      subject: q.subject,
      chapter: q.chapter,
      index: q.index ?? null,
      mistakePct: q.mistakePct,
      skipPct: q.skipPct,
      source: 'cohort',
    }))
  }

  if (!rows.length && attempts.length) {
    const personal = personalStruggleRows(attempts)
    const filtered =
      kind === 'high_skip'
        ? personal
            .filter((r) => r.skip > 0 && r.skip / r.seen >= 0.4)
            .sort((a, b) => b.skip / b.seen - a.skip / a.seen || b.skip - a.skip)
        : personal
            .filter((r) => r.wrong > 0 && r.wrong / r.seen >= 0.4)
            .sort((a, b) => b.wrong / b.seen - a.wrong / a.seen || b.wrong - a.wrong)
    rows = filtered.map((r) => ({
      questionId: r.questionId,
      subject: r.subject,
      chapter: r.chapter,
      index: r.index,
      mistakePct: r.seen ? Math.round((r.wrong / r.seen) * 100) : 0,
      skipPct: r.seen ? Math.round((r.skip / r.seen) * 100) : 0,
      source: 'personal',
    }))
  }

  const sliced = rows.slice(0, limit)
  const questions = resolveDiagnosticDrillQuestions(
    sliced.map((r) => r.questionId),
    attempts,
  )
  const byId = new Map(questions.map((q) => [String(q.id), q]))
  const available = sliced.filter((r) => byId.has(r.questionId))

  return {
    ready: available.length > 0,
    kind,
    label: diagnosticDrillLabel(kind),
    count: available.length,
    source: available[0]?.source || (rows[0]?.source ?? 'none'),
    attemptCount: attempts.length,
    rows: available,
    questions: available.map((r) => byId.get(r.questionId)).filter(Boolean),
    emptyHint:
      kind === 'high_skip'
        ? 'No High-skip questions yet. Finish a few papers (or skip items under time pressure) so this set can fill.'
        : 'No High-mistake questions yet. Finish a few papers so questions classmates get wrong can fill this set.',
  }
}

/**
 * @param {string[]} ids
 * @param {object[]} attempts
 */
export function resolveDiagnosticDrillQuestions(ids, attempts = []) {
  const bank = loadPublishedUploadedQuestions()
  /** @type {Map<string, import('../data/tests').Question>} */
  const byId = new Map()
  for (const q of bank) {
    if (q?.id) byId.set(String(q.id), q)
  }
  for (const att of attempts) {
    const testId = String(att?.testId || '')
    if (!testId) continue
    let test = null
    try {
      test = getTestById(testId)
    } catch {
      test = null
    }
    if (!test?.questions?.length) continue
    for (const q of getAnswerableQuestions(test.questions)) {
      const id = String(q.id)
      if (id && !byId.has(id)) byId.set(id, q)
    }
  }
  /** @type {import('../data/tests').Question[]} */
  const out = []
  const seen = new Set()
  for (const raw of ids) {
    const id = String(raw || '')
    if (!id || seen.has(id)) continue
    const q = byId.get(id)
    if (!q) continue
    out.push(q)
    seen.add(id)
  }
  return out
}

/**
 * @param {{
 *   kind: DiagnosticDrillKind
 *   mode: DiagnosticDrillMode
 *   userId?: string
 *   limit?: number
 * }} opts
 */
export function createDiagnosticDrillSession(opts) {
  const kind = opts.kind === 'high_skip' ? 'high_skip' : 'high_mistake'
  const mode = opts.mode === 'test' ? 'test' : 'practice'
  const pool = listDiagnosticDrillPool(kind, { userId: opts.userId, limit: opts.limit })
  if (!pool.ready || !pool.questions.length) {
    return { ok: false, error: pool.emptyHint }
  }

  const bank = loadPublishedUploadedQuestions()
  const picked = dedupeQuestionsForExam(
    ensurePassageParentsIncluded([...bank, ...pool.questions], pool.questions),
  )
  const answerable = getAnswerableQuestions(picked)
  if (!answerable.length) {
    return { ok: false, error: 'Could not load those questions for a session.' }
  }

  const count = answerable.length
  const label = diagnosticDrillLabel(kind)
  const isPractice = mode === 'practice'
  const secEach = isPractice ? 150 : 90
  const minutes = Math.max(isPractice ? 10 : 5, Math.ceil((count * secEach) / 60))
  const slug = kind === 'high_skip' ? 'hs' : 'hm'
  const id = `practice-diag-${slug}-${Date.now()}`
  const examPatternId =
    String(pool.questions[0]?.examPatternId || answerable[0]?.examPatternId || 'jee-main')

  /** @type {import('../data/tests').Test} */
  const session = {
    id,
    title: isPractice ? `${label} — Practice` : `${label} — Timed test`,
    description: isPractice
      ? `Self-paced practice of ${count} ${label.toLowerCase()} question${count === 1 ? '' : 's'}.`
      : `Timed drill of ${count} ${label.toLowerCase()} question${count === 1 ? '' : 's'}.`,
    examPatternId,
    testTypeId: isPractice ? 'practice' : 'speed',
    durationMinutes: minutes,
    totalQuestions: count,
    questions: picked,
    practiceMeta: {
      examPatternId,
      syllabus: { subjects: [], sections: [], chapters: [], topics: [] },
      sourcePoolSize: count,
      batchSize: count,
      usedBankIds: answerable.map((q) => q.id),
      batchesCompleted: 1,
      diagnosticDrill: true,
      diagnosticKind: kind,
      diagnosticMode: mode,
      diagnosticSource: pool.source,
    },
    diagnosticDrillMeta: {
      kind,
      mode,
      source: pool.source,
      createdAt: Date.now(),
      count,
    },
  }

  const map = loadDynamicTestMap(PRACTICE_STORAGE_KEY)
  map[id] = session
  saveDynamicTestMap(PRACTICE_STORAGE_KEY, map)

  return { ok: true, test: session, count, kind, mode, source: pool.source }
}
