/**
 * Merit Stride — Merit Points, Stride Badges, Focus Goals.
 * Local progress + server sync (`/api/pulse/merit` + profiles).
 */
import { getAttemptsByOwner } from './attemptHistory.js'
import { buildUserAnalytics } from './analytics.js'
import { pushMeritRemote, pushPulseProfileRemote, syncPulseQuiet } from './pulseApi.js'

const STORE_KEY = 'testvantage-merit-stride'
const PROFILE_DIR_KEY = 'testvantage-student-pulse-profiles'

/** @typedef {{
 *   ownerKey: string
 *   meritPoints: number
 *   badges: string[]
 *   focusGoal: number
 *   focusEarnedToday: number
 *   focusDate: string
 *   history: { at: number, points: number, reason: string, testId?: string }[]
 * }} MeritState */

/** @type {{ id: string, title: string, desc: string, check: (ctx: object) => boolean }[]} */
export const STRIDE_BADGES = [
  {
    id: 'first-stride',
    title: 'First Stride',
    desc: 'Complete your first scored attempt',
    check: (c) => c.totalAttempts >= 1,
  },
  {
    id: 'focus-keeper',
    title: 'Focus Keeper',
    desc: 'Hit your Focus Goal for the day',
    check: (c) => c.focusHitToday,
  },
  {
    id: 'three-day-pulse',
    title: 'Three-Day Pulse',
    desc: 'Practice on 3 days in a row',
    check: (c) => c.streak >= 3,
  },
  {
    id: 'sharp-shot',
    title: 'Sharp Shot',
    desc: 'Score 80%+ accuracy on any attempt',
    check: (c) => c.bestAccuracy >= 80,
  },
  {
    id: 'century-merit',
    title: 'Century Merit',
    desc: 'Earn 100 Merit Points',
    check: (c) => c.meritPoints >= 100,
  },
  {
    id: 'drill-finisher',
    title: 'Drill Finisher',
    desc: 'Finish Today’s Drill once',
    check: (c) => c.drillCompletions >= 1,
  },
]

function todayKey() {
  return new Date().toDateString()
}

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) : { byOwner: {} }
  } catch {
    return { byOwner: {} }
  }
}

function saveRaw(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data))
}

/** @param {string} ownerKey */
export function getMeritState(ownerKey) {
  const data = loadRaw()
  const existing = data.byOwner[ownerKey]
  if (existing) {
    if (existing.focusDate !== todayKey()) {
      existing.focusDate = todayKey()
      existing.focusEarnedToday = 0
      data.byOwner[ownerKey] = existing
      saveRaw(data)
    }
    return existing
  }
  /** @type {MeritState} */
  const fresh = {
    ownerKey,
    meritPoints: 0,
    badges: [],
    focusGoal: 25,
    focusEarnedToday: 0,
    focusDate: todayKey(),
    history: [],
  }
  data.byOwner[ownerKey] = fresh
  saveRaw(data)
  return fresh
}

/**
 * @param {string} ownerKey
 * @param {{ points: number, reason: string, testId?: string }} award
 */
export function awardMeritPoints(ownerKey, award) {
  const data = loadRaw()
  const state = getMeritState(ownerKey)
  const points = Math.max(0, Math.round(award.points))
  state.meritPoints += points
  if (state.focusDate !== todayKey()) {
    state.focusDate = todayKey()
    state.focusEarnedToday = 0
  }
  state.focusEarnedToday += points
  state.history.unshift({
    at: Date.now(),
    points,
    reason: award.reason,
    testId: award.testId,
  })
  if (state.history.length > 80) state.history = state.history.slice(0, 80)
  data.byOwner[ownerKey] = state
  saveRaw(data)
  refreshStrideBadges(ownerKey)
  return getMeritState(ownerKey)
}

/**
 * Award from a finished attempt (idempotent per attempt id via history scan).
 * @param {{
 *   ownerKey: string
 *   attemptId: string
 *   score: number
 *   maxScore: number
 *   accuracy?: number
 *   testId?: string
 *   title?: string
 * }} attempt
 */
export function awardMeritFromAttempt(attempt) {
  const { ownerKey, attemptId } = attempt
  if (!ownerKey || !attemptId) return getMeritState(ownerKey ?? 'guest')
  const state = getMeritState(ownerKey)
  if (state.history.some((h) => h.testId === `attempt:${attemptId}`)) {
    return state
  }
  const pct = attempt.maxScore > 0 ? (attempt.score / attempt.maxScore) * 100 : 0
  const accuracy = attempt.accuracy ?? pct
  let points = 10
  points += Math.round(Math.min(40, pct / 2.5))
  if (accuracy >= 80) points += 8
  if (String(attempt.testId ?? '').includes('drill') || /today.?s drill/i.test(attempt.title ?? '')) {
    points += 12
  }
  return awardMeritPoints(ownerKey, {
    points,
    reason: attempt.title ? `Finished: ${attempt.title}` : 'Completed a session',
    testId: `attempt:${attemptId}`,
  })
}

/** @param {string} ownerKey */
export function setFocusGoal(ownerKey, goal) {
  const data = loadRaw()
  const state = getMeritState(ownerKey)
  state.focusGoal = Math.max(10, Math.min(100, Math.round(goal)))
  data.byOwner[ownerKey] = state
  saveRaw(data)
  return state
}

/**
 * @param {string} ownerKey
 * @param {{ drillCompletions?: number }} [extra]
 */
export function refreshStrideBadges(ownerKey, extra = {}) {
  const data = loadRaw()
  const state = getMeritState(ownerKey)
  const attempts = getAttemptsByOwner(ownerKey)
  const analytics = buildUserAnalytics(attempts)
  const bestAccuracy = attempts.reduce((m, a) => Math.max(m, a.accuracy ?? 0), 0)
  const drillCompletions =
    extra.drillCompletions ??
    attempts.filter(
      (a) =>
        String(a.testId ?? '').includes('drill') || /today.?s drill/i.test(a.title ?? ''),
    ).length
  const ctx = {
    totalAttempts: attempts.length,
    streak: analytics.streak ?? 0,
    bestAccuracy,
    meritPoints: state.meritPoints,
    focusHitToday: state.focusEarnedToday >= state.focusGoal,
    drillCompletions,
  }
  const earned = new Set(state.badges)
  for (const badge of STRIDE_BADGES) {
    if (badge.check(ctx)) earned.add(badge.id)
  }
  state.badges = [...earned]
  data.byOwner[ownerKey] = state
  saveRaw(data)
  return state
}

/** Publish lightweight stats for Peer Pulse / Study Circle lookups. */
export function upsertPulseProfile({
  ownerKey,
  code,
  name,
  examHint,
}) {
  const merit = getMeritState(ownerKey)
  const attempts = getAttemptsByOwner(ownerKey)
  const analytics = buildUserAnalytics(attempts)
  const today = todayKey()
  const todayAttempts = attempts.filter((a) => new Date(a.submittedAt).toDateString() === today)
  const dailyScore = todayAttempts.reduce((s, a) => s + (a.score ?? 0), 0)
  const dailyMax = todayAttempts.reduce((s, a) => s + (a.maxScore ?? 0), 0)

  let dir = { profiles: {} }
  try {
    const raw = localStorage.getItem(PROFILE_DIR_KEY)
    if (raw) dir = JSON.parse(raw)
  } catch {
    /* ignore */
  }
  dir.profiles = dir.profiles ?? {}
  dir.profiles[code] = {
    code,
    ownerKey,
    name: name || 'Student',
    examHint: examHint || '',
    streak: analytics.streak ?? 0,
    accuracy: analytics.avgAccuracy ?? 0,
    meritPoints: merit.meritPoints,
    dailyScore,
    dailyMax,
    focusEarnedToday: merit.focusEarnedToday,
    focusGoal: merit.focusGoal,
    updatedAt: Date.now(),
  }
  localStorage.setItem(PROFILE_DIR_KEY, JSON.stringify(dir))
  const profile = dir.profiles[code]
  syncPulseQuiet(() => pushPulseProfileRemote(profile))
  syncPulseQuiet(() => pushMeritRemote(ownerKey, merit))
  return profile
}

/** @param {string} code */
export function getPulseProfileByCode(code) {
  try {
    const raw = localStorage.getItem(PROFILE_DIR_KEY)
    if (!raw) return null
    const dir = JSON.parse(raw)
    const key = String(code || '')
      .trim()
      .toUpperCase()
    return dir.profiles?.[key] ?? null
  } catch {
    return null
  }
}

export function listPulseProfiles() {
  try {
    const raw = localStorage.getItem(PROFILE_DIR_KEY)
    if (!raw) return []
    const dir = JSON.parse(raw)
    return Object.values(dir.profiles ?? {})
  } catch {
    return []
  }
}

export const DAILY_TARGET_KEY = 'testvantage-daily-target'
export const DAILY_GOAL_CHOICES = [15, 25, 40]

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function loadDailyStore() {
  try {
    const raw = localStorage.getItem(DAILY_TARGET_KEY)
    if (!raw) return { byOwner: {} }
    const parsed = JSON.parse(raw)
    return { byOwner: parsed?.byOwner && typeof parsed.byOwner === 'object' ? parsed.byOwner : {} }
  } catch {
    return { byOwner: {} }
  }
}

function saveDailyStore(store) {
  localStorage.setItem(DAILY_TARGET_KEY, JSON.stringify(store))
}

function chapterAttemptedCount(chapterStats) {
  if (!chapterStats || typeof chapterStats !== 'object') return 0
  return (chapterStats.correct ?? 0) + (chapterStats.wrong ?? 0) + (chapterStats.partial ?? 0)
}

export function loadDailyTarget(ownerKey) {
  const key = String(ownerKey || 'guest')
  const saved = loadDailyStore().byOwner[key]
  if (saved && saved.date === todayIso()) return saved
  return {
    date: todayIso(),
    examId: saved?.examId || 'jee-main',
    goalQuestions: saved?.goalQuestions || 25,
    chapters: Array.isArray(saved?.chapters) ? saved.chapters : [],
  }
}

export function saveDailyTarget(ownerKey, patch) {
  const store = loadDailyStore()
  const key = String(ownerKey || 'guest')
  const next = {
    ...loadDailyTarget(ownerKey),
    ...patch,
    date: todayIso(),
  }
  if (Array.isArray(next.chapters)) next.chapters = next.chapters.slice(0, 3)
  next.goalQuestions = DAILY_GOAL_CHOICES.includes(Number(next.goalQuestions))
    ? Number(next.goalQuestions)
    : 25
  store.byOwner[key] = next
  saveDailyStore(store)
  return next
}

export function suggestBacklogChapters(ownerKey) {
  const attempts = getAttemptsByOwner(ownerKey)
  const analytics = buildUserAnalytics(attempts)
  return (analytics.weakChapters ?? []).slice(0, 3).map((c) => ({
    chapter: c.chapter,
    accuracy: c.accuracy,
    subject: c.subject,
  }))
}

export function countTodayChapterQuestions(ownerKey, chapters) {
  const names = new Set(
    (chapters ?? []).map((c) => String(c.chapter || '').trim().toLowerCase()).filter(Boolean),
  )
  if (!names.size) return 0
  const today = new Date().toDateString()
  const attempts = getAttemptsByOwner(ownerKey).filter(
    (a) => a.submittedAt && new Date(a.submittedAt).toDateString() === today,
  )
  let n = 0
  for (const a of attempts) {
    const byChapter = a.byChapter ?? a.result?.byChapter ?? {}
    for (const [chapter, stats] of Object.entries(byChapter)) {
      if (names.has(String(chapter).trim().toLowerCase())) {
        n += chapterAttemptedCount(stats)
      }
    }
    if (!Object.keys(byChapter).length) {
      const rows = a.perQuestion ?? a.result?.perQuestion ?? []
      n += rows.filter(
        (q) =>
          names.has(String(q.chapter || '').trim().toLowerCase()) && q.grade !== 'unattempted',
      ).length
    }
  }
  return n
}

export function dailyTargetProgress(ownerKey) {
  const target = loadDailyTarget(ownerKey)
  const done = countTodayChapterQuestions(ownerKey, target.chapters)
  const goal = Math.max(1, target.goalQuestions || 25)
  return {
    target,
    done,
    goal,
    remaining: Math.max(0, goal - done),
    pct: Math.min(100, Math.round((done / goal) * 100)),
    hit: done >= goal,
  }
}
