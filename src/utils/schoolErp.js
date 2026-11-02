import {
  ensureDemoAttendance,
  todayAttendanceSummary,
} from '../utils/schoolAttendanceStore'
import { ensureDemoFees, feesSummary } from '../utils/schoolFeesStore'
import { ensureDemoTimetable, todaySchedule } from '../utils/schoolTimetableStore'

/**
 * One-time local demo seed for ERP modules (attendance / fees / timetable).
 * Safe to call repeatedly — skips if data already exists.
 */
export function ensureSchoolErpDemo(schoolId, schoolClasses, students, teachers) {
  if (!schoolId || !schoolClasses?.length) {
    return { attendance: false, fees: false, timetable: false }
  }
  return {
    attendance: ensureDemoAttendance(schoolId, schoolClasses),
    fees: ensureDemoFees(schoolId, schoolClasses, students),
    timetable: ensureDemoTimetable(schoolId, schoolClasses, teachers),
  }
}

/**
 * Dashboard snapshot for a school page.
 */
export function schoolDashboardSnapshot({
  schoolId,
  schoolClasses,
  students,
  teachers,
  assignments,
  testsById = {},
}) {
  const attendance = todayAttendanceSummary(schoolId, schoolClasses, students)
  const fees = feesSummary(schoolId, schoolClasses, students)
  const schedule = todaySchedule(schoolId, schoolClasses)

  const classIds = new Set(schoolClasses.map((c) => c.id))
  const now = Date.now()
  const upcomingExams = (assignments || [])
    .filter((a) => a.active !== false && classIds.has(a.classId))
    .map((a) => {
      const due = a.dueAt ? new Date(a.dueAt).getTime() : null
      const from = a.availableFrom ? new Date(a.availableFrom).getTime() : null
      return { ...a, due, from }
    })
    .filter((a) => {
      if (a.due && a.due < now) return false
      return true
    })
    .sort((a, b) => (a.due ?? a.from ?? Infinity) - (b.due ?? b.from ?? Infinity))
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      testId: a.testId,
      testTitle: testsById[a.testId]?.title || a.testId,
      classId: a.classId,
      className: schoolClasses.find((c) => c.id === a.classId)?.name || 'Class',
      dueAt: a.dueAt,
      availableFrom: a.availableFrom,
    }))

  const teacherIds = new Set(schoolClasses.flatMap((c) => c.teacherIds ?? []))
  const staffCount = teachers.filter((t) => teacherIds.has(t.id)).length || teacherIds.size

  return {
    attendance,
    fees,
    schedule,
    upcomingExams,
    counts: {
      classes: schoolClasses.length,
      students: new Set(schoolClasses.flatMap((c) => c.studentIds ?? [])).size,
      staff: staffCount,
      activeAssignments: (assignments || []).filter(
        (a) => a.active !== false && classIds.has(a.classId),
      ).length,
    },
  }
}
