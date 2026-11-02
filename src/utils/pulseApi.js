/**
 * Server-backed Peer Pulse / Study Circle / Merit sync.
 * Falls back silently when API is offline — local storage still works.
 */
import { API_BASE } from '../config/platform.js'

async function pulseFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    signal: AbortSignal.timeout(opts.timeout ?? 10000),
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error || `Pulse API ${res.status}`)
  return data
}

export async function pingPulseApi() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/** @param {string} code */
export async function fetchPulseProfileRemote(code) {
  const q = encodeURIComponent(String(code).trim().toUpperCase())
  const data = await pulseFetch(`/pulse/profile?code=${q}`)
  return data?.profile ?? null
}

/** @param {object} profile */
export async function pushPulseProfileRemote(profile) {
  return pulseFetch('/pulse/profile', {
    method: 'PUT',
    body: JSON.stringify({ profile }),
  })
}

/** @param {string} ownerKey */
export async function fetchPulseLinkRemote(ownerKey) {
  const data = await pulseFetch(`/pulse/link?ownerKey=${encodeURIComponent(ownerKey)}`)
  return data?.peerCode ?? null
}

/**
 * @param {string} ownerKey
 * @param {string|null} peerCode
 */
export async function pushPulseLinkRemote(ownerKey, peerCode) {
  return pulseFetch('/pulse/link', {
    method: 'PUT',
    body: JSON.stringify({ ownerKey, peerCode }),
  })
}

/** @param {object} circle */
export async function pushCircleRemote(circle) {
  return pulseFetch('/pulse/circle', {
    method: 'PUT',
    body: JSON.stringify({ circle }),
  })
}

/** @param {string} code */
export async function fetchCircleRemote(code) {
  const data = await pulseFetch(`/pulse/circle?code=${encodeURIComponent(String(code).trim().toUpperCase())}`)
  return data?.circle ?? null
}

/** @param {string} ownerKey */
export async function fetchMyCirclesRemote(ownerKey) {
  const data = await pulseFetch(`/pulse/circles?ownerKey=${encodeURIComponent(ownerKey)}`)
  return Array.isArray(data?.circles) ? data.circles : []
}

/**
 * @param {{ code: string, ownerKey: string, name: string, sparCode: string }} opts
 */
export async function joinCircleRemote(opts) {
  return pulseFetch('/pulse/circle/join', {
    method: 'POST',
    body: JSON.stringify(opts),
  })
}

/** @param {string} ownerKey @param {object} state */
export async function pushMeritRemote(ownerKey, state) {
  return pulseFetch('/pulse/merit', {
    method: 'PUT',
    body: JSON.stringify({ ownerKey, state }),
  })
}

/** @param {string} ownerKey */
export async function fetchMeritRemote(ownerKey) {
  const data = await pulseFetch(`/pulse/merit?ownerKey=${encodeURIComponent(ownerKey)}`)
  return data?.state ?? null
}

/** Fire-and-forget sync helper */
export function syncPulseQuiet(fn) {
  Promise.resolve()
    .then(fn)
    .catch(() => {
      /* offline / local-only OK */
    })
}
