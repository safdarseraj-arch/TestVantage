import { isPlatformScaleEnabled } from '../config/platform.js'
import { getSession } from './auth.js'
import { loadAssignments } from './assignmentsStore.js'
import { loadClasses } from './classesStore.js'
import { fetchOrgData, pingOrgApi, pushOrgData } from './orgApi.js'
import { loadSchools } from './schoolsStore.js'
import { loadUsers, saveUsersDirect } from './users.js'

const ORG_SYNC_META_KEY = 'testvantage-org-sync-meta'

/** @returns {boolean} */
export function isLiveOrgSyncEnabled() {
  return isPlatformScaleEnabled()
}

/** @returns {{ updatedAt: number, lastPullAt?: number, lastPushAt?: number }} */
function loadSyncMeta() {
  try {
    const raw = localStorage.getItem(ORG_SYNC_META_KEY)
    return raw ? JSON.parse(raw) : { updatedAt: 0 }
  } catch {
    return { updatedAt: 0 }
  }
}

/** @param {object} meta */
function saveSyncMeta(meta) {
  localStorage.setItem(ORG_SYNC_META_KEY, JSON.stringify(meta))
}

/** @returns {{ schools: object[], classes: object[], assignments: object[], users: object[] }} */
export function collectOrgPayload() {
  return {
    schools: loadSchools(),
    classes: loadClasses(),
    assignments: loadAssignments(),
    users: loadUsers(),
  }
}

/**
 * @param {{
 *   schools: object[],
 *   classes: object[],
 *   assignments: object[],
 *   users: object[],
 *   updatedAt?: number,
 * }} payload
 */
export function applyOrgPayload(payload) {
  localStorage.setItem('testvantage-schools', JSON.stringify({ schools: payload.schools ?? [] }))
  localStorage.setItem('testvantage-classes', JSON.stringify({ classes: payload.classes ?? [] }))
  localStorage.setItem(
    'testvantage-assignments',
    JSON.stringify({ assignments: payload.assignments ?? [] }),
  )
  saveUsersDirect(payload.users ?? [])
  saveSyncMeta({
    updatedAt: payload.updatedAt ?? Date.now(),
    lastPullAt: Date.now(),
    lastPushAt: loadSyncMeta().lastPushAt,
  })
}

let pushTimer = null
let pushing = false

/** Debounced push after local school/teacher edits. */
export function notifyOrgChanged() {
  if (!isLiveOrgSyncEnabled()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushOrgToServer().catch(() => {})
  }, 600)
}

/** @returns {Promise<{ ok: boolean, updatedAt?: number, error?: string }>} */
export async function pushOrgToServer() {
  if (!isLiveOrgSyncEnabled()) {
    return { ok: false, error: 'Live sync is off — set VITE_PLATFORM_SCALE=1 in production build.' }
  }
  if (pushing) return { ok: false, error: 'Sync already in progress' }

  const apiUp = await pingOrgApi()
  if (!apiUp) return { ok: false, error: 'API offline — start with npm run api or npm run stack:up' }

  pushing = true
  try {
    const payload = collectOrgPayload()
    const saved = await pushOrgData(payload, { email: getSession()?.email ?? '' })
    saveSyncMeta({
      updatedAt: saved.updatedAt ?? Date.now(),
      lastPullAt: loadSyncMeta().lastPullAt,
      lastPushAt: Date.now(),
    })
    return { ok: true, updatedAt: saved.updatedAt }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Push failed' }
  } finally {
    pushing = false
  }
}

/**
 * Pull schools/classes/assignments/users from server (server wins on conflicts).
 * @returns {Promise<{ ok: boolean, counts?: object, error?: string }>}
 */
export async function pullOrgFromServer() {
  if (!isLiveOrgSyncEnabled()) {
    return { ok: false, error: 'Live sync is off — set VITE_PLATFORM_SCALE=1 in production build.' }
  }

  const apiUp = await pingOrgApi()
  if (!apiUp) return { ok: false, error: 'API offline — start with npm run api or npm run stack:up' }

  try {
    const remote = await fetchOrgData()
    const localMeta = loadSyncMeta()
    const local = collectOrgPayload()

    const merged = mergeOrgData(local, remote, localMeta.updatedAt, remote.updatedAt)
    applyOrgPayload({ ...merged, updatedAt: remote.updatedAt })

    return {
      ok: true,
      counts: {
        schools: merged.schools.length,
        classes: merged.classes.length,
        assignments: merged.assignments.length,
        users: merged.users.length,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Pull failed' }
  }
}

/**
 * Merge local + remote org data. Newer `updatedAt` bundle wins; tie goes to remote.
 * @param {object} local
 * @param {object} remote
 * @param {number} localUpdatedAt
 * @param {number} remoteUpdatedAt
 */
function mergeOrgData(local, remote, localUpdatedAt, remoteUpdatedAt) {
  if (remoteUpdatedAt >= localUpdatedAt) return remote

  const mergeById = (localRows, remoteRows) => {
    const map = new Map(remoteRows.map((r) => [r.id, r]))
    for (const row of localRows) map.set(row.id, row)
    return [...map.values()]
  }

  return {
    schools: mergeById(local.schools, remote.schools),
    classes: mergeById(local.classes, remote.classes),
    assignments: mergeById(local.assignments, remote.assignments),
    users: mergeById(local.users, remote.users),
  }
}
