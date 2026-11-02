import { loadQuestionBank, saveQuestionBank } from './questionBank.js'
import { resolveQuestionHierarchy } from './curriculumOptions.js'

const PENDING_KEY = 'testvantage-pending-meta-renames'

/**
 * @typedef {{
 *   id: string,
 *   kind: 'hierarchy' | 'subject' | 'exam',
 *   subject: string,
 *   level?: 'section' | 'chapter' | 'topic',
 *   oldName: string,
 *   newName: string,
 *   context?: { section?: string, chapter?: string },
 *   oldSubjectId?: string,
 *   newSubjectId?: string,
 *   oldExamId?: string,
 *   newExamId?: string,
 *   createdAt: number,
 * }} PendingMetaRename
 */

/** @returns {PendingMetaRename[]} */
export function loadPendingRenames() {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** @param {PendingMetaRename[]} list */
function savePendingRenames(list) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(list))
}

/** @param {Omit<PendingMetaRename, 'id' | 'createdAt'>} entry */
export function queuePendingRename(entry) {
  const list = loadPendingRenames()
  const id = `pr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  list.push({ ...entry, id, createdAt: Date.now() })
  savePendingRenames(list)
  return id
}

/** @param {string} id */
export function removePendingRename(id) {
  savePendingRenames(loadPendingRenames().filter((p) => p.id !== id))
}

/**
 * @param {string} subject
 * @param {'section' | 'chapter' | 'topic'} level
 * @param {string} oldName
 * @param {{ section?: string, chapter?: string }} [context]
 */
export function countQuestionsForHierarchyRename(subject, level, oldName, context = {}, questions) {
  const list = Array.isArray(questions) ? questions : loadQuestionBank().questions
  let count = 0
  for (const q of list) {
    if (q.subject !== subject) continue
    const r = resolveQuestionHierarchy(subject, q.section, q.chapter, q.topic)
    if (level === 'section' && r.section === oldName) count++
    else if (level === 'chapter' && r.section === context.section && r.chapter === oldName) count++
    else if (
      level === 'topic' &&
      r.section === context.section &&
      r.chapter === context.chapter &&
      r.topic === oldName
    ) {
      count++
    }
  }
  return count
}

/** @param {string} oldSubjectId @param {string} newSubjectId */
export function countQuestionsForSubjectReassign(oldSubjectId, newSubjectId) {
  if (oldSubjectId === newSubjectId) return 0
  return loadQuestionBank().questions.filter((q) => q.subject === oldSubjectId).length
}

/** @param {string} oldExamId @param {string} newExamId */
export function countQuestionsForExamRename(oldExamId, newExamId) {
  if (oldExamId === newExamId) return 0
  return loadQuestionBank().questions.filter((q) => q.examIds?.includes(oldExamId)).length
}

/**
 * @param {string} subject
 * @param {'section' | 'chapter' | 'topic'} level
 * @param {string} oldName
 * @param {string} newName
 * @param {{ section?: string, chapter?: string }} [context]
 */
export function applyHierarchyRenameToQuestions(subject, level, oldName, newName, context = {}) {
  const bank = loadQuestionBank()
  let count = 0
  bank.questions = bank.questions.map((q) => {
    if (q.subject !== subject) return q
    const r = resolveQuestionHierarchy(subject, q.section, q.chapter, q.topic)
    const next = { ...q, section: r.section || q.section, chapter: r.chapter || q.chapter, topic: r.topic || q.topic }

    if (level === 'section' && r.section === oldName) {
      next.section = newName
      count++
    } else if (level === 'chapter' && r.section === context.section && r.chapter === oldName) {
      next.chapter = newName
      count++
    } else if (
      level === 'topic' &&
      r.section === context.section &&
      r.chapter === context.chapter &&
      r.topic === oldName
    ) {
      next.topic = newName
      count++
    }
    return next
  })
  saveQuestionBank(bank)
  return count
}

/** @param {string} oldSubjectId @param {string} newSubjectId */
export function reassignQuestionsSubject(oldSubjectId, newSubjectId) {
  const bank = loadQuestionBank()
  let count = 0
  bank.questions = bank.questions.map((q) => {
    if (q.subject !== oldSubjectId) return q
    count++
    return { ...q, subject: newSubjectId }
  })
  saveQuestionBank(bank)
  return count
}

/** @param {string} oldExamId @param {string} newExamId */
export function renameExamOnQuestions(oldExamId, newExamId) {
  const bank = loadQuestionBank()
  let count = 0
  bank.questions = bank.questions.map((q) => {
    if (!q.examIds?.includes(oldExamId)) return q
    count++
    const nextIds = q.examIds.map((id) => (id === oldExamId ? newExamId : id))
    return { ...q, examIds: [...new Set(nextIds)] }
  })
  saveQuestionBank(bank)
  return count
}

/** @param {PendingMetaRename} entry @returns {number} */
export function applyPendingRename(entry) {
  if (entry.kind === 'hierarchy' && entry.level) {
    return applyHierarchyRenameToQuestions(
      entry.subject,
      entry.level,
      entry.oldName,
      entry.newName,
      entry.context ?? {},
    )
  }
  if (entry.kind === 'subject' && entry.oldSubjectId && entry.newSubjectId) {
    return reassignQuestionsSubject(entry.oldSubjectId, entry.newSubjectId)
  }
  if (entry.kind === 'exam' && entry.oldExamId && entry.newExamId) {
    return renameExamOnQuestions(entry.oldExamId, entry.newExamId)
  }
  return 0
}

/** @returns {number} total questions updated */
export function applyAllPendingRenames() {
  const list = loadPendingRenames()
  let total = 0
  for (const entry of list) {
    total += applyPendingRename(entry)
  }
  savePendingRenames([])
  return total
}
