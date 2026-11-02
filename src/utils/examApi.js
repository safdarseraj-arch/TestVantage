import { API_BASE } from '../config/platform.js'

/** @returns {Promise<boolean>} */
export async function pingExamApi() {
  try {
    const res = await fetch(`${API_BASE}/ready`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return false
    const data = await res.json()
    return data?.ready === true
  } catch {
    return false
  }
}

/**
 * @param {{ ownerKey: string, studentEmail?: string | null }} who
 */
function studentHeaders(who) {
  return {
    'Content-Type': 'application/json',
    'X-Student-Id': who.ownerKey,
    ...(who.studentEmail ? { 'X-Student-Email': who.studentEmail } : {}),
    'X-Request-Id': `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  }
}

/**
 * @param {object} snapshot
 * @param {{ ownerKey: string, studentEmail?: string | null }} who
 */
export async function pushExamProgressRemote(snapshot, who) {
  const res = await fetch(`${API_BASE}/exam-sessions`, {
    method: 'PUT',
    headers: studentHeaders(who),
    body: JSON.stringify({ session: snapshot }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `Exam save failed (${res.status})`)
  }
  return res.json()
}

/**
 * @param {string} testId
 * @param {{ ownerKey: string, studentEmail?: string | null }} who
 */
export async function fetchExamProgressRemote(testId, who) {
  const res = await fetch(
    `${API_BASE}/exam-sessions/${encodeURIComponent(who.ownerKey)}/${encodeURIComponent(testId)}`,
    {
      headers: studentHeaders(who),
      signal: AbortSignal.timeout(10000),
    },
  )
  if (res.status === 404) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `Exam load failed (${res.status})`)
  }
  const data = await res.json()
  return data?.session ?? null
}

/**
 * @param {string} testId
 * @param {{ ownerKey: string }} who
 */
export async function clearExamProgressRemote(testId, who) {
  await fetch(
    `${API_BASE}/exam-sessions/${encodeURIComponent(who.ownerKey)}/${encodeURIComponent(testId)}`,
    {
      method: 'DELETE',
      headers: studentHeaders(who),
      signal: AbortSignal.timeout(8000),
    },
  ).catch(() => {})
}

/**
 * @param {object} attempt
 * @param {{ ownerKey: string, studentEmail?: string | null }} who
 */
export async function submitAttemptRemote(attempt, who) {
  const res = await fetch(`${API_BASE}/attempts`, {
    method: 'POST',
    headers: studentHeaders(who),
    body: JSON.stringify({ attempt }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `Submit failed (${res.status})`)
  }
  return res.json()
}

/**
 * @returns {Promise<{ targetConcurrentStudents: number, activeExamSessions: number } | null>}
 */
export async function fetchPlatformHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
