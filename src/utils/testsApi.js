import { API_BASE } from '../config/platform.js'

/** @returns {Promise<{ tests: import('../data/tests').Test[], updatedAt: number }>} */
export async function fetchServerTests() {
  const res = await fetch(`${API_BASE}/tests`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `Server returned ${res.status}`)
  }
  const data = await res.json()
  return {
    tests: Array.isArray(data?.tests) ? data.tests : [],
    updatedAt: Number(data?.updatedAt) || 0,
  }
}

/**
 * @param {import('../data/tests').Test[]} tests
 * @param {{ email?: string }} [opts]
 */
export async function pushServerTests(tests, opts = {}) {
  const res = await fetch(`${API_BASE}/tests`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Teacher-Email': opts.email ?? '',
    },
    body: JSON.stringify({ tests }),
    signal: AbortSignal.timeout(120000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Sync failed (${res.status})`)
  return data
}
