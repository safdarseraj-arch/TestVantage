import { useState } from 'react'
import {
  createTeacherAccount,
  deleteTeacherAccount,
  listTeachers,
  updateTeacherAccount,
} from '../utils/users'
import { ALL_TEACHER_PERMS, DEFAULT_TEACHER_PERMS, PERM_LABELS } from '../utils/permissions'

export default function TeacherManager() {
  const [teachers, setTeachers] = useState(() => listTeachers())
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [permissions, setPermissions] = useState([...DEFAULT_TEACHER_PERMS])
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [editingId, setEditingId] = useState(null)

  const refresh = () => setTeachers(listTeachers())

  const togglePerm = (perm) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    )
  }

  const resetForm = () => {
    setName('')
    setEmail('')
    setPassword('')
    setPermissions([...DEFAULT_TEACHER_PERMS])
    setEditingId(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setMsg({ type: '', text: '' })
    if (!permissions.length) {
      setMsg({ type: 'error', text: 'Select at least one permission.' })
      return
    }
    const result = editingId
      ? updateTeacherAccount(editingId, { name, email, password, permissions })
      : createTeacherAccount({ name, email, password, permissions, createdBy: 'admin' })
    if (!result.ok) {
      setMsg({ type: 'error', text: result.error })
      return
    }
    setMsg({
      type: 'success',
      text: editingId ? 'Teacher account updated.' : 'Teacher account created.',
    })
    resetForm()
    refresh()
  }

  const startEdit = (t) => {
    setEditingId(t.id)
    setName(t.name)
    setEmail(t.email)
    setPassword('')
    setPermissions([...(t.permissions ?? [])])
    setMsg({ type: '', text: '' })
  }

  const handleDelete = (id) => {
    if (!window.confirm('Delete this teacher account?')) return
    const result = deleteTeacherAccount(id)
    if (!result.ok) setMsg({ type: 'error', text: result.error })
    else {
      setMsg({ type: 'success', text: 'Teacher removed.' })
      if (editingId === id) resetForm()
      refresh()
    }
  }

  return (
    <section className="card teacher-manager">
      <h2>Teacher accounts</h2>
      <p className="form-hint">
        Create login ID and password for teachers. Assign rights: upload, create paper, publish,
        access main question bank, view results. <strong>Publish</strong> and{' '}
        <strong>Access main question bank</strong> are off by default — turn them on for trusted
        teachers / operators.
      </p>

      <form onSubmit={handleSubmit} className="teacher-form">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email (login ID)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password {editingId ? '(leave blank to keep)' : ''}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={editingId ? 0 : 4}
            required={!editingId}
          />
        </label>

        <fieldset className="teacher-perms">
          <legend>Rights</legend>
          {ALL_TEACHER_PERMS.map((perm) => (
            <label key={perm} className="perm-check">
              <input
                type="checkbox"
                checked={permissions.includes(perm)}
                onChange={() => togglePerm(perm)}
              />
              {PERM_LABELS[perm]}
            </label>
          ))}
        </fieldset>

        {msg.text && (
          <p className={msg.type === 'error' ? 'upload-error' : 'upload-success'}>{msg.text}</p>
        )}

        <div className="teacher-form-actions">
          <button type="submit" className="btn btn-primary">
            {editingId ? 'Save teacher' : 'Create teacher'}
          </button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
      </form>

      {teachers.length > 0 && (
        <table className="attempts-table teacher-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Rights</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td><code>{t.email}</code></td>
                <td>
                  {(t.permissions ?? [])
                    .map((p) => PERM_LABELS[p] ?? p)
                    .join(' · ') || '—'}
                </td>
                <td>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleDelete(t.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
