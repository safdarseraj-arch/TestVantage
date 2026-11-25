import { useMemo, useState } from 'react'
import {
  enrollStudentInClass,
  removeStudentFromClass,
} from '../../utils/classesStore'
import {
  createStudentAccount,
  generateStudentCredentials,
  updateStudentAccount,
} from '../../utils/users'
import { studentInitials } from '../../utils/schoolUi'
import {
  ROSTER_CSV_TEMPLATE,
  formatRosterErrors,
  importRosterToClass,
  parseRosterCsv,
  previewRosterRows,
} from '../../utils/schoolRosterImport'

/**
 * @param {{
 *   schoolClasses: object[]
 *   students: object[]
 *   selectedClassId: string
 *   onSelectClass: (id: string) => void
 *   session: object
 *   onMessage: (type: string, text: string) => void
 *   onRefresh: () => void
 *   onGoTab?: (tab: string) => void
 * }} props
 */
export default function StudentManagementPanel({
  schoolClasses,
  students,
  selectedClassId,
  onSelectClass,
  session,
  onMessage,
  onRefresh,
  onGoTab,
}) {
  const [search, setSearch] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentLoginId, setNewStudentLoginId] = useState('')
  const [newStudentPassword, setNewStudentPassword] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState(null)
  const [resettingStudentId, setResettingStudentId] = useState(null)
  const [resetPassword, setResetPassword] = useState('')
  const [studentToAdd, setStudentToAdd] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState(ROSTER_CSV_TEMPLATE)
  const [bulkResult, setBulkResult] = useState(null)

  const activeClass = schoolClasses.find((c) => c.id === selectedClassId) ?? schoolClasses[0] ?? null

  const enrolledStudents = useMemo(() => {
    if (!activeClass) return []
    return (activeClass.studentIds ?? [])
      .map((id) => students.find((s) => s.id === id))
      .filter(Boolean)
  }, [activeClass, students])

  const filteredEnrolled = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return enrolledStudents
    return enrolledStudents.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        String(s.email ?? '').toLowerCase().includes(q),
    )
  }, [enrolledStudents, search])

  const availableStudents = useMemo(
    () => students.filter((s) => !activeClass?.studentIds?.includes(s.id)),
    [students, activeClass],
  )

  const bulkPreview = useMemo(() => {
    if (!showBulk || !bulkText.trim()) return null
    const parsed = parseRosterCsv(bulkText)
    if (!parsed.ok) return { ok: false, error: parsed.error, count: 0, errors: [] }
    const preview = previewRosterRows(parsed.rows)
    return { ...preview, error: preview.ok ? '' : formatRosterErrors(preview.errors) }
  }, [showBulk, bulkText])

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text)
      onMessage('success', `${label} copied.`)
    } catch {
      onMessage('error', 'Could not copy — select and copy manually.')
    }
  }

  const handleGenerateCredentials = () => {
    if (!newStudentName.trim()) {
      onMessage('error', 'Enter student name first.')
      return
    }
    const creds = generateStudentCredentials(newStudentName, activeClass?.name)
    setNewStudentLoginId(creds.loginId)
    setNewStudentPassword(creds.password)
  }

  const handleCreateStudent = (e) => {
    e.preventDefault()
    if (!activeClass) {
      onMessage('error', 'Create a class first.')
      return
    }
    onMessage('', '')
    const result = createStudentAccount({
      name: newStudentName,
      loginId: newStudentLoginId,
      password: newStudentPassword,
      createdBy: session?.id ?? session?.email ?? 'admin',
    })
    if (!result.ok) {
      onMessage('error', result.error)
      return
    }
    const enroll = enrollStudentInClass(activeClass.id, result.user.id)
    if (!enroll.ok) {
      onMessage('error', enroll.error)
      return
    }
    setCreatedCredentials({
      name: result.user.name,
      loginId: result.user.email,
      password: newStudentPassword,
      className: activeClass.name,
    })
    setNewStudentName('')
    setNewStudentLoginId('')
    setNewStudentPassword('')
    setShowAddForm(false)
    onMessage('success', 'Student created and added to class.')
    onRefresh()
  }

  const handleEnrollExisting = () => {
    if (!activeClass || !studentToAdd) return
    const result = enrollStudentInClass(activeClass.id, studentToAdd)
    if (!result.ok) onMessage('error', result.error)
    else {
      onMessage('success', 'Student added to class.')
      setStudentToAdd('')
      onRefresh()
    }
  }

  const handleRemoveStudent = (studentId) => {
    if (!activeClass) return
    if (!window.confirm('Remove this student from the class? Their account stays active.')) return
    const result = removeStudentFromClass(activeClass.id, studentId)
    if (!result.ok) onMessage('error', result.error)
    else {
      onMessage('success', 'Student removed from class.')
      onRefresh()
    }
  }

  const handleResetPassword = (studentId) => {
    if (!resetPassword || resetPassword.length < 4) {
      onMessage('error', 'Password must be at least 4 characters.')
      return
    }
    const result = updateStudentAccount(studentId, { password: resetPassword })
    if (!result.ok) onMessage('error', result.error)
    else {
      onMessage('success', 'Password updated.')
      setResettingStudentId(null)
      setResetPassword('')
    }
  }

  const handleBulkImport = () => {
    if (!activeClass) {
      onMessage('error', 'Select a class first.')
      return
    }
    onMessage('', '')
    setBulkResult(null)
    const parsed = parseRosterCsv(bulkText)
    if (!parsed.ok) {
      onMessage('error', parsed.error)
      return
    }
    const preview = previewRosterRows(parsed.rows)
    if (!preview.ok) {
      onMessage('error', formatRosterErrors(preview.errors))
      return
    }
    const result = importRosterToClass({
      classId: activeClass.id,
      className: activeClass.name,
      rows: parsed.rows,
      createdBy: session?.id ?? session?.email ?? 'roster-import',
    })
    setBulkResult(result)
    if (!result.ok) {
      onMessage('error', result.error || 'Import failed.')
      return
    }
    const failNote = result.failed?.length
      ? ` ${result.failed.length} row(s) failed — see details below.`
      : ''
    onMessage(
      'success',
      `Imported ${result.created.length} student(s) into ${activeClass.name}.${failNote}`,
    )
    onRefresh()
  }

  const downloadTemplate = () => {
    const blob = new Blob([ROSTER_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'testvantage-roster-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCsvFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      setBulkText(text)
      setBulkResult(null)
      onMessage('success', `Loaded ${file.name}. Check the preview, then import.`)
    }
    reader.onerror = () => onMessage('error', 'Could not read that file.')
    reader.readAsText(file)
    e.target.value = ''
  }

  if (schoolClasses.length === 0) {
    return (
      <div className="school-empty-state">
        <span className="school-empty-icon" aria-hidden>👥</span>
        <h4>Add a class first</h4>
        <p className="form-hint">Create a class/section, then enroll students here (or import a CSV).</p>
        {typeof onGoTab === 'function' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onGoTab('classes')}>
            Go to Classes
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="school-students-panel">
      <div className="school-panel-head">
        <div>
          <h3>Students</h3>
          <p className="form-hint">Create accounts, share login details, and manage class rosters.</p>
        </div>
        <div className="school-panel-head-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!activeClass}
            onClick={() => {
              setShowBulk((v) => !v)
              setBulkResult(null)
            }}
          >
            {showBulk ? 'Close CSV' : 'Bulk CSV import'}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!activeClass}
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? 'Close form' : '+ Add student'}
          </button>
        </div>
      </div>

      {showBulk && activeClass && (
        <div className="school-bulk-import">
          <h4>Bulk CSV import — {activeClass.name}</h4>
          <p className="form-hint">
            Columns: <code>name</code>, optional <code>loginId</code>, <code>password</code>,{' '}
            <code>rollNo</code>. Blank login/password are auto-generated.
          </p>
          <div className="school-form-actions" style={{ marginBottom: '0.75rem' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
              Download template
            </button>
            <label className="btn btn-ghost btn-sm school-file-label">
              Upload CSV
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleCsvFile}
                className="sr-only"
              />
            </label>
          </div>
          <textarea
            className="school-bulk-textarea"
            value={bulkText}
            onChange={(e) => {
              setBulkText(e.target.value)
              setBulkResult(null)
            }}
            rows={8}
            spellCheck={false}
            aria-label="Roster CSV"
          />
          {bulkPreview && (
            <p
              className={
                bulkPreview.ok ? 'form-hint school-bulk-preview' : 'upload-error school-bulk-preview'
              }
            >
              {bulkPreview.ok
                ? bulkPreview.summary
                : bulkPreview.error || 'Fix CSV errors before importing.'}
            </p>
          )}
          <div className="school-form-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleBulkImport}
              disabled={!bulkPreview?.ok}
            >
              Import {bulkPreview?.ok ? `${bulkPreview.count} student(s)` : 'into class'}
            </button>
          </div>
          {bulkResult?.created?.length > 0 && (
            <div className="school-credentials-card">
              <strong>Created logins ({bulkResult.created.length})</strong>
              <ul className="school-bulk-result-list">
                {bulkResult.created.slice(0, 20).map((r) => (
                  <li key={r.id}>
                    {r.name} · <code>{r.loginId}</code> / <code>{r.password}</code>
                  </li>
                ))}
              </ul>
              {bulkResult.created.length > 20 && (
                <p className="form-hint">Showing first 20 — copy from list as needed.</p>
              )}
              {bulkResult.failed?.length > 0 && (
                <div className="school-bulk-failed">
                  <p className="upload-error">
                    {bulkResult.failed.length} row(s) failed (duplicate IDs or bad data):
                  </p>
                  <ul className="school-bulk-result-list">
                    {bulkResult.failed.slice(0, 10).map((f) => (
                      <li key={`${f.line}-${f.name}`}>
                        Line {f.line}: {f.name} — {f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="school-student-toolbar">
        <label className="school-field school-field--grow">
          <span className="sr-only">Class</span>
          <select
            value={activeClass?.id ?? ''}
            onChange={(e) => onSelectClass(e.target.value)}
          >
            {schoolClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.studentIds?.length ?? 0} students)
              </option>
            ))}
          </select>
        </label>
        <label className="school-field school-field--grow">
          <span className="sr-only">Search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or user ID…"
          />
        </label>
      </div>

      {createdCredentials && (
        <div className="school-credentials-card">
          <div className="school-credentials-head">
            <strong>Share these login details with {createdCredentials.name}</strong>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setCreatedCredentials(null)}
            >
              Dismiss
            </button>
          </div>
          <dl className="school-credentials-dl">
            <div>
              <dt>User ID</dt>
              <dd>
                <code>{createdCredentials.loginId}</code>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => copyText(createdCredentials.loginId, 'User ID')}
                >
                  Copy
                </button>
              </dd>
            </div>
            <div>
              <dt>Password</dt>
              <dd>
                <code>{createdCredentials.password}</code>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => copyText(createdCredentials.password, 'Password')}
                >
                  Copy
                </button>
              </dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>{createdCredentials.className}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              copyText(
                `User ID: ${createdCredentials.loginId}\nPassword: ${createdCredentials.password}\nClass: ${createdCredentials.className}`,
                'All details',
              )
            }
          >
            Copy all for WhatsApp / email
          </button>
        </div>
      )}

      {showAddForm && activeClass && (
        <div className="school-inline-form card-inner">
          <h4>New student — {activeClass.name}</h4>
          <ol className="school-wizard-steps">
            <li>Enter name</li>
            <li>Set or generate User ID &amp; password</li>
            <li>Create — student is added to this class automatically</li>
          </ol>
          <form onSubmit={handleCreateStudent} className="school-form-grid">
            <label className="school-field">
              <span>Full name</span>
              <input
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                required
              />
            </label>
            <label className="school-field">
              <span>User ID (login)</span>
              <input
                value={newStudentLoginId}
                onChange={(e) => setNewStudentLoginId(e.target.value)}
                placeholder="e.g. rahul.11a"
                required
                minLength={3}
              />
            </label>
            <label className="school-field">
              <span>Password</span>
              <input
                type="text"
                value={newStudentPassword}
                onChange={(e) => setNewStudentPassword(e.target.value)}
                placeholder="min 4 characters"
                required
                minLength={4}
              />
            </label>
            <div className="school-form-actions school-field--full">
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleGenerateCredentials}>
                Auto-generate ID &amp; password
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Create &amp; enroll
              </button>
            </div>
          </form>

          {availableStudents.length > 0 && (
            <div className="school-enroll-existing">
              <h5>Or add an existing student</h5>
              <div className="school-enroll-row">
                <select value={studentToAdd} onChange={(e) => setStudentToAdd(e.target.value)}>
                  <option value="">Select student…</option>
                  {availableStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.email})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!studentToAdd}
                  onClick={handleEnrollExisting}
                >
                  Add to class
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {filteredEnrolled.length === 0 ? (
        <div className="school-empty-state school-empty-state--compact">
          <span className="school-empty-icon" aria-hidden>🎓</span>
          <p>
            {search
              ? 'No students match your search.'
              : `No students in ${activeClass?.name ?? 'this class'} yet.`}
          </p>
          {!search && (
            <div className="school-form-actions" style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddForm(true)}
              >
                Add student
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setShowBulk(true)
                  setBulkResult(null)
                }}
              >
                Bulk CSV import
              </button>
            </div>
          )}
        </div>
      ) : (
        <ul className="school-student-list">
          {filteredEnrolled.map((s) => (
            <li key={s.id} className="school-student-card">
              <div className="school-student-avatar" aria-hidden>
                {studentInitials(s.name)}
              </div>
              <div className="school-student-info">
                <strong>{s.name}</strong>
                <code>{s.email}</code>
              </div>
              <div className="school-student-actions">
                {resettingStudentId === s.id ? (
                  <div className="school-reset-row">
                    <input
                      type="text"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="New password"
                      minLength={4}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => handleResetPassword(s.id)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setResettingStudentId(null)
                        setResetPassword('')
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => copyText(s.email, 'User ID')}
                    >
                      Copy ID
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setResettingStudentId(s.id)
                        setResetPassword(generateStudentCredentials(s.name).password)
                      }}
                    >
                      Reset password
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm school-btn-danger"
                      onClick={() => handleRemoveStudent(s.id)}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
