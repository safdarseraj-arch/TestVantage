import { useMemo, useState } from 'react'
import {
  BATCH_TRACK_TYPES,
  addBatch,
  deleteBatch,
  enrollStudentInBatch,
  removeStudentFromBatch,
  trackLabel,
  updateBatch,
} from '../../utils/schoolBatchesStore'

/**
 * Dual-track competitive batches — map students alongside their class/section.
 */
export default function BatchesPanel({
  schoolId,
  batches,
  schoolClasses,
  students,
  teachers,
  onMessage,
  onRefresh,
  onGoTab,
}) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [trackType, setTrackType] = useState('jee')
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id || '')
  const [studentToAdd, setStudentToAdd] = useState('')

  const activeBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) || batches[0] || null,
    [batches, selectedBatchId],
  )

  const enrolled = useMemo(() => {
    if (!activeBatch) return []
    return (activeBatch.studentIds ?? [])
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean)
  }, [activeBatch, students])

  const classRosterIds = useMemo(() => {
    const ids = new Set(schoolClasses.flatMap((c) => c.studentIds ?? []))
    return students.filter((s) => ids.has(s.id))
  }, [schoolClasses, students])

  const available = useMemo(() => {
    const inBatch = new Set(activeBatch?.studentIds ?? [])
    return classRosterIds.filter((s) => !inBatch.has(s.id))
  }, [classRosterIds, activeBatch])

  const classLabelFor = (studentId) => {
    const cls = schoolClasses.find((c) => (c.studentIds ?? []).includes(studentId))
    return cls?.name || '—'
  }

  const linkedClassSummary = useMemo(() => {
    if (!activeBatch) return []
    const names = new Set()
    for (const sid of activeBatch.studentIds ?? []) {
      const label = classLabelFor(sid)
      if (label && label !== '—') names.add(label)
    }
    return [...names]
  }, [activeBatch, schoolClasses])

  const resetForm = () => {
    setName('')
    setTrackType('jee')
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (b) => {
    setEditingId(b.id)
    setName(b.name)
    setTrackType(b.trackType || 'jee')
    setShowForm(true)
    setSelectedBatchId(b.id)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onMessage('', '')
    const result = editingId
      ? updateBatch(editingId, { name, trackType })
      : addBatch({ schoolId, name, trackType })
    if (!result.ok) {
      onMessage('error', result.error)
      return
    }
    onMessage('success', editingId ? 'Batch updated.' : 'Competitive batch created.')
    if (!editingId && result.batch) setSelectedBatchId(result.batch.id)
    resetForm()
    onRefresh()
  }

  const handleDelete = (id, batchName, studentCount) => {
    const warn =
      studentCount > 0
        ? `Delete batch "${batchName}"? ${studentCount} student(s) leave this batch but stay in their class.`
        : `Delete batch "${batchName}"? This cannot be undone.`
    if (!window.confirm(warn)) return
    const result = deleteBatch(id)
    if (!result.ok) onMessage('error', result.error)
    else {
      onMessage('success', 'Batch removed. Class rosters are unchanged.')
      if (selectedBatchId === id) setSelectedBatchId('')
      onRefresh()
    }
  }

  const handleEnroll = (e) => {
    e.preventDefault()
    if (!activeBatch || !studentToAdd) return
    const result = enrollStudentInBatch(activeBatch.id, studentToAdd)
    if (!result.ok) onMessage('error', result.error)
    else {
      onMessage('success', 'Student added to competitive batch.')
      setStudentToAdd('')
      onRefresh()
    }
  }

  const handleRemove = (studentId) => {
    if (!activeBatch) return
    const result = removeStudentFromBatch(activeBatch.id, studentId)
    if (!result.ok) onMessage('error', result.error)
    else {
      onMessage('success', 'Removed from batch (still in class).')
      onRefresh()
    }
  }

  return (
    <div className="school-module">
      <div className="school-panel-head">
        <div>
          <h3>Competitive batches</h3>
          <p className="form-hint">
            Dual track: keep the board class (e.g. 11-A) and add JEE / NEET / Olympiad batches for
            the same students — no double data entry. Batch names must be unique in this school.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
        >
          New batch
        </button>
      </div>

      {showForm && (
        <form className="school-inline-form" onSubmit={handleSubmit}>
          <label className="school-field">
            <span>Batch name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. JEE Integrated Batch 1"
              required
            />
          </label>
          <label className="school-field">
            <span>Track</span>
            <select value={trackType} onChange={(e) => setTrackType(e.target.value)}>
              {BATCH_TRACK_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <div className="school-form-actions">
            <button type="submit" className="btn btn-primary btn-sm">
              {editingId ? 'Save batch' : 'Create batch'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {batches.length === 0 ? (
        <div className="school-empty-state school-empty-state--compact">
          <span className="school-empty-icon" aria-hidden>
            🎯
          </span>
          <h4>No competitive batches yet</h4>
          <p className="form-hint">
            Create a JEE, NEET, Olympiad, Foundation, or Remedial batch, then map students from your
            class roster.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
          >
            Create first batch
          </button>
        </div>
      ) : (
        <>
          <div className="school-batch-chips" role="list">
            {batches.map((b) => (
              <button
                key={b.id}
                type="button"
                role="listitem"
                className={`school-batch-chip ${activeBatch?.id === b.id ? 'active' : ''}`}
                onClick={() => setSelectedBatchId(b.id)}
              >
                <strong>{b.name}</strong>
                <span>
                  {trackLabel(b.trackType)} · {(b.studentIds ?? []).length} students
                </span>
              </button>
            ))}
          </div>

          {activeBatch && (
            <div className="school-batch-detail">
              <div className="school-panel-head">
                <div>
                  <h4>{activeBatch.name}</h4>
                  <p className="form-hint" style={{ margin: 0 }}>
                    {trackLabel(activeBatch.trackType)} track ·{' '}
                    {(activeBatch.studentIds ?? []).length} student
                    {(activeBatch.studentIds ?? []).length === 1 ? '' : 's'}
                    {linkedClassSummary.length
                      ? ` · from class${linkedClassSummary.length === 1 ? '' : 'es'}: ${linkedClassSummary.join(', ')}`
                      : ' · not linked to a class roster yet'}
                  </p>
                </div>
                <div className="school-batch-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => startEdit(activeBatch)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm school-btn-danger"
                    onClick={() =>
                      handleDelete(
                        activeBatch.id,
                        activeBatch.name,
                        (activeBatch.studentIds ?? []).length,
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>

              <form className="school-inline-form school-inline-form--row" onSubmit={handleEnroll}>
                <label className="school-field school-field--grow">
                  <span>Add student from class roster</span>
                  <select
                    value={studentToAdd}
                    onChange={(e) => setStudentToAdd(e.target.value)}
                    required
                  >
                    <option value="">Select student…</option>
                    {available.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({classLabelFor(s.id)})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={!studentToAdd || available.length === 0}
                >
                  Add to batch
                </button>
              </form>

              {classRosterIds.length === 0 && (
                <p className="form-hint">
                  Enroll students under the Students tab first, then map them here.
                  {typeof onGoTab === 'function' && (
                    <>
                      {' '}
                      <button type="button" className="link-btn" onClick={() => onGoTab('students')}>
                        Open Students
                      </button>
                    </>
                  )}
                </p>
              )}

              {enrolled.length === 0 ? (
                <p className="form-hint">No students in this batch yet.</p>
              ) : (
                <ul className="school-student-list">
                  {enrolled.map((s) => (
                    <li key={s.id} className="school-student-card">
                      <div className="school-student-info">
                        <strong>{s.name}</strong>
                        <code>{s.email}</code>
                        <span className="form-hint" style={{ margin: 0 }}>
                          Class: {classLabelFor(s.id)} · also in {trackLabel(activeBatch.trackType)}{' '}
                          batch
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleRemove(s.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {teachers?.length > 0 && (
                <p className="form-hint school-batch-foot">
                  Tip: link subject teachers to the board class under Classes — batch membership is
                  for competitive grouping and future exam assignment.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
