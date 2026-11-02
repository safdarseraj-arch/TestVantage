import { API_BASE } from '../config/platform.js'

/** @returns {Promise<boolean>} */
export async function pingOrgApi() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return false
    const data = await res.json()
    return data?.ok === true
  } catch {
    return false
  }
}

/**
 * @returns {Promise<{
 *   schools: object[],
 *   classes: object[],
 *   assignments: object[],
 *   users: object[],
 *   updatedAt: number,
 * }>}
 */
export async function fetchOrgData() {
  const res = await fetch(`${API_BASE}/org`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `Server returned ${res.status}`)
  }
  const data = await res.json()
  return {
    schools: Array.isArray(data?.schools) ? data.schools : [],
    classes: Array.isArray(data?.classes) ? data.classes : [],
    assignments: Array.isArray(data?.assignments) ? data.assignments : [],
    users: Array.isArray(data?.users) ? data.users : [],
    updatedAt: Number(data?.updatedAt) || 0,
  }
}

/**
 * @param {{
 *   schools: object[],
 *   classes: object[],
 *   assignments: object[],
 *   users: object[],
 * }} payload
 * @param {{ email?: string }} [opts]
 */
export async function pushOrgData(payload, opts = {}) {
  const res = await fetch(`${API_BASE}/org`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Teacher-Email': opts.email ?? '',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Org sync failed (${res.status})`)
  return data
}

/**
 * @param {{ ownerKeys?: string[], limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function fetchAttemptsRemote(opts = {}) {
  const params = new URLSearchParams()
  if (opts.ownerKeys?.length) params.set('ownerKeys', opts.ownerKeys.join(','))
  if (opts.limit) params.set('limit', String(opts.limit))
  const qs = params.toString()
  const res = await fetch(`${API_BASE}/attempts${qs ? `?${qs}` : ''}`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `Attempts fetch failed (${res.status})`)
  }
  const data = await res.json()
  return Array.isArray(data?.attempts) ? data.attempts : []
}
