/**
 * After Path A invite redemption — attach teacher to school classes from invite metadata.
 */

import {
  getClassesBySchool,
  loadClasses,
  syncUserClassLinks,
  updateClass,
} from './classesStore.js'
import { loadSchools } from './schoolsStore.js'
import { getUserById, loadUsers, saveUsersDirect } from './users.js'

const PILOT_DEMO_CAMPUS_NAME = 'Pilot Demo Campus'

/**
 * Resolve a school id from a live or demo invite payload.
 * @param {{ schoolId?: string, campusName?: string }} invite
 * @returns {string | null}
 */
export function resolveSchoolIdFromInvite(invite) {
  if (!invite) return null
  if (invite.schoolId) {
    const hit = loadSchools().find((s) => s.id === invite.schoolId)
    if (hit) return hit.id
  }
  const name = String(invite.campusName || '').trim().toLowerCase()
  if (!name) return null
  const byName = loadSchools().find((s) => s.name.toLowerCase() === name)
  if (byName) return byName.id
  // Demo codes historically used Partner / Demo School labels — map to Pilot Demo Campus.
  if (
    name.includes('partner campus') ||
    name.includes('demo school') ||
    name === PILOT_DEMO_CAMPUS_NAME.toLowerCase()
  ) {
    const pilot = loadSchools().find(
      (s) => s.name.toLowerCase() === PILOT_DEMO_CAMPUS_NAME.toLowerCase(),
    )
    if (pilot) return pilot.id
  }
  return null
}

/**
 * Link a teacher to school classes named in the invite (or first 1–2 classes).
 * Sets user.schoolId and refreshes classIds via syncUserClassLinks.
 *
 * @param {string} teacherId
 * @param {{ schoolId?: string, campusName?: string, classes?: string[], code?: string }} invite
 * @returns {{ ok: boolean, attached: boolean, schoolId?: string, classIds?: string[], error?: string }}
 */
export function attachTeacherFromSchoolInvite(teacherId, invite) {
  const teacher = getUserById(teacherId)
  if (!teacher || teacher.role !== 'teacher') {
    return { ok: false, attached: false, error: 'Teacher account not found.' }
  }

  const schoolId = resolveSchoolIdFromInvite(invite)
  if (!schoolId) {
    return {
      ok: true,
      attached: false,
      error: 'No matching school yet — create the campus or open School Management first.',
    }
  }

  const schoolClasses = getClassesBySchool(schoolId)
  if (schoolClasses.length === 0) {
    // Still stamp schoolId so Staff can see them as campus-linked once classes exist.
    stampTeacherSchool(teacherId, schoolId)
    return { ok: true, attached: true, schoolId, classIds: [] }
  }

  const wanted = new Set(
    (invite?.classes || []).map((n) => String(n).trim().toLowerCase()).filter(Boolean),
  )
  let targets =
    wanted.size > 0
      ? schoolClasses.filter((c) => wanted.has(String(c.name || '').toLowerCase()))
      : []
  if (targets.length === 0) {
    targets = schoolClasses.slice(0, Math.min(2, schoolClasses.length))
  }

  let changed = false
  const linkedIds = []
  for (const cls of targets) {
    const teacherIds = Array.isArray(cls.teacherIds) ? [...cls.teacherIds] : []
    if (!teacherIds.includes(teacherId)) {
      teacherIds.push(teacherId)
      const res = updateClass(cls.id, { teacherIds })
      if (res.ok) changed = true
    }
    linkedIds.push(cls.id)
  }

  stampTeacherSchool(teacherId, schoolId)
  syncUserClassLinks()

  return {
    ok: true,
    attached: changed || linkedIds.length > 0,
    schoolId,
    classIds: linkedIds,
  }
}

/** @param {string} teacherId @param {string} schoolId */
function stampTeacherSchool(teacherId, schoolId) {
  const users = loadUsers()
  const idx = users.findIndex((u) => u.id === teacherId)
  if (idx < 0) return
  if (users[idx].schoolId === schoolId) return
  users[idx] = { ...users[idx], schoolId }
  saveUsersDirect(users)
}

/**
 * Whether a teacher appears linked on Staff (class teacherIds or schoolId stamp).
 * @param {string} teacherId
 * @param {string} schoolId
 */
export function isTeacherLinkedToSchool(teacherId, schoolId) {
  if (!teacherId || !schoolId) return false
  const user = getUserById(teacherId)
  if (user?.schoolId === schoolId) return true
  return loadClasses().some(
    (c) => c.schoolId === schoolId && (c.teacherIds || []).includes(teacherId),
  )
}
