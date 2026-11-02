/**
 * Study Circle — Cohort Code peer rooms (not School Management).
 * Local + server (`/api/pulse/circle*`) so friends can join across devices.
 */
import { getPulseProfileByCode, listPulseProfiles } from './meritStrideStore.js'
import { getOrCreateSparCode } from './peerPulseStore.js'
import {
  fetchCircleRemote,
  fetchMyCirclesRemote,
  joinCircleRemote,
  pushCircleRemote,
  syncPulseQuiet,
} from './pulseApi.js'

const STORE_KEY = 'testvantage-study-circles'

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? JSON.parse(raw) : { circles: {} }
  } catch {
    return { circles: {} }
  }
}

function save(data) {
  localStorage.setItem(STORE_KEY, JSON.stringify(data))
}

function randomCircleCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

function cacheCircle(circle) {
  if (!circle?.code) return
  const data = load()
  data.circles[circle.code] = circle
  save(data)
}

/**
 * @param {{ ownerKey: string, name: string, title?: string }} opts
 */
export function createStudyCircle(opts) {
  const data = load()
  let code = randomCircleCode()
  let guard = 0
  while (data.circles[code] && guard < 30) {
    code = randomCircleCode()
    guard++
  }
  const spar = getOrCreateSparCode(opts.ownerKey, { name: opts.name })
  const circle = {
    code,
    title: (opts.title || 'Study Circle').trim().slice(0, 48) || 'Study Circle',
    hostOwnerKey: opts.ownerKey,
    hostSparCode: spar,
    createdAt: Date.now(),
    members: [
      {
        ownerKey: opts.ownerKey,
        sparCode: spar,
        name: opts.name || 'Host',
        joinedAt: Date.now(),
      },
    ],
  }
  data.circles[code] = circle
  save(data)
  syncPulseQuiet(() => pushCircleRemote(circle))
  return circle
}

/**
 * @param {{ code: string, ownerKey: string, name: string }} opts
 */
export function joinStudyCircle(opts) {
  const code = String(opts.code || '')
    .trim()
    .toUpperCase()
  const data = load()
  let circle = data.circles[code]
  if (!circle) {
    return {
      ok: false,
      error: 'No Study Circle with that code on this device. Checking server…',
      needsRemote: true,
      code,
    }
  }
  const spar = getOrCreateSparCode(opts.ownerKey, { name: opts.name })
  if (!circle.members.some((m) => m.ownerKey === opts.ownerKey)) {
    circle.members.push({
      ownerKey: opts.ownerKey,
      sparCode: spar,
      name: opts.name || 'Member',
      joinedAt: Date.now(),
    })
    data.circles[code] = circle
    save(data)
  }
  syncPulseQuiet(() => pushCircleRemote(circle))
  return { ok: true, circle }
}

/**
 * @param {{ code: string, ownerKey: string, name: string }} opts
 */
export async function joinStudyCircleAsync(opts) {
  const sync = joinStudyCircle(opts)
  if (sync.ok) return sync
  if (!sync.needsRemote) return sync

  const spar = getOrCreateSparCode(opts.ownerKey, { name: opts.name })
  try {
    const remote = await fetchCircleRemote(sync.code)
    if (!remote) {
      return { ok: false, error: 'No Study Circle with that Cohort Code. Check the code and try again.' }
    }
    cacheCircle(remote)
    const joined = await joinCircleRemote({
      code: sync.code,
      ownerKey: opts.ownerKey,
      name: opts.name || 'Member',
      sparCode: spar,
    })
    if (joined?.circle) {
      cacheCircle(joined.circle)
      return { ok: true, circle: joined.circle }
    }
    return { ok: true, circle: remote }
  } catch {
    return {
      ok: false,
      error:
        'Could not reach the server to join that circle. Start TestVantages (F5 / Start task) and try again.',
    }
  }
}

/** @param {string} code */
export function getStudyCircle(code) {
  const key = String(code || '')
    .trim()
    .toUpperCase()
  return load().circles[key] ?? null
}

/** Circles this owner belongs to (local cache). */
export function listMyStudyCircles(ownerKey) {
  return Object.values(load().circles).filter((c) =>
    c.members.some((m) => m.ownerKey === ownerKey),
  )
}

/** Merge server circles into local cache. */
export async function refreshMyStudyCircles(ownerKey) {
  try {
    const remote = await fetchMyCirclesRemote(ownerKey)
    for (const c of remote) cacheCircle(c)
  } catch {
    /* offline */
  }
  return listMyStudyCircles(ownerKey)
}

/**
 * Leaderboard for a circle using published pulse profiles + member names.
 * @param {string} code
 */
export function getCircleLeaderboard(code) {
  const circle = getStudyCircle(code)
  if (!circle) return []
  const profiles = listPulseProfiles()
  const byOwner = new Map(profiles.map((p) => [p.ownerKey, p]))
  return circle.members
    .map((m) => {
      const pulse = byOwner.get(m.ownerKey) ?? getPulseProfileByCode(m.sparCode)
      return {
        name: pulse?.name || m.name,
        sparCode: m.sparCode,
        meritPoints: pulse?.meritPoints ?? 0,
        streak: pulse?.streak ?? 0,
        accuracy: pulse?.accuracy ?? 0,
        dailyScore: pulse?.dailyScore ?? 0,
        updatedAt: pulse?.updatedAt ?? m.joinedAt,
      }
    })
    .sort(
      (a, b) =>
        b.meritPoints - a.meritPoints ||
        b.dailyScore - a.dailyScore ||
        b.streak - a.streak,
    )
}
