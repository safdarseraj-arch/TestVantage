/**
 * Exam access control — assign gate + publish gate.
 */

import { isCustomTestPaper, isTestPublished } from './paperPublish.js'
import { isDemoStudentIdentity, STAFF_WORKING_TEST_ID } from './demoStudentAccess.js'

/**
 * @param {string} testId
 * @param {import('../data/tests').Test | undefined} test
 * @param {{
 *   session?: { role?: string, userId?: string } | null
 *   canManagePapers?: boolean
 *   studentClassIds?: string[]
 *   assignedTestIds?: string[]
 * }} ctx
 */
export function getExamAccess(testId, test, ctx = {}) {
  const { canManagePapers = false, studentClassIds = [], assignedTestIds = [] } = ctx

  if (!test) {
    return { allowed: false, reason: 'not_found', message: 'This paper was not found.' }
  }

  const id = testId ?? test.id ?? ''

  if (
    id.startsWith('practice-') ||
    id.startsWith('speed-') ||
    id.startsWith('cdf-') ||
    id.startsWith('smock-') ||
    id.startsWith('pyq-') ||
    test.testTypeId === 'practice'
  ) {
    return { allowed: true, reason: 'open' }
  }

  if (id === STAFF_WORKING_TEST_ID && !canManagePapers) {
    return {
      allowed: false,
      reason: 'staff_pool',
      message:
        'That paper is a staff working set of the question bank, not a student mock. Open Mock Tests and pick a sample paper.',
    }
  }

  if (!id.startsWith('custom-')) {
    return { allowed: true, reason: 'builtin' }
  }

  if (isCustomTestPaper(test) && !isTestPublished(test)) {
    if (canManagePapers) {
      return { allowed: true, reason: 'draft_preview', preview: true }
    }
    return {
      allowed: false,
      reason: 'draft',
      message: 'This paper is still a draft. Ask your teacher to publish it first.',
    }
  }

  const isStudent = ctx.session?.role === 'user' || ctx.session?.role === 'student'
  const demoStudent = isDemoStudentIdentity(ctx.session)
  // Demo student may try every published / sample mock (not only assigned class papers).
  if (isStudent && demoStudent) {
    return { allowed: true, reason: 'demo_open' }
  }
  if (isStudent && studentClassIds.length > 0 && isCustomTestPaper(test)) {
    if (!assignedTestIds.includes(id)) {
      return {
        allowed: false,
        reason: 'not_assigned',
        message:
          'This test was not assigned to your class. Check Mock Tests → Assigned to me, or ask your teacher.',
      }
    }
  }

  return { allowed: true, reason: 'published' }
}

/** @param {ReturnType<typeof getExamAccess>} access */
export function examAccessBlockMessage(access) {
  return access.message ?? 'You cannot start this test.'
}
