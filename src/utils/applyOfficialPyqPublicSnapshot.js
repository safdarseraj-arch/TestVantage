/**
 * One-shot: put stored Official PYQ papers from
 * public/official-pyq-store-snapshot.json onto the Pending list.
 * Does not Approve. Does not invent questions.
 * A paper that is already approved stays approved, with the questions it had
 * at publish time. Reload must not send it back to Pending.
 */

import {
  OFFICIAL_PYQ_PENDING_KEY,
  OFFICIAL_PYQ_PENDING_BACKUP_KEY,
  OFFICIAL_PYQ_PENDING_LIST_KEY,
  OFFICIAL_PYQ_PENDING_PAPER_KEY_PREFIX,
  keepAdminEditedOfficialPyqCards,
  officialPyqSittingKey,
  reloadOfficialPyqPendingFromStorage,
} from './officialPyqPendingStore.js'

const APPLY_FLAG = 'testvantage-opyq-snapshot-applied-pending'
const UI_KEY = 'testvantage-official-pyq-ui'

function questionCountOf(p) {
  return Array.isArray(p?.questions) ? p.questions.length : 0
}

/** One stored paper per exam sitting. Prefer the copy that still has questions. */
function uniqueSnapshotPapers(payload) {
  const raw = []
  if (Array.isArray(payload?.root?.papers)) raw.push(...payload.root.papers)
  for (const extra of [payload?.itemPaper1, payload?.itemPaper2, payload?.itemPaper2026P1]) {
    if (extra && typeof extra === 'object') raw.push(extra)
  }
  /** @type {Map<string, object>} */
  const byKey = new Map()
  for (const paper of raw) {
    if (!paper || questionCountOf(paper) < 1) continue
    const key = officialPyqSittingKey(paper)
    const prev = byKey.get(key)
    if (!prev || questionCountOf(paper) > questionCountOf(prev)) byKey.set(key, paper)
  }
  return [...byKey.values()]
}

/**
 * Key for "already copied this snapshot into the browser".
 * Includes a fingerprint of each question so a later correction reloads
 * even when restoredAt was left unchanged.
 * @param {object} payload
 */
export function officialPyqSnapshotApplyKey(payload) {
  const papers = uniqueSnapshotPapers(payload)
  const restoredAt = String(payload?.restoredAt ?? '')
  let hash = 2166136261
  for (const paper of papers) {
    const questions = Array.isArray(paper?.questions) ? paper.questions : []
    const bits = [
      paper?.paperId,
      paper?.status,
      questions.length,
      ...questions.map(
        (q) =>
          `${q?.printedNumber ?? ''}|${String(q?.text ?? '').length}|${
            (Array.isArray(q?.options) ? q.options : []).filter((o) => String(o ?? '').trim()).length
          }`,
      ),
    ]
    for (const bit of bits) {
      const s = String(bit)
      for (let i = 0; i < s.length; i += 1) {
        hash ^= s.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
    }
  }
  return `${restoredAt}:${papers.length}:${hash >>> 0}`
}

/**
 * Merge snapshot papers into the papers already in this browser.
 * Approved papers are left untouched (status and questions).
 * @param {object[]} existingPapers
 * @param {object[]} incomingPapers
 */
export function mergeOfficialPyqSnapshotIntoPapers(existingPapers, incomingPapers) {
  const papers = Array.isArray(existingPapers) ? existingPapers.slice() : []
  let skippedPublished = 0
  for (const src of incomingPapers || []) {
    if (!src || questionCountOf(src) < 1) continue
    const key = officialPyqSittingKey(src)
    const idx = papers.findIndex(
      (p) => officialPyqSittingKey(p) === key || (src.id && p.id === src.id),
    )
    if (idx >= 0 && ['approved', 'published'].includes(String(papers[idx]?.status ?? ''))) {
      skippedPublished += 1
      continue
    }
    const healed = {
      ...src,
      status: 'pending_review',
      reviewedAt: undefined,
      rejectReason: '',
      questionCount: questionCountOf(src),
      hasOcr: String(src.preparedText || '').trim().length >= 80,
    }
    if (idx >= 0) {
      const kept = keepAdminEditedOfficialPyqCards(papers[idx]?.questions, healed.questions)
      if (kept !== healed.questions) {
        healed.questions = kept
        healed.questionCount = kept.length
      }
    }
    if (idx >= 0) papers[idx] = healed
    else papers.push(healed)
  }
  return { papers, skippedPublished }
}

/**
 * @returns {Promise<{
 *   ok: boolean
 *   skipped?: boolean
 *   pending?: number
 *   paper2Count?: number
 *   error?: string
 * }>}
 */
export async function applyOfficialPyqPublicSnapshotOnce() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return { ok: false, error: 'No browser storage.' }
  }
  let payload
  try {
    const res = await fetch('/official-pyq-store-snapshot.json', { cache: 'no-store' })
    if (!res.ok) return { ok: false, error: `Snapshot missing (${res.status})` }
    payload = await res.json()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not load snapshot.' }
  }

  const incoming = uniqueSnapshotPapers(payload)
  if (!incoming.length) {
    return { ok: false, error: 'Snapshot has no stored questions.' }
  }

  const restoredAt = officialPyqSnapshotApplyKey(payload)
  try {
    if (sessionStorage.getItem(APPLY_FLAG) === restoredAt) {
      return { ok: true, skipped: true }
    }
  } catch {
    /* continue */
  }

  let existing = null
  try {
    existing = JSON.parse(localStorage.getItem(OFFICIAL_PYQ_PENDING_KEY) || 'null')
  } catch {
    existing = null
  }
  const mergedPapers = mergeOfficialPyqSnapshotIntoPapers(existing?.papers, incoming)
  const papers = mergedPapers.papers
  const merged = {
    papers,
    updatedAt: Date.now(),
    version: existing?.version || 1,
  }

  localStorage.setItem(OFFICIAL_PYQ_PENDING_KEY, JSON.stringify(merged))
  try {
    sessionStorage.setItem(OFFICIAL_PYQ_PENDING_BACKUP_KEY, JSON.stringify(merged))
  } catch {
    /* optional */
  }

  const summaries = merged.papers.map((p) => ({
    id: p.id,
    paperId: p.paperId,
    paperLabel: p.paperLabel,
    status: p.status,
    year: p.year,
    exam: p.exam,
    session: p.session,
    sourceLabel: p.sourceLabel,
    questionCount: Array.isArray(p.questions) ? p.questions.length : 0,
    expectedQuestionCount: p.expectedQuestionCount,
    hasOcr: String(p.preparedText || '').trim().length >= 80,
    importedAt: p.importedAt,
  }))
  localStorage.setItem(
    OFFICIAL_PYQ_PENDING_LIST_KEY,
    JSON.stringify({ papers: summaries, updatedAt: Date.now() }),
  )
  for (const paper of papers) {
    if (!paper?.id) continue
    localStorage.setItem(
      `${OFFICIAL_PYQ_PENDING_PAPER_KEY_PREFIX}${paper.id}`,
      JSON.stringify(paper),
    )
  }

  try {
    reloadOfficialPyqPendingFromStorage?.()
  } catch {
    /* optional */
  }

  try {
    sessionStorage.setItem(
      UI_KEY,
      JSON.stringify({ filter: 'pending_review', openId: null }),
    )
    sessionStorage.setItem(APPLY_FLAG, restoredAt)
  } catch {
    /* optional */
  }

  const pendingPapers = summaries.filter((p) => p.status === 'pending_review')
  return {
    ok: true,
    pending: pendingPapers.length,
    papers: pendingPapers.map((p) => ({
      id: p.id,
      year: p.year,
      session: p.session,
      questionCount: p.questionCount,
    })),
    paper2Count: pendingPapers.find((p) => /paper\s*2/i.test(String(p.session || '')))?.questionCount,
  }
}