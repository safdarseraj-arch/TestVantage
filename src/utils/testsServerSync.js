import { isPlatformScaleEnabled } from '../config/platform.js'
import { getSession } from './auth.js'
import { loadCustomTests } from './customTests.js'
import { fetchServerTests, pushServerTests } from './testsApi.js'

const TESTS_SYNC_META_KEY = 'testvantage-tests-sync-meta'

/** @returns {boolean} */
export function isLiveTestsSyncEnabled() {
  return isPlatformScaleEnabled()
}

/** @returns {{ updatedAt: number, lastPullAt?: number, lastPushAt?: number }} */
function loadSyncMeta() {
  try {
    const raw = localStorage.getItem(TESTS_SYNC_META_KEY)
    return raw ? JSON.parse(raw) : { updatedAt: 0 }
  } catch {
    return { updatedAt: 0 }
  }
}

/** @param {object} meta */
function saveSyncMeta(meta) {
  localStorage.setItem(TESTS_SYNC_META_KEY, JSON.stringify(meta))
}

/** @returns {{ tests: import('../data/tests').Test[] }} */
export function collectTestsPayload() {
  return { tests: loadCustomTests() }
}

/**
 * @param {{ tests: import('../data/tests').Test[], updatedAt?: number }} payload
 */
export function applyTestsPayload(payload) {
  localStorage.setItem(
    'testvantage-custom-tests',
    JSON.stringify({ tests: payload.tests ?? [] }),
  )
  saveSyncMeta({
    updatedAt: payload.updatedAt ?? Date.now(),
    lastPullAt: Date.now(),
    lastPushAt: loadSyncMeta().lastPushAt,
  })
}

let pushTimer = null

/** Debounced push after paper save. */
export function notifyTestsChanged() {
  if (!isLiveTestsSyncEnabled()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTestsToServer().catch(() => {})
  }, 800)
}

/** @returns {Promise<{ ok: boolean, error?: string, updatedAt?: number }>} */
export async function pushTestsToServer() {
  if (!isLiveTestsSyncEnabled()) {
    return { ok: false, error: 'Live sync off — set VITE_PLATFORM_SCALE=1 for server backup.' }
  }
  const session = getSession()
  const { tests } = collectTestsPayload()
  try {
    const result = await pushServerTests(tests, { email: session?.email })
    saveSyncMeta({
      updatedAt: result.updatedAt ?? Date.now(),
      lastPullAt: loadSyncMeta().lastPullAt,
      lastPushAt: Date.now(),
    })
    return { ok: true, updatedAt: result.updatedAt }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Push failed' }
  }
}

/** @returns {Promise<{ ok: boolean, error?: string, count?: number }>} */
export async function pullTestsFromServer() {
  if (!isLiveTestsSyncEnabled()) {
    return { ok: false, error: 'Live sync off' }
  }
  try {
    const remote = await fetchServerTests()
    const local = loadCustomTests()
    const remoteTs = remote.updatedAt ?? 0
    const localTs = loadSyncMeta().updatedAt ?? 0
    if (remote.tests.length && remoteTs >= localTs) {
      applyTestsPayload(remote)
    } else if (!local.length && remote.tests.length) {
      applyTestsPayload(remote)
    }
    return { ok: true, count: loadCustomTests().length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Pull failed' }
  }
}
