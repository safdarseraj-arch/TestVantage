/**
 * @param {{ schools: object[], classes: object[], students: object[] }} props
 */
export function schoolOrgStats(schools, classes, students) {
  const totalStudents = students.length
  const totalClasses = classes.length
  return { schoolCount: schools.length, totalClasses, totalStudents }
}

/**
 * @param {string} schoolId
 * @param {object[]} classes
 * @param {object[]} students
 */
export function statsForSchool(schoolId, classes, students) {
  const schoolClasses = classes.filter((c) => c.schoolId === schoolId)
  const studentIds = new Set(schoolClasses.flatMap((c) => c.studentIds ?? []))
  const enrolled = students.filter((s) => studentIds.has(s.id))
  return {
    classCount: schoolClasses.length,
    studentCount: enrolled.length,
    teacherSlots: schoolClasses.reduce((n, c) => n + (c.teacherIds?.length ?? 0), 0),
  }
}

/** @param {string} name */
export function studentInitials(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
