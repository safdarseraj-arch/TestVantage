/**
 * Separate staging bank for official previous-year papers awaiting approval.
 * Never auto-publishes to student PYQ or the main Question Bank.
 */

import { getOfficialPyqExamLabel } from '../data/officialPyqSources.js'
import { enforceAdminFactsOnQuestions } from './officialPyqAdminFacts.js'

export const OFFICIAL_PYQ_PENDING_KEY = 'testvantage-official-pyq-pending'
export const OFFICIAL_PYQ_PENDING_BACKUP_KEY = 'testvantage-official-pyq-pending-backup'
/** Lightweight rows for tab lists — no question bodies or OCR. */
export const OFFICIAL_PYQ_PENDING_LIST_KEY = 'testvantage-official-pyq-pending-list'
/** One paper’s questions (no OCR blob) so Open does not JSON.parse the fat store. */
export const OFFICIAL_PYQ_PENDING_PAPER_KEY_PREFIX = 'testvantage-official-pyq-pending-item:'

/** @typedef {'pending_review' | 'approved' | 'rejected'} OfficialPyqPaperStatus */

/**
 * @typedef {{
 *   id?: string
 *   text: string
 *   options?: string[]
 *   correctIndex?: number
 *   correctIndices?: number[]
 *   correctInteger?: number
 *   correctNumerical?: number
 *   solution?: string
 *   subject?: string
 *   chapter?: string
 *   questionType?: string
 *   answerSource?: string
 *   solutionSource?: string
 *   answerConfidence?: number
 *   solutionConfidence?: number
 *   provenance?: string
 *   pyqSlot?: number
 *   [key: string]: unknown
 * }} OfficialPyqPendingQuestion
 */

/**
 * @typedef {{
 *   id: string
 *   exam: 'jee-main' | 'jee-advanced' | 'neet'
 *   year: number
 *   session?: string
 *   pyqDate?: string
 *   pyqShift?: number
 *   paperId: string
 *   paperLabel: string
 *   sourceUrl?: string
 *   sourceLabel: string
 *   sourceSlotId?: string
 *   status: OfficialPyqPaperStatus
 *   importedAt: number
 *   reviewedAt?: number
 *   rejectReason?: string
 *   notes?: string
 *   preparedText?: string
 *   questions: OfficialPyqPendingQuestion[]
 * }} OfficialPyqPendingPaper
 */

/** @type {{ papers: OfficialPyqPendingPaper[], updatedAt: number } | null} */
let memoryRoot = null

/**
 * @typedef {{
 *   id: string
 *   paperId?: string
 *   paperLabel: string
 *   status: OfficialPyqPaperStatus
 *   year: number
 *   exam: OfficialPyqPendingPaper['exam']
 *   session?: string
 *   sourceLabel?: string
 *   sourceSlotId?: string
 *   questionCount: number
 *   importedAt?: number
 * }} OfficialPyqPendingSummary
 */

/** @type {OfficialPyqPendingSummary[] | null} */
let memorySummaries = null

/** @type {Map<string, OfficialPyqPendingPaper> | null} */
let memoryPaperById = null

function paperItemKey(id) {
  return `${OFFICIAL_PYQ_PENDING_PAPER_KEY_PREFIX}${String(id)}`
}

/** @param {OfficialPyqPendingPaper | null | undefined} paper */
function rememberPaper(paper) {
  if (!paper?.id) return
  if (!memoryPaperById) memoryPaperById = new Map()
  memoryPaperById.set(String(paper.id), paper)
}

/** Filled stems only — empty / placeholder rows do not count. */
export function countFilledOfficialPyqQuestions(questions) {
  return (Array.isArray(questions) ? questions : []).filter((q) =>
    String(q?.text ?? q?.stem ?? '').trim(),
  ).length
}

/** @param {OfficialPyqPendingPaper | OfficialPyqPendingSummary | null | undefined} paper */
export function officialPyqPaperQuestionCount(paper) {
  const stored = Number(paper?.questionCount)
  if (Number.isFinite(stored) && stored >= 0) return stored
  return Array.isArray(paper?.questions) ? paper.questions.length : 0
}

/**
 * Never replace a real paper (8+ filled cards) with an empty questions[].
 * Hung Approve / failed persist / hard reload used to wipe 51 → 0.
 * @param {OfficialPyqPendingPaper | null | undefined} prev
 * @param {unknown} nextQuestions
 * @param {{ allowEmpty?: boolean }} [opts]
 */
export function keepOfficialPyqQuestionsIfEmptied(prev, nextQuestions, opts = {}) {
  if (opts.allowEmpty === true) return Array.isArray(nextQuestions) ? nextQuestions : []
  const prevFilled = countFilledOfficialPyqQuestions(prev?.questions)
  if (prevFilled < 8) return nextQuestions
  const nextFilled = countFilledOfficialPyqQuestions(nextQuestions)
  if (nextFilled === 0) return prev.questions
  return nextQuestions
}

/** Card fields an admin can change in the Edit question box. */
export const OFFICIAL_PYQ_ADMIN_EDIT_FIELDS = [
  'text',
  'stem',
  'options',
  'correctIndex',
  'correctIndices',
  'correctInteger',
  'correctNumerical',
  'questionImage',
  'passageText',
  'passageSource',
  'adminEdited',
  'adminEditedAt',
  'adminApproved',
  'adminApprovedAt',
  'editHistory',
  'editSource',
]

/** @param {unknown} q */
export function officialPyqCardIsAdminEdited(q) {
  return Boolean(q && typeof q === 'object' && /** @type {any} */ (q).adminEdited === true)
}

/** An admin approved this one card as shown: no quality alarms, nothing may change it. @param {unknown} q */
export function officialPyqCardIsApproved(q) {
  return Boolean(q && typeof q === 'object' && /** @type {any} */ (q).adminApproved === true)
}

/** @param {any} q @param {number} index */
function officialPyqCardSlotKey(q, index) {
  const slot = Number(q?.pyqSlot ?? q?.questionNumber)
  return Number.isFinite(slot) && slot > 0 ? slot : index + 1
}

/**
 * Re-parse, auto-heal, quality fix, snapshot restore and Gemini fill must never
 * overwrite a card an admin edited by hand. Matches cards by slot number.
 * A newer admin save (larger adminEditedAt) is the only thing that replaces one.
 * `release` lists old card indexes the admin chose to undo (Undo last edit /
 * Go back to the scanned version); those may be replaced.
 * @param {unknown[] | null | undefined} prevQuestions
 * @param {unknown[] | null | undefined} nextQuestions
 * @param {{ release?: Iterable<number> }} [opts]
 * @returns {unknown[]}
 */
export function keepAdminEditedOfficialPyqCards(prevQuestions, nextQuestions, opts = {}) {
  const released = new Set(Array.from(opts?.release ?? [], Number))
  const prev = (Array.isArray(prevQuestions) ? prevQuestions : []).map((q, i) => (released.has(i) ? null : q))
  const next = Array.isArray(nextQuestions) ? nextQuestions : []
  if (!next.length) return next
  /** @type {Map<string, number>} */
  const nextById = new Map()
  next.forEach((q, i) => {
    const id = String(/** @type {any} */ (q)?.id ?? '').trim()
    if (id && !nextById.has(id)) nextById.set(id, i)
  })
  const editedContent = new Set(
    next
      .filter((q) => officialPyqCardIsAdminEdited(q))
      .map((q) => JSON.stringify([/** @type {any} */ (q).text ?? '', /** @type {any} */ (q).options ?? []])),
  )
  const edited = new Map()
  /** @type {Map<number, any>} */
  const carried = new Map()
  prev.forEach((q, i) => {
    if (!officialPyqCardIsAdminEdited(q)) return
    // A card that moved slot (e.g. a passage card before it was removed) keeps its edit by id.
    const at = nextById.get(String(q?.id ?? '').trim())
    if (at != null && officialPyqCardIsAdminEdited(next[at])) carried.set(at, q)
    else if (!editedContent.has(JSON.stringify([q.text ?? '', q.options ?? []]))) {
      edited.set(officialPyqCardSlotKey(q, i), q)
    }
  })
  if (!edited.size && !carried.size) return next
  let changed = false
  const used = new Set()
  const out = next.map((q, i) => {
    const mineById = carried.get(i)
    if (mineById) {
      const nextAt = Number(/** @type {any} */ (q)?.adminEditedAt) || 0
      if (nextAt > (Number(mineById.adminEditedAt) || 0)) return q
      const forced = { ...q }
      for (const field of OFFICIAL_PYQ_ADMIN_EDIT_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(mineById, field)) forced[field] = mineById[field]
        else delete forced[field]
      }
      changed = true
      return forced
    }
    const key = officialPyqCardSlotKey(q, i)
    const mine = edited.get(key)
    if (!mine || used.has(key)) return q
    used.add(key)
    const nextAt = Number(/** @type {any} */ (q)?.adminEditedAt) || 0
    const mineAt = Number(mine.adminEditedAt) || 0
    if (officialPyqCardIsAdminEdited(q) && nextAt > mineAt) return q
    changed = true
    if (officialPyqCardIsAdminEdited(q) && nextAt === mineAt) {
      const forced = { ...q }
      for (const field of OFFICIAL_PYQ_ADMIN_EDIT_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(mine, field)) forced[field] = mine[field]
        else delete forced[field]
      }
      return forced
    }
    return mine
  })
  for (const [key, card] of edited) {
    if (used.has(key)) continue
    changed = true
    const at = out.findIndex((q, i) => officialPyqCardSlotKey(q, i) > key)
    if (at < 0) out.push(card)
    else out.splice(at, 0, card)
  }
  return changed ? out : next
}

/**
 * Restore questions for this id from item cache / fat store / session backup.
 * Never invents cards. Returns [] if this paper truly has none.
 * @param {string} id
 * @returns {OfficialPyqPendingQuestion[]}
 */
export function recoverOfficialPyqQuestionsFromStore(id) {
  const needle = String(id ?? '').trim()
  if (!needle) return []
  const fromMem = memoryPaperById?.get(needle)
  if (countFilledOfficialPyqQuestions(fromMem?.questions) >= 8) {
    return Array.isArray(fromMem.questions) ? fromMem.questions : []
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(paperItemKey(needle))
      if (raw) {
        const data = JSON.parse(raw)
        if (countFilledOfficialPyqQuestions(data?.questions) >= 8) {
          return data.questions
        }
      }
    }
  } catch {
    /* item cache optional */
  }
  if (memoryRoot) {
    const found = memoryRoot.papers.find((p) => p.id === needle)
    if (countFilledOfficialPyqQuestions(found?.questions) >= 8) {
      return found.questions
    }
  }
  const persisted = readPersistedRoot()
  const found = persisted.papers.find((p) => p.id === needle)
  if (countFilledOfficialPyqQuestions(found?.questions) >= 8) {
    return found.questions
  }
  return []
}

/**
 * Another stored paper (same exam + year) that still has real cards.
 * Paper 2 empty shell ≠ the Paper 1 the user already reviewed.
 * @param {Partial<OfficialPyqPendingPaper> | OfficialPyqPendingSummary | null | undefined} paper
 */
export function findOfficialPyqSiblingWithQuestions(paper) {
  const exam = String(paper?.exam || '')
  const year = Number(paper?.year)
  const exclude = String(paper?.id || '')
  if (!exam || !Number.isFinite(year) || year < 2000) return null
  const list = Array.isArray(memorySummaries) ? memorySummaries : listOfficialPyqPendingSummaries('all')
  return (
    list.find(
      (p) =>
        String(p.id) !== exclude &&
        String(p.exam) === exam &&
        Number(p.year) === year &&
        officialPyqPaperQuestionCount(p) >= 8,
    ) ?? null
  )
}

/**
 * Questions + meta for preview. Omits preparedText so Open is not an OCR parse.
 * @param {OfficialPyqPendingPaper} paper
 */
function paperToLightRecord(paper) {
  return {
    id: String(paper.id ?? ''),
    paperId: paper.paperId,
    paperLabel: paper.paperLabel,
    status: paper.status,
    year: paper.year,
    exam: paper.exam,
    session: paper.session,
    pyqDate: paper.pyqDate,
    pyqShift: paper.pyqShift,
    sourceLabel: paper.sourceLabel,
    sourceSlotId: paper.sourceSlotId,
    sourceUrl: paper.sourceUrl,
    notes: [
      String(paper.notes ?? '').match(/^Extract summary:[^\n]+/im)?.[0] || '',
      String(paper.notes ?? '').match(/Needs a look:[^\n]+/i)?.[0] || '',
    ]
      .filter(Boolean)
      .join('\n'),
    importedAt: paper.importedAt,
    reviewedAt: paper.reviewedAt,
    rejectReason: paper.rejectReason,
    expectedQuestionCount: paper.expectedQuestionCount,
    hasOcr: paper.hasOcr === true || String(paper.preparedText ?? '').trim().length >= 80,
    questionCount: officialPyqPaperQuestionCount(paper),
    questions: Array.isArray(paper.questions) ? paper.questions : [],
    localQuality: paper.localQuality,
    ...(paper.adminFacts ? { adminFacts: paper.adminFacts } : {}),
    ...(paper.aiReplicaPaper === true ? { aiReplicaPaper: true } : {}),
    ...(paper.replicaParentPaperId
      ? { replicaParentPaperId: String(paper.replicaParentPaperId) }
      : {}),
    ...(paper.replicaDifficultyOffset != null
      ? { replicaDifficultyOffset: Number(paper.replicaDifficultyOffset) }
      : {}),
  }
}

/** @param {OfficialPyqPendingPaper} paper */
function writeLightPaper(paper) {
  rememberPaper(paper)
  try {
    if (typeof localStorage === 'undefined' || !paper?.id) return
    localStorage.setItem(paperItemKey(paper.id), JSON.stringify(paperToLightRecord(paper)))
  } catch {
    /* item cache is optional */
  }
}

/** @param {OfficialPyqPendingPaper[]} papers */
function writeAllLightPapers(papers) {
  for (const paper of Array.isArray(papers) ? papers : []) writeLightPaper(paper)
}

/** @param {string} id */
function readLightPaper(id) {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(paperItemKey(id))
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object') return null
    rememberPaper(data)
    return data
  } catch {
    return null
  }
}

/** @param {Iterable<string>} ids */
function forgetPaperRecords(ids) {
  if (!memoryPaperById) memoryPaperById = new Map()
  for (const id of ids ?? []) {
    const key = String(id ?? '').trim()
    if (!key) continue
    memoryPaperById.delete(key)
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(paperItemKey(key))
    } catch {
      /* ignore */
    }
  }
}

function forgetAllPaperRecords() {
  const ids = [
    ...(memoryPaperById?.keys() ?? []),
    ...(memorySummaries ?? []).map((p) => p.id),
    ...(memoryRoot?.papers ?? []).map((p) => p.id),
  ]
  forgetPaperRecords(ids)
  memoryPaperById = new Map()
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.key !== 'function') return
    const toRemove = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.startsWith(OFFICIAL_PYQ_PENDING_PAPER_KEY_PREFIX)) toRemove.push(key)
    }
    for (const key of toRemove) localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** @param {OfficialPyqPendingPaper | OfficialPyqPendingSummary} paper */
export function officialPyqPaperToSummary(paper) {
  return paperToSummary(paper)
}

/** @param {OfficialPyqPendingPaper | OfficialPyqPendingSummary} paper */
function paperToSummary(paper) {
  return {
    id: String(paper.id ?? ''),
    paperId: paper.paperId,
    paperLabel: String(paper.paperLabel || ''),
    status:
      paper.status === 'approved' || paper.status === 'rejected' || paper.status === 'pending_review'
        ? paper.status
        : 'pending_review',
    year: Number(paper.year) || 0,
    exam: paper.exam,
    session: paper.session,
    sourceLabel: paper.sourceLabel,
    sourceSlotId: paper.sourceSlotId,
    questionCount: officialPyqPaperQuestionCount(paper),
    expectedQuestionCount: paper.expectedQuestionCount,
    hasOcr: paper.hasOcr === true || String(paper.preparedText ?? '').trim().length >= 80,
    importedAt: paper.importedAt,
    localQuality: paper.localQuality,
    ...(paper.adminFacts?.confirmedAt || paper.factsConfirmedAt
      ? { factsConfirmedAt: paper.adminFacts?.confirmedAt || paper.factsConfirmedAt }
      : {}),
    ...(paper.aiReplicaPaper === true || paper.replicaParentPaperId ? { aiReplicaPaper: true } : {}),
  }
}

function writeSummaryCache(summaries, updatedAt) {
  memorySummaries = summaries
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(
      OFFICIAL_PYQ_PENDING_LIST_KEY,
      JSON.stringify({ papers: summaries, updatedAt: updatedAt || Date.now() }),
    )
  } catch {
    /* list cache is optional */
  }
}

function readSummaryCache() {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(OFFICIAL_PYQ_PENDING_LIST_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!Array.isArray(data?.papers)) return null
    return data.papers
  } catch {
    return null
  }
}

function rebuildSummariesFromPapers(papers, updatedAt) {
  writeSummaryCache((Array.isArray(papers) ? papers : []).map(paperToSummary), updatedAt)
  return memorySummaries ?? []
}

const STATUS_RANK = { approved: 3, pending_review: 2, rejected: 1 }

/**
 * One row per exam sitting (exam + year + paper/session/shift).
 * @param {Partial<OfficialPyqPendingPaper> & { exam?: string, year?: number }} paper
 */
export function officialPyqSittingKey(paper) {
  if (paper?.aiReplicaPaper === true || String(paper?.replicaParentPaperId || '').trim()) {
    return `replica|${String(paper.id || paper.paperId || '').trim()}`
  }
  const exam = String(paper?.exam || '').trim().toLowerCase()
  const year = Number(paper?.year)
  if (exam === 'jee-main') {
    const date = String(paper?.pyqDate || '').trim()
    const shift = paper?.pyqShift === 1 || paper?.pyqShift === 2 ? String(paper.pyqShift) : ''
    return [exam, year, date, shift].join('|')
  }
  if (exam === 'jee-advanced') {
    const sessionRaw = String(paper?.session || paper?.paperLabel || '').trim()
    const session = /paper\s*2/i.test(sessionRaw) ? 'p2' : 'p1'
    return [exam, year, session].join('|')
  }
  return [exam, year].join('|')
}

/**
 * @param {OfficialPyqPendingPaper} a
 * @param {OfficialPyqPendingPaper} b
 */
function pickPreferredPaper(a, b) {
  const rankA = STATUS_RANK[a.status] ?? 0
  const rankB = STATUS_RANK[b.status] ?? 0
  if (rankA !== rankB) return rankA > rankB ? a : b
  const qa = a.questions?.length ?? 0
  const qb = b.questions?.length ?? 0
  if (qa !== qb) return qa > qb ? a : b
  const timeA = Math.max(a.reviewedAt ?? 0, a.importedAt ?? 0)
  const timeB = Math.max(b.reviewedAt ?? 0, b.importedAt ?? 0)
  return timeA >= timeB ? a : b
}

/**
 * Ensure status defaults and collapse duplicate sittings to one row.
 * @param {OfficialPyqPendingPaper[]} papers
 * @returns {OfficialPyqPendingPaper[]}
 */
export function normalizeOfficialPyqPendingPapers(papers) {
  const list = (Array.isArray(papers) ? papers : []).map((p) => ({
    ...p,
    status:
      p.status === 'approved' || p.status === 'rejected' || p.status === 'pending_review'
        ? p.status
        : 'pending_review',
  }))
  /** @type {Map<string, OfficialPyqPendingPaper>} */
  const byKey = new Map()
  for (const paper of list) {
    const key = officialPyqSittingKey(paper)
    const prev = byKey.get(key)
    byKey.set(key, prev ? pickPreferredPaper(prev, paper) : paper)
  }
  return Array.from(byKey.values()).sort((a, b) => (b.importedAt ?? 0) - (a.importedAt ?? 0))
}

/**
 * @param {Partial<OfficialPyqPendingPaper> & { exam?: string, year?: number }} match
 */
export function findOfficialPyqPendingBySittingKey(match) {
  const key = officialPyqSittingKey(match)
  return loadOfficialPyqPendingPapers().find((p) => officialPyqSittingKey(p) === key) ?? null
}

/**
 * Groups with more than one stored row for the same sitting (before normalize).
 * @returns {Array<{ key: string, papers: OfficialPyqPendingPaper[] }>}
 */
export function listOfficialPyqDuplicateSittingGroups() {
  /** @type {Map<string, OfficialPyqPendingPaper[]>} */
  const groups = new Map()
  for (const paper of loadOfficialPyqPendingPapersRaw()) {
    const key = officialPyqSittingKey(paper)
    const list = groups.get(key) ?? []
    list.push(paper)
    groups.set(key, list)
  }
  return Array.from(groups.entries())
    .filter(([, papers]) => papers.length > 1)
    .map(([key, papers]) => ({ key, papers }))
}

/** @returns {OfficialPyqPendingPaper[]} */
function loadOfficialPyqPendingPapersRaw() {
  if (memoryRoot) return [...memoryRoot.papers]
  return readPersistedRoot().papers
}

/**
 * @returns {{ papers: OfficialPyqPendingPaper[], updatedAt: number }}
 */
function readPersistedRoot() {
  /** @type {string | null} */
  let raw = null
  try {
    if (typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(OFFICIAL_PYQ_PENDING_KEY)
    }
  } catch {
    raw = null
  }
  if (!raw) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        raw = sessionStorage.getItem(OFFICIAL_PYQ_PENDING_BACKUP_KEY)
      }
    } catch {
      raw = null
    }
  }
  if (!raw) return { papers: [], updatedAt: 0 }
  try {
    const data = JSON.parse(raw)
    const papers = Array.isArray(data?.papers) ? data.papers : []
    return { papers, updatedAt: Number(data?.updatedAt) || 0 }
  } catch {
    return { papers: [], updatedAt: 0 }
  }
}

/**
 * @returns {{ papers: OfficialPyqPendingPaper[], updatedAt: number }}
 */
function loadRoot() {
  if (memoryRoot) return memoryRoot
  const persisted = readPersistedRoot()
  const papers = normalizeOfficialPyqPendingPapers(persisted.papers)
  memoryRoot = { papers, updatedAt: persisted.updatedAt || Date.now() }
  rebuildSummariesFromPapers(papers, memoryRoot.updatedAt)
  writeAllLightPapers(papers)
  if (papers.length !== persisted.papers.length) {
    persistRoot(memoryRoot)
  }
  return memoryRoot
}

/**
 * @param {{ papers: OfficialPyqPendingPaper[], updatedAt?: number }} data
 * @returns {{ ok: boolean, error?: string, papers: OfficialPyqPendingPaper[], updatedAt: number }}
 */
function persistRoot(data) {
  const incoming = normalizeOfficialPyqPendingPapers(data.papers ?? [])
  const prior = Array.isArray(memoryRoot?.papers) ? memoryRoot.papers : []
  const byId = new Map(prior.map((p) => [p.id, p]))
  const papers = incoming.map((p) => {
    const prev = byId.get(p.id)
    if (!prev) return p
    const kept = keepOfficialPyqQuestionsIfEmptied(prev, p.questions)
    return kept === p.questions ? p : { ...p, questions: kept }
  })
  const payload = {
    papers,
    updatedAt: data.updatedAt ?? Date.now(),
  }
  memoryRoot = payload
  rebuildSummariesFromPapers(papers, payload.updatedAt)
  const raw = JSON.stringify(payload)
  let saved = false
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OFFICIAL_PYQ_PENDING_KEY, raw)
      saved = true
    }
  } catch (e) {
    console.warn('[officialPyqPending] localStorage save failed', e)
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(OFFICIAL_PYQ_PENDING_BACKUP_KEY, raw)
      saved = true
    }
  } catch {
    /* backup optional */
  }
  writeAllLightPapers(papers)
  if (!saved) {
    return {
      ok: false,
      error: 'Could not save approval queue — browser storage may be full or blocked.',
      ...payload,
    }
  }
  return { ok: true, ...payload }
}

/**
 * @param {{ papers: OfficialPyqPendingPaper[], updatedAt?: number }} data
 */
function saveRoot(data) {
  const result = persistRoot(data)
  if (!result.ok) {
    throw new Error(result.error || 'Could not save official PYQ pending queue.')
  }
  return result
}

/** @returns {OfficialPyqPendingPaper[]} */
export function loadOfficialPyqPendingPapers() {
  return loadRoot().papers
}

/** @param {OfficialPyqPaperStatus | 'all'} [status] */
export function listOfficialPyqPendingPapers(status = 'pending_review') {
  const papers = loadOfficialPyqPendingPapers()
  if (status === 'all') return papers
  return papers.filter((p) => p.status === status)
}

/**
 * Fill the light tab cache once if it is missing (older fat-store saves).
 * Also rebuilds when the list key was wiped to [] while the fat store still has papers
 * (Pending looked empty even though Paper 2 was still stored).
 * Tab clicks must keep using listOfficialPyqPendingSummaries — never this.
 */
export function hydrateOfficialPyqPendingSummariesIfEmpty() {
  if (Array.isArray(memorySummaries) && memorySummaries.length) return memorySummaries
  const cached = readSummaryCache()
  if (cached?.length) {
    memorySummaries = cached
    return memorySummaries
  }
  if (memoryRoot?.papers?.length) {
    return rebuildSummariesFromPapers(memoryRoot.papers, memoryRoot.updatedAt)
  }
  loadRoot()
  return memorySummaries ?? []
}

/**
 * Tab list only — never JSON.parses full OCR/question bodies, never maps fat papers.
 * @param {OfficialPyqPaperStatus | 'all'} [status]
 * @returns {OfficialPyqPendingSummary[]}
 */
export function listOfficialPyqPendingSummaries(status = 'pending_review') {
  if (!memorySummaries) {
    memorySummaries = readSummaryCache()
  }
  // Empty [] must not stick — rebuild from fat store / item keys when needed.
  if (!Array.isArray(memorySummaries) || memorySummaries.length === 0) {
    hydrateOfficialPyqPendingSummariesIfEmpty()
  }
  const list = Array.isArray(memorySummaries) ? memorySummaries : []
  if (status === 'all') return list
  return list.filter((p) => p.status === status)
}

/** One pass over the light cache — used by tab badges. */
export function countOfficialPyqPendingByStatus() {
  const all = listOfficialPyqPendingSummaries('all')
  const out = { pending_review: 0, approved: 0, rejected: 0, all: all.length }
  for (const p of all) {
    if (p.status === 'approved') out.approved += 1
    else if (p.status === 'rejected') out.rejected += 1
    else out.pending_review += 1
  }
  return out
}

/** @param {string} id */
export function getOfficialPyqPendingPaper(id) {
  const needle = String(id ?? '').trim()
  if (!needle) return null
  if (memoryRoot) {
    const found = memoryRoot.papers.find((p) => p.id === needle) ?? null
    if (found) rememberPaper(found)
    return found
  }
  const cached = memoryPaperById?.get(needle)
  if (cached && String(cached.preparedText ?? '').trim()) return cached
  const papers = loadRoot().papers
  return papers.find((p) => p.id === needle) ?? cached ?? null
}

/**
 * Preview/Open path — one paper’s questions, no fat-store JSON.parse when an item key exists.
 * @param {string} id
 */
export function getOfficialPyqPendingPreviewPaper(id) {
  const needle = String(id ?? '').trim()
  if (!needle) return null
  const cached = memoryPaperById?.get(needle)
  if (cached && countFilledOfficialPyqQuestions(cached.questions) >= 8) {
    return paperToLightRecord(cached)
  }
  const light = readLightPaper(needle)
  if (light) {
    if (countFilledOfficialPyqQuestions(light.questions) >= 8) return light
    const hint = officialPyqPaperQuestionCount(light)
    if (hint >= 8 || light.hasOcr === true) {
      const recovered = recoverOfficialPyqQuestionsFromStore(needle)
      if (countFilledOfficialPyqQuestions(recovered) >= 8) {
        const restored = { ...light, questions: recovered, questionCount: recovered.length }
        rememberPaper(restored)
        return paperToLightRecord(restored)
      }
    }
    return light
  }
  if (memoryRoot) {
    const found = memoryRoot.papers.find((p) => p.id === needle) ?? null
    if (found) {
      writeLightPaper(found)
      return paperToLightRecord(found)
    }
    return null
  }
  const full = getOfficialPyqPendingPaper(needle)
  return full ? paperToLightRecord(full) : null
}

/** OCR blob only — idle List-I / figure restore. Never call from a tab click. */
export function getOfficialPyqPendingOcrText(id) {
  const needle = String(id ?? '').trim()
  if (!needle) return ''
  const cached = memoryPaperById?.get(needle)
  const fromCache = String(cached?.preparedText ?? '').trim()
  if (fromCache.length >= 80) return fromCache
  const full = getOfficialPyqPendingPaper(needle)
  return String(full?.preparedText ?? '').trim()
}

/** @param {string} sourceSlotId */
export function findOfficialPyqPendingBySourceSlot(sourceSlotId) {
  const id = String(sourceSlotId || '').trim()
  if (!id) return null
  return loadOfficialPyqPendingPapers().find((p) => p.sourceSlotId === id) ?? null
}

/**
 * @param {Omit<OfficialPyqPendingPaper, 'id' | 'importedAt' | 'status'> & {
 *   id?: string
 *   status?: OfficialPyqPaperStatus
 *   importedAt?: number
 * }} input
 * @returns {OfficialPyqPendingPaper}
 */
export function addOfficialPyqPendingPaper(input) {
  const root = loadRoot()
  const now = Date.now()
  const exam = /** @type {OfficialPyqPendingPaper['exam']} */ (input.exam || 'jee-main')
  const year = Number(input.year)
  if (!Number.isFinite(year) || year < 2000) {
    throw new Error('Year is required (e.g. 2024).')
  }
  const questions = Array.isArray(input.questions) ? input.questions : []
  const uniq = `${now}-${Math.random().toString(36).slice(2, 9)}`
  const session = input.session ? String(input.session) : undefined
  const paperId = String(
    input.paperId ||
      `${exam}-${year}-${String(session || 'paper')
        .toLowerCase()
        .replace(/\s+/g, '-')}`,
  )
  /** @type {OfficialPyqPendingPaper} */
  const draft = {
    id: String(input.id ?? `opyq-${uniq}`),
    exam,
    year,
    session,
    pyqDate: input.pyqDate ? String(input.pyqDate) : undefined,
    pyqShift:
      input.pyqShift === 1 || input.pyqShift === 2
        ? input.pyqShift
        : Number(input.pyqShift) === 1 || Number(input.pyqShift) === 2
          ? Number(input.pyqShift)
          : undefined,
    paperId,
    paperLabel:
      String(input.paperLabel || '').trim() ||
      `${getOfficialPyqExamLabel(exam)} ${year}${session ? ` · ${session}` : ''}`,
    sourceUrl: input.sourceUrl ? String(input.sourceUrl) : undefined,
    sourceLabel: String(input.sourceLabel || 'Official source').trim() || 'Official source',
    sourceSlotId: input.sourceSlotId ? String(input.sourceSlotId) : undefined,
    status: input.status ?? 'pending_review',
    importedAt: input.importedAt ?? now,
    reviewedAt: input.reviewedAt,
    rejectReason: input.rejectReason,
    notes: input.notes,
    preparedText: input.preparedText ? String(input.preparedText) : undefined,
    expectedQuestionCount:
      Number(input.expectedQuestionCount) > 0 ? Number(input.expectedQuestionCount) : undefined,
    questions,
  }

  const existing = findOfficialPyqPendingBySittingKey(draft)
  if (existing) {
    if (existing.status === 'approved') {
      throw new Error(`“${existing.paperLabel}” is already published.`)
    }
    const updated = updateOfficialPyqPendingPaper(existing.id, {
      ...draft,
      id: existing.id,
      importedAt: existing.importedAt,
      status: input.status ?? existing.status ?? 'pending_review',
      questions: questions.length ? questions : existing.questions,
    })
    if (!updated) throw new Error('Could not update existing pending paper.')
    return updated
  }

  root.papers.unshift(draft)
  saveRoot({ papers: root.papers, updatedAt: now })
  return draft
}

/** Next SimilarN number for this published paper id. */
export function nextOfficialPyqReplicaNumber(parentPaperId) {
  const root = loadRoot()
  const parent = String(parentPaperId || '').trim()
  let max = 0
  for (const paper of root.papers || []) {
    if (String(paper?.replicaParentPaperId || '') !== parent) continue
    const match = String(paper.paperId || '').match(/-similar-(\d+)$/i)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return max + 1
}

/**
 * A Hybrid AI replica sits in Pending review beside the published paper.
 * It does not replace that sitting and it is not approved.
 * @param {Partial<OfficialPyqPendingPaper> & { questions?: OfficialPyqPendingQuestion[], replicaParentPaperId?: string, replicaDifficultyOffset?: number }} input
 */
export function addOfficialPyqReplicaPendingPaper(input) {
  const now = Date.now()
  const uniq = `${now}-${Math.random().toString(36).slice(2, 8)}`
  const questions = Array.isArray(input?.questions) ? input.questions : []
  /** @type {OfficialPyqPendingPaper} */
  const paper = {
    id: String(input?.id || `opyq-replica-${uniq}`),
    exam: input.exam,
    year: Number(input.year),
    session: input.session ? String(input.session) : undefined,
    pyqDate: input.pyqDate ? String(input.pyqDate) : undefined,
    pyqShift: input.pyqShift,
    paperId: String(input.paperId || `replica-${uniq}`),
    paperLabel: String(input.paperLabel || 'Similar paper'),
    sourceLabel: String(input.sourceLabel || 'Hybrid AI replica'),
    status: 'pending_review',
    importedAt: now,
    notes: input.notes ? String(input.notes) : undefined,
    questions,
    aiReplicaPaper: true,
    replicaParentPaperId: input.replicaParentPaperId ? String(input.replicaParentPaperId) : undefined,
    replicaDifficultyOffset: Number(input.replicaDifficultyOffset),
    questionCount: questions.length,
  }
  const root = loadRoot()
  root.papers.unshift(paper)
  saveRoot({ papers: root.papers, updatedAt: now })
  return paper
}

/** True when Approve & Publish has locked this paper’s question bodies. */
export function officialPyqQuestionsArePublishedLocked(paper) {
  return String(paper?.status ?? '') === 'approved'
}

/**
 * True when opening the page must not re-parse or heal this paper.
 * Published papers stay locked. A paper an admin sent back for review
 * keeps the published question copy until someone clicks Re-parse.
 */
export function officialPyqAutoRewriteBlocked(paper) {
  if (officialPyqQuestionsArePublishedLocked(paper)) return true
  return paper?.returnedFromPublished === true
}

/**
 * @param {string} id
 * @param {Partial<OfficialPyqPendingPaper> & { allowPublishedQuestionWrite?: boolean, releaseAdminEditIndexes?: number[] }} updates
 */
export function updateOfficialPyqPendingPaper(id, updates) {
  const root = loadRoot()
  const idx = root.papers.findIndex((p) => p.id === id)
  if (idx === -1) return null
  const prev = root.papers[idx]
  const unlocking =
    updates &&
    Object.prototype.hasOwnProperty.call(updates, 'status') &&
    updates.status !== 'approved'
  const wantsQuestions =
    updates && Object.prototype.hasOwnProperty.call(updates, 'questions')
  const publishedLocked =
    officialPyqQuestionsArePublishedLocked(prev) &&
    wantsQuestions &&
    !unlocking &&
    updates.allowPublishedQuestionWrite !== true
  let nextQuestions = publishedLocked
    ? prev.questions
    : wantsQuestions
      ? keepAdminEditedOfficialPyqCards(
          prev.questions,
          keepOfficialPyqQuestionsIfEmptied(prev, updates.questions, {
            allowEmpty: updates.allowEmptyQuestions === true,
          }),
          { release: Array.isArray(updates.releaseAdminEditIndexes) ? updates.releaseAdminEditIndexes : [] },
        )
      : prev.questions
  const {
    allowEmptyQuestions: _allowEmptyQuestions,
    allowPublishedQuestionWrite: _allowPublishedQuestionWrite,
    releaseAdminEditIndexes: _releaseAdminEditIndexes,
    ...safeUpdates
  } = updates || {}
  const adminFacts = Object.prototype.hasOwnProperty.call(safeUpdates, 'adminFacts')
    ? safeUpdates.adminFacts
    : prev.adminFacts
  if (wantsQuestions && !publishedLocked && adminFacts?.confirmedAt) {
    const ocr =
      String(safeUpdates.preparedText ?? '').trim() ||
      String(prev.preparedText ?? '').trim() ||
      String(memoryPaperById?.get(prev.id)?.preparedText ?? '')
    nextQuestions = enforceAdminFactsOnQuestions(nextQuestions, adminFacts, ocr)
  }
  root.papers[idx] = { ...prev, ...safeUpdates, questions: nextQuestions, id: prev.id }
  try {
    saveRoot({ papers: root.papers, updatedAt: Date.now() })
  } catch {
    return null
  }
  const saved = memoryRoot?.papers?.find((paper) => paper.id === prev.id) || root.papers[idx]
  writeLightPaper(saved)
  return saved
}

/** @param {string} id */
export function removeOfficialPyqPendingPaper(id) {
  const root = loadRoot()
  const next = root.papers.filter((p) => p.id !== id)
  if (next.length === root.papers.length) return false
  try {
    saveRoot({ papers: next, updatedAt: Date.now() })
  } catch {
    return false
  }
  forgetPaperRecords([id])
  return true
}

/**
 * Remove every queue row for the same sitting (all duplicates).
 * @param {Partial<OfficialPyqPendingPaper> & { exam?: string, year?: number }} match
 */
export function removeOfficialPyqPendingSitting(match) {
  const key = officialPyqSittingKey(match)
  const root = loadRoot()
  const removedIds = root.papers.filter((p) => officialPyqSittingKey(p) === key).map((p) => p.id)
  const next = root.papers.filter((p) => officialPyqSittingKey(p) !== key)
  const removed = root.papers.length - next.length
  if (!removed) return { ok: false, removed: 0 }
  try {
    saveRoot({ papers: next, updatedAt: Date.now() })
  } catch (e) {
    return {
      ok: false,
      removed: 0,
      error: e instanceof Error ? e.message : 'Could not save after remove.',
    }
  }
  forgetPaperRecords(removedIds)
  return { ok: true, removed }
}

/** Collapse duplicate sittings already in storage. @returns {number} rows removed */
export function dedupeOfficialPyqPendingPapers() {
  const root = loadRoot()
  const before = root.papers.length
  const papers = normalizeOfficialPyqPendingPapers(root.papers)
  if (papers.length === before) return 0
  saveRoot({ papers, updatedAt: Date.now() })
  return before - papers.length
}

export function clearOfficialPyqPendingPapers() {
  memoryRoot = { papers: [], updatedAt: Date.now() }
  memorySummaries = []
  forgetAllPaperRecords()
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(OFFICIAL_PYQ_PENDING_KEY)
      localStorage.removeItem(OFFICIAL_PYQ_PENDING_LIST_KEY)
    }
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(OFFICIAL_PYQ_PENDING_BACKUP_KEY)
  } catch {
    /* ignore */
  }
}

/** Drop in-memory cache and re-read localStorage (after external snapshot restore). */
export function reloadOfficialPyqPendingFromStorage() {
  memoryRoot = null
  memorySummaries = null
  memoryPaperById = new Map()
  return loadRoot()
}

export function countOfficialPyqPendingReview() {
  return countOfficialPyqPendingByStatus().pending_review
}

/**
 * Build a pending paper shell from a curated source slot (questions empty until upload).
 * @param {import('../data/officialPyqSources').OfficialPyqSourceSlot} slot
 * @param {OfficialPyqPendingQuestion[]} [questions]
 */
export function pendingPaperFromSourceSlot(slot, questions = []) {
  return addOfficialPyqPendingPaper({
    exam: slot.exam,
    year: slot.year,
    session: slot.session,
    pyqDate: slot.pyqDate,
    pyqShift: slot.pyqShift,
    paperId: `${slot.exam}-${slot.year}-${slot.id}`,
    paperLabel: slot.paperLabel,
    sourceUrl: slot.sourceUrl,
    sourceLabel: slot.sourceLabel,
    sourceSlotId: slot.id,
    notes: slot.downloadHint,
    questions,
    status: 'pending_review',
  })
}
