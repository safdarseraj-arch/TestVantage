import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { loadAdminAccount } from '../utils/auth'
import { teacherHomePath } from '../utils/permissions'
import {
  STUDENT_HOME_PATH,
  STUDENT_ONBOARDING_PATH,
  TEACHER_ONBOARDING_PATH,
  afterAuthPath,
} from '../utils/userProfiles'
import { DEMO_ACCOUNTS, ensureDemoAccounts, getDemoAdminHint } from '../utils/demoAccounts.js'
import { findUserByInviteCode, normalizeInviteCode } from '../utils/invites.js'

const STUDENT_HOME = STUDENT_HOME_PATH

function pathOnly(raw) {
  return String(raw ?? '').split('?')[0]
}

function isAuthPath(path) {
  const p = pathOnly(path)
  return !p || p === '/' || p === '/login' || p.startsWith('/login/')
}

function isStaffPath(path) {
  const p = pathOnly(path)
  return (
    p.startsWith('/admin') ||
    p.startsWith('/question-bank') ||
    p.startsWith('/teacher') ||
    p.startsWith('/merge-banks') ||
    p.startsWith('/create-test') ||
    p.startsWith('/edit-test')
  )
}

function loginReturnPath(state, roleHint = 'student') {
  const raw = typeof state?.from === 'string' ? state.from : ''
  const fallback =
    roleHint === 'admin' ? '/question-bank' : roleHint === 'teacher' ? '/teacher' : STUDENT_HOME
  if (!raw.startsWith('/') || isAuthPath(raw)) return fallback
  if (roleHint === 'student' && isStaffPath(raw)) return STUDENT_HOME
  return raw
}

function AuthContinuing({ to, title, detail, extra }) {
  return (
    <div className="page login-page auth-page">
      <Navigate to={to} replace />
      <div className="auth-shell auth-shell--continue">
        <div className="auth-form-panel">
          <div className="auth-form-header">
            <h1>{title}</h1>
            <p>{detail}</p>
          </div>
          <Link to={to} className="btn btn-primary auth-submit-btn">
            Continue
          </Link>
          {extra}
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  const { isAdmin, isUser, isTeacher, session, loginAsAdmin, loginAsUser, register, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const inviteFromUrl = normalizeInviteCode(searchParams.get('invite'))
  const rawFrom = typeof location.state?.from === 'string' ? location.state.from : ''
  const fromQuestionBank = rawFrom.startsWith('/question-bank')

  const initialMode = location.state?.admin || rawFrom.startsWith('/admin') || fromQuestionBank
    ? 'admin'
    : rawFrom.startsWith('/teacher') || location.state?.staff
      ? 'teacher'
      : 'student'
  const [mode, setMode] = useState(initialMode)
  const [isRegister, setIsRegister] = useState(Boolean(inviteFromUrl))
  const [inviteCode, setInviteCode] = useState(inviteFromUrl)
  const defaultAdmin = loadAdminAccount()
  const [name, setName] = useState('')
  const [email, setEmail] = useState(() => (initialMode === 'admin' ? defaultAdmin.email : ''))
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [demoBusy, setDemoBusy] = useState('')

  if (isAdmin) {
    const dest = fromQuestionBank ? rawFrom : '/question-bank'
    return (
      <AuthContinuing
        to={isAuthPath(dest) ? '/question-bank' : dest}
        title="Admin signed in"
        detail="Opening Question Bank. If this stays blank, tap Continue."
      />
    )
  }
  if (isTeacher && !location.state?.admin) {
    const dest = afterAuthPath(session, fromQuestionBank ? rawFrom : teacherHomePath(session?.permissions))
    return (
      <AuthContinuing
        to={isAuthPath(dest) ? '/teacher' : dest}
        title="Teacher signed in"
        detail={
          dest === TEACHER_ONBOARDING_PATH
            ? 'Opening your teacher profile. If this stays blank, tap Continue.'
            : 'Opening Teacher home. If this stays blank, tap Continue.'
        }
      />
    )
  }
  if (isUser && !isTeacher && !location.state?.admin) {
    const dest = afterAuthPath(session, loginReturnPath(location.state, 'student'))
    return (
      <AuthContinuing
        to={dest}
        title="You are signed in"
        detail={
          dest === STUDENT_ONBOARDING_PATH
            ? 'Opening your student profile. If this page stays here, tap Continue.'
            : 'Opening your student home. If this page stays here, tap Continue.'
        }
        extra={
          <button type="button" className="link-btn auth-continue-logout" onClick={logout}>
            Log out instead
          </button>
        }
      />
    )
  }

  const handleUserLogin = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (isRegister && (mode === 'student' || mode === 'teacher')) {
        const result = await register({
          name,
          email,
          password,
          role: mode === 'teacher' ? 'teacher' : 'user',
          inviteCode,
        })
        if (result.ok) {
          const dest =
            mode === 'teacher'
              ? afterAuthPath(result.session, TEACHER_ONBOARDING_PATH)
              : afterAuthPath(result.session, STUDENT_ONBOARDING_PATH)
          navigate(dest, { replace: true })
        } else {
          setError(result.error ?? 'Registration failed. Try a different email, or press F5 and sign in.')
        }
        return
      }
      const result = await loginAsUser(email, password)
      if (result.ok) {
        if (mode === 'teacher' && result.session?.role !== 'teacher') {
          logout()
          setError('This account is not a teacher. Use the Student tab, or ask an admin for a teacher login.')
          return
        }
        const dest = afterAuthPath(
          result.session,
          result.session?.role === 'teacher'
            ? fromQuestionBank
              ? rawFrom
              : teacherHomePath(result.session.permissions)
            : loginReturnPath(location.state, 'student'),
        )
        navigate(isAuthPath(dest) ? STUDENT_HOME : dest, { replace: true })
      } else setError(result.error ?? 'Login failed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed. Press F5 and try again.')
    }
  }

  const tryDemoAccount = async (key) => {
    const account = DEMO_ACCOUNTS.find((d) => d.key === key)
    if (!account || demoBusy) return
    setError('')
    setDemoBusy(key)
    try {
      ensureDemoAccounts()
      if (account.role === 'admin') {
        setMode('admin')
        setEmail(account.email)
        setPassword(account.password)
        const result = await loginAsAdmin(account.email, account.password)
        if (!result.ok) {
          setError(result.error ?? 'Demo admin sign-in failed. Press F5 and try again.')
          return
        }
        navigate('/question-bank', { replace: true })
        return
      }
      setMode(account.key === 'student' ? 'student' : 'teacher')
      setEmail(account.email)
      setPassword(account.password)
      const result = await loginAsUser(account.email, account.password)
      if (!result.ok) {
        setError(result.error ?? 'Demo sign-in failed. Press F5 and try again.')
        return
      }
      const dest = afterAuthPath(result.session, account.home)
      navigate(dest, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed. Press F5 and try again.')
    } finally {
      setDemoBusy('')
    }
  }

  const handleAdmin = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const result = await loginAsAdmin(email || defaultAdmin.email, password)
      if (result.ok) {
        const dest = fromQuestionBank ? rawFrom : '/question-bank'
        navigate(isAuthPath(dest) ? '/question-bank' : dest, { replace: true })
      } else setError(result.error ?? 'Login failed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin sign in failed. Press F5 and try again.')
    }
  }

  const isTeacherMode = mode === 'teacher'
  const isStudentMode = mode === 'student'
  const inviteHost = inviteFromUrl ? findUserByInviteCode(inviteFromUrl) : null

  return (
    <div className="page login-page auth-page">
      <div className="auth-shell">
        <div className="auth-brand-panel">
          <div className="auth-brand-glow" aria-hidden="true" />
          <span className="auth-brand-mark">TV</span>
          <h2>TestVantages Advanced</h2>
          <p className="auth-brand-lead">
            The complete JEE &amp; NEET mock platform — timed tests, MSQ partial marking, solution
            review, and smart question uploads.
          </p>
          <ul className="auth-feature-list">
            <li>NTA-style mocks with AI paper builder</li>
            <li>Full result analysis and percentile trends</li>
            <li>PYQ bank, speed drills, and syllabus practice</li>
          </ul>
          <div className="auth-brand-chips">
            <span className="auth-brand-chip">JEE Main</span>
            <span className="auth-brand-chip">JEE Advanced</span>
            <span className="auth-brand-chip">NEET</span>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-mode-tabs">
            <button
              type="button"
              className={mode === 'student' ? 'active' : ''}
              onClick={() => {
                setMode('student')
                setIsRegister(false)
                setError('')
              }}
            >
              Student
            </button>
            <button
              type="button"
              className={mode === 'teacher' ? 'active' : ''}
              onClick={() => {
                setMode('teacher')
                setIsRegister(false)
                setError('')
              }}
            >
              Teacher
            </button>
            <button
              type="button"
              className={mode === 'admin' ? 'active' : ''}
              onClick={() => {
                setMode('admin')
                setEmail(defaultAdmin.email)
                setIsRegister(false)
                setError('')
              }}
            >
              Admin
            </button>
          </div>

          {fromQuestionBank ? (
            <p className="form-hint" style={{ margin: '0 0 0.75rem' }}>
              Question Bank needs a <strong>Teacher</strong> or <strong>Admin</strong> sign-in.
              Students cannot open it.
            </p>
          ) : null}

          {isStudentMode || isTeacherMode ? (
            <>
              <div className="auth-form-header">
                <h1>
                  {isRegister
                    ? isTeacherMode
                      ? 'Create teacher account'
                      : 'Create account'
                    : isTeacherMode
                      ? 'Teacher sign in'
                      : 'Welcome back'}
                </h1>
                <p>
                  {isTeacherMode
                    ? isRegister
                      ? 'Register free, then finish a short profile. Your bank, lecture plan, and papers turn on. Official PYQ approve stays with admin.'
                      : fromQuestionBank
                        ? 'Use your teacher email and password. After sign-in you open Question Bank.'
                        : 'Use your teacher email and password, or register free. After sign-in you land on Teacher home.'
                    : 'Use the user ID and password from your school admin, or register with your email.'}
                </p>
              </div>
              <form onSubmit={handleUserLogin}>
                {isRegister && (isStudentMode || isTeacherMode) && (
                  <label>
                    Full name
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </label>
                )}
                <label>
                  User ID or email
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={4}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                  />
                </label>
                {isRegister && (isStudentMode || isTeacherMode) ? (
                  <label>
                    Invite code (optional)
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(normalizeInviteCode(e.target.value))}
                      autoComplete="off"
                      placeholder="From a teacher or friend"
                    />
                  </label>
                ) : null}
                {inviteHost ? (
                  <p className="form-hint">
                    Invited by <strong>{inviteHost.name || 'a TestVantages account'}</strong>. Register
                    to join.
                  </p>
                ) : null}
                {error && <p className="upload-error">{error}</p>}
                <button type="submit" className="btn btn-primary auth-submit-btn">
                  {isRegister
                    ? isTeacherMode
                      ? 'Register teacher'
                      : 'Register & continue'
                    : isTeacherMode
                      ? 'Teacher sign in'
                      : 'Sign in'}
                </button>
              </form>
              <p className="auth-toggle">
                {isRegister ? (
                  <>
                    Already have an account?{' '}
                    <button type="button" className="link-btn" onClick={() => setIsRegister(false)}>
                      Sign in
                    </button>
                  </>
                ) : (
                  <>
                    New here?{' '}
                    <button type="button" className="link-btn" onClick={() => setIsRegister(true)}>
                      Register free
                    </button>
                  </>
                )}
              </p>
              {isStudentMode ? (
                <Link to="/tests" className="auth-guest-link">
                  Continue without login →
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <div className="auth-form-header">
                <h1>Admin access</h1>
                <p>
                  {fromQuestionBank
                    ? 'Sign in to open Question Bank (uploads, review, and papers).'
                    : 'Question bank, uploads &amp; test builder.'}
                </p>
              </div>
              <form onSubmit={handleAdmin}>
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
                {error && <p className="upload-error">{error}</p>}
                <button type="submit" className="btn btn-primary auth-submit-btn">
                  Admin sign in
                </button>
              </form>
            </>
          )}

          <div className="auth-demo-panel">
            <p className="auth-demo-lead">
              <strong>Demo logins</strong> — practice accounts so you can try the product as a
              student, teacher, school staff, or admin. They are labeled Demo, not real people.
            </p>
            <div className="auth-demo-try">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.key}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-testid={`demo-login-${account.key}`}
                  disabled={!!demoBusy}
                  onClick={() => {
                    void tryDemoAccount(account.key)
                  }}
                >
                  {demoBusy === account.key ? 'Signing in…' : `Try as ${account.label.toLowerCase()}`}
                </button>
              ))}
            </div>
            <ul className="auth-demo-creds">
              {DEMO_ACCOUNTS.map((account) => {
                const adminHint = account.role === 'admin' ? getDemoAdminHint() : null
                return (
                  <li key={account.key}>
                    <strong>{account.label}:</strong> {adminHint?.email || account.email} /{' '}
                    {adminHint?.password || account.password}
                    <span className="auth-demo-home"> — {account.hint}</span>
                  </li>
                )
              })}
            </ul>
          </div>

          <Link to="/" className="auth-footer-link">
            ← Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
