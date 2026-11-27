import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PortalPage from '../components/PortalPage.jsx'
import { PERMS } from '../utils/permissions'
import { teacherUploadLinks, questionBankUploadUrl } from '../utils/questionBankUploadRoutes.js'
import { canAccessMainQuestionBank } from '../utils/teacherQuestionBank.js'
import { getUserById } from '../utils/users.js'
import { TEACHER_STANDARDS, TEACHER_SUBJECTS } from '../utils/userProfiles.js'
import {
  FACULTY_EXAM_SPECIALIZATIONS,
  FACULTY_MODE_LABELS,
  FACULTY_ONBOARDING_MODES,
  facultyModeFromProfile,
  personalVaultBlurb,
  summarizeEntitlements,
} from '../utils/facultyWorkbench.js'

const UPLOAD = teacherUploadLinks({ from: 'teacher' })

const PRIMARY_CARDS = [
  {
    id: 'bank',
    to: '/question-bank?hub=view&view=draft&owner=teacher',
    icon: '📚',
    title: 'Personal Vault',
    desc: 'Your private teacher-owned question bank — portable IP.',
    cta: 'Open vault',
    perms: [PERMS.UPLOAD_QUESTIONS],
    accent: '#1d4ed8',
  },
  {
    id: 'upload',
    to: UPLOAD.root,
    icon: '⬆️',
    title: 'Upload to vault',
    desc: 'Add questions from text, image, PDF, Word, CSV, or JSON.',
    cta: 'Upload questions',
    perms: [PERMS.UPLOAD_QUESTIONS],
    accent: '#7c3aed',
  },
  {
    id: 'planner',
    to: '/teacher/lecture-planner',
    icon: '📋',
    title: 'Lecture plan',
    desc: 'Plan the class, pick bank questions, and draft topic notes.',
    cta: 'Open planner',
    perms: [PERMS.UPLOAD_QUESTIONS],
    accent: '#0369a1',
  },
  {
    id: 'paper',
    to: '/create-test?pool=mine',
    icon: '📝',
    title: 'Paper making',
    desc: 'Build a timed mock from your bank, chapter by chapter.',
    cta: 'Make a paper',
    perms: [PERMS.CREATE_PAPER],
    accent: '#0f766e',
  },
  {
    id: 'generate',
    to: '/create-test?pool=mine',
    icon: '⚡',
    title: 'Generate paper',
    desc: 'Auto-generate a paper from your syllabus and question pool.',
    cta: 'Generate',
    perms: [PERMS.CREATE_PAPER],
    accent: '#b45309',
  },
  {
    id: 'pdf',
    to: '/edit-test',
    icon: '🖨️',
    title: 'PDF',
    desc: 'Open a paper and print or save it as PDF for class.',
    cta: 'Open papers',
    perms: [PERMS.CREATE_PAPER],
    accent: '#334155',
  },
]

function labelList(ids, catalog) {
  return (ids ?? [])
    .map((id) => catalog.find((row) => row.id === id)?.label)
    .filter(Boolean)
}

function greetingLine(name) {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = String(name ?? 'Teacher').trim().split(/\s+/)[0] || 'Teacher'
  return `${part}, ${first}`
}

/**
 * Teacher landing hub after login — everyday teaching tools, not server deployment.
 */
const FIRST_RUN_KEY = 'tv_teacher_hub_first_run_dismissed'

export default function TeacherHub() {
  const { isAdmin, isTeacher, isLoggedIn, hasPermission, session } = useAuth()
  const [firstRunHidden, setFirstRunHidden] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(FIRST_RUN_KEY) === '1'
    } catch {
      return false
    }
  })

  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: '/teacher' }} replace />
  }
  if (!isTeacher && !isAdmin) {
    return <Navigate to="/home" replace />
  }

  const stored = session?.userId ? getUserById(session.userId) : null
  const profile = stored?.profile
  const subjects = labelList(profile?.subjects, TEACHER_SUBJECTS)
  const standards = labelList(profile?.standards, TEACHER_STANDARDS)
  const exams = labelList(profile?.examSpecializations, FACULTY_EXAM_SPECIALIZATIONS)
  const fullName = session?.name?.trim() || 'Teacher'
  const facultyMode =
    facultyModeFromProfile(profile) || FACULTY_ONBOARDING_MODES.INDEPENDENT
  const entitlements = profile?.entitlements || null
  const entitlementSummary = summarizeEntitlements(entitlements)

  const accessMain = isAdmin || canAccessMainQuestionBank(session)
  const cards = PRIMARY_CARDS.filter((card) => card.perms.some((p) => hasPermission(p)))
  const showFirstRun =
    !firstRunHidden &&
    Boolean(profile?.personalVaultOwned) &&
    hasPermission(PERMS.UPLOAD_QUESTIONS)

  const dismissFirstRun = () => {
    try {
      localStorage.setItem(FIRST_RUN_KEY, '1')
    } catch {
      /* ignore */
    }
    setFirstRunHidden(true)
  }

  return (
    <PortalPage
      role="teacher"
      eyebrow="Teacher home"
      title={greetingLine(fullName)}
      subtitle="Personal Vault, lecture plan, and papers — student mocks stay under Practice."
      actions={
        <>
          <Link to="/earn#promo-gallery" className="btn btn-primary btn-sm">
            Refer &amp; earn
          </Link>
          <Link to="/profile" className="btn btn-ghost btn-sm">
            Profile
          </Link>
        </>
      }
      className="teacher-hub-page"
    >
      <section className="teacher-hub-hero">
        <div>
          {(subjects.length || standards.length || exams.length) ? (
            <div className="teacher-hub-welcome-chips">
              {subjects.map((s) => (
                <span key={s} className="teacher-hub-welcome-chip">
                  {s}
                </span>
              ))}
              {standards.map((s) => (
                <span key={`st-${s}`} className="teacher-hub-welcome-chip teacher-hub-welcome-chip--muted">
                  {s}
                </span>
              ))}
              {exams.map((label) => (
                <span key={`ex-${label}`} className="teacher-hub-welcome-chip teacher-hub-welcome-chip--muted">
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <p className="teacher-hub-hero-lead">
              Pick a tool below, or upload questions to your Personal Vault.
            </p>
          )}
          {facultyMode === FACULTY_ONBOARDING_MODES.SCHOOL && profile?.campusName ? (
            <p className="form-hint" style={{ marginTop: '0.55rem' }}>
              {FACULTY_MODE_LABELS[facultyMode]} · <strong>{profile.campusName}</strong>
              {profile.department ? ` · ${profile.department}` : ''}
            </p>
          ) : (
            <p className="form-hint" style={{ marginTop: '0.55rem' }}>
              {FACULTY_MODE_LABELS[facultyMode]}
              {facultyMode === FACULTY_ONBOARDING_MODES.INDEPENDENT
                ? ' · Join a school anytime from Profile'
                : ''}
            </p>
          )}
        </div>
        <Link to={questionBankUploadUrl({ owner: 'teacher', from: 'teacher' })} className="btn btn-primary">
          Upload questions
        </Link>
      </section>

      {showFirstRun ? (
        <section className="card teacher-first-run" aria-label="Get started">
          <div className="teacher-workbench-strip-head">
            <h2>Get started</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={dismissFirstRun}>
              Dismiss
            </button>
          </div>
          <ol className="teacher-first-run-list">
            <li>
              <Link to="/question-bank?hub=view&view=draft&owner=teacher">Open Personal Vault</Link>
            </li>
            <li>
              <Link to={questionBankUploadUrl({ owner: 'teacher', from: 'teacher' })}>
                Upload questions
              </Link>
            </li>
            <li>
              <Link to="/create-test?pool=mine">Make a paper</Link>
            </li>
          </ol>
        </section>
      ) : null}

      <details className="card teacher-workbench-strip" aria-label="Faculty workbench details">
        <summary className="teacher-workbench-summary">
          <span>Vault &amp; plan rights</span>
          <span className="form-hint">
            {entitlementSummary.onLabels.length} on
            {entitlementSummary.offCount ? ` · ${entitlementSummary.offCount} locked` : ''}
            {entitlements ? ` · OCR ${entitlementSummary.ocrQuota}/mo` : ''}
          </span>
        </summary>
        <p className="form-hint">{personalVaultBlurb(facultyMode)}</p>
        {!accessMain && hasPermission(PERMS.UPLOAD_QUESTIONS) ? (
          <p className="form-hint">Uploads stay in your vault and also reach the admin Review queue.</p>
        ) : null}
        {entitlements ? (
          <ul className="teacher-entitlement-list">
            {entitlementSummary.onLabels.map((label) => (
              <li key={label} className="is-on">
                {label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="form-hint">
            Finish <Link to="/onboarding/teacher">faculty onboarding</Link> to set pathway rights.
          </p>
        )}
        {(profile?.watermarkText || profile?.paperHeaderText) && (
          <p className="form-hint">
            Branding set in <Link to="/profile">Profile</Link>
            {profile.paperHeaderText ? ` · ${profile.paperHeaderText}` : ''}
            {profile.watermarkText ? ` · ${profile.watermarkText}` : ''}
          </p>
        )}
      </details>

      {cards.length > 0 ? (
        <div className="teacher-hub-grid teacher-hub-grid--six">
          {cards.map((card) => (
            <article
              key={card.id}
              className="teacher-hub-card"
              style={{ '--hub-accent': card.accent }}
            >
              <Link to={card.to} className="teacher-hub-card-main">
                <span className="teacher-hub-icon" aria-hidden="true">
                  {card.icon}
                </span>
                <h2>{card.title}</h2>
                <p>{card.desc}</p>
                <span className="teacher-hub-cta">{card.cta} →</span>
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <section className="card">
          <p className="form-hint">
            Your teacher account does not have upload or paper permissions yet. Ask an admin to turn
            those on.
          </p>
        </section>
      )}
    </PortalPage>
  )
}
