/**
 * Admin edits on an Approved Official PYQ paper (by hand or by Hybrid AI fill).
 * Tags, answer, and solution can change. The stem, options, and figures stay.
 * The paper stays Approved; students see nothing until Publish, which also gives
 * the final question ids (see officialPyqPublishFlow.js).
 */

import { ALL_SUBJECTS, LEGACY_SUBJECTS } from '../data/subjects.js'
import { isAdminLoggedIn } from './auth.js'
import { isTemporaryQuestionId } from './classifiedQuestionId.js'
import {
  getOfficialPyqPendingPaper,
  officialPyqCardIsAdminEdited,
  updateOfficialPyqPendingPaper,
} from './officialPyqPendingStore.js'

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
  if (patch?.answerSource) next.answerSource = String(patch.answerSource)
  if (patch?.solutionSource) next.solutionSource = String(patch.solutionSource)
  restoreBody(next, prev && typeof prev === 'object' ? prev : {})
  return next
}

/**
 * Save tags, answer, and solution on one card of an Approved paper.
 * The question id is not changed here; Publish gives the final id.
 * @param {string} paperId
 * @param {number} index
 * @param {object} patch
 * @returns {{ ok: boolean, error?: string, question?: object, status?: string }}
 */
export function applyOfficialPyqPublishedMeta(paperId, index, patch) {
  if (!isAdminLoggedIn()) {
    return { ok: false, error: 'Only an admin can edit tags on an approved paper.' }
  }
  const paper = getOfficialPyqPendingPaper(paperId)
  if (!paper) return { ok: false, error: 'Paper not found.' }
  if (paper.status === 'published') {
    return { ok: false, error: 'This paper is published. Unpublish it to change tags, answers, or solutions.' }
  }
  if (paper.status !== 'approved') {
    return { ok: false, error: 'These tags are saved on approved papers only.' }
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
  if (prev.id !== undefined) tagged.id = prev.id
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
    return { ok: false, error: 'Save refused because the paper would leave Approved.' }
  }
  const stored = saved.questions?.[idx]
  if (String(stored?.text ?? '') !== beforeText) {
    return { ok: false, error: 'Save refused because the question text would change.' }
  }
  return { ok: true, question: stored || tagged, status: saved.status }
}
