import { parseStoredBankJson } from './bankParse.js'
import {
  mergeBankBackup,
  loadUploadedQuestions,
  peekUploadedQuestions,
  repairBankFromBackups,
} from './questionBank.js'
import { restoreBankFromIdbIfNeeded } from './bankIdbStore.js'

const BANK_KEY = 'testvantage-uploaded-questions'
const BACKUP_KEY = 'testvantage-uploaded-questions-backup'

/**
 * If the main bank key is empty or unreadable, try other localStorage keys that hold question JSON.
 * @returns {{ recovered: boolean, count: number, source?: string }}
 */
export function tryRecoverBankFromLocalStorage() {
  let current = peekUploadedQuestions()
  if (current.length === 0) {
    const repaired = repairBankFromBackups()
    if (repaired > 0) return { recovered: true, count: repaired, source: 'backup' }
  }
  current = loadUploadedQuestions()
  if (current.length > 0) return { recovered: false, count: current.length }

  let best = null
  /** @type {string | undefined} */
  let bestKey = undefined

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key) continue
    const raw = localStorage.getItem(key)
    if (!raw || raw.length < 20) continue
    try {
      const payload = parseStoredBankJson(raw)
      if (!payload?.questions?.length) continue
      if (!best || payload.questions.length > best.questions.length) {
        best = payload
        bestKey = key
      }
    } catch {
      /* not JSON bank */
    }
  }

  if (!best || !bestKey) return { recovered: false, count: 0 }

  try {
    const payload = {
      settings: best.settings ?? {},
      questions: best.questions,
    }
    localStorage.setItem(BANK_KEY, JSON.stringify(payload))
    if (bestKey !== BACKUP_KEY) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(payload))
    }
    const { total } = mergeBankBackup(payload)
    return { recovered: true, count: total, source: bestKey }
  } catch {
    return { recovered: false, count: 0 }
  }
}

/**
 * Async recovery: localStorage first, then durable IndexedDB mirror.
 * @returns {Promise<{ recovered: boolean, count: number, source?: string }>}
 */
export async function tryRecoverBankAsync() {
  const sync = tryRecoverBankFromLocalStorage()
  if (sync.recovered || sync.count > 0) return sync
  const idb = await restoreBankFromIdbIfNeeded()
  if (idb.recovered) return { recovered: true, count: idb.count, source: 'indexedDB' }
  return { recovered: false, count: 0 }
}


/** @returns {{ count: number, bytes: number, parseOk: boolean }} */
export function getBankStorageDiagnostics() {
  if (typeof window === 'undefined') return { count: 0, bytes: 0, parseOk: false, backupCount: 0 }
  try {
    const raw = localStorage.getItem(BANK_KEY) ?? ''
    const backupRaw = localStorage.getItem(BACKUP_KEY) ?? ''
    const payload = raw ? parseStoredBankJson(raw) : null
    const backupPayload = backupRaw ? parseStoredBankJson(backupRaw) : null
    const count = payload?.questions?.length ?? 0
    const backupCount = backupPayload?.questions?.length ?? 0
    const loaded = peekUploadedQuestions().length
    return {
      count: Math.max(count, loaded),
      backupCount,
      bytes: raw.length,
      backupBytes: backupRaw.length,
      parseOk: !!payload || !raw,
    }
  } catch {
    return { count: 0, bytes: 0, parseOk: false, backupCount: 0 }
  }
}
