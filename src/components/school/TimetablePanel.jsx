import { useMemo, useState } from 'react'
import {
  DAYS,
  addTimetableSlot,
  deleteTimetableSlot,
  loadTimetableForClass,
} from '../../utils/schoolTimetableStore'

export default function TimetablePanel({
  schoolId,
  schoolClasses,
  teachers,
  selectedClassId,
  onSelectClass,
  onMessage,
  onRefreshLocal,
}) {
  const [tick, setTick] = useState(0)
  const classId = selectedClassId || schoolClasses[0]?.id || ''
  const slots = useMemo(
    () => loadTimetableForClass(schoolId, classId).sort(sortSlots),
    [schoolId, classId, tick],
  )

  const [day, setDay] = useState('Mon')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('09:45')
  const [subject, setSubject] = useState('')
  const [teacherName, setTeacherName] = useState(teachers[0]?.name || '')
  const [showAdd, setShowAdd] = useState(false)

  const refresh = () => {
    setTick((n) => n + 1)
    onRefreshLocal?.()
  }

  const add = (e) => {
    e.preventDefault()
    if (!classId) {
      onMessage?.('error', 'Pick a class first.')
      return
    }
    if (!subject.trim()) {
      onMessage?.('error', 'Enter a subject name.')
      return
    }
    addTimetableSlot({
      schoolId,
      classId,
      day,
      startTime,
      endTime,
      subject: subject.trim(),
      teacherName: teacherName.trim(),
    })
    setSubject('')
    setShowAdd(false)
    onMessage?.('success', 'Period added.')
    refresh()
  }

  const remove = (id) => {
    deleteTimetableSlot(id)
    onMessage?.('success', 'Period removed.')
    refresh()
  }

  if (schoolClasses.length === 0) {
    return (
      <div className="school-empty-state school-empty-state--compact">
        <span className="school-empty-icon" aria-hidden>
          🗓️
        </span>
        <h3>No classes yet</h3>
        <p className="form-hint">Create a class before building the weekly timetable.</p>
      </div>
    )
  }

  const byDay = DAYS.map((d) => ({
    day: d,
    items: slots.filter((s) => s.day === d),
  }))

  return (
    <div className="school-module">
      <div className="school-panel-head">
        <div>
          <h3>Weekly timetable</h3>
          <p className="form-hint">Simple period planner per class. Saved on this device.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Close' : '+ Add period'}
        </button>
      </div>

      <div className="school-student-toolbar">
        <label className="school-field school-field--grow">
          <span>Class</span>
          <select value={classId} onChange={(e) => onSelectClass?.(e.target.value)}>
            {schoolClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {showAdd && (
        <form className="school-inline-form" onSubmit={add}>
          <h4>Add period</h4>
          <div className="school-form-grid">
            <label className="school-field">
              <span>Day</span>
              <select value={day} onChange={(e) => setDay(e.target.value)}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="school-field">
              <span>Start</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="school-field">
              <span>End</span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
            <label className="school-field">
              <span>Subject</span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Maths"
                required
              />
            </label>
            <label className="school-field school-field--full">
              <span>Teacher</span>
              <input
                list="school-tt-teachers"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="Teacher name"
              />
              <datalist id="school-tt-teachers">
                {teachers.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
            </label>
          </div>
          <div className="school-form-actions">
            <button type="submit" className="btn btn-primary btn-sm">
              Save period
            </button>
          </div>
        </form>
      )}

      {slots.length === 0 ? (
        <div className="school-empty-state school-empty-state--compact">
          <h4>No periods yet</h4>
          <p className="form-hint">Add Monday–Saturday periods for this class.</p>
        </div>
      ) : (
        <div className="school-tt-grid">
          {byDay.map(({ day: d, items }) => (
            <div key={d} className="school-tt-day">
              <h4>{d}</h4>
              {items.length === 0 ? (
                <p className="form-hint">—</p>
              ) : (
                <ul>
                  {items.map((s) => (
                    <li key={s.id}>
                      <div>
                        <strong>
                          {s.startTime}–{s.endTime}
                        </strong>
                        <span>{s.subject}</span>
                        {s.teacherName && <em>{s.teacherName}</em>}
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm school-btn-danger"
                        onClick={() => remove(s.id)}
                        aria-label={`Remove ${s.subject}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function sortSlots(a, b) {
  const di = DAYS.indexOf(a.day) - DAYS.indexOf(b.day)
  if (di !== 0) return di
  return String(a.startTime).localeCompare(String(b.startTime))
}
