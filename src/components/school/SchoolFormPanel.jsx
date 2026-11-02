import { useState } from 'react'
import { addSchool, deleteSchool, updateSchool } from '../../utils/schoolsStore'

/**
 * @param {{
 *   school?: object | null
 *   classes: object[]
 *   onDone: () => void
 *   onCancel?: () => void
 *   onMessage: (type: string, text: string) => void
 * }} props
 */
export default function SchoolFormPanel({ school, classes, onDone, onCancel, onMessage }) {
  const editing = !!school
  const [name, setName] = useState(school?.name ?? '')
  const [code, setCode] = useState(school?.code ?? '')
  const [address, setAddress] = useState(school?.address ?? '')

  const handleSubmit = (e) => {
    e.preventDefault()
    onMessage('', '')
    const result = editing
      ? updateSchool(school.id, { name, code, address })
      : addSchool({ name, code, address })
    if (!result.ok) {
      onMessage('error', result.error)
      return
    }
    onMessage('success', editing ? 'School updated.' : 'School created.')
    onDone()
  }

  const handleDelete = () => {
    if (!school) return
    const hasClasses = classes.some((c) => c.schoolId === school.id)
    if (hasClasses) {
      onMessage('error', 'Remove all classes from this school first.')
      return
    }
    if (!window.confirm(`Delete "${school.name}"? This cannot be undone.`)) return
    const result = deleteSchool(school.id)
    if (!result.ok) onMessage('error', result.error)
    else {
      onMessage('success', 'School removed.')
      onDone()
    }
  }

  return (
    <form className="school-form-panel" onSubmit={handleSubmit}>
      <div className="school-form-grid">
        <label className="school-field">
          <span>School name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Delhi Public School"
            required
          />
        </label>
        <label className="school-field">
          <span>School code (optional)</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. DPS001"
          />
        </label>
        <label className="school-field school-field--full">
          <span>Address (optional)</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="City, state"
          />
        </label>
      </div>
      <div className="school-form-actions">
        <button type="submit" className="btn btn-primary">
          {editing ? 'Save changes' : 'Add school'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        {editing && (
          <button type="button" className="btn btn-ghost school-btn-danger" onClick={handleDelete}>
            Delete school
          </button>
        )}
      </div>
    </form>
  )
}
