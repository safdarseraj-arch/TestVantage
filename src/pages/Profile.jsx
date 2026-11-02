import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PortalPage from '../components/PortalPage'
import StudentProfileFields from '../components/StudentProfileFields'
import TeacherProfileFields from '../components/TeacherProfileFields'
import { getUserById } from '../utils/users'
import {
  countReferralsForUser,
  inviteCodeForUser,
  inviteSignupPath,
  persistInviteCode,
} from '../utils/invites.js'
import {
  STUDENT_HOME_PATH,
  TEACHER_HOME_PATH,
  completeStudentProfile,
  completeTeacherProfile,
  currentCalendarYear,
} from '../utils/userProfiles'

function emptyStudent(nowY) {
  return {
    dob: '',
    fatherName: '',
    fatherPhone: '',
    tenthMarks: '',
    tenthYear: '',
    academicStatus: '',
    school: '',
    targetExams: [],
    targetYear: String(nowY + 1),
  }
}

function emptyTeacher() {
  return { dob: '', subjects: [], standards: [], experience: '' }
}

function studentFromStored(profile, nowY) {
  const base = emptyStudent(nowY)
  if (!profile) return base
  return {
    dob: profile.dob ?? '',
    fatherName: profile.fatherName ?? '',
    fatherPhone: profile.fatherPhone ?? '',
    tenthMarks: profile.tenthMarks != null ? String(profile.tenthMarks) : '',
    tenthYear: profile.tenthYear != null ? String(profile.tenthYear) : '',
    academicStatus: profile.academicStatus ?? '',
    school: profile.school ?? '',
    targetExams: Array.isArray(profile.targetExams) ? [...profile.targetExams] : [],
    targetYear: profile.targetYear != null ? String(profile.targetYear) : String(nowY + 1),
  }
}

function teacherFromStored(profile) {
  const base = emptyTeacher()
  if (!profile) return base
  return {
    dob: profile.dob ?? '',
    subjects: Array.isArray(profile.subjects) ? [...profile.subjects] : [],
    standards: Array.isArray(profile.standards) ? [...profile.standards] : [],
    experience: profile.experience ?? '',
  }
}

export default function Profile() {
  const { session, isUser, isTeacher, isAdmin, refresh } = useAuth()
  const nowY = currentCalendarYear()
  const stored = session?.userId ? getUserById(session.userId) : null
  const isStudent = isUser && !isTeacher && !isAdmin

  const [student, setStudent] = useState(() => studentFromStored(stored?.profile, nowY))
  const [teacher, setTeacher] = useState(() => teacherFromStored(stored?.profile))
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inviteCopied, setInviteCopied] = useState(false)
  const inviteCode = session?.userId ? inviteCodeForUser(session.userId) : ''
  const inviteLink = inviteCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}${inviteSignupPath(inviteCode)}`
    : ''
  const referralCount = session?.userId ? countReferralsForUser(session.userId) : 0

  useEffect(() => {
    if (session?.userId) persistInviteCode(session.userId)
  }, [session?.userId])

  const homeTo = useMemo(() => {
    if (isTeacher) return TEACHER_HOME_PATH
    if (isAdmin) return '/question-bank'
    return STUDENT_HOME_PATH
  }, [isAdmin, isTeacher])

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (isAdmin && !isTeacher && !isUser) {
    return (
      <PortalPage
        role="admin"
        eyebrow="Account"
        title="Admin profile"
        subtitle="Founder admin credentials are managed in Admin settings — not this student/teacher form."
        actions={
          <Link to="/admin" className="btn btn-primary btn-sm">
            Open Admin
          </Link>
        }
        className="profile-page"
      >
        <section className="card profile-readonly">
          <p>
            Signed in as <strong>{session.name || 'Admin'}</strong>
            {session.email ? ` · ${session.email}` : ''}.
          </p>
          <Link to="/admin" className="btn btn-ghost btn-sm">
            Change admin email or password
          </Link>
        </section>
      </PortalPage>
    )
  }

  if (!isStudent && !isTeacher) {
    return <Navigate to={homeTo} replace />
  }

  const onStudentChange = (field, value) => {
    setSaved(false)
    setError('')
    setStudent((prev) => ({ ...prev, [field]: value }))
  }

  const onTeacherChange = (field, value) => {
    setSaved(false)
    setError('')
    setTeacher((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setSaved(false)
    setSaving(true)
    const result = isTeacher
      ? completeTeacherProfile(session.userId, teacher)
      : completeStudentProfile(session.userId, student)
    setSaving(false)
    if (!result.ok) {
      setError(result.error ?? 'Could not save. Check the fields and try again.')
      return
    }
    refresh()
    setSaved(true)
  }

  return (
    <PortalPage
      role={isTeacher ? 'teacher' : 'student'}
      eyebrow="Your account"
      title="Profile"
      subtitle={
        isTeacher
          ? 'View and update the teaching details from sign-up. Changes save to your TestVantages account.'
          : 'View and update the details from sign-up. Changes save to your TestVantages account.'
      }
      actions={
        <Link to={homeTo} className="btn btn-ghost btn-sm">
          Back to home
        </Link>
      }
      className="profile-page"
    >
      <section className="card profile-card">
        <p className="profile-identity">
          <strong>{session.name || 'Account'}</strong>
          {session.email ? <span> · {session.email}</span> : null}
        </p>
        <form onSubmit={handleSubmit} className="onboarding-form profile-edit-form">
          {isTeacher ? (
            <TeacherProfileFields values={teacher} onChange={onTeacherChange} />
          ) : (
            <StudentProfileFields values={student} onChange={onStudentChange} />
          )}

          {error ? <p className="upload-error">{error}</p> : null}
          {saved ? (
            <p className="profile-saved" role="status">
              Profile saved.
            </p>
          ) : null}

          <button type="submit" className="btn btn-primary auth-submit-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      {inviteCode ? (
        <section className="card profile-card" data-testid="profile-invite-card">
          <h2 className="profile-invite-title">Invite friends</h2>
          <p className="form-hint">
            Share your code. When they register at login with this code, they are marked as invited
            by you. This does not change their password or your question bank.
          </p>
          <p>
            Your code: <strong>{inviteCode}</strong>
          </p>
          <p className="form-hint">Link: {inviteLink}</p>
          <p className="form-hint">
            People who joined with your code: <strong>{referralCount}</strong>
          </p>
          {stored?.referredByName ? (
            <p className="form-hint">You joined from {stored.referredByName}.</p>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(inviteLink || inviteCode)
                setInviteCopied(true)
              } catch {
                setInviteCopied(false)
              }
            }}
          >
            {inviteCopied ? 'Copied' : 'Copy invite link'}
          </button>
        </section>
      ) : null}
    </PortalPage>
  )
}
