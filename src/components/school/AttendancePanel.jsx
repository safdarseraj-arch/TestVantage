import { useEffect, useMemo, useState } from 'react'
import {
  getAttendanceRecord,
  todayIso,
  upsertAttendance,
} from '../../utils/schoolAttendanceStore'
import { studentInitials } from '../../utils/schoolUi'

const STATUSES = [
  { id: 'present', label: 'Present' },
  { id: 'absent', label: 'Absent' },
  { id: 'late', label: 'Late' },
]

export default function AttendancePanel({
  schoolId,
  schoolClasses,
  students,
  selectedClassId,
  onSelectClass,
  onMessage,
}) {
  const [date, setDate] = useState(todayIso())
  const [marks, setMarks] = useState({})
  const [savedAt, setSavedAt] = useState('')

  const classId = selectedClassId || schoolClasses[0]?.id || ''
  const cls = schoolClasses.find((c) => c.id === classId)
  const roster = useMemo(() => {
    const ids = new Set(cls?.studentIds ?? [])
    return students.filter((s) => ids.has(s.id))
  }, [cls, students])

  useEffect(() => {
    if (!classId) return
    const rec = getAttendanceRecord(schoolId, classId, date)
    if (rec?.marks) {
      setMarks({ ...rec.marks })
      setSavedAt(rec.updatedAt || '')
    } else {
      const next = {}
      roster.forEach((s) => {
        next[s.id] = 'present'
      })
      setMarks(next)
      setSavedAt('')
    }
  }, [schoolId, classId, date, roster])

  const setStatus = (studentId, status) => {
    setMarks((prev) => ({ ...prev, [studentId]: status }))
  }

  const markAll = (status) => {
    const next = {}
    roster.forEach((s) => {
      next[s.id] = status
    })
    setMarks(next)
  }

  const save = () => {
    if (!classId) {
      onMessage?.('error', 'Pick a class first.')
      return
    }
    if (roster.length === 0) {
      onMessage?.('error', 'This class has no students yet. Add students first.')
      return
    }
    const rec = upsertAttendance({ schoolId, classId, date, marks })
    setSavedAt(rec.updatedAt)
    onMessage?.('success', `Attendance saved for ${date}.`)
  }

  if (schoolClasses.length === 0) {
    return (
      <div className="school-empty-state school-empty-state--compact">
        <span className="school-empty-icon" aria-hidden>
          📅
        </span>
        <h3>No classes yet</h3>
        <p className="form-hint">Create a class, enroll students, then mark daily attendance.</p>
      </div>
    )
  }

  return (
    <div className="school-module">
      <div className="school-panel-head">
        <div>
          <h3>Daily attendance</h3>
          <p className="form-hint">Mark present, absent, or late for each student. Saved on this device.</p>
        </div>
        <div className="school-form-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => markAll('present')}>
            All present
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={save}>
            Save attendance
          </button>
        </div>
      </div>

      <div className="school-student-toolbar">
        <label className="school-field school-field--grow">
          <span>Class</span>
          <select
            value={classId}
            onChange={(e) => onSelectClass?.(e.target.value)}
          >
            {schoolClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="school-field">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      {savedAt && (
        <p className="form-hint">Last saved {new Date(savedAt).toLocaleString('en-IN')}</p>
      )}

      {roster.length === 0 ? (
        <div className="school-empty-state school-empty-state--compact">
          <h4>No students in this class</h4>
          <p className="form-hint">Open the Students tab to enroll accounts.</p>
        </div>
      ) : (
        <ul className="school-student-list">
          {roster.map((s) => (
            <li key={s.id} className="school-student-card school-att-row">
              <span className="school-student-avatar" aria-hidden>
                {studentInitials(s.name)}
              </span>
              <div className="school-student-info">
                <strong>{s.name || 'Student'}</strong>
                <code>{s.email || s.id}</code>
              </div>
              <div className="school-att-toggle" role="group" aria-label={`Attendance for ${s.name}`}>
                {STATUSES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    className={`school-att-btn school-att-btn--${st.id} ${
                      marks[s.id] === st.id ? 'active' : ''
                    }`}
                    onClick={() => setStatus(s.id, st.id)}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
