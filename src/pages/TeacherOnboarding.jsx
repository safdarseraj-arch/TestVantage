import { useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TeacherProfileFields from '../components/TeacherProfileFields'
import {
  FACULTY_ONBOARDING_MODES,
  lookupSchoolInvite,
  readRememberedSchoolInvite,
  rememberSchoolInvite,
} from '../utils/facultyWorkbench'
import {
  TEACHER_HOME_PATH,
  completeTeacherProfile,
  needsTeacherOnboarding,
} from '../utils/userProfiles'

function initialValuesFromInvite(rawCode) {
  const invite = lookupSchoolInvite(rawCode)
  if (!invite) {
    return {
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
  }
  rememberSchoolInvite(invite.code)
  return {
    dob: '',
    subjects: [],
    standards: [],
    experience: '',
    onboardingMode: FACULTY_ONBOARDING_MODES.SCHOOL,
    examSpecializations: [],
    schoolInviteCode: invite.code,
    campusName: invite.campusName,
    department: invite.department,
    schoolClasses: [...(invite.classes || [])],
    watermarkText: '',
    paperHeaderText: '',
    signatureDataUrl: '',
  }
}

export default function TeacherOnboarding() {
  const { session, isTeacher, isAdmin, refresh } = useAuth()
  const [searchParams] = useSearchParams()
  const inviteFromUrl =
    searchParams.get('schoolInvite') || searchParams.get('invite') || readRememberedSchoolInvite()
  const [values, setValues] = useState(() => initialValuesFromInvite(inviteFromUrl))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  const pathHint = useMemo(() => {
    if (values.onboardingMode === FACULTY_ONBOARDING_MODES.SCHOOL) {
      return 'School path — campus rights and school bank submit after you save.'
    }
    return 'Independent path — Personal Vault and branded papers for your own batches.'
  }, [values.onboardingMode])

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
    const result = completeTeacherProfile(session.userId, {
      ...values,
      suggestName: session.name,
    })
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
              Welcome{session.name ? `, ${session.name.split(' ')[0]}` : ''}. {pathHint}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="onboarding-form">
            <TeacherProfileFields
              values={values}
              onChange={(field, value) => {
                setValues((prev) => {
                  const next = { ...prev, [field]: value }
                  if (field === 'schoolInviteCode') {
                    const hit = lookupSchoolInvite(value)
                    if (hit) {
                      rememberSchoolInvite(hit.code)
                      return {
                        ...next,
                        onboardingMode: FACULTY_ONBOARDING_MODES.SCHOOL,
                        schoolInviteCode: hit.code,
                        campusName: prev.campusName || hit.campusName,
                        department: prev.department || hit.department,
                        schoolClasses:
                          prev.schoolClasses?.length > 0 ? prev.schoolClasses : [...hit.classes],
                      }
                    }
                  }
                  if (field === 'onboardingMode' && value === FACULTY_ONBOARDING_MODES.SCHOOL) {
                    const remembered = readRememberedSchoolInvite()
                    if (remembered && !next.schoolInviteCode) {
                      const hit = lookupSchoolInvite(remembered)
                      if (hit) {
                        return {
                          ...next,
                          schoolInviteCode: hit.code,
                          campusName: hit.campusName,
                          department: hit.department,
                          schoolClasses: [...hit.classes],
                        }
                      }
                    }
                  }
                  return next
                })
              }}
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
