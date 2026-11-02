import { useMemo } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { EXAM_PATTERNS } from '../data/examPatterns'
import { getExamPattern, getPatternMarkingLabel } from '../data/examPatterns'
import { getTestType } from '../data/testTypes'
import { filterTests } from '../data/tests'
import { PERMS } from '../utils/permissions'
import { getAssignedTestIdsForClasses } from '../utils/assignmentsStore'
import { getClassesForStudent } from '../utils/classesStore'
import { getUserById } from '../utils/users'
import { getAttemptsByOwner, getOwnerKey } from '../utils/attemptHistory'
import { buildMasteryGraph } from '../utils/aiMastery.js'
import StudentNotificationsBanner from '../components/StudentNotificationsBanner.jsx'
import { isDemoStudentIdentity, DEMO_SAMPLE_TEST_IDS, STAFF_WORKING_TEST_ID } from '../utils/demoStudentAccess.js'

const FEATURED_ACTIONS = [
  {
    to: '/form-forecast',
    icon: '🎯',
    title: 'Form Forecast',
    desc: 'Practice AIR, Exam Fit /100, Revision Ladder, Precision Map & Insight Coach.',
    cta: 'Open Form Forecast →',
    accent: '#b45309',
    primary: true,
  },
  {
    to: '/career-compass',
    icon: '🧭',
    title: 'Career Compass',
    desc: 'Exam-day marks → AIR → colleges & choice filling for JEE + NEET.',
    cta: 'Open Career Compass →',
    accent: '#0284c7',
  },
  {
    to: '/todays-drill',
    icon: '🗓️',
    title: 'Today’s Drill',
    desc: 'One mixed daily set — habit under the Compete tab.',
    cta: 'Start Today’s Drill →',
    accent: '#0f766e',
  },
]

const STUDENT_PILLARS = [
  {
    icon: '📝',
    label: 'Prepare',
    links: [
      { to: '/prepare', icon: '🎓', label: 'Prepare centre', desc: 'All prepare modes' },
      { to: '/mock-test', icon: '🎯', label: 'AI Mock Builder', desc: 'AI paper · your syllabus' },
      { to: '/tests', icon: '📋', label: 'Mock tests', desc: 'Assigned & sample papers' },
      { to: '/practice', icon: '📖', label: 'Syllabus practice', desc: 'Mixed chapters · no timer' },
      { to: '/speed-test', icon: '⚡', label: 'Speed test', desc: '15–60 min timed drill' },
      { to: '/cdf-test', icon: '⏱️', label: 'CDF test', desc: 'Concept, Definition & Formula' },
      { to: '/quick-revision', icon: '📝', label: 'Quick Revision', desc: 'Definitions & formulas by chapter' },
      { to: '/formula-sheet', icon: '📌', label: 'My Formula Sheet', desc: 'Pin formulas you keep forgetting' },
      { to: '/daily-target', icon: '🎯', label: 'Today’s Target', desc: 'Clear backlog chapters today' },
      { to: '/pyq', icon: '📅', label: 'PYQ bank', desc: 'Previous year · six modes' },
    ],
  },
  {
    icon: '📊',
    label: 'Insights',
    links: [
      { to: '/my-results', icon: '📋', label: 'My results', desc: 'Full attempt history' },
      { to: '/analytics', icon: '📈', label: 'Analytics', desc: 'Trends · streak · study path' },
      { to: '/form-forecast', icon: '🎯', label: 'Form Forecast', desc: 'Practice AIR · Exam Fit · coach' },
      { to: '/career-compass', icon: '🧭', label: 'Career Compass', desc: 'Exam-day AIR · colleges' },
      { to: '/leaderboard', icon: '🏆', label: 'Leaderboard', desc: 'Real attempt standings' },
      { to: '/exam-pulse', icon: '📡', label: 'Exam Pulse', desc: 'Exams · admissions · focus' },
      { to: '/profile', icon: '👤', label: 'Profile & invites', desc: 'Your details · share invite code' },
    ],
  },
  {
    icon: '🔗',
    label: 'Compete',
    links: [
      { to: '/todays-drill', icon: '🗓️', label: 'Today’s Drill', desc: 'Daily mixed set' },
      { to: '/peer-pulse', icon: '🔗', label: 'Peer Pulse', desc: 'Spar Code · one peer' },
      { to: '/merit-stride', icon: '✨', label: 'Merit Stride', desc: 'Points · badges · focus' },
      { to: '/study-circle', icon: '👥', label: 'Study Circle', desc: 'Cohort Code rooms' },
      { to: '/doubts', icon: '💬', label: 'Ask Your Doubt', desc: 'Doubt on a question' },
    ],
  },
]

const TRUST_ITEMS = [
  { icon: '📝', title: 'NTA-style patterns', desc: 'JEE Main, Advanced & NEET with correct marking.' },
  { icon: '🤖', title: 'AI paper builder', desc: 'Calibrated mocks from your syllabus in minutes.' },
  { icon: '📊', title: 'Deep result analysis', desc: '15+ metrics, weak areas, and percentile trends.' },
  { icon: '🏫', title: 'School-ready', desc: 'Teachers upload, assign, and track attempts.' },
]

const EXPLORE_LINKS = [
  { to: '/tour', label: 'TestVantages Tour', primary: true },
  { to: '/prepare', label: 'Prepare centre' },
]
const EXPLORE_LINKS_ADMIN = [
  ...EXPLORE_LINKS,
  { to: '/go-live-guide', label: 'Go-live guide' },
]

const FEATURES = [
  {
    icon: '📝',
    title: 'NTA-style mocks',
    desc: 'JEE Main, Advanced & NEET patterns with section-wise flow and accurate marking.',
    color: '#2563eb',
  },
  {
    icon: '📊',
    title: 'In-depth test analysis',
    desc: 'Score, accuracy, subject breakdown, time per question, weak areas & percentile.',
    color: '#16a34a',
  },
  {
    icon: '🎯',
    title: 'Practice & PYQ',
    desc: 'Topic drills and previous-year questions to sharpen speed and accuracy.',
    color: '#ca8a04',
  },
  {
    icon: '🏆',
    title: 'Leaderboard & rank',
    desc: 'See where you stand and track improvement after every mock.',
    color: '#0d9488',
  },
]

const QUICK_ACTIONS = FEATURED_ACTIONS.map((f) => ({
  to: f.to,
  icon: f.icon,
  label: f.title,
  desc: f.desc,
  accent: f.accent,
}))

/* Teacher landing lives at /teacher (TeacherHub). /home redirects teachers there. */

function StrengthRing({ percent }) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0))
  const r = 54
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c

  return (
    <div className="sp-mastery-ring" aria-label={`${pct}% chapter strength`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="sp-strength-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="50%" stopColor="#818cf8" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
        <circle className="sp-mastery-ring-bg" cx="60" cy="60" r={r} />
        <circle
          className="sp-mastery-ring-fill"
          cx="60"
          cy="60"
          r={r}
          stroke="url(#sp-strength-gradient)"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="sp-mastery-ring-label">
        <strong>{pct}%</strong>
        <span>Chapter strength</span>
      </div>
    </div>
  )
}

function greetingLine(name) {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const first = String(name ?? 'Student').trim().split(/\s+/)[0] || 'Student'
  return `${part}, ${first}`
}

function StudentDashboard({ session }) {
  const ownerKey = getOwnerKey(session?.userId)
  const attempts = useMemo(() => getAttemptsByOwner(ownerKey), [ownerKey])

  const studentClassIds = useMemo(() => {
    if (!session?.userId) return []
    const user = getUserById(session.userId)
    if (user?.classIds?.length) return user.classIds
    return getClassesForStudent(session.userId).map((c) => c.id)
  }, [session?.userId])

  const assignedTests = useMemo(() => {
    const ids = getAssignedTestIdsForClasses(studentClassIds)
    return filterTests().filter((t) => ids.includes(t.id))
  }, [studentClassIds])

  const stats = useMemo(() => {
    if (!attempts.length) {
      return { count: 0, avgPct: null, lastAttempt: null, bestPct: null }
    }
    const pcts = attempts.map((a) =>
      a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0,
    )
    const avgPct = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length)
    const bestPct = Math.max(...pcts)
    return { count: attempts.length, avgPct, bestPct, lastAttempt: attempts[0] }
  }, [attempts])

  const mastery = useMemo(() => buildMasteryGraph(attempts), [attempts])

  const recentMocks = useMemo(
    () =>
      filterTests()
        .filter((t) => t.id !== STAFF_WORKING_TEST_ID)
        .slice(0, 4),
    [],
  )
  const demoStudent = isDemoStudentIdentity(session)
  const sampleMockId = DEMO_SAMPLE_TEST_IDS[0]

  return (
    <div className="sp-dashboard">
      <section className="sp-hero">
        <div className="sp-hero-glow" aria-hidden="true" />
        <div className="sp-hero-body">
          <div className="sp-hero-top">
            <span className="sp-hero-badge">Student dashboard</span>
            <span className="sp-hero-badge sp-hero-badge--ai">
              <span className="ai-tune-badge">AI</span> powered
            </span>
          </div>
          <h1>{greetingLine(session?.name)}</h1>
          <p className="sp-hero-lead">
            Build NTA-style mocks, practice by syllabus, and track chapter strength — everything you
            need to rank higher, in one place.
          </p>
          <div className="sp-hero-actions">
            <Link to="/prepare" className="sp-btn sp-btn-primary">
              Open prepare centre
            </Link>
            {demoStudent ? (
              <Link to={`/exam/${sampleMockId}`} className="sp-btn sp-btn-glass">
                Start sample mock
              </Link>
            ) : null}
            <Link to="/mock-test" className="sp-btn sp-btn-glass">
              AI Mock Builder
            </Link>
            {stats.lastAttempt ? (
              <Link
                to={`/result/${stats.lastAttempt.testId}?attempt=${stats.lastAttempt.id}`}
                className="sp-btn sp-btn-glass"
              >
                Last result analysis
              </Link>
            ) : (
              <Link to="/practice" className="sp-btn sp-btn-glass">
                Start syllabus practice
              </Link>
            )}
            <Link to="/tour" className="sp-btn sp-btn-glass">
              App tour
            </Link>
            {session?.userId ? (
              <Link to="/profile" className="sp-btn sp-btn-glass">
                Profile &amp; invite
              </Link>
            ) : null}
          </div>
        </div>

        <aside className="sp-hero-aside">
          <StrengthRing percent={mastery.overallMastery} />
          <div className="sp-hero-metrics">
            <div className="sp-metric">
              <strong>{stats.count}</strong>
              <span>Mocks</span>
            </div>
            <div className="sp-metric">
              <strong>{stats.avgPct != null ? `${stats.avgPct}%` : '—'}</strong>
              <span>Average</span>
            </div>
            <div className="sp-metric">
              <strong>{stats.bestPct != null ? `${stats.bestPct}%` : '—'}</strong>
              <span>Best</span>
            </div>
          </div>
        </aside>
      </section>

      <StudentNotificationsBanner userId={session?.userId} />

      <section className="sp-featured-strip" aria-label="Prepare centre">
        <Link
          to="/prepare"
          className="sp-featured-card sp-featured-card--primary"
          style={{ '--sp-accent': '#2563eb' }}
        >
          <span className="sp-featured-icon">🎓</span>
          <h3>Prepare centre</h3>
          <p>All prepare modes in one place — AI Mock Builder, practice, speed, CDF, PYQ, and mock tests.</p>
          <span className="sp-featured-cta">Choose your mode →</span>
        </Link>
      </section>

      <section className="sp-featured-strip" aria-label="Recommended actions">
        {FEATURED_ACTIONS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className={`sp-featured-card${card.primary ? ' sp-featured-card--primary' : ''}`}
            style={{ '--sp-accent': card.accent }}
          >
            <span className="sp-featured-icon">{card.icon}</span>
            <h3>{card.title}</h3>
            <p>{card.desc}</p>
            <span className="sp-featured-cta">{card.cta}</span>
          </Link>
        ))}
      </section>

      <section className="sp-pillars">
        <div className="sp-pillars-head">
          <h2>Your learning centre</h2>
          <p>Prepare · Insights · Compete — same buckets as the top nav.</p>
        </div>
        <div className="sp-pillar-grid">
          {STUDENT_PILLARS.map((pillar) => (
            <div key={pillar.label} className="sp-pillar">
              <div className="sp-pillar-label">
                <span>{pillar.icon}</span>
                <strong>{pillar.label}</strong>
              </div>
              <div className="sp-pillar-links">
                {pillar.links.map((link) => (
                  <Link key={link.to} to={link.to} className="sp-pillar-link">
                    <span className="sp-pillar-link-icon">{link.icon}</span>
                    <div>
                      <strong>{link.label}</strong>
                      <span>{link.desc}</span>
                    </div>
                    <span className="sp-pillar-link-arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {assignedTests.length > 0 && (
        <section className="sl-section">
          <div className="sl-section-head sl-section-head-row">
            <div>
              <h2>Assigned to you</h2>
              <p>Tests from your teacher — complete these first.</p>
            </div>
            <Link to="/tests" className="sl-link">
              View all mocks →
            </Link>
          </div>
          <div className="sl-test-grid">
            {assignedTests.map((test) => {
              const pattern = getExamPattern(test.examPatternId)
              const type = getTestType(test.testTypeId)
              return (
                <article key={test.id} className="sl-test-card">
                  <div className="sl-test-badges">
                    <span className="sl-badge sl-badge-exam" style={{ background: pattern?.color }}>
                      {pattern?.shortName ?? 'Exam'}
                    </span>
                    <span className="sl-badge sl-badge-type">
                      {type?.icon} {type?.name}
                    </span>
                  </div>
                  <h3>{test.title}</h3>
                  <p>
                    {test.totalQuestions} questions · {test.durationMinutes} min
                  </p>
                  <Link to={`/exam/${test.id}`} className="sp-btn sp-btn-primary sp-btn-sm">
                    Start now →
                  </Link>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section className="sl-section">
        <div className="sl-section-head sl-section-head-row">
          <div>
            <h2>Popular mock tests</h2>
            <p>Official-style blueprints with accurate NTA marking.</p>
          </div>
          <Link to="/tests" className="sl-link">
            Browse all →
          </Link>
        </div>
        <div className="sl-test-grid">
          {recentMocks.map((test) => {
            const pattern = getExamPattern(test.examPatternId)
            const type = getTestType(test.testTypeId)
            return (
              <article key={test.id} className="sl-test-card">
                <div className="sl-test-badges">
                  <span className="sl-badge sl-badge-exam" style={{ background: pattern?.color }}>
                    {pattern?.shortName ?? 'Exam'}
                  </span>
                  <span className="sl-badge sl-badge-type">
                    {type?.icon} {type?.name}
                  </span>
                </div>
                <h3>{test.title}</h3>
                <p>
                  {test.totalQuestions} Q · {test.durationMinutes} min ·{' '}
                  {pattern ? getPatternMarkingLabel(pattern) : ''}
                </p>
                <Link to={`/exam/${test.id}`} className="sp-btn sp-btn-outline sp-btn-sm">
                  Start →
                </Link>
              </article>
            )
          })}
        </div>
      </section>

      <section className="sl-section">
        <div className="sl-section-head">
          <h2>Choose your exam</h2>
          <p>Filter mocks by the pattern you are preparing for.</p>
        </div>
        <div className="sl-exam-grid">
          {EXAM_PATTERNS.slice(0, 4).map((p) => (
            <Link key={p.id} to="/mock-test" className="sl-exam-card" style={{ '--exam': p.color }}>
              <span className="sl-exam-dot" />
              <h3>{p.name}</h3>
              <p>{getPatternMarkingLabel(p)}</p>
              <span className="sl-exam-cta">Build mock →</span>
            </Link>
          ))}
        </div>
      </section>

      {attempts.length > 0 && (
        <section className="sl-section">
          <div className="sl-section-head sl-section-head-row">
            <div>
              <h2>Recent attempts</h2>
              <p>Tap any row to open full result analysis.</p>
            </div>
            <Link to="/my-results" className="sl-link">
              Full history →
            </Link>
          </div>
          <div className="sl-recent-list">
            {attempts.slice(0, 5).map((a) => {
              const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0
              return (
                <Link
                  key={a.id}
                  to={`/result/${a.testId}?attempt=${a.id}`}
                  className="sl-recent-row"
                >
                  <div className="sl-recent-info">
                    <strong>{a.title}</strong>
                    <span>{new Date(a.submittedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="sl-recent-score">
                    <strong>
                      {a.score}/{a.maxScore}
                    </strong>
                    <span className={`sl-pct ${pct >= 70 ? 'good' : pct >= 40 ? 'mid' : 'low'}`}>
                      {pct}%
                    </span>
                  </div>
                  <span className="sl-recent-arrow">Analysis →</span>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function MarketingHome({ isUser, isTeacher, isAdmin, canManageSchools }) {
  return (
    <>
      <section className="c1-hero">
        <div className="c1-hero-glow" aria-hidden="true" />
        <div className="c1-hero-inner">
          <span className="c1-pill">TestVantages · JEE & NEET</span>
          <h1>
            Prepare like the <span className="c1-gradient-text">top 1%</span>
          </h1>
          <p className="c1-hero-lead">
            Timed mocks, instant solutions, detailed performance reports, and smart practice — built
            for serious aspirants.
          </p>
          <div className="c1-hero-actions">
            <Link to="/tests" className="c1-btn c1-btn-primary">
              Start mock test
            </Link>
            <Link to="/my-results" className="c1-btn c1-btn-glass">
              View my analysis
            </Link>
            {!isUser && !isTeacher && !isAdmin && (
              <Link to="/login" className="c1-btn c1-btn-outline">
                Sign in / Register
              </Link>
            )}
            {canManageSchools && (
              <Link to="/admin/schools" className="c1-btn c1-btn-outline">
                School Management
              </Link>
            )}
          </div>
        </div>
        <div className="c1-hero-card">
          <div className="c1-score-ring">
            <span className="c1-score-num">89%</span>
            <span className="c1-score-label">Accuracy</span>
          </div>
          <ul className="c1-mini-stats">
            <li>
              <strong>203</strong>
              <span>/300 score</span>
            </li>
            <li>
              <strong>98.2</strong>
              <span>percentile</span>
            </li>
            <li>
              <strong>2h 43m</strong>
              <span>time</span>
            </li>
          </ul>
          <p className="c1-card-foot">Live analysis after every submit</p>
        </div>
      </section>

      <ul className="c1-trust-strip" aria-label="Why TestVantages">
        {TRUST_ITEMS.map((item) => (
          <li key={item.title} className="c1-trust-item">
            <span className="c1-trust-icon" aria-hidden="true">
              {item.icon}
            </span>
            <div>
              <strong>{item.title}</strong>
              <span>{item.desc}</span>
            </div>
          </li>
        ))}
      </ul>

      <nav className="c1-explore-strip" aria-label="Explore TestVantages">
        <span className="c1-explore-label">Explore</span>
        {(isAdmin ? EXPLORE_LINKS_ADMIN : EXPLORE_LINKS).map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`c1-explore-link${link.primary ? ' c1-explore-link--primary' : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <section className="c1-stats-strip">
        {[
          { value: '6', label: 'Question types' },
          { value: '75+', label: 'Q per full mock' },
          { value: '15+', label: 'Analysis metrics' },
          { value: 'AIR', label: 'Percentile rank' },
        ].map((s) => (
          <div key={s.label} className="c1-stat">
            <strong>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </section>

      <section className="c1-section">
        <div className="c1-section-head">
          <h2>Everything in one place</h2>
          <p>Premium EdTech experience — full focus on marks and rank.</p>
        </div>
        <div className="c1-bento">
          {FEATURES.map((f) => (
            <article key={f.title} className="c1-feature" style={{ '--accent': f.color }}>
              <span className="c1-feature-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="c1-section">
        <div className="c1-section-head">
          <h2>Pick your exam</h2>
          <p>Official-style blueprints with correct marking schemes.</p>
        </div>
        <div className="c1-exam-grid">
          {EXAM_PATTERNS.slice(0, 4).map((p) => (
            <Link key={p.id} to="/tests" className="c1-exam-card" style={{ '--exam': p.color }}>
              <span className="c1-exam-dot" />
              <h3>{p.name}</h3>
              <p>{p.subjects?.length ?? 3} subjects · timed sections</p>
              <span className="c1-exam-cta">Browse mocks →</span>
            </Link>
          ))}
        </div>
      </section>

      {!isUser && (
      <section className="c1-section">
        <div className="c1-section-head">
            <h2>Get started</h2>
            <p>Create a free student account to save results and track progress.</p>
        </div>
          <div className="c1-roles c1-roles-compact">
          <article className="c1-role c1-role-student">
            <h3>Student</h3>
            <ul>
              <li>Register free & take mocks</li>
              <li>My Results + Analytics dashboard</li>
              <li>Topic-wise weak area reports</li>
            </ul>
            <Link to="/login" className="c1-btn c1-btn-primary c1-btn-sm">
              Student login
            </Link>
          </article>
          <article className="c1-role c1-role-teacher">
            <h3>Teacher</h3>
            <ul>
                <li>Create papers & assign tests</li>
                <li>View student attempts</li>
            </ul>
            <Link to="/login" className="c1-btn c1-btn-glass c1-btn-sm">
              Teacher login
            </Link>
          </article>
        </div>
      </section>
      )}

      <section className="c1-cta-banner">
        <div>
          <h2>Ready for your next mock?</h2>
          <p>Submit once — get full performance analysis in seconds.</p>
        </div>
        <div className="c1-cta-banner-actions">
        <Link to="/tests" className="c1-btn c1-btn-primary c1-btn-lg">
          Go to Mock Tests
        </Link>
          <Link to="/tour" className="c1-btn c1-btn-glass c1-btn-sm">
            TestVantages Tour →
          </Link>
        </div>
      </section>
    </>
  )
}

export default function ClassOneHome() {
  const { isAdmin, isTeacher, isUser, hasPermission, session } = useAuth()
  const canManageSchools =
    isAdmin || hasPermission(PERMS.MANAGE_SCHOOLS) || hasPermission(PERMS.ASSIGN_TESTS)
  const isStudent = isUser && !isTeacher && !isAdmin
  const isTeacherOnly = isTeacher && !isAdmin

  if (isTeacherOnly) {
    return <Navigate to="/teacher" replace />
  }

  return (
    <div
      className={`page home-page-advanced class-one-page${isStudent ? ' student-landing' : ''}`}
    >
      {isStudent ? (
        <StudentDashboard session={session} />
      ) : (
        <MarketingHome
          isUser={isUser}
          isTeacher={isTeacher}
          isAdmin={isAdmin}
          canManageSchools={canManageSchools}
        />
      )}
    </div>
  )
}
