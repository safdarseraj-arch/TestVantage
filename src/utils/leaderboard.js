import { allowAutoDemoSeed } from './prodSafety.js'
import { fetchAttemptsRemote } from './orgApi.js'
import { getAllStudentAttempts } from './attemptHistory.js'

const GLOBAL_KEY = 'testvantage-global-leaderboard'
const SEED_KEY = 'testvantage-leaderboard-seeded'

const DEMO_NAMES = [
  'Aarav S.', 'Priya M.', 'Rohan K.', 'Ananya P.', 'Vikram T.',
  'Sneha R.', 'Arjun D.', 'Isha N.', 'Karan B.', 'Meera L.',
]

function load() {
  try {
    const raw = localStorage.getItem(GLOBAL_KEY)
    return raw ? JSON.parse(raw) : { entries: [] }
  } catch {
    return { entries: [] }
  }
}

function save(data) {
  localStorage.setItem(GLOBAL_KEY, JSON.stringify(data))
}

/** Seed demo pool only in local dev when explicitly allowed — never marketed as live. */
export function seedDemoLeaderboard() {
  if (!allowAutoDemoSeed()) return
  if (localStorage.getItem(SEED_KEY)) return
  const tests = [
    'jee-main-chapter-kinematics',
    'jee-main-part-pcm',
    'jee-main-full-demo',
    'jee-advanced-all-types',
    'neet-part-demo',
  ]
  const entries = []
  tests.forEach((testId) => {
    for (let i = 0; i < 48; i++) {
      const maxScore = 100
      const score = Math.round(35 + Math.random() * 60 + (i < 5 ? 15 : 0))
      entries.push({
        id: `seed-${testId}-${i}`,
        testId,
        ownerKey: `seed-user-${i}`,
        userName: DEMO_NAMES[i % DEMO_NAMES.length],
        score: Math.min(score, maxScore),
        maxScore,
        submittedAt: Date.now() - i * 86400000,
        isDemo: true,
      })
    }
  })
  save({ entries })
  localStorage.setItem(SEED_KEY, '1')
}

/**
 * @param {object} entry
 */
export function recordGlobalScore(entry) {
  const data = load()
  // Drop stale demo rows in production path when real scores arrive
  if (!allowAutoDemoSeed()) {
    data.entries = data.entries.filter((e) => !e.isDemo)
  }
  data.entries.unshift({
    id: entry.id ?? `g-${Date.now()}`,
    testId: entry.testId,
    ownerKey: entry.ownerKey,
    userName: entry.userName ?? 'Student',
    score: entry.score,
    maxScore: entry.maxScore,
    submittedAt: entry.submittedAt ?? Date.now(),
    percentile: entry.percentile,
    isDemo: false,
  })
  if (data.entries.length > 800) data.entries = data.entries.slice(0, 800)
  save(data)
  return data.entries[0]
}

function attemptToEntry(a) {
  const demo = Boolean(a.isDemo || a.isDemoBatch)
  return {
    id: a.id || `att-${a.testId}-${a.ownerKey}`,
    testId: a.testId,
    ownerKey: a.ownerKey,
    userName: a.userName || a.name || 'Student',
    score: a.score ?? 0,
    maxScore: a.maxScore ?? 0,
    submittedAt: a.submittedAt ?? Date.now(),
    percentile: a.percentile,
    isDemo: demo,
  }
}

function purgeDemoLeaderboardRows() {
  if (allowAutoDemoSeed()) return
  const data = load()
  const next = (data.entries ?? []).filter((e) => !e.isDemo)
  if (next.length !== (data.entries ?? []).length) {
    save({ entries: next })
  }
}

/**
 * Merge local recorded scores + local attempt history (+ optional remote).
 * @param {string} testId
 * @param {object[]} [extraAttempts]
 */
function buildBoardEntries(testId, extraAttempts = []) {
  if (allowAutoDemoSeed()) seedDemoLeaderboard()
  else purgeDemoLeaderboardRows()

  const recorded = load().entries.filter((e) => e.testId === testId && (allowAutoDemoSeed() || !e.isDemo))

  const fromHistory = getAllStudentAttempts()
    .filter((a) => a.testId === testId && a.maxScore > 0 && (allowAutoDemoSeed() || !(a.isDemo || a.isDemoBatch)))
    .map(attemptToEntry)

  const fromExtra = (extraAttempts || [])
    .filter((a) => a.testId === testId && a.maxScore > 0 && (allowAutoDemoSeed() || !(a.isDemo || a.isDemoBatch)))
    .map(attemptToEntry)

  const byOwnerBest = new Map()
  for (const e of [...fromHistory, ...fromExtra, ...recorded]) {
    const prev = byOwnerBest.get(e.ownerKey)
    if (!prev || e.score > prev.score) byOwnerBest.set(e.ownerKey, e)
  }

  return [...byOwnerBest.values()].sort(
    (a, b) => b.score - a.score || a.submittedAt - b.submittedAt,
  )
}

/** @param {string} testId */
export function getLeaderboardForTest(testId, limit = 25) {
  return buildBoardEntries(testId).slice(0, limit)
}

/**
 * Async board: prefers remote attempts when API is up.
 * @param {string} testId
 * @param {number} [limit]
 */
export async function getLeaderboardForTestAsync(testId, limit = 25) {
  let remote = []
  try {
    remote = await fetchAttemptsRemote({ limit: 400 })
  } catch {
    remote = []
  }
  return buildBoardEntries(testId, remote).slice(0, limit)
}

/** @param {string} testId @param {number} score @param {string} ownerKey */
export function getUserRank(testId, score, ownerKey) {
  const sorted = buildBoardEntries(testId)
  const better = sorted.filter((e) => e.score > score).length
  const rank = better + 1
  const userBest = sorted.find((e) => e.ownerKey === ownerKey && e.score === score)
  return {
    rank,
    total: Math.max(sorted.length, 1),
    entry: userBest,
    isDemoBoard: allowAutoDemoSeed() && sorted.some((e) => e.isDemo),
  }
}

/** Whether the board includes any real (non-demo) rows for this test. */
export function leaderboardHasRealData(testId) {
  return buildBoardEntries(testId).some((e) => !e.isDemo)
}
