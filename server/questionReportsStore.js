import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  buildQuestionReport,
  normalizeStoredReport,
} from '../src/utils/questionReports.js'

const SERVER_DIR = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.TESTVANTAGE_BANK_DATA_DIR || join(SERVER_DIR, 'data')
const REPORTS_FILE = join(DATA_DIR, 'question-reports.json')

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
}

function loadRaw() {
  ensureDataDir()
  if (!existsSync(REPORTS_FILE)) return { reports: [], updatedAt: 0 }
  try {
    const parsed = JSON.parse(readFileSync(REPORTS_FILE, 'utf8'))
    const list = Array.isArray(parsed?.reports) ? parsed.reports : []
    return {
      reports: list.map(normalizeStoredReport).filter(Boolean),
      updatedAt: Number(parsed?.updatedAt) || 0,
    }
  } catch {
    return { reports: [], updatedAt: 0 }
  }
}

function saveRaw(data) {
  ensureDataDir()
  const next = {
    reports: data.reports ?? [],
    updatedAt: Date.now(),
  }
  writeFileSync(REPORTS_FILE, JSON.stringify(next))
  return next
}

export function listQuestionReportsFile() {
  return loadRaw().reports.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

/** @param {object} input */
export function addQuestionReportFile(input) {
  const report = buildQuestionReport({ ...input, status: input?.status || 'open' })
  const data = loadRaw()
  const idx = data.reports.findIndex((r) => r.id === report.id)
  if (idx === -1) data.reports.unshift(report)
  else data.reports[idx] = { ...data.reports[idx], ...report }
  saveRaw(data)
  return report
}

/**
 * @param {string} id
 * @param {'open' | 'reviewed'} status
 */
export function setQuestionReportStatusFile(id, status) {
  const key = String(id ?? '').trim()
  if (!key) throw new Error('Report id is required')
  if (status !== 'open' && status !== 'reviewed') {
    throw new Error('Status must be open or reviewed')
  }
  const data = loadRaw()
  const idx = data.reports.findIndex((r) => r.id === key)
  if (idx < 0) return null
  data.reports[idx] = {
    ...data.reports[idx],
    status,
    reviewedAt: status === 'reviewed' ? Date.now() : null,
  }
  saveRaw(data)
  return data.reports[idx]
}
