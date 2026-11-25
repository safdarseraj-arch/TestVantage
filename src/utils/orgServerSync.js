import { isPlatformScaleEnabled } from '../config/platform.js'
import { getSession } from './auth.js'
import { loadAssignments } from './assignmentsStore.js'
import { loadClasses } from './classesStore.js'
import { fetchOrgData, pingOrgApi, pushOrgData } from './orgApi.js'
import { loadBatches } from './schoolBatchesStore.js'
import { loadSchoolInvites } from './schoolInvitesStore.js'
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

/**
 * @returns {{
 *   schools: object[],
 *   classes: object[],
 *   assignments: object[],
 *   users: object[],
 *   batches: object[],
 *   invites: object[],
 * }}
 */
export function collectOrgPayload() {
  return {
    schools: loadSchools(),
    classes: loadClasses(),
    assignments: loadAssignments(),
    users: loadUsers(),
    batches: loadBatches(),
    invites: loadSchoolInvites(),
  }
}

/**
 * @param {{
 *   schools: object[],
 *   classes: object[],
 *   assignments: object[],
 *   users: object[],
 *   batches?: object[],
 *   invites?: object[],
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
  localStorage.setItem(
    'testvantage-school-batches',
    JSON.stringify({ batches: payload.batches ?? [] }),
  )
  localStorage.setItem(
    'testvantage-school-invites',
    JSON.stringify({ invites: payload.invites ?? [] }),
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
 * Pull schools/classes/assignments/users/batches/invites from server (server wins on conflicts).
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
        batches: merged.batches.length,
        invites: merged.invites.length,
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
  if (remoteUpdatedAt >= localUpdatedAt) {
    return {
      schools: remote.schools ?? [],
      classes: remote.classes ?? [],
      assignments: remote.assignments ?? [],
      users: remote.users ?? [],
      batches: remote.batches ?? [],
      invites: remote.invites ?? [],
    }
  }

  const mergeByKey = (localRows, remoteRows, keyFn) => {
    const map = new Map((remoteRows || []).map((r) => [keyFn(r), r]))
    for (const row of localRows || []) map.set(keyFn(row), row)
    return [...map.values()]
  }

  return {
    schools: mergeByKey(local.schools, remote.schools, (r) => r.id),
    classes: mergeByKey(local.classes, remote.classes, (r) => r.id),
    assignments: mergeByKey(local.assignments, remote.assignments, (r) => r.id),
    users: mergeByKey(local.users, remote.users, (r) => r.id),
    batches: mergeByKey(local.batches, remote.batches, (r) => r.id),
    invites: mergeByKey(local.invites, remote.invites, (r) => r.code),
  }
}
