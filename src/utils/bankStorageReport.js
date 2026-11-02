import { getQuestionType } from '../data/questionTypes.js'
import { estimateDataUrlBytes, formatImageSize } from './imageQuestion.js'
import { getBankStorageDiagnostics } from './bankStorageRecovery.js'

const BANK_KEY = 'testvantage-uploaded-questions'
const BACKUP_KEY = 'testvantage-uploaded-questions-backup'
const SESSION_BACKUP_KEY = 'testvantage-bank-session-backup'

/** @param {number} bytes */
export function formatStorageSize(bytes) {
  return formatImageSize(bytes)
}

/** @param {string | undefined | null} url */
function imageBytes(url) {
  return url?.trim() ? estimateDataUrlBytes(url) : 0
}

/** @param {import('../data/tests').Question} q */
function questionImageBytes(q) {
  let total = 0
  total += imageBytes(q.questionImage)
  total += imageBytes(q.passageImage)
  total += imageBytes(q.optionsImage)
  total += imageBytes(q.solutionImage)
  for (const img of q.optionImages ?? []) total += imageBytes(img)
  return total
}

/** @param {import('../data/tests').Question} q */
export function describeQuestionImageParts(q) {
  const parts = []
  if (q.questionImage) parts.push('stem image')
  if (q.passageImage) parts.push('passage image')
  if (q.optionsImage) parts.push('options (one image)')
  const optCount = (q.optionImages ?? []).filter((img) => img?.trim()).length
  if (optCount) parts.push(`${optCount} option image(s)`)
  if (q.solutionImage) parts.push('solution image')
  return parts.length ? parts.join(', ') : '—'
}

/** @param {import('../data/tests').Question} q */
export function describeQuestionSaveFormat(q) {
  const type = getQuestionType(q.questionType).shortName
  const mode = q.contentMode === 'hybrid' || questionImageBytes(q) > 0 ? 'Hybrid' : 'Text'
  const images = describeQuestionImageParts(q)
  if (images === '—') return `${mode} · ${type} · LaTeX text in JSON`
  return `${mode} · ${type} · LaTeX + images (${images})`
}

/**
 * @param {import('../data/tests').Question} q
 * @returns {{ id: string, subject: string, type: string, format: string, textBytes: number, imageBytes: number, totalBytes: number }}
 */
export function getQuestionStorageRow(q) {
  const totalBytes = JSON.stringify(q).length
  const imageBytesTotal = questionImageBytes(q)
  return {
    id: String(q.id ?? '—'),
    subject: String(q.subject ?? '—'),
    type: getQuestionType(q.questionType).shortName,
    format: describeQuestionSaveFormat(q),
    textBytes: Math.max(0, totalBytes - imageBytesTotal),
    imageBytes: imageBytesTotal,
    totalBytes,
  }
}

/** @returns {{ name: string, location: string, key: string, format: string, bytes: number }[]} */
export function getBankStorageSlots() {
  if (typeof window === 'undefined') return []

  const readLen = (storage, key) => {
    try {
      return storage.getItem(key)?.length ?? 0
    } catch {
      return 0
    }
  }

  return [
    {
      name: 'Main question bank',
      location: 'Browser localStorage',
      key: BANK_KEY,
      format: 'JSON — { settings, questions[] }',
      bytes: readLen(localStorage, BANK_KEY),
    },
    {
      name: 'Backup copy',
      location: 'Browser localStorage',
      key: BACKUP_KEY,
      format: 'JSON — same as main bank',
      bytes: readLen(localStorage, BACKUP_KEY),
    },
    {
      name: 'Session backup',
      location: 'Browser sessionStorage',
      key: SESSION_BACKUP_KEY,
      format: 'JSON — temporary copy while tab is open',
      bytes: readLen(sessionStorage, SESSION_BACKUP_KEY),
    },
  ]
}

/** @returns {{ name: string, format: string, note: string }[]} */
export function getExportFormatRows() {
  return [
    {
      name: 'Saved in browser (default)',
      format: 'JSON in localStorage',
      note: 'Used automatically when you Save in Question Bank',
    },
    {
      name: 'Export JSON',
      format: '{ "questions": [ … ] }',
      note: 'One file per export — good for backup or moving to another PC',
    },
    {
      name: 'Export CSV',
      format: 'Comma-separated columns (subject, text, options A–F, metatags…)',
      note: 'Text only — no images',
    },
    {
      name: 'Full backup',
      format: '{ "settings": {…}, "questions": [ … ] }',
      note: 'Settings + all questions — use Merge backup to restore',
    },
  ]
}

/**
 * @param {import('../data/tests').Question[]} questions
 */
export function buildBankStorageReport(questions) {
  const rows = (questions ?? []).map(getQuestionStorageRow)
  const diag = getBankStorageDiagnostics()
  const slots = getBankStorageSlots()
  const totalQuestionBytes = rows.reduce((s, r) => s + r.totalBytes, 0)
  const totalImageBytes = rows.reduce((s, r) => s + r.imageBytes, 0)

  return {
    questionCount: rows.length,
    rows,
    slots,
    exportFormats: getExportFormatRows(),
    summary: {
      mainBankBytes: diag.bytes,
      backupBytes: diag.backupBytes ?? 0,
      questionsJsonBytes: totalQuestionBytes,
      imageBytes: totalImageBytes,
      textBytes: totalQuestionBytes - totalImageBytes,
    },
  }
}
