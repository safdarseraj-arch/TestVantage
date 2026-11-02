/**
 * In-progress exam sessions — local cache + optional server sync (platform scale).
 */
import { getGuestId } from './attemptHistory.js'
import { isPlatformScaleEnabled, examAutosaveIntervalMs } from '../config/platform.js'
import {
  pushExamProgressRemote,
  fetchExamProgressRemote,
  clearExamProgressRemote,
} from './examApi.js'

const STORAGE_KEY = 'testvantage-exam-progress'

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { sessions: [] }
  } catch {
    return { sessions: [] }
  }
}

function saveAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

/** @param {number} deadlineAt */
export function secondsLeftFromDeadline(deadlineAt) {
  return Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000))
}

/** Recommended autosave interval (ms) — aligns client with server capacity. */
export function examProgressAutosaveMs() {
  return isPlatformScaleEnabled() ? examAutosaveIntervalMs() : 4000
}

/**
 * @param {string} testId
 * @param {{ ownerKey: string, guestId?: string, email?: string | null }} who
 */
export async function findExamProgressAsync(testId, who) {
  if (isPlatformScaleEnabled()) {
    try {
      const remote = await fetchExamProgressRemote(testId, {
        ownerKey: who.ownerKey,
        studentEmail: who.email,
      })
      if (remote && secondsLeftFromDeadline(remote.deadlineAt) > 0) return remote
      if (remote) {
        clearExamProgress(testId, who.ownerKey)
        clearExamProgressRemote(testId, { ownerKey: who.ownerKey }).catch(() => {})
      }
    } catch {
      /* fall back to local */
    }
  }
  return findExamProgress(testId, who)
}

/**
 * @param {string} testId
 * @param {{ ownerKey: string, guestId?: string, email?: string | null }} who
 */
export function findExamProgress(testId, who) {
  const email = who.email?.trim().toLowerCase()
  const sessions = loadAll().sessions
  const match = sessions.find((s) => {
    if (s.testId !== testId) return false
    if (s.ownerKey === who.ownerKey) return true
    if (who.guestId && s.guestOwnerKey === who.guestId) return true
    if (email && s.userEmail?.toLowerCase() === email) return true
    return false
  })
  if (!match) return null
  if (secondsLeftFromDeadline(match.deadlineAt) <= 0) {
    clearExamProgress(testId, match.ownerKey)
    return null
  }
  return match
}

/** @param {object} snapshot */
export function saveExamProgress(snapshot) {
  if (!snapshot?.testId || !snapshot?.ownerKey || !snapshot?.deadlineAt) return
  const data = loadAll()
  const idx = data.sessions.findIndex(
    (s) => s.testId === snapshot.testId && s.ownerKey === snapshot.ownerKey,
  )
  const entry = {
    ...snapshot,
    guestOwnerKey: snapshot.guestOwnerKey ?? getGuestId(),
    updatedAt: Date.now(),
  }
  if (idx >= 0) data.sessions[idx] = entry
  else data.sessions.push(entry)
  if (data.sessions.length > 12) {
    data.sessions.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    data.sessions = data.sessions.slice(0, 12)
  }
  saveAll(data)

  if (isPlatformScaleEnabled()) {
    pushExamProgressRemote(entry, {
      ownerKey: entry.ownerKey,
      studentEmail: entry.userEmail,
    }).catch(() => {})
  }
}

/** @param {string} testId @param {string} ownerKey */
export function clearExamProgress(testId, ownerKey) {
  const data = loadAll()
  data.sessions = data.sessions.filter(
    (s) => !(s.testId === testId && s.ownerKey === ownerKey),
  )
  saveAll(data)
  if (isPlatformScaleEnabled()) {
    clearExamProgressRemote(testId, { ownerKey }).catch(() => {})
  }
}

/** Reassign saved exams from guest id to logged-in user id after login. */
export function migrateExamProgressOwner(oldOwnerKey, newOwnerKey) {
  if (!oldOwnerKey || !newOwnerKey || oldOwnerKey === newOwnerKey) return
  const data = loadAll()
  let changed = false
  for (const s of data.sessions) {
    if (s.ownerKey === oldOwnerKey) {
      s.ownerKey = newOwnerKey
      changed = true
    }
    if (s.guestOwnerKey === oldOwnerKey) {
      s.guestOwnerKey = oldOwnerKey
      changed = true
    }
  }
  if (changed) saveAll(data)
}

/** @param {string} ownerKey */
export function listResumableExams(ownerKey) {
  const guestId = getGuestId()
  return loadAll()
    .sessions.filter((s) => {
      const mine = s.ownerKey === ownerKey || s.guestOwnerKey === guestId
      return mine && secondsLeftFromDeadline(s.deadlineAt) > 0
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}
