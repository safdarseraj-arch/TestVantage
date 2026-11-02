import { API_BASE } from '../config/platform.js'

/**
 * @param {string} email
 * @param {string} password
 * @param {'admin' | 'student' | 'teacher' | 'any'} [roleHint]
 */
export async function loginRemote(email, password, roleHint = 'any') {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role: roleHint }),
    signal: AbortSignal.timeout(10000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return { ok: false, error: data?.error || `Login failed (${res.status})` }
  }
  return { ok: true, session: data.session }
}

/**
 * @param {string} adminEmail
 * @param {string} adminPassword
 */
export async function fetchLiveBackup(adminEmail, adminPassword) {
  const res = await fetch(`${API_BASE}/backup`, {
    headers: {
      'X-Admin-Email': adminEmail,
      'X-Admin-Password': adminPassword,
    },
    signal: AbortSignal.timeout(120000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `Backup failed (${res.status})`)
  }
  return res.json()
}

/** @returns {Promise<boolean>} */
export async function pingAuthApi() {
  try {
    const res = await fetch(`${API_BASE}/ready`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return false
    const data = await res.json()
    return data?.ready === true
  } catch {
    return false
  }
}
