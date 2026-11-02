import { getUserById, loadUsers, saveUsersDirect } from './users.js'

const STORAGE_KEY = 'testvantage-classes'

/**
 * @typedef {{
 *   id: string
 *   schoolId: string
 *   name: string
 *   grade?: string
 *   section?: string
 *   teacherIds: string[]
 *   studentIds: string[]
 *   createdAt: number
 * }} SchoolClass
 */

/** @returns {SchoolClass[]} */
export function loadClasses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data.classes) ? data.classes : []
  } catch {
    return []
  }
}

/** @param {SchoolClass[]} classes */
function saveClasses(classes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ classes }))
  import('./orgServerSync.js')
    .then((m) => m.notifyOrgChanged())
    .catch(() => {})
}

/** @param {string} id */
export function getClassById(id) {
  return loadClasses().find((c) => c.id === id) ?? null
}

/** @param {string} schoolId */
export function getClassesBySchool(schoolId) {
  return loadClasses().filter((c) => c.schoolId === schoolId)
}

/**
 * @param {{ schoolId: string, name: string, grade?: string, section?: string, teacherIds?: string[] }} data
 */
export function addClass({ schoolId, name, grade, section, teacherIds = [] }) {
  const trimmed = String(name ?? '').trim()
  if (!schoolId) return { ok: false, error: 'Select a school.' }
  if (!trimmed) return { ok: false, error: 'Class name is required.' }

  const classes = loadClasses()
  const schoolClasses = classes.filter((c) => c.schoolId === schoolId)
  if (schoolClasses.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: 'This school already has a class with this name.' }
  }

  const validTeachers = teacherIds.filter((id) => {
    const u = getUserById(id)
    return u?.role === 'teacher'
  })

  const schoolClass = {
    id: `class-${Date.now()}`,
    schoolId,
    name: trimmed,
    grade: grade?.trim() || undefined,
    section: section?.trim() || undefined,
    teacherIds: validTeachers,
    studentIds: [],
    createdAt: Date.now(),
  }
  classes.push(schoolClass)
  saveClasses(classes)
  syncUserClassLinks()
  return { ok: true, class: schoolClass }
}

/**
 * @param {string} id
 * @param {{ name?: string, grade?: string, section?: string, teacherIds?: string[], studentIds?: string[] }} updates
 */
export function updateClass(id, updates) {
  const classes = loadClasses()
  const idx = classes.findIndex((c) => c.id === id)
  if (idx < 0) return { ok: false, error: 'Class not found.' }

  const row = { ...classes[idx] }

  if (updates.name != null) {
    const trimmed = updates.name.trim()
    if (!trimmed) return { ok: false, error: 'Class name is required.' }
    if (
      classes.some(
        (c) =>
          c.id !== id &&
          c.schoolId === row.schoolId &&
          c.name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      return { ok: false, error: 'This school already has a class with this name.' }
    }
    row.name = trimmed
  }
  if (updates.grade != null) row.grade = updates.grade.trim() || undefined
  if (updates.section != null) row.section = updates.section.trim() || undefined
  if (updates.teacherIds != null) {
    row.teacherIds = updates.teacherIds.filter((tid) => {
      const u = getUserById(tid)
      return u?.role === 'teacher'
    })
  }
  if (updates.studentIds != null) {
    row.studentIds = updates.studentIds.filter((sid) => {
      const u = getUserById(sid)
      return u?.role === 'user'
    })
  }

  classes[idx] = row
  saveClasses(classes)
  syncUserClassLinks()
  return { ok: true, class: row }
}

/** @param {string} id */
export function deleteClass(id) {
  const classes = loadClasses()
  const next = classes.filter((c) => c.id !== id)
  if (next.length === classes.length) return { ok: false, error: 'Class not found.' }
  saveClasses(next)
  syncUserClassLinks()
  return { ok: true }
}

/** @param {string} classId @param {string} studentId */
export function enrollStudentInClass(classId, studentId) {
  const schoolClass = getClassById(classId)
  if (!schoolClass) return { ok: false, error: 'Class not found.' }
  const student = getUserById(studentId)
  if (!student || student.role !== 'user') return { ok: false, error: 'Student not found.' }

  const currentIds = idList(schoolClass.studentIds)
  const studentIds = currentIds.includes(studentId) ? currentIds : [...currentIds, studentId]
  return updateClass(classId, { studentIds })
}

/** @param {string} classId @param {string} studentId */
export function removeStudentFromClass(classId, studentId) {
  const schoolClass = getClassById(classId)
  if (!schoolClass) return { ok: false, error: 'Class not found.' }
  return updateClass(classId, {
    studentIds: idList(schoolClass.studentIds).filter((id) => id !== studentId),
  })
}

function idList(value) {
  return Array.isArray(value) ? value : []
}

/** @param {string} teacherId */
export function getClassesForTeacher(teacherId) {
  return loadClasses().filter((c) => idList(c.teacherIds).includes(teacherId))
}

/** @param {string} studentId */
export function getClassesForStudent(studentId) {
  return loadClasses().filter((c) => idList(c.studentIds).includes(studentId))
}

/** Keep user.schoolId and user.classIds in sync with class rosters. */
export function syncUserClassLinks() {
  const classes = loadClasses()
  const users = loadUsers()
  let changed = false

  const nextUsers = users.map((u) => {
    if (u.role === 'user') {
      const memberOf = classes.filter((c) => idList(c.studentIds).includes(u.id)).map((c) => c.id)
      const schoolId = memberOf.length
        ? classes.find((c) => c.id === memberOf[0])?.schoolId
        : undefined
      const prevIds = [...(u.classIds ?? [])].sort().join(',')
      const nextIds = [...memberOf].sort().join(',')
      if (prevIds !== nextIds || u.schoolId !== schoolId) {
        changed = true
        return { ...u, classIds: memberOf, schoolId }
      }
    }
    if (u.role === 'teacher') {
      const teaches = classes.filter((c) => idList(c.teacherIds).includes(u.id)).map((c) => c.id)
      const prevIds = [...(u.classIds ?? [])].sort().join(',')
      const nextIds = [...teaches].sort().join(',')
      if (prevIds !== nextIds) {
        changed = true
        return { ...u, classIds: teaches }
      }
    }
    return u
  })

  if (changed) saveUsersDirect(nextUsers)
}
