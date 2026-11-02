import { getSession } from './auth.js'
import {
  bulkSyncServerQuestions,
  pingBankApi,
  upsertServerQuestion,
} from './bankApi.js'
import {
  loadUploadedQuestions,
  saveUploadedQuestions,
  addUploadedQuestion,
  addUploadedQuestionsBulk,
  updateUploadedQuestion,
} from './questionBank.js'
import { fetchServerQuestions } from './bankApi.js'
import { getBankSaveMode } from './bankSaveMode.js'
import { isPlatformScaleEnabled } from '../config/platform.js'

const PENDING_KEY = 'testvantage-pending-server-sync'

/**
 * @typedef {'offline' | 'pending' | 'live' | 'failed'} QuestionSyncStatus
 */

/**
 * @typedef {{
 *   id: string,
 *   questionId: string,
 *   op: 'create' | 'update',
 *   question: import('../data/tests').Question,
 *   createdAt: number,
 *   lastError?: string,
 * }} PendingServerSync
 */

/** @returns {PendingServerSync[]} */
export function loadPendingServerSync() {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** @param {PendingServerSync[]} list */
function savePendingServerSync(list) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(list))
}

/** @param {import('../data/tests').Question} question @param {'create' | 'update'} op */
export function queuePendingServerSync(question, op) {
  const list = loadPendingServerSync().filter((p) => p.questionId !== question.id)
  list.push({
    id: `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    questionId: question.id,
    op,
    question,
    createdAt: Date.now(),
  })
  savePendingServerSync(list)
}

/** @param {string} questionId */
export function removePendingServerSync(questionId) {
  savePendingServerSync(loadPendingServerSync().filter((p) => p.questionId !== questionId))
}

function teacherEmail() {
  return getSession()?.email ?? ''
}

/** @param {import('../data/tests').Question} q */
export function questionNeedsSync(q) {
  const status = q?.syncStatus ?? 'offline'
  return status === 'offline' || status === 'pending' || status === 'failed'
}

/** @param {import('../data/tests').Question} q */
export function syncStatusLabel(q) {
  const status = q?.syncStatus ?? 'offline'
  if (status === 'live') return 'Live'
  if (status === 'pending') return 'Pending sync'
  if (status === 'failed') return 'Sync failed'
  return 'Offline'
}

/**
 * Try to push one question to the server and update local row.
 * @param {import('../data/tests').Question} question
 */
export async function syncQuestionToServer(question) {
  const saved = await upsertServerQuestion(question, { email: teacherEmail() })
  removePendingServerSync(question.id)
  return updateUploadedQuestion(question.id, {
    syncStatus: 'live',
    serverSyncedAt: saved?.serverSyncedAt ?? Date.now(),
  })
}

/**
 * Save locally, then online if mode is online.
 * @param {import('../data/tests').Question} cleaned
 * @param {{ editingId?: string, mode?: import('./bankSaveMode.js').BankSaveMode }} [opts]
 * @returns {Promise<{ result: 'saved' | 'updated', entry: import('../data/tests').Question, syncStatus: QuestionSyncStatus }>}
 */
export async function persistQuestionWithSaveMode(cleaned, opts = {}) {
  const mode = opts.mode ?? getBankSaveMode()
  const editingId = opts.editingId
  const baseMeta =
    mode === 'online'
      ? { syncStatus: /** @type {QuestionSyncStatus} */ ('pending') }
      : { syncStatus: /** @type {QuestionSyncStatus} */ ('offline') }

  const saveLocal = () =>
    editingId
      ? updateUploadedQuestion(editingId, { ...cleaned, ...baseMeta })
      : addUploadedQuestion({ ...cleaned, ...baseMeta })

  let entry
  try {
    entry = saveLocal()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/storage full|QuotaExceeded/i.test(msg)) {
      try {
        const { slimStoredBankImages } = await import('./bankImageSlim.js')
        await slimStoredBankImages()
        entry = saveLocal()
      } catch (retryErr) {
        throw retryErr instanceof Error
          ? retryErr
          : new Error(
              'Browser storage full. Export your bank as JSON, delete old questions, or use smaller images.',
            )
      }
    } else {
      throw err
    }
  }

  if (!entry) throw new Error('Could not save question locally')

  if (mode !== 'online') {
    return {
      result: editingId ? 'updated' : 'saved',
      entry,
      syncStatus: 'offline',
    }
  }

  const apiUp = await pingBankApi()
  if (!apiUp) {
    queuePendingServerSync(entry, editingId ? 'update' : 'create')
    const failed = updateUploadedQuestion(entry.id, { syncStatus: 'failed' })
    return {
      result: editingId ? 'updated' : 'saved',
      entry: failed ?? entry,
      syncStatus: 'failed',
    }
  }

  try {
    const synced = await syncQuestionToServer(entry)
    return {
      result: editingId ? 'updated' : 'saved',
      entry: synced ?? entry,
      syncStatus: 'live',
    }
  } catch (err) {
    queuePendingServerSync(entry, editingId ? 'update' : 'create')
    const failed = updateUploadedQuestion(entry.id, {
      syncStatus: 'failed',
      syncError: err instanceof Error ? err.message : 'Sync failed',
    })
    return {
      result: editingId ? 'updated' : 'saved',
      entry: failed ?? entry,
      syncStatus: 'failed',
    }
  }
}

/**
 * Save many drafts with one (or few) localStorage writes. Does not wipe the bank.
 * Yields between chunks so the Manage meta tab stays clickable.
 * @param {import('../data/tests').Question[]} questions
 * @param {{
 *   mode?: import('./bankSaveMode.js').BankSaveMode,
 *   chunkSize?: number,
 *   onProgress?: (done: number, total: number) => void,
 * }} [opts]
 */
export async function persistQuestionsBulkWithSaveMode(questions, opts = {}) {
  const list = Array.isArray(questions) ? questions.filter(Boolean) : []
  if (!list.length) return { saved: 0, entries: [] }

  const mode = opts.mode ?? getBankSaveMode()
  const chunkSize = Math.max(1, Number(opts.chunkSize) || 40)
  const onProgress = opts.onProgress
  const syncMeta =
    mode === 'online'
      ? { syncStatus: /** @type {QuestionSyncStatus} */ ('pending') }
      : { syncStatus: /** @type {QuestionSyncStatus} */ ('offline') }

  const entries = []
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize).map((q) => ({
      ...q,
      bankStatus: q.bankStatus || 'draft',
      ...syncMeta,
    }))
    const savedChunk = addUploadedQuestionsBulk(chunk)
    entries.push(...savedChunk)
    onProgress?.(entries.length, list.length)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  if (mode === 'online' && entries.length) {
    try {
      const apiUp = await pingBankApi()
      if (apiUp) {
        await bulkSyncServerQuestions(entries, { email: teacherEmail() })
        const liveAt = Date.now()
        const ids = new Set(entries.map((e) => e.id))
        saveUploadedQuestions(
          loadUploadedQuestions().map((q) =>
            ids.has(q.id) ? { ...q, syncStatus: 'live', serverSyncedAt: liveAt } : q,
          ),
        )
        savePendingServerSync(loadPendingServerSync().filter((p) => !ids.has(p.questionId)))
      } else {
        const pending = loadPendingServerSync()
        const have = new Set(pending.map((p) => p.questionId))
        for (const entry of entries) {
          if (!entry?.id || have.has(entry.id)) continue
          pending.push({
            id: `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            questionId: entry.id,
            op: 'create',
            question: entry,
            createdAt: Date.now(),
          })
          have.add(entry.id)
        }
        savePendingServerSync(pending)
      }
    } catch {
      const pending = loadPendingServerSync()
      const have = new Set(pending.map((p) => p.questionId))
      for (const entry of entries) {
        if (!entry?.id || have.has(entry.id)) continue
        pending.push({
          id: `ss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          questionId: entry.id,
          op: 'create',
          question: entry,
          createdAt: Date.now(),
        })
        have.add(entry.id)
      }
      savePendingServerSync(pending)
    }
  }

  return { saved: entries.length, entries }
}

/**
 * Sync all pending queue items + questions marked offline/failed.
 * @param {import('../data/tests').Question[]} questions
 */
export async function flushAllServerSync(questions) {
  const apiUp = await pingBankApi()
  if (!apiUp) throw new Error('Online server is not running. Start it with: npm run api')

  const pending = loadPendingServerSync()
  const byId = new Map((questions ?? []).map((q) => [q.id, q]))
  const toSync = []

  for (const p of pending) {
    const q = byId.get(p.questionId) ?? p.question
    if (q) toSync.push(q)
  }

  for (const q of questions ?? []) {
    if (questionNeedsSync(q) && !toSync.some((row) => row.id === q.id)) {
      toSync.push(q)
    }
  }

  if (!toSync.length) return { synced: 0, failed: 0 }

  let synced = 0
  let failed = 0

  for (const q of toSync) {
    try {
      await syncQuestionToServer(q)
      synced += 1
    } catch (err) {
      failed += 1
      queuePendingServerSync(q, 'update')
      updateUploadedQuestion(q.id, {
        syncStatus: 'failed',
        syncError: err instanceof Error ? err.message : 'Sync failed',
      })
    }
  }

  return { synced, failed }
}

/**
 * Bulk sync selected questions (used by Sync button on rows).
 * @param {import('../data/tests').Question[]} questions
 */
export async function syncQuestionsBatch(questions) {
  const apiUp = await pingBankApi()
  if (!apiUp) throw new Error('Online server is not running. Start it with: npm run api')
  if (!questions?.length) return { synced: 0, failed: 0 }

  const data = await bulkSyncServerQuestions(questions, { email: teacherEmail() })
  let failed = 0

  for (const q of questions) {
    try {
      removePendingServerSync(q.id)
      updateUploadedQuestion(q.id, {
        syncStatus: 'live',
        serverSyncedAt: Date.now(),
      })
    } catch {
      failed += 1
    }
  }

  return { synced: data?.synced ?? questions.length, failed }
}

/**
 * Pull questions from server and merge into local bank (live mode).
 * @returns {Promise<{ merged: number, serverCount: number }>}
 */
export async function pullBankFromServer() {
  const apiUp = await pingBankApi()
  if (!apiUp) throw new Error('Online server is not running. Start it with: npm run api')

  const { questions, updatedAt } = await fetchServerQuestions()
  const local = loadUploadedQuestions()
  const byId = new Map(local.map((q) => [q.id, q]))

  for (const q of questions) {
    byId.set(q.id, {
      ...q,
      syncStatus: 'live',
      serverSyncedAt: updatedAt || Date.now(),
    })
  }

  const merged = [...byId.values()]
  saveUploadedQuestions(merged)
  return { merged: merged.length, serverCount: questions.length }
}

/** Auto-pull on live pages when production scale is enabled. */
export async function pullBankIfLiveMode() {
  if (!isPlatformScaleEnabled()) return null
  try {
    return await pullBankFromServer()
  } catch {
    return null
  }
}
