const KEY = 'testvantage-school-attendance'

/**
 * Record shape: { id, schoolId, classId, date (YYYY-MM-DD), marks: { [studentId]: 'present'|'absent'|'late' }, updatedAt }
 */

function loadAll() {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAll(rows) {
  localStorage.setItem(KEY, JSON.stringify(rows))
}

export function loadAttendanceForSchool(schoolId) {
  return loadAll().filter((r) => r.schoolId === schoolId)
}

export function getAttendanceRecord(schoolId, classId, date) {
  return (
    loadAll().find((r) => r.schoolId === schoolId && r.classId === classId && r.date === date) ?? null
  )
}

export function upsertAttendance({ schoolId, classId, date, marks }) {
  const rows = loadAll()
  const idx = rows.findIndex((r) => r.schoolId === schoolId && r.classId === classId && r.date === date)
  const next = {
    id: idx >= 0 ? rows[idx].id : `att-${schoolId}-${classId}-${date}`,
    schoolId,
    classId,
    date,
    marks: { ...marks },
    updatedAt: new Date().toISOString(),
  }
  if (idx >= 0) rows[idx] = next
  else rows.push(next)
  saveAll(rows)
  return next
}

/** Summarize today's attendance for a school across given class student lists. */
export function todayAttendanceSummary(schoolId, schoolClasses, students, date = todayIso()) {
  const classIds = new Set(schoolClasses.map((c) => c.id))
  const records = loadAll().filter((r) => r.schoolId === schoolId && r.date === date && classIds.has(r.classId))
  let present = 0
  let absent = 0
  let late = 0
  let marked = 0
  for (const rec of records) {
    for (const status of Object.values(rec.marks ?? {})) {
      marked += 1
      if (status === 'present') present += 1
      else if (status === 'absent') absent += 1
      else if (status === 'late') late += 1
    }
  }
  const enrolled = schoolClasses.reduce((n, c) => n + (c.studentIds?.length ?? 0), 0)
  return { date, present, absent, late, marked, enrolled, classesMarked: records.length }
}

export function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Seed one day of attendance if school has none yet. */
export function ensureDemoAttendance(schoolId, schoolClasses) {
  const existing = loadAttendanceForSchool(schoolId)
  if (existing.length > 0 || schoolClasses.length === 0) return false
  const date = todayIso()
  for (const cls of schoolClasses.slice(0, 3)) {
    const marks = {}
    ;(cls.studentIds ?? []).forEach((sid, i) => {
      marks[sid] = i % 7 === 0 ? 'absent' : i % 5 === 0 ? 'late' : 'present'
    })
    if (Object.keys(marks).length) {
      upsertAttendance({ schoolId, classId: cls.id, date, marks })
    }
  }
  return true
}
