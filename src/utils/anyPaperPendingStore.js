/**
 * Staging bank for named papers (not Official PYQ).
 * Never auto-publishes to the Question Bank.
 */

import { namedPaperTitleError, normalizeNamedPaperTitle } from './bankMathpixUpload.js'
import { ALREADY_PUBLISHED_MESSAGE } from './officialPyqPublishOnce.js'

export const ANY_PAPER_PENDING_KEY = 'testvantage-any-paper-pending'

/** @typedef {'pending_review' | 'approved' | 'rejected'} AnyPaperStatus */

/**
 * @typedef {{
 *   id: string
 *   paperName: string
 *   paperLabel: string
 *   status: AnyPaperStatus
 *   importedAt: number
 *   reviewedAt?: number
 *   notes?: string
 *   preparedText?: string
 *   questions: object[]
 *   localQuality?: object
 *   officialPyq?: false
 * }} AnyPaperPending
 */

/** @type {{ papers: AnyPaperPending[], updatedAt: number } | null} */
let memoryRoot = null

export function anyPaperNameKey(name) {
  return normalizeNamedPaperTitle(name).toLowerCase()
}

export function countFilledAnyPaperQuestions(questions) {
  return (Array.isArray(questions) ? questions : []).filter((q) =>
    String(q?.text ?? q?.stem ?? '').trim(),
  ).length
}

function loadRoot() {
  if (memoryRoot) return memoryRoot
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(ANY_PAPER_PENDING_KEY) : null
    if (raw) {
      const parsed = JSON.parse(raw)
      memoryRoot = {
        papers: Array.isArray(parsed?.papers) ? parsed.papers : [],
        updatedAt: Number(parsed?.updatedAt) || Date.now(),
      }
      return memoryRoot
    }
  } catch {
    /* ignore */
  }
  memoryRoot = { papers: [], updatedAt: Date.now() }
  return memoryRoot
}

function saveRoot(root) {
  memoryRoot = { papers: root.papers, updatedAt: Date.now() }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(ANY_PAPER_PENDING_KEY, JSON.stringify(memoryRoot))
    }
  } catch {
    /* quota */
  }
}

export function listAnyPaperPending() {
  return [...loadRoot().papers].sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0))
}

export function getAnyPaperPending(id) {
  const needle = String(id ?? '').trim()
  if (!needle) return null
  return loadRoot().papers.find((p) => p.id === needle) ?? null
}

export function findAnyPaperPendingByName(name) {
  const key = anyPaperNameKey(name)
  if (!key) return null
  return loadRoot().papers.find((p) => anyPaperNameKey(p.paperName) === key) ?? null
}

/**
 * @param {{ paperName: string, questions?: object[], preparedText?: string, notes?: string, localQuality?: object, id?: string }} input
 */
export function addAnyPaperPending(input) {
  const paperName = normalizeNamedPaperTitle(input?.paperName)
  const err = namedPaperTitleError(paperName)
  if (err) throw new Error(err)
  const questions = Array.isArray(input.questions) ? input.questions : []
  const existing = findAnyPaperPendingByName(paperName)
  if (existing) {
    if (existing.status === 'approved') {
      throw new Error(ALREADY_PUBLISHED_MESSAGE)
    }
    return updateAnyPaperPending(existing.id, {
      questions,
      preparedText: input.preparedText,
      notes: input.notes,
      localQuality: input.localQuality,
      status: 'pending_review',
    })
  }
  const now = Date.now()
  /** @type {AnyPaperPending} */
  const draft = {
    id: String(input.id ?? `anyp-${now}-${Math.random().toString(36).slice(2, 8)}`),
    paperName,
    paperLabel: paperName,
    status: 'pending_review',
    importedAt: now,
    notes: input.notes,
    preparedText: input.preparedText ? String(input.preparedText) : undefined,
    localQuality: input.localQuality,
    questions,
    officialPyq: false,
  }
  const root = loadRoot()
  root.papers.unshift(draft)
  saveRoot(root)
  return draft
}

export function updateAnyPaperPending(id, updates) {
  const root = loadRoot()
  const idx = root.papers.findIndex((p) => p.id === id)
  if (idx === -1) return null
  const prev = root.papers[idx]
  const nextName = updates.paperName != null ? normalizeNamedPaperTitle(updates.paperName) : prev.paperName
  root.papers[idx] = {
    ...prev,
    ...updates,
    id: prev.id,
    paperName: nextName || prev.paperName,
    paperLabel: nextName || prev.paperLabel,
    officialPyq: false,
  }
  saveRoot(root)
  return root.papers[idx]
}

export function removeAnyPaperPending(id) {
  const root = loadRoot()
  const next = root.papers.filter((p) => p.id !== id)
  if (next.length === root.papers.length) return false
  saveRoot({ papers: next, updatedAt: Date.now() })
  return true
}

export function clearAnyPaperPending() {
  memoryRoot = { papers: [], updatedAt: Date.now() }
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(ANY_PAPER_PENDING_KEY)
  } catch {
    /* ignore */
  }
}
