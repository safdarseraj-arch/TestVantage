import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.TESTVANTAGE_BANK_DATA_DIR || join(SERVER_DIR, 'data')
const PULSE_FILE = join(DATA_DIR, 'pulse-data.json')

const DEFAULT = {
  profiles: {},
  links: {},
  codes: {},
  circles: {},
  merit: {},
  updatedAt: 0,
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function loadRaw() {
  ensureDataDir()
  if (!existsSync(PULSE_FILE)) return { ...DEFAULT, profiles: {}, links: {}, codes: {}, circles: {}, merit: {} }
  try {
    const parsed = JSON.parse(readFileSync(PULSE_FILE, 'utf8'))
    return {
      profiles: parsed?.profiles && typeof parsed.profiles === 'object' ? parsed.profiles : {},
      links: parsed?.links && typeof parsed.links === 'object' ? parsed.links : {},
      codes: parsed?.codes && typeof parsed.codes === 'object' ? parsed.codes : {},
      circles: parsed?.circles && typeof parsed.circles === 'object' ? parsed.circles : {},
      merit: parsed?.merit && typeof parsed.merit === 'object' ? parsed.merit : {},
      updatedAt: Number(parsed?.updatedAt) || 0,
    }
  } catch {
    return { ...DEFAULT, profiles: {}, links: {}, codes: {}, circles: {}, merit: {} }
  }
}

function saveRaw(data) {
  ensureDataDir()
  const next = { ...data, updatedAt: Date.now() }
  writeFileSync(PULSE_FILE, JSON.stringify(next))
  return next
}

export function loadPulseFile() {
  return loadRaw()
}

/** @param {object} profile */
export function upsertPulseProfileFile(profile) {
  const data = loadRaw()
  const code = String(profile?.code || '')
    .trim()
    .toUpperCase()
  if (!code || !/^[A-Z0-9]{4,8}$/.test(code)) {
    throw new Error('Valid Spar Code required on profile')
  }
  data.profiles[code] = {
    ...data.profiles[code],
    ...profile,
    code,
    updatedAt: Date.now(),
  }
  if (profile.ownerKey) {
    data.codes[profile.ownerKey] = code
  }
  return saveRaw(data).profiles[code]
}

/** @param {string} code */
export function getPulseProfileFile(code) {
  const key = String(code || '')
    .trim()
    .toUpperCase()
  return loadRaw().profiles[key] ?? null
}

/**
 * @param {string} ownerKey
 * @param {string|null} peerCode
 */
export function setPulseLinkFile(ownerKey, peerCode) {
  const data = loadRaw()
  if (!ownerKey) throw new Error('ownerKey required')
  if (peerCode == null || peerCode === '') {
    delete data.links[ownerKey]
  } else {
    const code = String(peerCode).trim().toUpperCase()
    if (!/^[A-Z0-9]{4,8}$/.test(code)) throw new Error('Invalid peer Spar Code')
    data.links[ownerKey] = code
  }
  saveRaw(data)
  return data.links[ownerKey] ?? null
}

/** @param {string} ownerKey */
export function getPulseLinkFile(ownerKey) {
  return loadRaw().links[ownerKey] ?? null
}

/** @param {object} circle */
export function saveCircleFile(circle) {
  const data = loadRaw()
  const code = String(circle?.code || '')
    .trim()
    .toUpperCase()
  if (!code) throw new Error('Cohort Code required')
  data.circles[code] = { ...circle, code }
  saveRaw(data)
  return data.circles[code]
}

/** @param {string} code */
export function getCircleFile(code) {
  const key = String(code || '')
    .trim()
    .toUpperCase()
  return loadRaw().circles[key] ?? null
}

/** @param {string} ownerKey */
export function listCirclesForOwnerFile(ownerKey) {
  return Object.values(loadRaw().circles).filter((c) =>
    (c.members || []).some((m) => m.ownerKey === ownerKey),
  )
}

/**
 * @param {string} ownerKey
 * @param {object} state
 */
export function saveMeritFile(ownerKey, state) {
  const data = loadRaw()
  if (!ownerKey) throw new Error('ownerKey required')
  data.merit[ownerKey] = { ...state, ownerKey, syncedAt: Date.now() }
  saveRaw(data)
  return data.merit[ownerKey]
}

/** @param {string} ownerKey */
export function getMeritFile(ownerKey) {
  return loadRaw().merit[ownerKey] ?? null
}

/** @param {string} ownerKey @param {string} code */
export function saveOwnerCodeFile(ownerKey, code) {
  const data = loadRaw()
  data.codes[ownerKey] = String(code).trim().toUpperCase()
  saveRaw(data)
  return data.codes[ownerKey]
}

/** @param {string} ownerKey */
export function getOwnerCodeFile(ownerKey) {
  return loadRaw().codes[ownerKey] ?? null
}
