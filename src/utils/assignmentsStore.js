import { getClassById } from './classesStore.js'
import { getTestById } from '../data/tests.js'
import { validatePaperForPublish, isTestPublished } from './paperPublish.js'
import { notifyStudentsOnAssignment, buildAssignmentEmailDraft } from './studentNotifications.js'
import { getBatchById, getBatchesForStudent } from './schoolBatchesStore.js'

const STORAGE_KEY = 'testvantage-assignments'

/**
 * @typedef {{
 *   id: string
 *   testId: string
 *   classId?: string | null
 *   batchId?: string | null
 *   assignedBy: string
 *   assignedAt: number
 *   availableFrom?: number | null
 *   dueAt?: number | null
 *   active: boolean
 *   notes?: string
 * }} TestAssignment
 */

/** @returns {TestAssignment[]} */
export function loadAssignments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data.assignments) ? data.assignments.map(normalizeAssignment) : []
  } catch {
    return []
  }
}

/** @param {object} row @returns {TestAssignment} */
function normalizeAssignment(row) {
  return {
    ...row,
    classId: row.classId || null,
    batchId: row.batchId || null,
  }
}

/** @param {TestAssignment[]} assignments */
function saveAssignments(assignments) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ assignments }))
  import('./orgServerSync.js')
    .then((m) => m.notifyOrgChanged())
    .catch(() => {})
}

/**
 * @param {object | null | undefined} test
 * @returns {{ ok: true, test: object } | { ok: false, error: string }}
 */
function assertAssignableTest(testId) {
  if (!testId) return { ok: false, error: 'Select a test.' }
  if (!getTestById(testId)) return { ok: false, error: 'Test not found.' }
  const test = getTestById(testId)
  if (test?.id?.startsWith('custom-') && !isTestPublished(test)) {
    return {
      ok: false,
      error: 'Publish this paper first (Edit Test → Publish, or Create Test → Publish paper).',
    }
  }
  const pub = validatePaperForPublish(test?.questions ?? [], {
    slots: test?.paperBlueprint ?? [],
    strictKeys: true,
  })
  if (!pub.ok) {
    const first = pub.problems[0]
    return {
      ok: false,
      error: `Paper not ready to assign: ${first?.index ? `Q${first.index} — ` : ''}${first?.issues[0]?.message ?? 'fix in Question Bank.'}`,
    }
  }
  return { ok: true, test }
}

/**
 * @param {{
 *   testId: string
 *   classId: string
 *   assignedBy: string
 *   availableFrom?: number | null
 *   dueAt?: number | null
 *   notes?: string
 * }} data
 */
export function assignTestToClass({ testId, classId, assignedBy, availableFrom, dueAt, notes }) {
  if (!classId) return { ok: false, error: 'Select a class.' }
  if (!getClassById(classId)) return { ok: false, error: 'Class not found.' }

  const checked = assertAssignableTest(testId)
  if (!checked.ok) return checked
  const test = checked.test

  const assignments = loadAssignments()
  const duplicate = assignments.find(
    (a) => a.testId === testId && a.classId === classId && !a.batchId && a.active,
  )
  if (duplicate) {
    return { ok: false, error: 'This test is already assigned to this class.' }
  }

  const assignment = {
    id: `assign-${Date.now()}`,
    testId,
    classId,
    batchId: null,
    assignedBy,
    assignedAt: Date.now(),
    availableFrom: availableFrom ?? null,
    dueAt: dueAt ?? null,
    active: true,
    notes: notes?.trim() || undefined,
  }
  assignments.push(assignment)
  saveAssignments(assignments)

  const schoolClass = getClassById(classId)
  const notify = notifyStudentsOnAssignment({ assignment, test, classId })
  const emailDraft =
    schoolClass && test
      ? buildAssignmentEmailDraft({
          test,
          schoolClass,
          assignment,
          studentEmails: notify.emails,
        })
      : null

  return { ok: true, assignment, notify, emailDraft }
}

/**
 * Assign a published test to a competitive / remedial batch.
 * @param {{
 *   testId: string
 *   batchId: string
 *   assignedBy: string
 *   availableFrom?: number | null
 *   dueAt?: number | null
 *   notes?: string
 * }} data
 */
export function assignTestToBatch({ testId, batchId, assignedBy, availableFrom, dueAt, notes }) {
  if (!batchId) return { ok: false, error: 'Select a batch.' }
  const batch = getBatchById(batchId)
  if (!batch) return { ok: false, error: 'Batch not found.' }

  const checked = assertAssignableTest(testId)
  if (!checked.ok) return checked
  const test = checked.test

  const assignments = loadAssignments()
  const duplicate = assignments.find(
    (a) => a.testId === testId && a.batchId === batchId && a.active,
  )
  if (duplicate) {
    return { ok: false, error: 'This test is already assigned to this batch.' }
  }

  const assignment = {
    id: `assign-${Date.now()}`,
    testId,
    classId: null,
    batchId,
    assignedBy,
    assignedAt: Date.now(),
    availableFrom: availableFrom ?? null,
    dueAt: dueAt ?? null,
    active: true,
    notes: notes?.trim() || undefined,
  }
  assignments.push(assignment)
  saveAssignments(assignments)

  const notify = notifyStudentsOnAssignment({
    assignment,
    test,
    batchId,
    targetName: batch.name,
    studentIds: batch.studentIds || [],
  })
  const emailDraft =
    test
      ? buildAssignmentEmailDraft({
          test,
          schoolClass: { name: batch.name },
          assignment,
          studentEmails: notify.emails,
        })
      : null

  return { ok: true, assignment, notify, emailDraft }
}

/**
 * @param {string} id
 * @param {{ availableFrom?: number | null, dueAt?: number | null, active?: boolean, notes?: string }} updates
 */
export function updateAssignment(id, updates) {
  const assignments = loadAssignments()
  const idx = assignments.findIndex((a) => a.id === id)
  if (idx < 0) return { ok: false, error: 'Assignment not found.' }

  const row = { ...assignments[idx], ...updates }
  if (updates.notes != null) row.notes = updates.notes.trim() || undefined
  assignments[idx] = row
  saveAssignments(assignments)
  return { ok: true, assignment: row }
}

/** @param {string} id */
export function removeAssignment(id) {
  const assignments = loadAssignments()
  const next = assignments.filter((a) => a.id !== id)
  if (next.length === assignments.length) return { ok: false, error: 'Assignment not found.' }
  saveAssignments(next)
  return { ok: true }
}

/** @param {string} classId */
export function getAssignmentsForClass(classId) {
  return loadAssignments().filter((a) => a.classId === classId && !a.batchId && a.active)
}

/** @param {string} batchId */
export function getAssignmentsForBatch(batchId) {
  return loadAssignments().filter((a) => a.batchId === batchId && a.active)
}

/**
 * Active assignments visible now for a class.
 * @param {string} classId
 */
export function getActiveAssignmentsForClass(classId) {
  const now = Date.now()
  return getAssignmentsForClass(classId).filter((a) => {
    if (a.availableFrom && a.availableFrom > now) return false
    if (a.dueAt && a.dueAt < now) return false
    return true
  })
}

/**
 * Active assignments visible now for a batch.
 * @param {string} batchId
 */
export function getActiveAssignmentsForBatch(batchId) {
  const now = Date.now()
  return getAssignmentsForBatch(batchId).filter((a) => {
    if (a.availableFrom && a.availableFrom > now) return false
    if (a.dueAt && a.dueAt < now) return false
    return true
  })
}

/**
 * Test IDs assigned to a student via their classes.
 * @param {string[]} classIds
 */
export function getAssignedTestIdsForClasses(classIds) {
  if (!classIds?.length) return []
  const ids = new Set()
  for (const classId of classIds) {
    for (const a of getActiveAssignmentsForClass(classId)) {
      ids.add(a.testId)
    }
  }
  return [...ids]
}

/**
 * Test IDs from class assignments + competitive batch assignments for one student.
 * @param {string} studentId
 * @param {string[]} [classIds]
 */
export function getAssignedTestIdsForStudent(studentId, classIds = []) {
  const ids = new Set(getAssignedTestIdsForClasses(classIds))
  if (!studentId) return [...ids]
  for (const batch of getBatchesForStudent(studentId)) {
    for (const a of getActiveAssignmentsForBatch(batch.id)) {
      ids.add(a.testId)
    }
  }
  return [...ids]
}

/**
 * All assignments for classes a teacher manages (plus batches they teach).
 * @param {string[]} classIds
 */
export function getAssignmentsForTeacherClasses(classIds) {
  if (!classIds?.length) return []
  return loadAssignments().filter((a) => a.classId && classIds.includes(a.classId))
}

/** @param {TestAssignment} assignment */
export function assignmentStatusLabel(assignment) {
  const now = Date.now()
  if (!assignment.active) return 'Inactive'
  if (assignment.availableFrom && assignment.availableFrom > now) return 'Scheduled'
  if (assignment.dueAt && assignment.dueAt < now) return 'Past due'
  return 'Active'
}

/** @param {TestAssignment} assignment */
export function assignmentTargetLabel(assignment) {
  if (assignment.batchId) {
    const batch = getBatchById(assignment.batchId)
    return batch ? `Batch: ${batch.name}` : 'Batch'
  }
  if (assignment.classId) {
    const cls = getClassById(assignment.classId)
    return cls ? `Class: ${cls.name}` : 'Class'
  }
  return 'Target'
}
