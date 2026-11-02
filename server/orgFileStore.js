import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.TESTVANTAGE_BANK_DATA_DIR || join(SERVER_DIR, 'data')
const ORG_FILE = join(DATA_DIR, 'org-data.json')

const DEFAULT_ORG = {
  schools: [],
  classes: [],
  assignments: [],
  users: [],
  updatedAt: 0,
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

/** @returns {{ schools: object[], classes: object[], assignments: object[], users: object[], updatedAt: number }} */
export function loadOrgFile() {
  ensureDataDir()
  if (!existsSync(ORG_FILE)) return { ...DEFAULT_ORG }
  try {
    const parsed = JSON.parse(readFileSync(ORG_FILE, 'utf8'))
    return {
      schools: Array.isArray(parsed?.schools) ? parsed.schools : [],
      classes: Array.isArray(parsed?.classes) ? parsed.classes : [],
      assignments: Array.isArray(parsed?.assignments) ? parsed.assignments : [],
      users: Array.isArray(parsed?.users) ? parsed.users : [],
      updatedAt: Number(parsed?.updatedAt) || 0,
    }
  } catch {
    return { ...DEFAULT_ORG }
  }
}

/**
 * @param {{ schools?: object[], classes?: object[], assignments?: object[], users?: object[] }} payload
 */
export function saveOrgFile(payload) {
  ensureDataDir()
  const current = loadOrgFile()
  const next = {
    schools: payload.schools ?? current.schools,
    classes: payload.classes ?? current.classes,
    assignments: payload.assignments ?? current.assignments,
    users: payload.users ?? current.users,
    updatedAt: Date.now(),
  }
  writeFileSync(ORG_FILE, JSON.stringify(next))
  return next
}
