import { API_BASE } from '../config/platform.js'

/** @returns {Promise<boolean>} */
export async function pingBankApi() {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return false
    const data = await res.json()
    return data?.ok === true
  } catch {
    return false
  }
}

/** @returns {Promise<{ questions: import('../data/tests').Question[], updatedAt: number }>} */
export async function fetchServerQuestions() {
  const res = await fetch(`${API_BASE}/questions`, {
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error || `Server returned ${res.status}`)
  }
  const data = await res.json()
  return {
    questions: Array.isArray(data?.questions) ? data.questions : [],
    updatedAt: Number(data?.updatedAt) || 0,
  }
}

/**
 * @param {import('../data/tests').Question} question
 * @param {{ email?: string }} [opts]
 */
export async function upsertServerQuestion(question, opts = {}) {
  const res = await fetch(`${API_BASE}/questions/${encodeURIComponent(question.id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Teacher-Email': opts.email ?? '',
    },
    body: JSON.stringify({ question }),
    signal: AbortSignal.timeout(60000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Sync failed (${res.status})`)
  return data.question
}

/**
 * @param {import('../data/tests').Question[]} questions
 * @param {{ email?: string }} [opts]
 */
export async function bulkSyncServerQuestions(questions, opts = {}) {
  const res = await fetch(`${API_BASE}/questions/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Teacher-Email': opts.email ?? '',
    },
    body: JSON.stringify({ questions }),
    signal: AbortSignal.timeout(120000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Bulk sync failed (${res.status})`)
  return data
}
