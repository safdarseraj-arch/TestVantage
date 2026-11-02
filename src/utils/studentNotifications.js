/**
 * In-app alerts when a teacher assigns a test + email draft for parents/students.
 */

import { getClassById } from './classesStore.js'
import { getUserById } from './users.js'
import { examPath } from './examNavigation.js'

const STORAGE_KEY = 'testvantage-student-notifications'

/**
 * @typedef {{
 *   id: string
 *   userId: string
 *   type: 'test_assigned'
 *   testId: string
 *   testTitle: string
 *   classId: string
 *   className: string
 *   assignmentId: string
 *   availableFrom?: number | null
 *   dueAt?: number | null
 *   read: boolean
 *   createdAt: number
 * }} StudentNotification
 */

/** @returns {StudentNotification[]} */
function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data.notifications) ? data.notifications : []
  } catch {
    return []
  }
}

/** @param {StudentNotification[]} list */
function saveAll(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ notifications: list }))
}

/** @param {string} userId */
export function getNotificationsForUser(userId) {
  if (!userId) return []
  return loadAll()
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** @param {string} userId */
export function getUnreadCountForUser(userId) {
  return getNotificationsForUser(userId).filter((n) => !n.read).length
}

/** @param {string} id */
export function markNotificationRead(id) {
  const list = loadAll()
  const idx = list.findIndex((n) => n.id === id)
  if (idx < 0) return
  list[idx] = { ...list[idx], read: true }
  saveAll(list)
}

/** @param {string} userId */
export function markAllNotificationsRead(userId) {
  const list = loadAll().map((n) => (n.userId === userId ? { ...n, read: true } : n))
  saveAll(list)
}

/**
 * @param {{
 *   assignment: { id: string, testId: string, availableFrom?: number | null, dueAt?: number | null, notes?: string }
 *   test: { id: string, title: string, durationMinutes?: number, totalQuestions?: number }
 *   classId: string
 * }} payload
 */
export function notifyStudentsOnAssignment({ assignment, test, classId }) {
  const schoolClass = getClassById(classId)
  if (!schoolClass?.studentIds?.length) {
    return { studentCount: 0, emails: [], notifications: 0 }
  }

  const list = loadAll()
  const now = Date.now()
  let added = 0
  const emails = []

  for (const studentId of schoolClass.studentIds) {
    const student = getUserById(studentId)
    if (!student) continue
    emails.push(student.email)
    list.push({
      id: `notif-${now}-${studentId}-${assignment.id}`,
      userId: studentId,
      type: 'test_assigned',
      testId: test.id,
      testTitle: test.title,
      classId: schoolClass.id,
      className: schoolClass.name,
      assignmentId: assignment.id,
      availableFrom: assignment.availableFrom ?? null,
      dueAt: assignment.dueAt ?? null,
      read: false,
      createdAt: now,
    })
    added += 1
  }

  saveAll(list)
  return { studentCount: added, emails, notifications: added }
}

/**
 * @param {{
 *   test: { id: string, title: string, durationMinutes?: number, totalQuestions?: number }
 *   schoolClass: { name: string }
 *   assignment: { availableFrom?: number | null, dueAt?: number | null, notes?: string }
 *   studentEmails: string[]
 * }} payload
 */
export function buildAssignmentEmailDraft({ test, schoolClass, assignment, studentEmails }) {
  const url = examPath(test.id)
  const lines = [
    'Dear students,',
    '',
    `A new test has been assigned to class "${schoolClass.name}":`,
    '',
    `  Test: ${test.title}`,
    `  Questions: ${test.totalQuestions ?? '—'}`,
    `  Duration: ${test.durationMinutes ?? '—'} minutes`,
  ]
  if (assignment.availableFrom) {
    lines.push(`  Available from: ${new Date(assignment.availableFrom).toLocaleString()}`)
  }
  if (assignment.dueAt) {
    lines.push(`  Due by: ${new Date(assignment.dueAt).toLocaleString()}`)
  }
  if (assignment.notes) {
    lines.push('', `Note: ${assignment.notes}`)
  }
  lines.push(
    '',
    'Open the test here (use Cursor browser at 127.0.0.1):',
    url,
    '',
    'Sign in with your student ID, then go to Mock Tests → Assigned to me.',
    '',
    '— TestVantages',
  )
  const body = lines.join('\n')
  const subject = `New test assigned: ${test.title}`
  const to = studentEmails.filter(Boolean).join(',')
  const mailto = to
    ? `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : ''

  return { subject, body, mailto, to }
}
