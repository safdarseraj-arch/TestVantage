import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllTests } from '../../data/tests'
import {
  assignTestToClass,
  assignmentStatusLabel,
  removeAssignment,
} from '../../utils/assignmentsStore'

function parseDateInput(value) {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * @param {{
 *   schoolClasses: object[]
 *   assignments: object[]
 *   session: object
 *   onMessage: (type: string, text: string) => void
 *   onRefresh: () => void
 * }} props
 */
export default function AssignTestsPanel({
  schoolClasses,
  assignments,
  session,
  onMessage,
  onRefresh,
}) {
  const allTests = getAllTests()
  const [classId, setClassId] = useState(() => schoolClasses[0]?.id ?? '')
  const [testId, setTestId] = useState(() => allTests[0]?.id ?? '')
  const [availableFrom, setAvailableFrom] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [notes, setNotes] = useState('')
  const [lastEmailDraft, setLastEmailDraft] = useState(null)

  const activeClass = schoolClasses.find((c) => c.id === classId)
  const classAssignments = assignments.filter((a) => a.classId === classId)

  const handleAssign = (e) => {
    e.preventDefault()
    onMessage('', '')
    const result = assignTestToClass({
      testId,
      classId,
      assignedBy: session?.id ?? session?.email ?? 'admin',
      availableFrom: parseDateInput(availableFrom),
      dueAt: parseDateInput(dueAt),
      notes,
    })
    if (!result.ok) {
      onMessage('error', result.error)
      return
    }
    const count = result.notify?.studentCount ?? 0
    onMessage(
      'success',
      count > 0
        ? `Test assigned — ${count} student(s) will see it under Assigned to me.`
        : 'Test assigned. Add students to this class to notify them.',
    )
    if (result.emailDraft) {
      setLastEmailDraft({
        body: result.emailDraft.body,
        mailto: result.emailDraft.mailto,
        studentCount: count,
      })
    } else setLastEmailDraft(null)
    setNotes('')
    setAvailableFrom('')
    setDueAt('')
    onRefresh()
  }

  const handleRemove = (id) => {
    if (!window.confirm('Remove this assignment?')) return
    const result = removeAssignment(id)
    if (!result.ok) onMessage('error', result.error)
    else {
      onMessage('success', 'Assignment removed.')
      onRefresh()
    }
  }

  if (schoolClasses.length === 0) {
    return (
      <div className="school-empty-state">
        <span className="school-empty-icon" aria-hidden>📋</span>
        <p>Create a class first, then assign mock tests here.</p>
      </div>
    )
  }

  if (allTests.length === 0) {
    return (
      <div className="school-empty-state">
        <span className="school-empty-icon" aria-hidden>📝</span>
        <p>No tests in the catalog yet.</p>
        <Link to="/create-test" className="btn btn-primary btn-sm">
          Create a test
        </Link>
      </div>
    )
  }

  return (
    <div className="school-assign-panel">
      <div className="school-panel-head">
        <div>
          <h3>Assign tests</h3>
          <p className="form-hint">
            Students in the class see assigned papers under <strong>Assigned to me</strong> on Mock
            Tests.
          </p>
        </div>
      </div>

      <form onSubmit={handleAssign} className="school-form-grid school-assign-form">
        <label className="school-field">
          <span>Class</span>
          <select value={classId} onChange={(e) => setClassId(e.target.value)} required>
            {schoolClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.studentIds?.length ?? 0} students)
              </option>
            ))}
          </select>
        </label>
        <label className="school-field">
          <span>Test paper</span>
          <select value={testId} onChange={(e) => setTestId(e.target.value)} required>
            {allTests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({t.totalQuestions} Q)
              </option>
            ))}
          </select>
        </label>
        <label className="school-field">
          <span>Available from</span>
          <input
            type="datetime-local"
            value={availableFrom}
            onChange={(e) => setAvailableFrom(e.target.value)}
          />
        </label>
        <label className="school-field">
          <span>Due by</span>
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>
        <label className="school-field school-field--full">
          <span>Notes (optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Unit test 1" />
        </label>
        <div className="school-form-actions school-field--full">
          <button type="submit" className="btn btn-primary">
            Assign to class
          </button>
        </div>
      </form>

      {lastEmailDraft && lastEmailDraft.studentCount > 0 && (
        <div className="school-email-draft card-inner">
          <h4>Notify by email</h4>
          <p className="form-hint">Students also see an in-app alert on Home and Mock Tests.</p>
          <div className="school-form-actions">
            {lastEmailDraft.mailto && (
              <a href={lastEmailDraft.mailto} className="btn btn-secondary btn-sm">
                Open email app
              </a>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                navigator.clipboard?.writeText(lastEmailDraft.body)
                onMessage('success', 'Email text copied.')
              }}
            >
              Copy email text
            </button>
          </div>
        </div>
      )}

      <div className="school-assign-list">
        <h4>
          Current assignments — {activeClass?.name ?? 'class'}
        </h4>
        {classAssignments.length === 0 ? (
          <p className="form-hint">No tests assigned to this class yet.</p>
        ) : (
          <ul className="school-assign-cards">
            {classAssignments.map((a) => {
              const test = allTests.find((t) => t.id === a.testId)
              return (
                <li key={a.id} className="school-assign-card">
                  <div>
                    <strong>{test?.title ?? a.testId}</strong>
                    <span className={`school-assign-status school-assign-status--${a.status ?? 'active'}`}>
                      {assignmentStatusLabel(a)}
                    </span>
                    <p className="form-hint">
                      {a.availableFrom
                        ? `From ${new Date(a.availableFrom).toLocaleString()}`
                        : 'Available now'}
                      {a.dueAt ? ` · Due ${new Date(a.dueAt).toLocaleString()}` : ''}
                      {a.notes ? ` · ${a.notes}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm school-btn-danger"
                    onClick={() => handleRemove(a.id)}
                  >
                    Remove
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
