import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import StudentProfileFields from '../components/StudentProfileFields'
import {
  STUDENT_HOME_PATH,
  completeStudentProfile,
  currentCalendarYear,
  needsStudentOnboarding,
} from '../utils/userProfiles'

export default function StudentOnboarding() {
  const { session, isUser, isTeacher, isAdmin, refresh } = useAuth()
  const nowY = currentCalendarYear()

  const [values, setValues] = useState({
    dob: '',
    fatherName: '',
    fatherPhone: '',
    tenthMarks: '',
    tenthYear: '',
    academicStatus: '',
    school: '',
    targetExams: [],
    targetYear: String(nowY + 1),
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  if (!session || !isUser || isTeacher || isAdmin) {
    return (
      <div className="page login-page auth-page onboarding-page">
        <Navigate to="/login" replace />
        <div className="auth-shell auth-shell--continue">
          <div className="auth-form-panel">
            <div className="auth-form-header">
              <h1>Sign in to finish your profile</h1>
              <p>If this page stays empty, tap Continue. Do not stay on a blank login screen.</p>
            </div>
            <Link to="/login" className="btn btn-primary auth-submit-btn">
              Continue to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }
  if (done || !needsStudentOnboarding(session)) {
    return (
      <div className="page login-page auth-page onboarding-page">
        <Navigate to={STUDENT_HOME_PATH} replace />
        <div className="auth-shell auth-shell--continue">
          <div className="auth-form-panel">
            <div className="auth-form-header">
              <h1>Profile saved</h1>
              <p>Opening your student home. If this stays here, tap Continue.</p>
            </div>
            <Link to={STUDENT_HOME_PATH} className="btn btn-primary auth-submit-btn">
              Continue to student home
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
    const result = completeStudentProfile(session.userId, values)
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
          <h2>Finish your student profile</h2>
          <p className="auth-brand-lead">
            One short form so we can match mocks, PYQ, and your exam year. Required before student
            home.
          </p>
          <ul className="auth-feature-list">
            <li>Date of birth and parent contact</li>
            <li>Class 10 marks and current class</li>
            <li>JEE Main, Advanced, or NEET + year</li>
          </ul>
        </div>

        <div className="auth-form-panel onboarding-form-panel">
          <div className="auth-form-header">
            <h1>Student details</h1>
            <p>
              Welcome{session.name ? `, ${session.name.split(' ')[0]}` : ''}. Fill every field, then
              open your home.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="onboarding-form">
            <StudentProfileFields
              values={values}
              onChange={(field, value) => setValues((prev) => ({ ...prev, [field]: value }))}
            />

            {error ? <p className="upload-error">{error}</p> : null}

            <button type="submit" className="btn btn-primary auth-submit-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save and open student home'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
