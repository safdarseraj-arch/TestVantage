import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TeacherProfileFields from '../components/TeacherProfileFields'
import {
  TEACHER_HOME_PATH,
  completeTeacherProfile,
  needsTeacherOnboarding,
} from '../utils/userProfiles'

export default function TeacherOnboarding() {
  const { session, isTeacher, isAdmin, refresh } = useAuth()
  const [values, setValues] = useState({
    dob: '',
    subjects: [],
    standards: [],
    experience: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  if (!session || !isTeacher || isAdmin) {
    return (
      <div className="page login-page auth-page onboarding-page">
        <Navigate to="/login" state={{ staff: true }} replace />
        <div className="auth-shell auth-shell--continue">
          <div className="auth-form-panel">
            <div className="auth-form-header">
              <h1>Teacher sign in needed</h1>
              <p>If this page stays empty, tap Continue. Then finish your teacher profile.</p>
            </div>
            <Link to="/login" state={{ staff: true }} className="btn btn-primary auth-submit-btn">
              Continue to teacher sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }
  if (done || !needsTeacherOnboarding(session)) {
    return (
      <div className="page login-page auth-page onboarding-page">
        <Navigate to={TEACHER_HOME_PATH} replace />
        <div className="auth-shell auth-shell--continue">
          <div className="auth-form-panel">
            <div className="auth-form-header">
              <h1>Teacher tools ready</h1>
              <p>Opening Teacher home. If this stays here, tap Continue.</p>
            </div>
            <Link to={TEACHER_HOME_PATH} className="btn btn-primary auth-submit-btn">
              Continue to teacher home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const result = completeTeacherProfile(session.userId, values)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'Could not save. Check the fields and try again.')
      return
    }
    refresh()
    setDone(true)
  }

  return (
    <div className="page login-page auth-page onboarding-page">
      <div className="auth-shell onboarding-shell">
        <div className="auth-brand-panel">
          <div className="auth-brand-glow" aria-hidden="true" />
          <span className="auth-brand-mark">TV</span>
          <h2>Finish your teacher profile</h2>
          <p className="auth-brand-lead">
            After this page, your own question bank, lecture plan, and paper tools turn on. Official
            PYQ approve stays with the founder admin.
          </p>
          <ul className="auth-feature-list">
            <li>Create and upload to your bank</li>
            <li>Lecture planner and bank management</li>
            <li>Make papers, generate, and PDF</li>
          </ul>
        </div>

        <div className="auth-form-panel onboarding-form-panel">
          <div className="auth-form-header">
            <h1>Teaching details</h1>
            <p>
              Welcome{session.name ? `, ${session.name.split(' ')[0]}` : ''}. Date of birth, subjects,
              and class are required. Experience is optional.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="onboarding-form">
            <TeacherProfileFields
              values={values}
              onChange={(field, value) => setValues((prev) => ({ ...prev, [field]: value }))}
            />

            {error ? <p className="upload-error">{error}</p> : null}

            <button type="submit" className="btn btn-primary auth-submit-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save and open teacher tools'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
