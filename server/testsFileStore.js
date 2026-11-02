import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.TESTVANTAGE_BANK_DATA_DIR || join(SERVER_DIR, 'data')
const TESTS_FILE = join(DATA_DIR, 'custom-tests.json')

const DEFAULT = {
  tests: [],
  updatedAt: 0,
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

/** @returns {{ tests: object[], updatedAt: number }} */
export function loadTestsFile() {
  ensureDataDir()
  if (!existsSync(TESTS_FILE)) return { ...DEFAULT }
  try {
    const parsed = JSON.parse(readFileSync(TESTS_FILE, 'utf8'))
    return {
      tests: Array.isArray(parsed?.tests) ? parsed.tests : [],
      updatedAt: Number(parsed?.updatedAt) || 0,
    }
  } catch {
    return { ...DEFAULT }
  }
}

/** @param {{ tests?: object[] }} payload */
export function saveTestsFile(payload) {
  ensureDataDir()
  const next = {
    tests: Array.isArray(payload?.tests) ? payload.tests : [],
    updatedAt: Date.now(),
  }
  writeFileSync(TESTS_FILE, JSON.stringify(next))
  return next
}
