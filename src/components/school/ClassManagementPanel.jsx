import { useState } from 'react'
import {
  addClass,
  deleteClass,
  updateClass,
} from '../../utils/classesStore'

/**
 * @param {{
 *   schoolId: string
 *   schoolClasses: object[]
 *   teachers: object[]
 *   isAdmin: boolean
 *   selectedClassId: string
 *   onSelectClass: (id: string) => void
 *   onMessage: (type: string, text: string) => void
 *   onRefresh: () => void
 * }} props
 */
export default function ClassManagementPanel({
  schoolId,
  schoolClasses,
  teachers,
  isAdmin,
  selectedClassId,
  onSelectClass,
  onMessage,
  onRefresh,
}) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('')
  const [section, setSection] = useState('')
  const [teacherIds, setTeacherIds] = useState([])

  const resetForm = () => {
    setName('')
    setGrade('')
    setSection('')
    setTeacherIds([])
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (c) => {
    setEditingId(c.id)
    setName(c.name)
    setGrade(c.grade ?? '')
    setSection(c.section ?? '')
    setTeacherIds([...(c.teacherIds ?? [])])
    setShowForm(true)
    onSelectClass(c.id)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onMessage('', '')
    const result = editingId
      ? updateClass(editingId, { name, grade, section, teacherIds })
      : addClass({ schoolId, name, grade, section, teacherIds })
    if (!result.ok) {
      onMessage('error', result.error)
      return
    }
    onMessage('success', editingId ? 'Class updated.' : 'Class created.')
    if (!editingId && result.class) onSelectClass(result.class.id)
    resetForm()
    onRefresh()
  }

  const handleDelete = (id, className) => {
    if (!window.confirm(`Delete "${className}"? Students will be unlinked from this class.`)) return
    const result = deleteClass(id)
    if (!result.ok) onMessage('error', result.error)
    else {
      onMessage('success', 'Class removed.')
      if (selectedClassId === id) onSelectClass('')
      onRefresh()
    }
  }

  const toggleTeacher = (id) => {
    setTeacherIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  return (
    <div className="school-class-panel">
      <div className="school-panel-head">
        <div>
          <h3>Classes</h3>
          <p className="form-hint">Each class groups students for assignments and results.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            resetForm()
            setShowForm(true)
          }}
        >
          + Add class
        </button>
      </div>

      {showForm && (
        <div className="school-inline-form card-inner">
          <h4>{editingId ? 'Edit class' : 'New class'}</h4>
          <form onSubmit={handleSubmit} className="school-form-grid">
            <label className="school-field">
              <span>Class name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Class 11 Science A"
                required
              />
            </label>
            <label className="school-field">
              <span>Grade</span>
              <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="11" />
            </label>
            <label className="school-field">
              <span>Section</span>
              <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="A" />
            </label>
            {isAdmin && teachers.length > 0 && (
              <div className="school-field school-field--full school-teacher-picks">
                <span>Teachers</span>
                <div className="school-teacher-chips">
                  {teachers.map((t) => (
                    <label key={t.id} className="school-teacher-chip">
                      <input
                        type="checkbox"
                        checked={teacherIds.includes(t.id)}
                        onChange={() => toggleTeacher(t.id)}
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="school-form-actions school-field--full">
              <button type="submit" className="btn btn-primary btn-sm">
                {editingId ? 'Save class' : 'Create class'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {schoolClasses.length === 0 ? (
        <div className="school-empty-state">
          <span className="school-empty-icon" aria-hidden>📚</span>
          <p>No classes yet. Click <strong>Add class</strong> to create your first batch.</p>
        </div>
      ) : (
        <div className="school-class-grid">
          {schoolClasses.map((c) => {
            const active = selectedClassId === c.id
            return (
              <article
                key={c.id}
                className={`school-class-card ${active ? 'active' : ''}`}
              >
                <button
                  type="button"
                  className="school-class-card-main"
                  onClick={() => onSelectClass(c.id)}
                >
                  <h4>{c.name}</h4>
                  <div className="school-class-meta">
                    <span>{c.studentIds?.length ?? 0} students</span>
                    <span>{c.teacherIds?.length ?? 0} teachers</span>
                  </div>
                </button>
                <div className="school-class-card-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDelete(c.id, c.name)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
