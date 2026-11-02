/**
 * One published copy per official paper (exam + year + paper).
 * A second Approve must not add another 48 questions on top of the first 48.
 */

import { loadImportedPyqs, saveImportedPyqs } from './pyqStore.js'
import { loadQuestionBank } from './questionBank.js'

const BANK_KEY = 'testvantage-uploaded-questions'
const BANK_BACKUP_KEY = 'testvantage-uploaded-questions-backup'
const BANK_SESSION_KEY = 'testvantage-bank-session-backup'

/** Write the bank and its backups together so an empty save is not restored from the old backup. */
export function writeQuestionBankSnapshot(bank, questions) {
  const json = JSON.stringify({ settings: bank?.settings, questions })
  localStorage.setItem(BANK_KEY, json)
  localStorage.setItem(BANK_BACKUP_KEY, json)
  try {
    sessionStorage.setItem(BANK_SESSION_KEY, json)
  } catch {
    /* session backup is optional */
  }
}

export const ALREADY_PUBLISHED_MESSAGE =
  'This paper is already published. To publish again, an admin must first unapprove it.'

function isOfficialRow(q) {
  if (!q) return false
  if (q.officialPyq === true) return true
  return String(q.bankSource || '') === 'official_pyq'
}

/** @param {object} q */
export function officialPyqPublishSittingKey(q) {
  if (!isOfficialRow(q)) return ''
  const exam = String(q.examPatternId || (Array.isArray(q.examIds) ? q.examIds[0] : '') || '')
    .trim()
    .toLowerCase()
  const year = Number(q.pyqYear)
  if (!exam || !year) return ''
  const paperId = String(q.paperId || '').trim().toLowerCase()
  if (paperId) return `${exam}|${year}|${paperId}`
  const blob = `${q.pyqSession || ''} ${q.paperLabel || ''}`
  const paper = /paper\s*2/i.test(blob) ? 'p2' : /paper\s*1/i.test(blob) ? 'p1' : blob.trim().toLowerCase()
  return `${exam}|${year}|${paper}`
}

/** @param {object} paper */
export function officialPyqPublishSittingKeyFromPaper(paper) {
  if (!paper) return ''
  return officialPyqPublishSittingKey({
    officialPyq: true,
    examPatternId: paper.exam,
    pyqYear: paper.year,
    paperId: paper.paperId,
    pyqSession: paper.session,
    paperLabel: paper.paperLabel,
  })
}

/** Last 13-digit group is the publish time. The pending id also contains one. */
export function officialPyqPublishStamp(q) {
  const id = String(q?.id || '')
  const hits = [...id.matchAll(/(\d{13})/g)]
  if (hits.length) return Number(hits[hits.length - 1][1])
  const saved = Number(q?.savedAt)
  return Number.isFinite(saved) && saved > 1e12 ? saved : 0
}

function dedupeSlots(rows) {
  const bySlot = new Map()
  const loose = []
  for (const q of rows) {
    const slot = Number(q?.pyqSlot)
    if (!slot) {
      loose.push(q)
      continue
    }
    const prev = bySlot.get(slot)
    if (!prev || officialPyqPublishStamp(q) >= officialPyqPublishStamp(prev)) bySlot.set(slot, q)
  }
  return [...bySlot.values(), ...loose]
}

/**
 * Keep the later full publish of one sitting. Drop the older set.
 * @param {object[]} rows
 */
export function chooseKeptOfficialPyqPublish(rows) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : []
  if (list.length < 2) return list
  const byStamp = new Map()
  for (const q of list) {
    const stamp = officialPyqPublishStamp(q)
    if (!byStamp.has(stamp)) byStamp.set(stamp, [])
    byStamp.get(stamp).push(q)
  }
  const batches = [...byStamp.entries()].sort((a, b) => a[0] - b[0])
  if (batches.length === 1) return dedupeSlots(list)
  const newest = batches[batches.length - 1][1]
  const fullest = batches.reduce((best, cur) => (cur[1].length > best.length ? cur[1] : best), [])
  const newestFull = newest.length >= 40 && newest.length + 2 >= fullest.length
  return dedupeSlots(newestFull || newest.length >= fullest.length ? newest : fullest)
}

/**
 * Drop an older published copy of the same official paper from the student
 * PYQ list and the question bank. Leaves every other question in place.
 * @returns {{ removed: number, keptIds: string[] }}
 */
export function removeOlderDuplicateOfficialPyqPublishes() {
  if (typeof localStorage === 'undefined') return { removed: 0, keptIds: [] }
  const imported = loadImportedPyqs()
  const bank = loadQuestionBank()
  const bankRows = Array.isArray(bank?.questions) ? bank.questions : []
  const seen = new Set()
  /** @type {object[]} */
  const combined = []
  for (const q of [...imported, ...bankRows]) {
    const key = officialPyqPublishSittingKey(q)
    if (!key) continue
    const id = String(q.id || '')
    const mark = `${key}|${id}|${q.pyqSlot || ''}`
    if (seen.has(mark)) continue
    seen.add(mark)
    combined.push(q)
  }
  const groups = new Map()
  for (const q of combined) {
    const key = officialPyqPublishSittingKey(q)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(q)
  }
  const removeIds = new Set()
  const keptIds = []
  for (const rows of groups.values()) {
    const unique = []
    const ids = new Set()
    for (const q of rows) {
      const id = String(q.id || '')
      if (id && ids.has(id)) continue
      if (id) ids.add(id)
      unique.push(q)
    }
    const kept = chooseKeptOfficialPyqPublish(unique)
    const keep = new Set(kept.map((q) => String(q.id)))
    for (const id of keep) keptIds.push(id)
    if (kept.length >= unique.length) continue
    for (const q of unique) {
      const id = String(q.id || '')
      if (id && !keep.has(id)) removeIds.add(id)
    }
  }
  if (!removeIds.size) return { removed: 0, keptIds }

  const seenImported = new Set()
  const nextImported = []
  for (const q of imported) {
    const id = String(q?.id || '')
    if (id && removeIds.has(id)) continue
    if (id && seenImported.has(id)) continue
    if (id) seenImported.add(id)
    nextImported.push(q)
  }
  if (nextImported.length !== imported.length) saveImportedPyqs(nextImported)

  const nextBank = bankRows.filter((q) => !removeIds.has(String(q.id)))
  if (nextBank.length !== bankRows.length) {
    const keptStillThere = keptIds.some(
      (id) => nextImported.some((q) => String(q.id) === id) || nextBank.some((q) => String(q.id) === id),
    )
    if (nextBank.length > 0 || keptStillThere) writeQuestionBankSnapshot(bank, nextBank)
  }
  return { removed: removeIds.size, keptIds }
}

/** True when this exam + year + paper already has published official questions. */
export function officialPyqSittingHasPublishedQuestions(paper) {
  const key = officialPyqPublishSittingKeyFromPaper(paper)
  if (!key) return false
  if (loadImportedPyqs().some((q) => officialPyqPublishSittingKey(q) === key)) return true
  const bankRows = loadQuestionBank()?.questions ?? []
  return bankRows.some((q) => officialPyqPublishSittingKey(q) === key)
}
