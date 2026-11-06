/**
 * Admin edits on an already published Official PYQ paper.
 * Tags, answer, and solution can change. The stem, options, and figures stay.
 * The paper stays approved. This does not publish again.
 *
 * Question ids reuse assignOfficialPyqSaveId: classified core + exam letter + year
 * (Mathematics / Algebra / Matrices -> MAM00001A2024). A stable id is kept.
 */

import { ALL_SUBJECTS, LEGACY_SUBJECTS } from '../data/subjects.js'
import { isAdminLoggedIn } from './auth.js'
import { assignClassifiedQuestionId, isTemporaryQuestionId } from './classifiedQuestionId.js'
import { pyqId, stripFounderIdSuffixes } from './questionId.js'
import {
  officialPyqPublishSittingKey,
  officialPyqPublishSittingKeyFromPaper,
} from './officialPyqPublishOnce.js'
import {
  getOfficialPyqPendingPaper,
  officialPyqCardIsAdminEdited,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'
import { loadQuestionBank, saveQuestionBank } from './questionBank.js'
import { loadImportedPyqs, saveImportedPyqs } from './pyqStore.js'

const BODY_KEYS = [
  'text',
  'stem',
  'options',
  'questionImage',
  'optionImages',
  'images',
  'figure',
  'figures',
  'passageText',
  'passageGroup',
  'passageId',
  'passageRole',
  'stemImage',
  'solutionImage',
  'imageUrl',
  'pyqSlot',
  'questionNumber',
  'bankStatus',
  'officialPyq',
  'bankSource',
  'sub_bank_type',
  'imported',
  'matrixRows',
  'matrixCols',
  'matrixAnswerKey',
  'matrixColLabels',
  'matrixColCount',
  'matrixResponseMode',
]

/** @param {unknown} id */
export function hasStableOfficialPyqQuestionId(id) {
  const s = String(id ?? '').trim()
  if (!s || isTemporaryQuestionId(s)) return false
  return true
}

/** @param {unknown} value */
export function normalizeBankSubjectId(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const key = raw.toLowerCase()
  const known = [...ALL_SUBJECTS, ...LEGACY_SUBJECTS].find(
    (s) => s.id === raw || s.id === key || s.label.toLowerCase() === key,
  )
  return known ? known.id : raw
}

/** @param {object} question @param {number} fallbackIndex */
function slotNumber(question, fallbackIndex) {
  const n = Number(question?.pyqSlot ?? question?.questionNumber)
  if (Number.isFinite(n) && n > 0) return n
  if (fallbackIndex >= 0) return fallbackIndex + 1
  return 0
}

/** @param {object} paper @param {object} row */
function samePublishedPaper(paper, row) {
  if (!paper || !row) return false
  const paperId = String(paper.paperId || '').trim()
  const rowPaper = String(row.paperId || '').trim()
  if (paperId && rowPaper && paperId === rowPaper) return true
  const sitting = officialPyqPublishSittingKeyFromPaper(paper)
  const rowSitting = officialPyqPublishSittingKey(row)
  return Boolean(sitting && rowSitting && sitting === rowSitting)
}

/** @param {object[]} rows @param {object} paper @param {object} question @param {number} index */
function findPublishedCopy(rows, paper, question, index) {
  const list = Array.isArray(rows) ? rows : []
  const qid = String(question?.id ?? '').trim()
  if (qid) {
    const byId = list.find((row) => String(row?.id ?? '') === qid)
    if (byId) return byId
  }
  const slot = slotNumber(question, index)
  if (!slot) return null
  const matches = list.filter((row) => samePublishedPaper(paper, row) && slotNumber(row, -1) === slot)
  return matches.length === 1 ? matches[0] : null
}

/** @param {object} next @param {object} prev */
function restoreBody(next, prev) {
  for (const key of BODY_KEYS) {
    if (prev[key] === undefined) delete next[key]
    else next[key] = prev[key]
  }
}

/** @param {object} next @param {object} patch */
function applyAnswer(next, patch) {
  const index = patch.correctIndex
  if (index == null || index === '') delete next.correctIndex
  else next.correctIndex = Number(index)

  const indices = Array.isArray(patch.correctIndices)
    ? patch.correctIndices.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : []
  if (indices.length) next.correctIndices = indices
  else delete next.correctIndices

  const integer = patch.correctInteger
  if (integer == null || integer === '') delete next.correctInteger
  else next.correctInteger = Number(integer)

  const numerical = patch.correctNumerical
  if (numerical == null || numerical === '') delete next.correctNumerical
  else next.correctNumerical = Number(numerical)

  const solution = String(patch.solution ?? '')
  if (solution.trim()) next.solution = solution
  else delete next.solution
}

/**
 * Copy tag + answer fields onto a row. Stem, options, and figures stay on prev.
 * @param {object} prev
 * @param {object} patch
 */
export function overlayOfficialPyqPublishedMeta(prev, patch) {
  const next = { ...(prev && typeof prev === 'object' ? prev : {}) }
  const subject = normalizeBankSubjectId(patch?.subject)
  if (subject) next.subject = subject
  else delete next.subject

  const section = String(patch?.section ?? patch?.unit ?? '').trim()
  if (section) {
    next.section = section
    next.unit = section
  } else {
    delete next.section
    delete next.unit
  }

  const chapter = String(patch?.chapter ?? '').trim()
  if (chapter) next.chapter = chapter
  else delete next.chapter

  const topic = String(patch?.topic ?? '').trim()
  if (topic) next.topic = topic
  else delete next.topic

  const questionType = String(patch?.questionType ?? '').trim()
  if (questionType) next.questionType = questionType
  else delete next.questionType

  next.examIds = Array.isArray(patch?.examIds) ? patch.examIds.map(String).filter(Boolean) : []

  const level = Number(patch?.toughnessLevel)
  if (Number.isFinite(level) && level >= 1 && level <= 10) next.toughnessLevel = level
  else delete next.toughnessLevel

  const source = String(patch?.source ?? '').trim()
  if (source) next.source = source
  else delete next.source

  applyAnswer(next, patch || {})
  restoreBody(next, prev && typeof prev === 'object' ? prev : {})
  return next
}

/**
 * @param {object} prev
 * @param {object} tagged
 * @param {object} paper
 * @param {object[]} peers
 * @param {object | null} bankHit
 * @param {object | null} pyqHit
 */
/**
 * Same rule as assignOfficialPyqSaveId: classified core, then exam letter + year.
 * Called only when Subject, Unit, and Chapter are already filled, so it does not
 * substitute the word General.
 * @param {object} row
 * @param {object} paper
 * @param {object[]} peers
 */
function mintOfficialPyqQuestionId(row, paper, peers) {
  const assigned = assignClassifiedQuestionId(row, peers, {
    excludeIds: [String(row?.id ?? '')],
  })
  const core = stripFounderIdSuffixes(assigned.id)
  return pyqId(core, paper?.exam || row?.examPatternId, paper?.year ?? row?.pyqYear)
}

function resolveQuestionId(prev, tagged, paper, peers, bankHit, pyqHit) {
  if (hasStableOfficialPyqQuestionId(prev?.id)) return String(prev.id).trim()
  if (bankHit && hasStableOfficialPyqQuestionId(bankHit.id)) return String(bankHit.id).trim()
  if (pyqHit && hasStableOfficialPyqQuestionId(pyqHit.id)) return String(pyqHit.id).trim()
  const subject = String(tagged?.subject ?? '').trim()
  const section = String(tagged?.section || tagged?.unit || '').trim()
  const chapter = String(tagged?.chapter ?? '').trim()
  if (!subject || !section || !chapter) return String(prev?.id ?? '').trim()
  return mintOfficialPyqQuestionId(
    { ...tagged, id: prev?.id, subject, section, chapter, unit: section },
    paper,
    peers,
  )
}

/** @param {object[]} list @param {object} paper @param {object} question @param {number} index @param {object} patch @param {string} chosenId */
function replacePublishedCopy(list, paper, question, index, patch, chosenId) {
  const rows = Array.isArray(list) ? list : []
  const hit = findPublishedCopy(rows, paper, question, index)
  if (!hit) return null
  const idx = rows.indexOf(hit)
  if (idx < 0) return null
  const keepId = hasStableOfficialPyqQuestionId(hit.id) ? String(hit.id) : chosenId || String(hit.id ?? '')
  const next = overlayOfficialPyqPublishedMeta(hit, patch)
  next.id = keepId || hit.id
  rows[idx] = next
  return rows
}

/**
 * @param {string} paperId
 * @param {number} index
 * @param {object} patch
 * @returns {{ ok: boolean, error?: string, question?: object, status?: string, bankNote?: string }}
 */
export function applyOfficialPyqPublishedMeta(paperId, index, patch) {
  if (!isAdminLoggedIn()) {
    return { ok: false, error: 'Only an admin can edit tags on a published paper.' }
  }
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  if (paper.status !== 'approved') {
    return { ok: false, error: 'These tags are saved on published papers only.' }
  }
  const questions = Array.isArray(paper.questions) ? paper.questions.map((q) => ({ ...q })) : []
  let idx = Number(index)
  const expectId = String(patch?.questionId ?? '').trim()
  if (!Number.isInteger(idx) || idx < 0 || idx >= questions.length) idx = -1
  if (expectId) {
    const found = questions.findIndex((q) => String(q?.id ?? '') === expectId)
    if (found >= 0) idx = found
  }
  const prev = questions[idx]
  if (!prev) return { ok: false, error: 'Question not found.' }
  if (patch?.expectText != null && String(prev.text ?? prev.stem ?? '') !== String(patch.expectText)) {
    return { ok: false, error: 'This question changed. Reopen the preview and try again.' }
  }

  const tagged = overlayOfficialPyqPublishedMeta(prev, patch)
  const bank = loadQuestionBank()
  const bankQuestions = Array.isArray(bank.questions) ? bank.questions : []
  const pyqQuestions = loadImportedPyqs()
  const bankHit = findPublishedCopy(bankQuestions, paper, prev, idx)
  const pyqHit = findPublishedCopy(pyqQuestions, paper, prev, idx)
  const peers = [...bankQuestions]
  for (const row of questions) {
    if (row && row !== prev && hasStableOfficialPyqQuestionId(row.id)) peers.push(row)
  }
  const id = resolveQuestionId(prev, tagged, paper, peers, bankHit, pyqHit)
  if (id) tagged.id = id
  else if (prev.id) tagged.id = prev.id
  restoreBody(tagged, prev)
  // keepAdminEditedOfficialPyqCards puts back an edited card's old answer unless this save is newer.
  if (officialPyqCardIsAdminEdited(prev)) {
    tagged.adminEditedAt = Math.max(Date.now(), (Number(prev.adminEditedAt) || 0) + 1)
  }

  const beforeText = String(prev.text ?? '')
  const beforeOptions = JSON.stringify(prev.options ?? [])
  if (String(tagged.text ?? '') !== beforeText || JSON.stringify(tagged.options ?? []) !== beforeOptions) {
    return { ok: false, error: 'Save refused because the question text would change.' }
  }

  questions[idx] = tagged
  const saved = updateOfficialPyqPendingPaper(paper.id, {
    questions,
    allowPublishedQuestionWrite: true,
  })
  if (!saved) return { ok: false, error: 'Could not save.' }
  if (saved.status !== 'approved') {
    return { ok: false, error: 'Save refused because the paper would leave Published.' }
  }
  const stored = saved.questions?.[idx]
  if (String(stored?.text ?? '') !== beforeText) {
    return { ok: false, error: 'Save refused because the question text would change.' }
  }

  let bankNote = ''
  try {
    const nextBank = replacePublishedCopy(bankQuestions.slice(), paper, prev, idx, patch, tagged.id)
    if (nextBank && nextBank.length === bankQuestions.length) {
      saveQuestionBank({ ...bank, questions: nextBank })
    }
    const nextPyq = replacePublishedCopy(pyqQuestions.slice(), paper, prev, idx, patch, tagged.id)
    if (nextPyq && nextPyq.length === pyqQuestions.length) saveImportedPyqs(nextPyq, false)
  } catch (err) {
    bankNote = err instanceof Error ? err.message : 'Published bank copy was not updated.'
  }

  return { ok: true, question: stored || tagged, status: saved.status, bankNote }
}
