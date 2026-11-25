import { useState } from 'react'
import { addSchool, deleteSchool, updateSchool } from '../../utils/schoolsStore'
import { BOARD_TYPES, defaultAcademicYearLabel } from '../../utils/schoolPhase1'

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
  const [academicYear, setAcademicYear] = useState(
    school?.academicYear ?? defaultAcademicYearLabel(),
  )
  const [boardType, setBoardType] = useState(school?.boardType ?? 'cbse')
  const [affiliationNo, setAffiliationNo] = useState(school?.affiliationNo ?? '')

  const handleSubmit = (e) => {
    e.preventDefault()
    onMessage('', '')
    const payload = { name, code, address, academicYear, boardType, affiliationNo }
    const result = editing ? updateSchool(school.id, payload) : addSchool(payload)
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
    if (
      !window.confirm(
        `Delete "${school.name}"? Competitive batches and unused teacher invites for this campus are removed too. This cannot be undone.`,
      )
    ) {
      return
    }
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
        <label className="school-field">
          <span>Academic year</span>
          <input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            placeholder="e.g. 2026-27"
          />
        </label>
        <label className="school-field">
          <span>Board</span>
          <select value={boardType} onChange={(e) => setBoardType(e.target.value)}>
            {BOARD_TYPES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <label className="school-field">
          <span>Affiliation no. (optional)</span>
          <input
            value={affiliationNo}
            onChange={(e) => setAffiliationNo(e.target.value)}
            placeholder="Board affiliation"
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
