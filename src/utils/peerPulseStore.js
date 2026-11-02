/**
 * Peer Pulse — share Spar Code, link a peer, compare daily stats.
 * Local cache + server directory (`/api/pulse/*`) when API is up.
 */
import {
  getMeritState,
  getPulseProfileByCode,
  upsertPulseProfile,
} from './meritStrideStore.js'
import {
  fetchPulseLinkRemote,
  fetchPulseProfileRemote,
  pushPulseLinkRemote,
  pushPulseProfileRemote,
  syncPulseQuiet,
} from './pulseApi.js'

const LINK_KEY = 'testvantage-peer-pulse-links'
const CODE_KEY = 'testvantage-peer-pulse-codes'

function loadCodes() {
  try {
    const raw = localStorage.getItem(CODE_KEY)
    return raw ? JSON.parse(raw) : { byOwner: {} }
  } catch {
    return { byOwner: {} }
  }
}

function saveCodes(data) {
  localStorage.setItem(CODE_KEY, JSON.stringify(data))
}

function loadLinks() {
  try {
    const raw = localStorage.getItem(LINK_KEY)
    return raw ? JSON.parse(raw) : { byOwner: {} }
  } catch {
    return { byOwner: {} }
  }
}

function saveLinks(data) {
  localStorage.setItem(LINK_KEY, JSON.stringify(data))
}

/** Stable short Spar Code from owner key. */
function hashCode(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let n = h >>> 0
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += alphabet[n % alphabet.length]
    n = Math.floor(n / alphabet.length) ^ (h >>> ((i + 1) * 3))
  }
  return out
}

/**
 * @param {string} ownerKey
 * @param {{ name?: string, examHint?: string }} [meta]
 */
export function getOrCreateSparCode(ownerKey, meta = {}) {
  const data = loadCodes()
  let code = data.byOwner[ownerKey]
  if (!code) {
    code = hashCode(ownerKey)
    const used = new Set(Object.values(data.byOwner))
    let n = 0
    while (used.has(code) && n < 20) {
      code = hashCode(`${ownerKey}-${n++}`)
    }
    data.byOwner[ownerKey] = code
    saveCodes(data)
  }
  const profile = upsertPulseProfile({
    ownerKey,
    code,
    name: meta.name,
    examHint: meta.examHint,
  })
  syncPulseQuiet(() => pushPulseProfileRemote(profile))
  return code
}

/** @param {string} ownerKey */
export function getLinkedPeerCode(ownerKey) {
  return loadLinks().byOwner[ownerKey] ?? null
}

/**
 * Resolve peer profile: local first, then server.
 * @param {string} code
 */
export async function resolvePeerProfile(code) {
  const local = getPulseProfileByCode(code)
  if (local) return local
  try {
    const remote = await fetchPulseProfileRemote(code)
    if (remote) {
      // Cache remotely found profile locally for offline compare
      try {
        const raw = localStorage.getItem('testvantage-student-pulse-profiles')
        const dir = raw ? JSON.parse(raw) : { profiles: {} }
        dir.profiles = dir.profiles ?? {}
        dir.profiles[String(code).toUpperCase()] = remote
        localStorage.setItem('testvantage-student-pulse-profiles', JSON.stringify(dir))
      } catch {
        /* ignore */
      }
      return remote
    }
  } catch {
    /* offline */
  }
  return null
}

/**
 * @param {string} ownerKey
 * @param {string} peerCode
 */
export function linkPeerByCode(ownerKey, peerCode) {
  const code = String(peerCode || '')
    .trim()
    .toUpperCase()
  if (!/^[A-Z0-9]{4,8}$/.test(code)) {
    return { ok: false, error: 'Enter a valid Spar Code (4–8 letters/numbers).' }
  }
  const myCode = getOrCreateSparCode(ownerKey)
  if (code === myCode) {
    return { ok: false, error: 'That is your own Spar Code.' }
  }
  const peer = getPulseProfileByCode(code)
  if (!peer) {
    return {
      ok: false,
      error:
        'Code not found on this device yet. We’ll check the server when you confirm — ask your friend to open Peer Pulse once while signed in.',
      needsRemote: true,
      code,
    }
  }
  const data = loadLinks()
  data.byOwner[ownerKey] = code
  saveLinks(data)
  syncPulseQuiet(() => pushPulseLinkRemote(ownerKey, code))
  return { ok: true, peer }
}

/**
 * Async link that checks the server directory.
 * @param {string} ownerKey
 * @param {string} peerCode
 */
export async function linkPeerByCodeAsync(ownerKey, peerCode) {
  const sync = linkPeerByCode(ownerKey, peerCode)
  if (sync.ok) return sync
  if (!sync.needsRemote) return sync

  const peer = await resolvePeerProfile(sync.code)
  if (!peer) {
    return {
      ok: false,
      error:
        'No student found with that Spar Code. Ask them to open Peer Pulse once (signed in) so their code is published.',
    }
  }
  const data = loadLinks()
  data.byOwner[ownerKey] = sync.code
  saveLinks(data)
  syncPulseQuiet(() => pushPulseLinkRemote(ownerKey, sync.code))
  return { ok: true, peer }
}

/** @param {string} ownerKey */
export function unlinkPeer(ownerKey) {
  const data = loadLinks()
  delete data.byOwner[ownerKey]
  saveLinks(data)
  syncPulseQuiet(() => pushPulseLinkRemote(ownerKey, null))
}

/**
 * Pull linked peer code + profile from server into local cache.
 * @param {string} ownerKey
 * @param {{ name?: string }} [meta]
 */
export async function refreshPeerPulseFromServer(ownerKey, meta = {}) {
  getOrCreateSparCode(ownerKey, meta)
  try {
    const remoteLink = await fetchPulseLinkRemote(ownerKey)
    if (remoteLink) {
      const data = loadLinks()
      data.byOwner[ownerKey] = remoteLink
      saveLinks(data)
      await resolvePeerProfile(remoteLink)
    }
  } catch {
    /* offline */
  }
  return getPeerPulseSnapshot(ownerKey, meta)
}

/**
 * @param {string} ownerKey
 * @param {{ name?: string, examHint?: string }} [meta]
 */
export function getPeerPulseSnapshot(ownerKey, meta = {}) {
  const myCode = getOrCreateSparCode(ownerKey, meta)
  const me = getPulseProfileByCode(myCode)
  const peerCode = getLinkedPeerCode(ownerKey)
  const peer = peerCode ? getPulseProfileByCode(peerCode) : null
  const merit = getMeritState(ownerKey)

  let nudge = null
  if (peer && me) {
    if ((peer.dailyScore ?? 0) > (me.dailyScore ?? 0)) {
      nudge = `${peer.name} leads today’s score (${peer.dailyScore} vs ${me.dailyScore}). One more drill closes the gap.`
    } else if ((peer.streak ?? 0) > (me.streak ?? 0)) {
      nudge = `${peer.name} has a ${peer.streak}-day streak — yours is ${me.streak}. Keep your Focus Goal today.`
    } else if ((peer.meritPoints ?? 0) > (me.meritPoints ?? 0) + 15) {
      nudge = `${peer.name} is ahead on Merit Points (${peer.meritPoints} vs ${me.meritPoints}).`
    } else if ((me.dailyScore ?? 0) > (peer.dailyScore ?? 0)) {
      nudge = `You’re ahead of ${peer.name} on today’s score. Hold the lead.`
    }
  }

  return {
    myCode,
    me,
    peer,
    peerCode,
    merit,
    nudge,
  }
}

/** @deprecated Demo peer removed from primary product path — kept for allowAutoDemoSeed only. */
export function ensureDemoPeerProfile() {
  return null
}
