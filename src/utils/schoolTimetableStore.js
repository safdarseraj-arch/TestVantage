const KEY = 'testvantage-school-timetable'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Slot: { id, schoolId, classId, day, startTime, endTime, subject, teacherName }
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

export { DAYS }

export function loadTimetable(schoolId) {
  return loadAll().filter((s) => s.schoolId === schoolId)
}

export function loadTimetableForClass(schoolId, classId) {
  return loadTimetable(schoolId).filter((s) => s.classId === classId)
}

export function addTimetableSlot(slot) {
  const rows = loadAll()
  const next = {
    id: `tt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    schoolId: slot.schoolId,
    classId: slot.classId,
    day: slot.day || 'Mon',
    startTime: slot.startTime || '09:00',
    endTime: slot.endTime || '09:45',
    subject: String(slot.subject || '').trim() || 'Period',
    teacherName: String(slot.teacherName || '').trim(),
  }
  rows.push(next)
  saveAll(rows)
  return next
}

export function deleteTimetableSlot(id) {
  saveAll(loadAll().filter((s) => s.id !== id))
}

export function todaySchedule(schoolId, schoolClasses) {
  const dayIdx = new Date().getDay() // 0 Sun
  const dayMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' }
  const day = dayMap[dayIdx]
  if (!day) return { day: 'Sun', slots: [] }
  const classIds = new Set(schoolClasses.map((c) => c.id))
  const classById = Object.fromEntries(schoolClasses.map((c) => [c.id, c]))
  const slots = loadTimetable(schoolId)
    .filter((s) => s.day === day && classIds.has(s.classId))
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)))
    .map((s) => ({ ...s, className: classById[s.classId]?.name || 'Class' }))
  return { day, slots }
}

export function ensureDemoTimetable(schoolId, schoolClasses, teachers = []) {
  if (loadTimetable(schoolId).length > 0 || schoolClasses.length === 0) return false
  const teacherName = teachers[0]?.name || 'Class teacher'
  const subjects = ['Maths', 'English', 'Science', 'Social Studies', 'Hindi']
  const times = [
    ['09:00', '09:45'],
    ['09:50', '10:35'],
    ['11:00', '11:45'],
    ['11:50', '12:35'],
  ]
  const cls = schoolClasses[0]
  for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) {
    times.forEach(([startTime, endTime], i) => {
      addTimetableSlot({
        schoolId,
        classId: cls.id,
        day,
        startTime,
        endTime,
        subject: subjects[i % subjects.length],
        teacherName,
      })
    })
  }
  return true
}
