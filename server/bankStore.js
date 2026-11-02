import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.TESTVANTAGE_BANK_DATA_DIR || join(SERVER_DIR, 'data')
const BANK_FILE = join(DATA_DIR, 'questions.json')

const DEFAULT_BANK = { questions: [], updatedAt: 0 }

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

/** @returns {{ questions: object[], updatedAt: number }} */
export function loadBankFile() {
  ensureDataDir()
  if (!existsSync(BANK_FILE)) return { ...DEFAULT_BANK }
  try {
    const parsed = JSON.parse(readFileSync(BANK_FILE, 'utf8'))
    return {
      questions: Array.isArray(parsed?.questions) ? parsed.questions : [],
      updatedAt: Number(parsed?.updatedAt) || 0,
    }
  } catch {
    return { ...DEFAULT_BANK }
  }
}

/** @param {{ questions: object[], updatedAt?: number }} bank */
export function saveBankFile(bank) {
  ensureDataDir()
  const payload = {
    questions: bank.questions ?? [],
    updatedAt: bank.updatedAt ?? Date.now(),
  }
  writeFileSync(BANK_FILE, JSON.stringify(payload))
  return payload
}

/** @param {string} id */
export function findQuestionById(id) {
  const bank = loadBankFile()
  return bank.questions.find((q) => q?.id === id) ?? null
}

/**
 * @param {object} question
 * @returns {object}
 */
export function upsertQuestion(question) {
  if (!question?.id) throw new Error('Question id is required')
  const bank = loadBankFile()
  const idx = bank.questions.findIndex((q) => q?.id === question.id)
  const row = {
    ...question,
    syncStatus: 'live',
    serverSyncedAt: Date.now(),
  }
  if (idx === -1) bank.questions.unshift(row)
  else bank.questions[idx] = { ...bank.questions[idx], ...row }
  saveBankFile({ ...bank, updatedAt: Date.now() })
  return row
}

/**
 * @param {object[]} questions
 * @returns {{ synced: number, questions: object[] }}
 */
export function bulkUpsertQuestions(questions) {
  const bank = loadBankFile()
  const byId = new Map(bank.questions.map((q) => [q.id, q]))
  let synced = 0
  const results = []

  for (const raw of questions ?? []) {
    if (!raw?.id) continue
    const row = {
      ...raw,
      syncStatus: 'live',
      serverSyncedAt: Date.now(),
    }
    if (byId.has(raw.id)) {
      byId.set(raw.id, { ...byId.get(raw.id), ...row })
    } else {
      byId.set(raw.id, row)
    }
    results.push(row)
    synced += 1
  }

  const next = {
    questions: [...byId.values()],
    updatedAt: Date.now(),
  }
  saveBankFile(next)
  return { synced, questions: results }
}

export { BANK_FILE, DATA_DIR }
