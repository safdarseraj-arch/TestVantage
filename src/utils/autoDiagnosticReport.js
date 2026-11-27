/**
 * Auto-generate the exhaustive diagnostic report after every test / practice submit.
 * Local: IndexedDB HTML + status index. Live: also POST meta (+ html) to API when online.
 */

import { API_BASE, isPlatformScaleEnabled } from '../config/platform.js'
import {
  buildDiagnosticReportModelAsync,
  buildDiagnosticReportHtml,
} from './diagnosticReportPdf.js'
import { getTestById } from '../data/tests.js'
import { attemptToResultData, getAttemptById } from './attemptHistory.js'

const DB_NAME = 'testvantage-diagnostic-reports-db'
const DB_VERSION = 1
const STORE = 'reports'
const INDEX_KEY = 'tv_auto_diagnostic_index_v1'

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'attemptId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

/** @returns {Record<string, object>} */
function loadIndex() {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** @param {Record<string, object>} map */
function saveIndex(map) {
  try {
    const keys = Object.keys(map)
    if (keys.length > 80) {
      const trimmed = {}
      for (const k of keys.slice(0, 80)) trimmed[k] = map[k]
      localStorage.setItem(INDEX_KEY, JSON.stringify(trimmed))
      return
    }
    localStorage.setItem(INDEX_KEY, JSON.stringify(map))
  } catch {
    /* quota */
  }
}

/**
 * @param {string} attemptId
 * @param {object} patch
 */
function patchIndex(attemptId, patch) {
  const map = loadIndex()
  map[attemptId] = {
    ...(map[attemptId] || {}),
    attemptId,
    ...patch,
    updatedAt: Date.now(),
  }
  saveIndex(map)
  return map[attemptId]
}

/**
 * @param {string} attemptId
 */
export function getAutoDiagnosticStatus(attemptId) {
  if (!attemptId) return null
  return loadIndex()[attemptId] || null
}

/**
 * @param {string} attemptId
 * @returns {Promise<{ attemptId: string, html: string, meta: object } | null>}
 */
export async function loadAutoDiagnosticReport(attemptId) {
  const id = String(attemptId || '')
  if (!id) return null
  try {
    const db = await openDb()
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
    return row
  } catch {
    return null
  }
}

/**
 * @param {{ attemptId: string, html: string, meta: object }} row
 */
async function writeReportToIdb(row) {
  const db = await openDb()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(STORE).put(row)
  })
}

/**
 * Push report meta/html to live API (best-effort).
 * @param {object} payload
 */
async function pushReportRemote(payload) {
  if (!isPlatformScaleEnabled()) return { ok: false, reason: 'scale_off' }
  try {
    const res = await fetch(`${API_BASE}/diagnostics/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report: payload }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return { ok: false, reason: 'http', status: res.status }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

/**
 * Build + store the full diagnostic for one attempt.
 * @param {{
 *   attemptId: string
 *   test?: object | null
 *   data?: object | null
 *   attempts?: object[]
 *   studentName?: string
 * }} opts
 */
export async function generateAutoDiagnosticReport(opts = {}) {
  const attemptId = String(opts.attemptId || '')
  if (!attemptId) return { ok: false, error: 'missing_attempt' }

  patchIndex(attemptId, {
    status: 'generating',
    testId: opts.test?.id || opts.data?.testId || null,
    title: opts.test?.title || opts.data?.title || null,
  })

  try {
    let test = opts.test || null
    let data = opts.data || null
    if (!data) {
      const att = getAttemptById(attemptId)
      data = attemptToResultData(att)
      if (!test && att?.testId) test = getTestById(att.testId)
      if (!test && att?.testSnapshot) test = att.testSnapshot
    }
    if (!test && data?.testId) test = getTestById(data.testId)
    if (!data?.result) {
      patchIndex(attemptId, { status: 'error', error: 'no_result' })
      return { ok: false, error: 'no_result' }
    }

    const model = await buildDiagnosticReportModelAsync({
      data,
      test,
      studentName: opts.studentName || data.userName,
      attempts: opts.attempts || [],
      attemptId,
    })
    const html = buildDiagnosticReportHtml(model)
    const meta = {
      attemptId,
      testId: test?.id || data.testId,
      title: model.title,
      studentName: model.studentName,
      score: model.score,
      maxScore: model.maxScore,
      generatedAt: Date.now(),
      livePeersReady: Boolean(model.livePeersReady),
      peerSource: model.peerSource,
      auto: true,
    }
    await writeReportToIdb({ attemptId, html, meta })
    patchIndex(attemptId, {
      status: 'ready',
      ...meta,
      bytes: html.length,
    })

    pushReportRemote({
      ...meta,
      html,
      ownerKey: data.ownerKey || null,
    }).then((remote) => {
      if (remote.ok) patchIndex(attemptId, { synced: true })
    })

    return { ok: true, meta, html }
  } catch (err) {
    patchIndex(attemptId, {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
    return { ok: false, error: 'generate_failed' }
  }
}

/**
 * Fire-and-forget after exam/practice submit (does not block navigation).
 * @param {{
 *   attemptId: string
 *   test: object
 *   data: object
 *   studentName?: string
 * }} opts
 */
export function queueAutoDiagnosticAfterSubmit(opts) {
  const attemptId = String(opts?.attemptId || '')
  if (!attemptId || !opts?.data?.result) return

  patchIndex(attemptId, {
    status: 'queued',
    testId: opts.test?.id || opts.data?.testId,
    title: opts.test?.title || opts.data?.title,
    queuedAt: Date.now(),
  })

  const run = () => {
    generateAutoDiagnosticReport({
      attemptId,
      test: opts.test,
      data: opts.data,
      studentName: opts.studentName,
      attempts: [],
    }).catch(() => {})
  }

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => run(), { timeout: 2500 })
  } else {
    setTimeout(run, 400)
  }
}

/**
 * Open stored HTML in a print window.
 * @param {string} attemptId
 */
export async function openAutoDiagnosticPrint(attemptId) {
  const row = await loadAutoDiagnosticReport(attemptId)
  if (!row?.html) return { ok: false, reason: 'missing' }
  const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900')
  if (!w) return { ok: false, reason: 'popup' }
  w.document.open()
  w.document.write(row.html)
  w.document.close()
  setTimeout(() => {
    try {
      w.focus()
      w.print()
    } catch {
      /* ignore */
    }
  }, 300)
  return { ok: true }
}

/**
 * @param {string} attemptId
 */
export async function downloadAutoDiagnostic(attemptId) {
  const row = await loadAutoDiagnosticReport(attemptId)
  if (!row?.html) return { ok: false, reason: 'missing' }
  const safe = String(row.meta?.studentName || 'student')
    .replace(/[^\w\-]+/g, '-')
    .slice(0, 28)
  const title = String(row.meta?.title || 'diagnostic')
    .replace(/[^\w\-]+/g, '-')
    .slice(0, 36)
  const blob = new Blob([row.html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `testvantages-${safe}-${title}-auto-diagnostic.html`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
  return { ok: true }
}
