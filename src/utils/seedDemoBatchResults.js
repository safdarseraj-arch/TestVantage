/**
 * Demo batch of student attempts for one official-style paper.
 * Seeds local attempt history so Teacher → Student Results shows a full class table.
 */

import { saveAttempt, getAllStudentAttempts } from './attemptHistory.js'
import { scoreToPercentile } from './percentile.js'
import { allowAutoDemoSeed } from './prodSafety.js'

export const DEMO_BATCH_SEED_KEY = 'testvantage-demo-batch-results-v2'
export const DEMO_BATCH_TEST_ID = 'jee-main-full-demo'
export const DEMO_BATCH_TEST_TITLE = 'Sample classroom — JEE Main (practice only)'

/** JEE Main-style demo marking for SCQ */
export const DEMO_MARKS_CORRECT = 4
export const DEMO_MARKS_WRONG = -1
export const DEMO_Q_PER_SUBJECT = 25
export const DEMO_SUBJECTS = ['Physics', 'Chemistry', 'Maths']

/** Stable demo students for one classroom batch */
const DEMO_BATCH_STUDENTS = [
  { name: 'Aarav Sharma', email: 'aarav.s@demo.school', scorePct: 0.92, minutes: 168 },
  { name: 'Priya Mehta', email: 'priya.m@demo.school', scorePct: 0.86, minutes: 175 },
  { name: 'Rohan Kapoor', email: 'rohan.k@demo.school', scorePct: 0.81, minutes: 152 },
  { name: 'Ananya Patel', email: 'ananya.p@demo.school', scorePct: 0.78, minutes: 180 },
  { name: 'Vikram Thakur', email: 'vikram.t@demo.school', scorePct: 0.74, minutes: 165 },
  { name: 'Sneha Reddy', email: 'sneha.r@demo.school', scorePct: 0.69, minutes: 171 },
  { name: 'Arjun Das', email: 'arjun.d@demo.school', scorePct: 0.64, minutes: 148 },
  { name: 'Isha Nair', email: 'isha.n@demo.school', scorePct: 0.58, minutes: 178 },
  { name: 'Karan Bhatia', email: 'karan.b@demo.school', scorePct: 0.51, minutes: 140 },
  { name: 'Meera Lal', email: 'meera.l@demo.school', scorePct: 0.45, minutes: 160 },
  { name: 'Dev Joshi', email: 'dev.j@demo.school', scorePct: 0.38, minutes: 133 },
  { name: 'Neha Gupta', email: 'neha.g@demo.school', scorePct: 0.32, minutes: 155 },
]

const MAX_SCORE = DEMO_SUBJECTS.length * DEMO_Q_PER_SUBJECT * DEMO_MARKS_CORRECT

/**
 * Build one subject row with attempted / correct / negative / total marks.
 * Subject mix varies slightly so Physics/Chemistry/Maths are not identical.
 * @param {number} strength 0–1 overall student strength
 * @param {number} subjectBias -0.08 … +0.08
 */
function buildSubjectStats(strength, subjectBias) {
  const p = Math.max(0.12, Math.min(0.98, strength + subjectBias))
  const totalQ = DEMO_Q_PER_SUBJECT
  const attemptRate = Math.max(0.35, Math.min(1, 0.55 + p * 0.45))
  const attempted = Math.round(totalQ * attemptRate)
  const correct = Math.round(attempted * p)
  const wrong = Math.max(0, attempted - correct)
  const unattempted = Math.max(0, totalQ - attempted)
  const positiveMarks = correct * DEMO_MARKS_CORRECT
  const negativeMarks = wrong * Math.abs(DEMO_MARKS_WRONG)
  const totalMarks = positiveMarks - negativeMarks
  const maxScore = totalQ * DEMO_MARKS_CORRECT
  return {
    correct,
    wrong,
    unattempted,
    attempted,
    questionsTotal: totalQ,
    positiveMarks,
    negativeMarks,
    totalMarks,
    score: totalMarks,
    maxScore,
  }
}

/**
 * Normalize subject stats from older demos or thin bySubject blobs.
 * @param {string} subject
 * @param {object} [raw]
 */
export function normalizeSubjectStats(subject, raw = {}) {
  const correct = Number(raw.correct) || 0
  const wrong = Number(raw.wrong) || 0
  const unattempted = Number(raw.unattempted) || 0
  const attempted =
    Number(raw.attempted) ||
    (correct + wrong > 0 ? correct + wrong : 0)
  const negativeMarks =
    raw.negativeMarks != null
      ? Number(raw.negativeMarks)
      : wrong * Math.abs(DEMO_MARKS_WRONG)
  const totalMarks =
    raw.totalMarks != null
      ? Number(raw.totalMarks)
      : raw.score != null
        ? Number(raw.score)
        : correct * DEMO_MARKS_CORRECT - negativeMarks
  const maxScore = Number(raw.maxScore) || DEMO_Q_PER_SUBJECT * DEMO_MARKS_CORRECT
  return {
    subject,
    correct,
    wrong,
    unattempted,
    attempted,
    questionsTotal: Number(raw.questionsTotal) || DEMO_Q_PER_SUBJECT,
    positiveMarks: Number(raw.positiveMarks) || correct * DEMO_MARKS_CORRECT,
    negativeMarks,
    totalMarks,
    score: totalMarks,
    maxScore,
  }
}

/**
 * @param {object} attempt
 * @returns {ReturnType<typeof normalizeSubjectStats>[]}
 */
export function getAttemptSubjectDetails(attempt) {
  const by =
    attempt?.bySubject ??
    attempt?.resultSnapshot?.result?.bySubject ??
    {}
  const names = Object.keys(by).length ? Object.keys(by) : DEMO_SUBJECTS
  return names.map((name) => normalizeSubjectStats(name, by[name] ?? {}))
}

/**
 * @param {{ force?: boolean }} [opts]
 * @returns {{ seeded: boolean, count: number, alreadyPresent?: boolean }}
 */
export function seedDemoBatchResults(opts = {}) {
  // Live mode: never auto-seed fake class results; only when teacher clicks Load demo (force).
  if (!opts.force && !allowAutoDemoSeed()) {
    return { seeded: false, count: 0, alreadyPresent: false }
  }
  if (!opts.force && typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_BATCH_SEED_KEY)) {
    const existing = getDemoBatchAttempts()
    if (existing.length) {
      return { seeded: false, count: existing.length, alreadyPresent: true }
    }
  }

  // Replace previous demo-batch rows so force reload stays clean
  try {
    const raw = localStorage.getItem('testvantage-attempt-history')
    const data = raw ? JSON.parse(raw) : { attempts: [] }
    data.attempts = (data.attempts ?? []).filter(
      (a) => !(a.isDemoBatch || String(a.id ?? '').startsWith('demo-batch-att-')),
    )
    localStorage.setItem('testvantage-attempt-history', JSON.stringify(data))
  } catch {
    /* ignore */
  }

  const now = Date.now()
  const attempts = DEMO_BATCH_STUDENTS.map((s, i) => {
    const biases = [0.05 - (i % 3) * 0.03, -0.02 + (i % 2) * 0.04, 0.01 - (i % 4) * 0.02]
    const bySubject = {}
    for (let si = 0; si < DEMO_SUBJECTS.length; si += 1) {
      bySubject[DEMO_SUBJECTS[si]] = buildSubjectStats(s.scorePct, biases[si])
    }

    const subjects = DEMO_SUBJECTS.map((name) => normalizeSubjectStats(name, bySubject[name]))
    const correct = subjects.reduce((n, x) => n + x.correct, 0)
    const wrong = subjects.reduce((n, x) => n + x.wrong, 0)
    const unattempted = subjects.reduce((n, x) => n + x.unattempted, 0)
    const score = subjects.reduce((n, x) => n + x.totalMarks, 0)
    const negativeMarks = subjects.reduce((n, x) => n + x.negativeMarks, 0)
    const attempted = subjects.reduce((n, x) => n + x.attempted, 0)
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0
    const durationSeconds = s.minutes * 60 + (i % 7) * 13
    const submittedAt = now - i * 47 * 60_000 - (i % 3) * 120_000
    const percentile = scoreToPercentile(score, MAX_SCORE)
    const ownerKey = `demo-batch-student-${i + 1}`
    const id = `demo-batch-att-${i + 1}`

    const resultSnapshot = {
      title: DEMO_BATCH_TEST_TITLE,
      durationSeconds,
      percentile,
      estimatedAIR: Math.max(1200, Math.round(18000 * (1 - s.scorePct) + 800)),
      tabViolations: i % 5 === 0 ? 1 : 0,
      submitReason: 'submit',
      questionTimes: {},
      visitedIds: [],
      result: {
        score,
        maxScore: MAX_SCORE,
        accuracy,
        correct,
        wrong,
        partial: 0,
        unattempted,
        markedCount: 0,
        negativeMarks,
        attempted,
        bySubject,
        byChapter: {},
        byQuestionType: {},
        perQuestion: [],
      },
    }

    return {
      id,
      ownerKey,
      testId: DEMO_BATCH_TEST_ID,
      title: DEMO_BATCH_TEST_TITLE,
      examPatternId: 'jee-main',
      testTypeId: 'full',
      userName: s.name,
      userEmail: s.email,
      score,
      maxScore: MAX_SCORE,
      accuracy,
      correct,
      wrong,
      partial: 0,
      unattempted,
      attempted,
      negativeMarks,
      durationSeconds,
      submittedAt,
      percentile,
      estimatedAIR: resultSnapshot.estimatedAIR,
      tabViolations: resultSnapshot.tabViolations,
      submitReason: 'submit',
      bySubject,
      byChapter: {},
      byQuestionType: {},
      markedCount: 0,
      isDemoBatch: true,
      resultSnapshot,
    }
  })

  for (const entry of [...attempts].reverse()) {
    saveAttempt(entry)
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DEMO_BATCH_SEED_KEY, '1')
  }

  return { seeded: true, count: attempts.length }
}

/** @returns {object[]} */
export function getDemoBatchAttempts() {
  return getAllStudentAttempts().filter(
    (a) => a.isDemoBatch || String(a.id ?? '').startsWith('demo-batch-att-'),
  )
}

/**
 * Remove leftover demo-batch attempts in live mode. Does not touch the question bank.
 */
export function purgeDemoBatchResultsIfLive() {
  if (allowAutoDemoSeed()) {
    return { purged: false, remaining: getDemoBatchAttempts().length }
  }
  if (typeof localStorage === 'undefined') return { purged: false, remaining: 0 }
  try {
    const raw = localStorage.getItem('testvantage-attempt-history')
    const data = raw ? JSON.parse(raw) : { attempts: [] }
    const before = (data.attempts ?? []).length
    data.attempts = (data.attempts ?? []).filter(
      (a) => !(a.isDemoBatch || String(a.id ?? '').startsWith('demo-batch-att-')),
    )
    localStorage.setItem('testvantage-attempt-history', JSON.stringify(data))
    localStorage.removeItem(DEMO_BATCH_SEED_KEY)
    return { purged: before !== data.attempts.length, remaining: 0 }
  } catch {
    return { purged: false, remaining: 0 }
  }
}

/**
 * Assign competition ranks (1,2,2,4…) by numeric score descending.
 * @param {object[]} rows
 * @param {(row: object) => number} getScore
 * @returns {Map<string, number>} id → rank
 */
export function assignDynamicRanks(rows, getScore) {
  const sorted = [...rows].sort((a, b) => getScore(b) - getScore(a))
  /** @type {Map<string, number>} */
  const ranks = new Map()
  let i = 0
  while (i < sorted.length) {
    const score = getScore(sorted[i])
    let j = i
    while (j < sorted.length && getScore(sorted[j]) === score) j += 1
    const rank = i + 1
    for (let k = i; k < j; k += 1) {
      ranks.set(sorted[k].id, rank)
    }
    i = j
  }
  return ranks
}

/**
 * Flat ranked rows with subject fields as columns (not nested).
 * @param {object[]} attempts
 * @param {'overall'|'Physics'|'Chemistry'|'Maths'} [rankBy]
 */
export function buildRankedBatchRows(attempts, rankBy = 'overall') {
  const rows = (attempts ?? [])
    .filter((a) => a.testId === DEMO_BATCH_TEST_ID || a.isDemoBatch)
    .map((a) => {
      const subjects = getAttemptSubjectDetails(a)
      /** @type {Record<string, ReturnType<typeof normalizeSubjectStats>>} */
      const byName = {}
      for (const s of subjects) byName[s.subject] = s
      return {
        ...a,
        subjectsByName: byName,
        physicsMarks: byName.Physics?.totalMarks ?? 0,
        chemistryMarks: byName.Chemistry?.totalMarks ?? 0,
        mathsMarks: byName.Maths?.totalMarks ?? 0,
      }
    })

  const overallRanks = assignDynamicRanks(rows, (r) => Number(r.score) || 0)
  const phyRanks = assignDynamicRanks(rows, (r) => r.physicsMarks)
  const chemRanks = assignDynamicRanks(rows, (r) => r.chemistryMarks)
  const mathsRanks = assignDynamicRanks(rows, (r) => r.mathsMarks)

  const scoreFn =
    rankBy === 'Physics'
      ? (r) => r.physicsMarks
      : rankBy === 'Chemistry'
        ? (r) => r.chemistryMarks
        : rankBy === 'Maths'
          ? (r) => r.mathsMarks
          : (r) => Number(r.score) || 0

  const activeRanks = assignDynamicRanks(rows, scoreFn)

  return [...rows]
    .sort((a, b) => scoreFn(b) - scoreFn(a) || String(a.userName).localeCompare(String(b.userName)))
    .map((r) => ({
      ...r,
      rank: activeRanks.get(r.id) ?? 0,
      overallRank: overallRanks.get(r.id) ?? 0,
      physicsRank: phyRanks.get(r.id) ?? 0,
      chemistryRank: chemRanks.get(r.id) ?? 0,
      mathsRank: mathsRanks.get(r.id) ?? 0,
    }))
}

/**
 * Collective stats for the demo batch (or any attempts list filtered to that paper).
 * @param {object[]} [attempts]
 */
export function summarizeDemoBatch(attempts) {
  const rows = (attempts ?? getDemoBatchAttempts()).filter(
    (a) => a.testId === DEMO_BATCH_TEST_ID || a.isDemoBatch,
  )
  if (!rows.length) {
    return {
      count: 0,
      avgScore: 0,
      avgPct: 0,
      avgAccuracy: 0,
      topper: null,
      lowest: null,
      title: DEMO_BATCH_TEST_TITLE,
      bySubject: [],
      studentSubjectRows: [],
    }
  }
  const sorted = [...rows].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const sumScore = rows.reduce((s, a) => s + (a.score ?? 0), 0)
  const sumAcc = rows.reduce((s, a) => s + (a.accuracy ?? 0), 0)
  const maxScore = rows[0]?.maxScore || MAX_SCORE

  /** @type {Map<string, { attempted: number, correct: number, negativeMarks: number, totalMarks: number, n: number }>} */
  const subjectAgg = new Map()
  for (const row of rows) {
    for (const sub of getAttemptSubjectDetails(row)) {
      const cur = subjectAgg.get(sub.subject) ?? {
        attempted: 0,
        correct: 0,
        negativeMarks: 0,
        totalMarks: 0,
        n: 0,
      }
      cur.attempted += sub.attempted
      cur.correct += sub.correct
      cur.negativeMarks += sub.negativeMarks
      cur.totalMarks += sub.totalMarks
      cur.n += 1
      subjectAgg.set(sub.subject, cur)
    }
  }

  const bySubject = DEMO_SUBJECTS.map((name) => {
    const cur = subjectAgg.get(name) ?? {
      attempted: 0,
      correct: 0,
      negativeMarks: 0,
      totalMarks: 0,
      n: rows.length,
    }
    const n = Math.max(1, cur.n)
    return {
      subject: name,
      questionsAttempted: Math.round(cur.attempted / n),
      correctQuestions: Math.round(cur.correct / n),
      negativeMarks: Math.round(cur.negativeMarks / n),
      totalMarks: Math.round(cur.totalMarks / n),
      batchAttempted: cur.attempted,
      batchCorrect: cur.correct,
      batchNegativeMarks: cur.negativeMarks,
      batchTotalMarks: cur.totalMarks,
    }
  })

  const studentSubjectRows = sorted.map((a) => ({
    id: a.id,
    userName: a.userName,
    userEmail: a.userEmail,
    subjects: getAttemptSubjectDetails(a),
  }))

  return {
    count: rows.length,
    avgScore: Math.round(sumScore / rows.length),
    avgPct: Math.round((sumScore / rows.length / maxScore) * 100),
    avgAccuracy: Math.round(sumAcc / rows.length),
    topper: sorted[0],
    lowest: sorted[sorted.length - 1],
    title: DEMO_BATCH_TEST_TITLE,
    maxScore,
    bySubject,
    studentSubjectRows,
  }
}
