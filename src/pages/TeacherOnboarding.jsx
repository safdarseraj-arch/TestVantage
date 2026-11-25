import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TeacherProfileFields from '../components/TeacherProfileFields'
import { FACULTY_ONBOARDING_MODES } from '../utils/facultyWorkbench'
import {
  TEACHER_HOME_PATH,
  completeTeacherProfile,
  needsTeacherOnboarding,
} from '../utils/userProfiles'

const EMPTY = {
  dob: '',
  subjects: [],
  standards: [],
  experience: '',
  onboardingMode: FACULTY_ONBOARDING_MODES.INDEPENDENT,
  examSpecializations: [],
  schoolInviteCode: '',
  campusName: '',
  department: '',
  schoolClasses: [],
  watermarkText: '',
  paperHeaderText: '',
  signatureDataUrl: '',
}

export default function TeacherOnboarding() {
  const { session, isTeacher, isAdmin, refresh } = useAuth()
  const [values, setValues] = useState(EMPTY)
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
              <h1>Faculty workbench ready</h1>
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
          <h2>Faculty onboarding</h2>
          <p className="auth-brand-lead">
            School-invited or independent — finish this once to open your Personal Vault, lecture
            plan, and paper tools. Official PYQ approve stays with the founder admin.
          </p>
          <ul className="auth-feature-list">
            <li>Path A: school invite → campus + school bank</li>
            <li>Path B: independent → personal batches &amp; vault</li>
            <li>Your Personal Vault IP stays portable</li>
          </ul>
        </div>

        <div className="auth-form-panel onboarding-form-panel">
          <div className="auth-form-header">
            <h1>Set up your workbench</h1>
            <p>
              Welcome{session.name ? `, ${session.name.split(' ')[0]}` : ''}. Choose school-invited
              or independent, then subjects and class.
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
