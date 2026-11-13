/**
 * Official PYQ: Approve and Publish are two separate steps.
 *   approved  — reviewed. Not shown to students. Tags, answers, and solutions can be filled.
 *   published — every question has its final id and students get the paper.
 *
 * Final id: classified core + exam letter + year, e.g. MAM00001A2024
 * (Mathematics / Algebra / Matrices, JEE Advanced 2024). Similar children add C1, C2…
 *
 * Also holds the one-time move of papers published before the split back to Approved.
 */

import { classifiedIdPrefix, nextClassifiedSequence } from './classifiedQuestionId.js'
import { pyqExamLetter, pyqId, pyqYearDigits } from './questionId.js'
import { loadImportedPyqs, saveImportedPyqs } from './pyqStore.js'
import { isMatrixGridCard } from './matrixGridPyq.js'
import { loadQuestionBank, saveQuestionBank } from './questionBank.js'
import {
  officialPyqPublishSittingKey,
  officialPyqPublishSittingKeyFromPaper,
  writeQuestionBankSnapshot,
} from './officialPyqPublishOnce.js'
import {
  isBookPaper,
  isOtherPaper,
  loadOfficialPyqPendingPapers,
  updateOfficialPyqPendingPapersMeta,
} from './officialPyqPendingStore.js'

/** Question Bank rows of a paper from "Upload any paper". */
export const OTHER_PAPER_BANK_SOURCE = 'any_paper'
/** Question Bank rows of one exercise of an uploaded book / question bank PDF. */
export const BOOK_PAPER_BANK_SOURCE = 'book_pdf'

const CLASSIFIED_ID_RE = /^[A-Z]{3}\d{5}$/

/** Also read in main.jsx before the app starts, so the move runs before any student page. */
export const OFFICIAL_PYQ_PUBLISH_SPLIT_KEY = 'testvantage-official-pyq-publish-split'
export const OFFICIAL_PYQ_PUBLISH_SPLIT_REPORT_KEY = 'testvantage-official-pyq-publish-split-report'

const FINAL_ID_RE = /^[A-Z]{3}\d{5}[AJN]\d{4}(?:C\d+)?$/

/** @param {unknown} id */
export function isOfficialPyqFinalQuestionId(id) {
  return FINAL_ID_RE.test(String(id ?? '').trim())
}

/** @param {any} paper @param {unknown} id */
function finalIdFitsPaper(paper, id) {
  const s = String(id ?? '').trim()
  if (!/^[A-Z]{3}\d{5}[AJN]\d{4}$/.test(s)) return false
  return s.endsWith(pyqExamLetter(paper?.exam) + pyqYearDigits(paper?.year))
}

/** @param {any} q @param {number} index */
export function officialPyqCardSlot(q, index) {
  const n = Number(q?.pyqSlot ?? q?.questionNumber)
  return Number.isFinite(n) && n > 0 ? n : index + 1
}

/** @param {unknown} text */
function stemWords(text) {
  const words = String(text ?? '')
    .toLowerCase()
    .replace(/\\[a-z]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3)
  return new Set(words.slice(0, 40))
}

/** Loose same-question check: a healed copy may differ a little from the stored card. */
export function officialPyqStemsMatch(a, b) {
  const left = stemWords(a)
  const right = stemWords(b)
  if (!left.size || !right.size) return false
  let hit = 0
  for (const w of left) if (right.has(w)) hit += 1
  return hit / Math.min(left.size, right.size) >= 0.6
}

/**
 * Student PYQ / Question Bank rows that came from this paper.
 * @param {any} paper
 * @param {any} row
 */
export function officialPyqRowBelongsToPaper(paper, row) {
  if (!row || !paper) return false
  if (isOtherPaper(paper)) {
    const paperKey = String(paper.paperId || '').trim()
    const source = isBookPaper(paper) ? BOOK_PAPER_BANK_SOURCE : OTHER_PAPER_BANK_SOURCE
    return row.bankSource === source && Boolean(paperKey) && String(row.paperId || '').trim() === paperKey
  }
  const replica = row.aiReplicaPaper === true || row.bankSource === 'ai_replica_paper'
  if (row.officialPyq !== true && row.bankSource !== 'official_pyq' && !replica) return false
  const paperKey = String(paper.paperId || '').trim()
  const rowKey = String(row.paperId || '').trim()
  if (paperKey && rowKey && paperKey === rowKey) return true
  if (replica) return false
  const pendingId = String(paper.id || '').trim()
  if (pendingId && String(row.id || '').includes(pendingId)) return true
  const sitting = officialPyqPublishSittingKeyFromPaper(paper)
  return Boolean(sitting && officialPyqPublishSittingKey(row) === sitting)
}

/**
 * Take this paper out of student PYQ and the Question Bank.
 * @param {any} paper
 * @returns {{ pyqRemoved: number, bankRemoved: number }}
 */
export function removeOfficialPyqStudentRows(paper) {
  const papers = Array.isArray(paper) ? paper : [paper]
  const belongs = (row) => papers.some((p) => officialPyqRowBelongsToPaper(p, row))
  const beforePyq = loadImportedPyqs()
  const keepPyq = beforePyq.filter((row) => !belongs(row))
  const pyqRemoved = beforePyq.length - keepPyq.length
  if (pyqRemoved > 0) saveImportedPyqs(keepPyq)

  const bank = loadQuestionBank()
  const bankBefore = Array.isArray(bank.questions) ? bank.questions : []
  const bankNext = bankBefore.filter((row) => !belongs(row))
  const bankRemoved = bankBefore.length - bankNext.length
  if (bankRemoved > 0) {
    if (bankNext.length) saveQuestionBank({ ...bank, questions: bankNext })
    else writeQuestionBankSnapshot(bank, bankNext)
  }
  return { pyqRemoved, bankRemoved }
}

/** Subject / Unit / Chapter the id letters come from. Blank parts read as General. */
function idBucketFields(card) {
  return {
    ...card,
    subject: String(card?.subject || '').trim() || 'physics',
    section: String(card?.section || card?.unit || '').trim() || 'General',
    chapter: String(card?.chapter || '').trim() || 'General',
  }
}

/**
 * Ids no other question may take, plus peers for the next chapter number.
 * @param {any} paper this paper (its own cards are not counted)
 * @param {{ papers?: any[], pyqRows?: any[], bankRows?: any[] }} [sources]
 */
export function officialPyqFinalIdContext(paper, sources = {}) {
  const papers = sources.papers ?? loadOfficialPyqPendingPapers()
  const pyqRows = sources.pyqRows ?? loadImportedPyqs()
  const bankRows = sources.bankRows ?? (loadQuestionBank().questions || [])
  /** @type {Set<string>} */
  const taken = new Set()
  /** @type {any[]} */
  const peers = []
  for (const row of [...bankRows, ...pyqRows]) {
    const id = String(row?.id ?? '').trim()
    if (!id) continue
    taken.add(id)
    peers.push(row)
  }
  for (const other of papers) {
    if (!other || other.id === paper?.id) continue
    ;(Array.isArray(other.questions) ? other.questions : []).forEach((q) => {
      const id = String(q?.id ?? '').trim()
      if (!isOfficialPyqFinalQuestionId(id)) return
      taken.add(id)
      peers.push(idBucketFields(q))
    })
    for (const entry of Object.values(other.keptPublishedIds || {})) {
      if (entry?.id) taken.add(String(entry.id))
    }
  }
  /** This paper's own ids: a new id must not take one a later card keeps. */
  const reserved = new Set()
  for (const q of Array.isArray(paper?.questions) ? paper.questions : []) {
    if (finalIdFitsPaper(paper, q?.id)) reserved.add(String(q.id).trim())
  }
  for (const entry of Object.values(paper?.keptPublishedIds || {})) {
    if (entry?.id) reserved.add(String(entry.id))
  }
  return { taken, peers, usedKept: new Set(), reserved }
}

/**
 * The paper's remembered ids plus the final ids its cards carry now, per slot,
 * so a later re-parse in Pending does not lose them.
 * @param {any} paper
 */
export function officialPyqKeptIdsWithCards(paper) {
  /** @type {Record<string, { id: string, stem: string }>} */
  const kept = { ...(paper?.keptPublishedIds || {}) }
  ;(Array.isArray(paper?.questions) ? paper.questions : []).forEach((q, i) => {
    if (!finalIdFitsPaper(paper, q?.id)) return
    kept[String(officialPyqCardSlot(q, i))] = {
      id: String(q.id).trim(),
      stem: String(q?.text ?? q?.stem ?? '').slice(0, 240),
    }
  })
  return kept
}

/** @param {any} paper @param {any} card @param {number} index @param {Set<string>} usedKept */
function keptIdForCard(paper, card, index, usedKept) {
  const kept = paper?.keptPublishedIds
  if (!kept || typeof kept !== 'object') return ''
  const text = card?.text ?? card?.stem
  const atSlot = kept[String(officialPyqCardSlot(card, index))]
  if (atSlot?.id && !usedKept.has(atSlot.id) && officialPyqStemsMatch(text, atSlot.stem)) return String(atSlot.id)
  for (const entry of Object.values(kept)) {
    if (entry?.id && !usedKept.has(entry.id) && officialPyqStemsMatch(text, entry.stem)) return String(entry.id)
  }
  return ''
}

/** @param {any} paper @param {any} card @param {{ taken: Set<string>, peers: any[], reserved?: Set<string> }} ctx */
function mintOfficialPyqFinalId(paper, card, ctx) {
  const row = idBucketFields(card)
  const prefix = classifiedIdPrefix(row)
  let seq = nextClassifiedSequence(ctx.peers, row)
  let id = ''
  for (; seq <= 99999; seq += 1) {
    id = pyqId(prefix + String(seq).padStart(5, '0'), paper?.exam, paper?.year)
    if (!ctx.taken.has(id) && !ctx.reserved?.has(id)) break
  }
  return id
}

/**
 * Final id for one official card. Keeps the id it already has (or the one it had
 * when it was published before), so attempts and bookmarks still find it.
 * @param {any} paper
 * @param {any} card
 * @param {number} index
 * @param {{ taken: Set<string>, peers: any[], usedKept: Set<string>, reserved?: Set<string> }} ctx
 */
export function pickOfficialPyqFinalId(paper, card, index, ctx) {
  const current = String(card?.id ?? '').trim()
  let id = ''
  if (finalIdFitsPaper(paper, current) && !ctx.taken.has(current)) id = current
  if (!id) {
    const kept = keptIdForCard(paper, card, index, ctx.usedKept)
    if (kept && finalIdFitsPaper(paper, kept) && !ctx.taken.has(kept)) {
      id = kept
      ctx.usedKept.add(kept)
    }
  }
  if (!id) id = mintOfficialPyqFinalId(paper, card, ctx)
  ctx.taken.add(id)
  ctx.peers.push({ ...idBucketFields(card), id })
  return id
}

/**
 * Final id for a card of an uploaded other paper: a plain Question Bank id (MAQ00012), no exam
 * letter or year, since it is not a previous-year question. A card keeps the id it already has
 * while its Subject / Unit / Chapter letters still fit.
 * @param {any} card
 * @param {{ taken: Set<string>, peers: any[], reserved?: Set<string> }} ctx
 */
export function pickOtherPaperFinalId(card, ctx) {
  const row = idBucketFields(card)
  const prefix = classifiedIdPrefix(row)
  const current = String(card?.id ?? '').trim()
  let id = CLASSIFIED_ID_RE.test(current) && current.startsWith(prefix) && !ctx.taken.has(current) ? current : ''
  for (let seq = nextClassifiedSequence(ctx.peers, row); !id && seq <= 99999; seq += 1) {
    const next = prefix + String(seq).padStart(5, '0')
    if (!ctx.taken.has(next) && !ctx.reserved?.has(next)) id = next
  }
  ctx.taken.add(id)
  ctx.peers.push({ ...row, id })
  return id
}

/**
 * 1-based numbers of the cards with no answer (and no "marks to all"). Students are marked
 * against the answer, so an uploaded other paper is not published while any are left.
 * @param {any} paper
 */
export function otherPaperUnansweredNumbers(paper) {
  const cards = Array.isArray(paper?.questions) ? paper.questions : []
  return cards
    .map((q, i) => (String(q?.text ?? '').trim() && !hasAnswer(q) && q?.bonusMarksToAll !== true && q?.zeroMarksToAll !== true ? i + 1 : 0))
    .filter(Boolean)
}

/** @param {any} q */
function hasAnswer(q) {
  if (isMatrixGridCard(q)) return Boolean(q.matrixAnswerKey && Object.keys(q.matrixAnswerKey).length)
  if (Array.isArray(q?.correctIndices) && q.correctIndices.length) return true
  return [q?.correctIndex, q?.correctInteger, q?.correctNumerical].some((v) => v != null && v !== '')
}

/**
 * What is still blank before Publish. Publish does not need these; it only reports them.
 * @param {any} paper
 */
export function officialPyqPublishGaps(paper) {
  const cards = Array.isArray(paper?.questions) ? paper.questions : []
  let noChapter = 0
  let noAnswer = 0
  let noSolution = 0
  for (const q of cards) {
    if (!String(q?.text ?? q?.stem ?? '').trim()) continue
    const chapter = String(q?.chapter || '').trim()
    if (!chapter || /^general$/i.test(chapter)) noChapter += 1
    if (!hasAnswer(q)) noAnswer += 1
    if (!String(q?.solution || '').trim()) noSolution += 1
  }
  return { total: cards.length, noChapter, noAnswer, noSolution }
}

/**
 * Papers published before Approve and Publish were split become Approved:
 * their student PYQ and Question Bank copies are removed, and the ids those
 * copies had are remembered per slot so the next Publish gives them back.
 * Question cards are not changed. Safe to run again.
 */
export function migrateOfficialPyqPublishedToApproved() {
  const papers = loadOfficialPyqPendingPapers().filter((p) => p?.status === 'approved')
  if (!papers.length) return { papers: 0, pyqRemoved: 0, bankRemoved: 0, keptIds: 0 }
  const pyqRows = loadImportedPyqs()
  const bankRows = loadQuestionBank().questions || []

  /** @type {Map<string, Array<{ paperId: string, slot: number, stem: string, fromBank: boolean }>>} */
  const owners = new Map()
  for (const paper of papers) {
    const cards = Array.isArray(paper.questions) ? paper.questions : []
    const mine = [
      ...pyqRows.filter((row) => officialPyqRowBelongsToPaper(paper, row)).map((row) => ({ row, fromBank: false })),
      ...bankRows.filter((row) => officialPyqRowBelongsToPaper(paper, row)).map((row) => ({ row, fromBank: true })),
    ]
    for (const { row, fromBank } of mine) {
      const id = String(row?.id ?? '').trim()
      if (!finalIdFitsPaper(paper, id)) continue
      const slot = Number(row.pyqSlot)
      let at = cards.findIndex((q, i) => officialPyqCardSlot(q, i) === slot)
      if (at < 0 || !officialPyqStemsMatch(cards[at]?.text ?? cards[at]?.stem, row.text)) {
        at = cards.findIndex((q) => officialPyqStemsMatch(q?.text ?? q?.stem, row.text))
      }
      if (at < 0) continue
      const card = cards[at]
      const list = owners.get(id) || []
      list.push({
        paperId: paper.id,
        slot: officialPyqCardSlot(card, at),
        stem: String(card?.text ?? card?.stem ?? '').slice(0, 240),
        fromBank,
      })
      owners.set(id, list)
    }
  }

  /** @type {Record<string, Record<string, { id: string, stem: string }>>} */
  const kept = {}
  for (const [id, list] of owners) {
    const unique = [...new Map(list.map((o) => [`${o.paperId}|${o.slot}`, o])).values()]
    // An id that older publishes gave to several questions goes to the one the bank kept.
    const banked = unique.filter((o) => list.some((x) => x.fromBank && x.paperId === o.paperId && x.slot === o.slot))
    const owner = unique.length === 1 ? unique[0] : banked.length === 1 ? banked[0] : unique[0]
    const map = (kept[owner.paperId] ||= {})
    if (!map[String(owner.slot)]) map[String(owner.slot)] = { id, stem: owner.stem }
  }

  const { pyqRemoved, bankRemoved } = removeOfficialPyqStudentRows(papers)
  const now = Date.now()
  /** @type {Record<string, object>} */
  const patches = {}
  let keptIds = 0
  for (const paper of papers) {
    const mine = kept[paper.id] || {}
    keptIds += Object.keys(mine).length
    if (!Object.keys(mine).length && paper.approvedFromPublishedAt) continue
    patches[paper.id] = {
      keptPublishedIds: { ...mine, ...(paper.keptPublishedIds || {}) },
      approvedFromPublishedAt: paper.approvedFromPublishedAt || now,
    }
  }
  updateOfficialPyqPendingPapersMeta(patches)
  return { papers: papers.length, pyqRemoved, bankRemoved, keptIds }
}

/** Runs the move once per browser. A failed run is tried again on the next start. */
export function runOfficialPyqPublishSplitMigrationOnce() {
  if (typeof localStorage === 'undefined') return { skipped: true }
  if (localStorage.getItem(OFFICIAL_PYQ_PUBLISH_SPLIT_KEY) === '1') return { skipped: true }
  const result = migrateOfficialPyqPublishedToApproved()
  localStorage.setItem(OFFICIAL_PYQ_PUBLISH_SPLIT_KEY, '1')
  try {
    localStorage.setItem(OFFICIAL_PYQ_PUBLISH_SPLIT_REPORT_KEY, JSON.stringify({ ...result, at: Date.now() }))
  } catch {
    /* the report is optional */
  }
  return result
}
