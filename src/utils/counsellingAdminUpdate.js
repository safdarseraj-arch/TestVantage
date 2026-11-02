import { API_BASE } from '../config/platform.js'
import { getSession, loadAdminAccount } from './auth.js'

export const COUNSELLING_UPDATE_TAB = {
  id: 'update-data',
  label: 'Update data',
}

function adminHeaders() {
  const admin = loadAdminAccount()
  const session = getSession()
  return {
    'Content-Type': 'application/json',
    'X-Admin-Email': String(session?.email || admin.email || '').trim().toLowerCase(),
    'X-Admin-Password': String(admin.password || ''),
  }
}

function statusUrl() {
  const base = String(API_BASE || '/api').replace(/\/$/, '')
  return `${base}/career-compass/update-counselling`
}

/**
 * @param {any} data
 * @param {number} [httpStatus]
 */
function normalizeJob(data, httpStatus = 200) {
  const engine = data?.engine === 'openai' ? 'openai' : data?.engine === 'local' ? 'local' : 'gemini'
  const engineLabel =
    data?.engineLabel || (engine === 'openai' ? 'OpenAI' : engine === 'local' ? 'local AI' : 'Gemini')
  const status =
    data?.status === 'running' || data?.status === 'done' || data?.status === 'failed' ? data.status : 'idle'
  let message = String(data?.message || '').trim()
  if (!message) {
    if (status === 'running') message = `Updating with ${engineLabel}...`
    else if (status === 'done') message = `Updated with ${engineLabel}. Indicative -- unknown stays Not available.`
    else if (status === 'failed') message = `Update failed${data?.error ? `: ${data.error}` : '.'}`
    else message = `Ready to update with ${engineLabel}.`
  }
  return {
    ok: data?.ok !== false && httpStatus < 400,
    started: Boolean(data?.started),
    alreadyRunning: Boolean(data?.alreadyRunning),
    status,
    engine,
    engineLabel,
    model: data?.model ?? null,
    cloud: Boolean(data?.cloud),
    message,
    error: data?.error ? String(data.error) : null,
    hint: data?.hint ? String(data.hint) : '',
    collegeCount: Number(data?.collegeCount) || 0,
    cloudFilled: Number(data?.cloudFilled) || 0,
    source: data?.source ? String(data.source) : '',
    batch: data?.batch && typeof data.batch === 'object' ? data.batch : null,
  }
}

export async function fetchCounsellingUpdateStatus() {
  const res = await fetch(statusUrl(), {
    headers: adminHeaders(),
    signal: AbortSignal.timeout(12000),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    return {
      ...normalizeJob({ status: 'failed', engine: 'local', engineLabel: 'local AI' }, res.status),
      ok: false,
      error: data?.error || 'Admin login required',
      message: data?.error || 'Admin login required',
    }
  }
  if (!res.ok) {
    const err = data?.error || `Could not read update status (${res.status})`
    return { ...normalizeJob({ status: 'failed', error: err, message: err }, res.status), ok: false }
  }
  return normalizeJob(data, res.status)
}

export async function startCounsellingAdminUpdate() {
  const res = await fetch(statusUrl(), {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ force: false }),
    signal: AbortSignal.timeout(20000),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    throw new Error(data?.error || 'Admin login required')
  }
  if (!res.ok) {
    throw new Error(data?.error || `Update failed (${res.status})`)
  }
  return normalizeJob(data, res.status)
}
