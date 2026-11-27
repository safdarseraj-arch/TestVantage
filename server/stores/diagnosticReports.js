/**
 * Persist auto-generated diagnostic report meta (+ optional HTML) after go-live.
 * File-backed; Postgres can replace later without changing the route.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const FILE = path.join(DATA_DIR, 'diagnostic-reports.json')

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ reports: [] }, null, 2), 'utf8')
}

function load() {
  ensure()
  try {
    const raw = fs.readFileSync(FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.reports) ? parsed : { reports: [] }
  } catch {
    return { reports: [] }
  }
}

function save(data) {
  ensure()
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf8')
}

/**
 * @param {object} report
 */
export function saveDiagnosticReport(report) {
  const data = load()
  const attemptId = String(report.attemptId || '')
  if (!attemptId) throw new Error('attemptId required')
  const entry = {
    ...report,
    attemptId,
    savedAt: Date.now(),
  }
  const idx = data.reports.findIndex((r) => String(r.attemptId) === attemptId)
  if (idx >= 0) data.reports[idx] = { ...data.reports[idx], ...entry }
  else data.reports.unshift(entry)
  if (data.reports.length > 500) data.reports = data.reports.slice(0, 500)
  save(data)
  return entry
}

/**
 * @param {string} attemptId
 */
export function getDiagnosticReport(attemptId) {
  const data = load()
  return data.reports.find((r) => String(r.attemptId) === String(attemptId)) || null
}

/**
 * @param {{ ownerKey?: string, limit?: number }} [opts]
 */
export function listDiagnosticReports(opts = {}) {
  const data = load()
  let list = data.reports
  if (opts.ownerKey) {
    list = list.filter((r) => String(r.ownerKey || '') === String(opts.ownerKey))
  }
  const limit = Number(opts.limit) || 50
  return list.slice(0, limit)
}
