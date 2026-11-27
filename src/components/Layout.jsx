import { useEffect, useId, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

import ErrorBoundary from './ErrorBoundary'
import ProfileGate from './ProfileGate'
import FeatureHighlightCarousel from './FeatureHighlightCarousel'
import { useAuth } from '../context/AuthContext'
import { PERMS } from '../utils/permissions'
import { canAccessMainQuestionBank } from '../utils/teacherQuestionBank.js'
import {
  broadcastHybridSyncStatus,
  hybridSyncUserMessage,
  isHybridAiJobPending,
  postgresHasNoHybridAiRows,
  syncHybridAiIntoQuestionBank,
} from '../utils/hybridAiSync.js'
import { peekUploadedQuestions } from '../utils/questionBank.js'
import { countHybridAiDrafts } from '../utils/questionBankSubBank.js'

/* Student nav rule of thumb:
 * Practice = learn & revise · Tests = timed papers · PYQ = past papers
 * Progress = scores + what next · Challenges = habit & peers · More = extras
 */
const NAV_PRACTICE = [
  { to: '/prepare', label: 'Practice Hub', icon: '🎓', title: 'All practice modes' },
  { to: '/practice', label: 'Syllabus Practice', icon: '📖', title: 'Self-paced chapter drills' },
  { to: '/high-mistake', label: 'High mistake', icon: '❌', title: 'Practice or test trap questions' },
  { to: '/high-skip', label: 'High skip', icon: '⏭️', title: 'Practice or test often-skipped questions' },
  { to: '/cdf-test', label: 'CDF Mastery', icon: '⏱️', title: 'Concept · Definition · Formula' },
  { to: '/quick-revision', label: 'Quick Revision', icon: '📝', title: 'Chapter notes and cheat sheets' },
  { to: '/formula-sheet', label: 'Formula Sheet', icon: '📌', title: 'Pin formulas you forget' },
  { to: '/daily-target', label: 'Daily Target', icon: '🎯', title: 'Clear weak chapters today' },
  { to: '/daily-sheet', label: 'Daily Practice Sheet', icon: '📄', title: 'Dated chapter sheet' },
]

const NAV_TEST = [
  { to: '/mock-test', label: 'Mock Builder', icon: '🎯', title: 'Build your own full mock' },
  { to: '/speed-test', label: 'Speed Test', icon: '⚡', title: 'Timed easy–medium drill' },
  { to: '/test-series', label: 'Series Calendar', icon: '📆', title: 'Week-by-week mock schedule' },
  { to: '/tests', label: 'Mock Tests', icon: '📋', title: 'Assigned and sample papers' },
  { to: '/placement-check', label: 'Starter Diagnosis', icon: '📍', title: 'Short paper → weak chapters → today’s plan' },
]

const NAV_CHALLENGES = [
  { to: '/todays-drill', label: 'Daily Challenge', icon: '🗓️', title: 'Mixed set for today' },
  { to: '/peer-pulse', label: 'Peer Match', icon: '🔗', title: 'Spar with a classmate' },
  { to: '/study-circle', label: 'Study Groups', icon: '👥', title: 'Cohort rooms' },
  { to: '/doubts', label: 'Ask a Doubt', icon: '💬', title: 'Question help' },
  { to: '/merit-stride', label: 'Rewards', icon: '✨', title: 'Points and badges' },
]

const NAV_PROGRESS = [
  { to: '/my-results', label: 'My Results', icon: '📊', title: 'All finished attempts' },
  { to: '/analytics', label: 'Score Analytics', icon: '📈', title: 'Trends and study path' },
  { to: '/form-forecast', label: 'Rank Forecast', icon: '🎯', title: 'Practice AIR and Exam Fit' },
  { to: '/leaderboard', label: 'Rankings', icon: '🏆', title: 'Peer standings' },
]

const NAV_PYQ = [
  { to: '/practice/pyq', label: 'PYQ Bank', icon: '📅', title: 'Six study modes on one page' },
  { to: '/practice/similar-pyq', label: 'Similar PYQ', icon: '🔁', title: 'AI-similar / replica practice' },
]

const NAV_MORE = [
  { to: '/career-compass', label: 'Career Guide', icon: '🧭', title: 'Marks → rank → colleges' },
  { to: '/exam-pulse', label: 'Exam Updates', icon: '📡', title: 'Dates, counselling, focus notes' },
  { to: '/earn', label: 'Refer & Earn', icon: '💸', title: 'Share TestVantage and earn' },
  { to: '/campus-earn', label: 'Campus Referrals', icon: '🎓', title: 'University mentor track' },
  { to: '/tour', label: 'Product Tour', icon: '🗺️', title: 'Map of every tab' },
  { to: '/profile', label: 'Profile', icon: '👤', title: 'Your details and invite code' },
]
const NAV_MORE_ADMIN = [
  ...NAV_MORE,
  { to: '/go-live-guide', label: 'Go-live Guide', icon: '🚀' },
  { to: '/admin/referrals', label: 'Referral Admin', icon: '📈' },
]

const ADMIN_NAV = [
  { to: '/question-bank', label: 'Question Bank', icon: '📚' },
  { to: '/question-bank/ai-generate', label: 'Hybrid AI', icon: '🤖' },
  { to: '/upload', label: 'Upload PDF', icon: '📄' },
  { to: '/question-bank/review', label: 'Review & Publish', icon: '✅' },
  { to: '/question-bank/reports', label: 'Question Reports', icon: '🚩' },
  { to: '/merge-banks', label: 'Merge Banks', icon: '🔀' },
  { to: '/create-test', label: 'Create Test', icon: '➕' },
  { to: '/admin/paper-patterns', label: 'Paper Patterns', icon: '📐' },
  { to: '/edit-test', label: 'Edit Test', icon: '✏️' },
  { to: '/admin/schools', label: 'Schools', icon: '🏫' },
  { to: '/teacher/results', label: 'Student Results', icon: '👥' },
  { to: '/admin', label: 'OCR Settings', icon: '⚙️' },
  { to: '/admin/referrals', label: 'Referral Admin', icon: '📈' },
]

const PAGE_TITLES = {
  '/': 'Home',
  '/home': 'Home',
  '/prepare': 'Practice Hub',
  '/prep-hub': 'Practice Hub',
  '/peer-pulse': 'Peer Match',
  '/todays-drill': 'Daily Challenge',
  '/merit-stride': 'Rewards',
  '/study-circle': 'Study Groups',
  '/tour': 'Product Tour',
  '/site-map': 'Product Tour',
  '/go-live-guide': 'Go-live Guide',
  '/tests': 'Mock Tests',
  '/practice': 'Syllabus Practice',
  '/speed-test': 'Speed Test',
  '/cdf-test': 'CDF Mastery',
  '/quick-revision': 'Quick Revision',
  '/formula-sheet': 'Formula Sheet',
  '/daily-target': 'Daily Target',
  '/daily-sheet': 'Daily Practice Sheet',
  '/high-mistake': 'High mistake',
  '/high-skip': 'High skip',
  '/placement-check': 'Starter Diagnosis',
  '/mock-test': 'Mock Builder',
  '/my-results': 'My Results',
  '/analytics': 'Score Analytics',
  '/form-forecast': 'Rank Forecast',
  '/leaderboard': 'Rankings',
  '/career-compass': 'Career Guide',
  '/exam-pulse': 'Exam Updates',
  '/test-series': 'Test Series',
  '/pyq': 'PYQ Bank',
  '/practice/pyq': 'PYQ Bank',
  '/practice/similar-pyq': 'Similar PYQ',
  '/official-pyq': 'Approve Official Papers',
  '/any-paper': 'Upload Any Paper',
  '/upload': 'Upload PDF',
  '/doubts': 'Ask a Doubt',
  '/question-bank': 'Question Bank',
  '/question-bank/ai-generate': 'Hybrid AI',
  '/question-bank/review': 'Review & Publish',
  '/question-bank/reports': 'Question Reports',
  '/merge-banks': 'Merge Banks',
  '/create-test': 'Create Test',
  '/edit-test': 'Edit Test',
  '/publish-review': 'Publish Review',
  '/paper-manifest': 'Paper Manifest',
  '/admin': 'Admin Settings',
  '/admin/schools': 'Schools',
  '/teacher': 'Teacher Home',
  '/teacher/lecture-questions': 'Lecture Questions',
  '/teacher/results': 'Student Results',
  '/admin/paper-patterns': 'Paper Patterns',
  '/login': 'Sign In',
  '/profile': 'Profile',
  '/earn': 'Refer & Earn',
  '/campus-earn': 'Campus Referrals',
  '/admin/referrals': 'Referral Admin',
}

const BREADCRUMB = {
  '/': 'Home',
  '/home': 'Home',
  '/prepare': 'Practice',
  '/prep-hub': 'Practice',
  '/practice': 'Practice',
  '/cdf-test': 'Practice',
  '/quick-revision': 'Practice',
  '/formula-sheet': 'Practice',
  '/daily-target': 'Practice',
  '/daily-sheet': 'Practice',
  '/high-mistake': 'Practice',
  '/high-skip': 'Practice',
  '/mock-test': 'Tests',
  '/speed-test': 'Tests',
  '/test-series': 'Tests',
  '/tests': 'Tests',
  '/placement-check': 'Tests',
  '/todays-drill': 'Challenges',
  '/peer-pulse': 'Challenges',
  '/merit-stride': 'Challenges',
  '/study-circle': 'Challenges',
  '/doubts': 'Challenges',
  '/my-results': 'Progress',
  '/analytics': 'Progress',
  '/form-forecast': 'Progress',
  '/leaderboard': 'Progress',
  '/pyq': 'PYQ',
  '/practice/pyq': 'PYQ',
  '/practice/similar-pyq': 'PYQ',
  '/career-compass': 'More',
  '/exam-pulse': 'More',
  '/tour': 'More',
  '/site-map': 'More',
  '/go-live-guide': 'More',
  '/earn': 'More',
  '/campus-earn': 'More',
  '/profile': 'More',
  '/official-pyq': 'Admin',
  '/any-paper': 'Admin',
  '/upload': 'Admin',
  '/question-bank': 'Content',
  '/question-bank/ai-generate': 'Content',
  '/question-bank/review': 'Content',
  '/question-bank/reports': 'Content',
  '/create-test': 'Classroom',
  '/edit-test': 'Classroom',
  '/admin': 'Admin',
  '/admin/schools': 'Admin',
  '/admin/paper-patterns': 'Admin',
  '/teacher': 'Classroom',
  '/teacher/lecture-questions': 'Classroom',
  '/teacher/results': 'Classroom',
  '/login': 'Account',
  '/admin/referrals': 'Admin',
}

function getPageTitle(pathname) {
  if (pathname.startsWith('/result/')) return 'Result Analysis'
  if (pathname.startsWith('/exam/')) return 'Live Exam'
  if (/^\/admin\/schools\/[^/]+$/.test(pathname)) return 'School Management'
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  let best = null
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (path !== '/' && pathname.startsWith(`${path}/`) && (!best || path.length > best.path.length)) {
      best = { path, title }
    }
  }
  return best?.title ?? 'TestVantages'
}

function getBreadcrumb(pathname) {
  if (pathname.startsWith('/result/')) return 'Results'
  if (pathname.startsWith('/exam/')) return 'Live test'
  if (BREADCRUMB[pathname]) return BREADCRUMB[pathname]
  let best = null
  for (const [path, crumb] of Object.entries(BREADCRUMB)) {
    if (path !== '/' && pathname.startsWith(`${path}/`) && (!best || path.length > best.path.length)) {
      best = { path, crumb }
    }
  }
  return best?.crumb ?? 'TestVantages'
}

function topbarRole({ isAdmin, isTeacher, isUser }) {
  if (isAdmin) return { label: 'Admin', className: 'topbar-role-pill--admin' }
  if (isTeacher) return { label: 'Teacher', className: 'topbar-role-pill--teacher' }
  if (isUser) return { label: 'Student', className: 'topbar-role-pill--student' }
  return null
}

function pathMatches(item, pathname, search = '') {
  const raw = String(item.to ?? '')
  const qIndex = raw.indexOf('?')
  const pathOnly = qIndex >= 0 ? raw.slice(0, qIndex) : raw
  const itemParams = qIndex >= 0 ? new URLSearchParams(raw.slice(qIndex + 1)) : null
  const pageParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)

  if (pathname === pathOnly) {
    if (itemParams?.has('hub')) {
      return pageParams.get('hub') === itemParams.get('hub')
    }
    if (itemParams?.has('mode')) {
      return pageParams.get('mode') === itemParams.get('mode')
    }
    if (pathOnly === '/question-bank') {
      return !pageParams.get('hub') || pageParams.get('hub') === 'view'
    }
    return true
  }

  if (
    pathOnly !== '/' &&
    pathOnly !== '/teacher' &&
    pathOnly !== '/practice' &&
    !itemParams &&
    pathname.startsWith(`${pathOnly}/`) &&
    !(pathOnly === '/question-bank' && pathname.startsWith('/question-bank/'))
  ) {
    return true
  }

  return false
}

function anyPathActive(items, pathname, search) {
  return items.some((item) => pathMatches(item, pathname, search))
}

function ChromeLink({ item, pathname, search = '', className = 'chrome-nav-link' }) {
  const active = pathMatches(item, pathname, search)
  return (
    <Link to={item.to} className={`${className}${active ? ' is-active' : ''}`} title={item.title}>
      {item.icon ? <span className="chrome-nav-icon" aria-hidden="true">{item.icon}</span> : null}
      <span>{item.label}</span>
    </Link>
  )
}

function ChromeDropdown({ id, label, hubTo, items, pathname, search, openId, setOpenId }) {
  const active = pathMatches({ to: hubTo }, pathname, search) || anyPathActive(items, pathname, search)
  const open = openId === id
  const panelId = `${id}-panel`

  return (
    <div className={`chrome-nav-group${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}>
      <div className="chrome-nav-group-row">
        <Link
          to={hubTo}
          className={`chrome-nav-link chrome-nav-link--hub${active ? ' is-active' : ''}`}
          onClick={() => setOpenId(null)}
        >
          {label}
        </Link>
        <button
          type="button"
          className="chrome-nav-chevron"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${label} menu`}
          onClick={() => setOpenId(open ? null : id)}
        >
          <span aria-hidden="true">▾</span>
        </button>
      </div>
      {open ? (
        <div id={panelId} className="chrome-nav-dropdown" role="menu">
          {items.map((item) => (
            <Link
              key={`${item.to}::${item.label}`}
              to={item.to}
              role="menuitem"
              className={`chrome-nav-dropdown-link${pathMatches(item, pathname, search) ? ' is-active' : ''}`}
              title={item.title}
              onClick={() => setOpenId(null)}
            >
              {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function Layout() {
  const { pathname, search } = useLocation()
  const { isAdmin, isUser, isTeacher, hasPermission, logout, session } = useAuth()

  useEffect(() => {
    if (!pathname.startsWith('/question-bank')) return undefined
    let cancelled = false
    const run = () => {
      if (cancelled) return
      void syncHybridAiIntoQuestionBank({ approvedOnly: false })
        .then((result) => {
          if (!postgresHasNoHybridAiRows(result)) return
          if (isHybridAiJobPending()) return
          try {
            if (sessionStorage.getItem('tv-hybrid-empty-pool-hint')) return
            sessionStorage.setItem('tv-hybrid-empty-pool-hint', '1')
          } catch {
            /* private mode */
          }
          const localHybrid = countHybridAiDrafts(peekUploadedQuestions())
          const msg = hybridSyncUserMessage(result, { localHybridDraftCount: localHybrid })
          if (msg) {
            broadcastHybridSyncStatus({
              type: localHybrid > 0 ? 'info' : 'error',
              message: msg,
            })
          }
        })
        .catch((err) => {
          const message =
            err instanceof Error ? err.message : 'Hybrid AI sync failed — is the API running?'
          broadcastHybridSyncStatus({ type: 'error', message })
        })
    }
    run()
    const id = window.setInterval(run, 90_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [pathname])
  const accessMainBank = isAdmin || canAccessMainQuestionBank(session)
  const [openMenu, setOpenMenu] = useState(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const navRef = useRef(null)
  const navListId = useId()

  const navTeacher = [
    { to: '/teacher', label: 'Teacher Home', icon: '🏠' },
    ...(hasPermission(PERMS.UPLOAD_QUESTIONS)
      ? [
          {
            to: accessMainBank
              ? '/question-bank?hub=view'
              : '/question-bank?hub=view&view=draft&owner=teacher',
            label: accessMainBank ? 'Question Bank' : 'My Question Bank',
            icon: '📚',
          },
          { to: '/teacher/lecture-questions', label: 'Lecture Set', icon: '🎓' },
          { to: '/teacher/lecture-planner', label: 'Lecture Planner', icon: '📋' },
          { to: '/question-bank?hub=upload&owner=teacher', label: 'Upload Questions', icon: '⬆️' },
          { to: '/question-bank/ai-generate', label: 'Hybrid AI', icon: '🤖' },
          { to: '/upload', label: 'Upload PDF', icon: '📄' },
        ]
      : []),
    ...(accessMainBank && hasPermission(PERMS.UPLOAD_QUESTIONS)
      ? [{ to: '/question-bank/review', label: 'Review & Publish', icon: '✅' }]
      : []),
    ...(hasPermission(PERMS.UPLOAD_QUESTIONS)
      ? [{ to: '/question-bank/reports', label: 'Question Reports', icon: '🚩' }]
      : []),
    ...(hasPermission(PERMS.CREATE_PAPER)
      ? [
          { to: '/create-test?pool=mine', label: 'Create Paper', icon: '📝' },
          { to: '/edit-test', label: 'Edit Paper', icon: '✏️' },
          { to: '/admin/paper-patterns', label: 'Paper Patterns', icon: '📐' },
        ]
      : []),
    ...(hasPermission(PERMS.VIEW_STUDENT_RESULTS)
      ? [{ to: '/teacher/results', label: 'Student Results', icon: '👥' }]
      : []),
    ...(hasPermission(PERMS.MANAGE_SCHOOLS) || hasPermission(PERMS.ASSIGN_TESTS)
      ? [{ to: '/admin/schools', label: 'Schools', icon: '🏫' }]
      : []),
  ]

  const homeLink = isTeacher
    ? '/teacher'
    : isAdmin || hasPermission(PERMS.UPLOAD_QUESTIONS)
      ? '/question-bank'
      : '/home'

  const isStudentView = isUser && !isTeacher && !isAdmin
  const signedIn = isAdmin || isUser || isTeacher
  const inExam = pathname.startsWith('/exam/')
  /* Students never see Question Bank. Signed-out founders and all staff see it in the main bar
     (not buried under Classroom / Explore). Opening the page still requires Teacher or Admin sign-in. */
  const showQuestionBankTab = !isStudentView
  const questionBankTo =
    !signedIn || accessMainBank
      ? '/question-bank?hub=view'
      : '/question-bank?hub=view&view=draft&owner=teacher'

  useEffect(() => {
    setOpenMenu(null)
    setMobileNavOpen(false)
  }, [pathname, search])

  useEffect(() => {
    if (!openMenu) return undefined
    const onPointerDown = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setOpenMenu(null)
      }
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  if (inExam) {
    return (
      <main className="main-exam">
        <ErrorBoundary key={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    )
  }

  const pageTitle = getPageTitle(pathname)
  const breadcrumb = getBreadcrumb(pathname)
  const rolePill = topbarRole({ isAdmin, isTeacher, isUser })
  const initials = session?.name
    ? session.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : null

  const navHomeTo = isTeacher && !isAdmin ? '/teacher' : '/home'
  const homeActive =
    pathname === '/home' ||
    pathname === '/' ||
    (isTeacher && !isAdmin && pathname === '/teacher')

  return (
    <div className="app-shell app-shell--chrome">
      <header className="app-chrome">
        <div className="chrome-brand-bar">
          <div className="chrome-brand-bar-inner">
            <Link to={homeLink} className="chrome-brand">
              <span className="brand-mark">TV</span>
              <span className="chrome-brand-text">
                Test<span className="accent">Vantage</span>
              </span>
            </Link>

            <div className="chrome-brand-actions">
              {!signedIn ? (
                <Link to="/login" className="btn btn-primary btn-sm chrome-signin">
                  Sign in
                </Link>
              ) : (
                <>
                  {rolePill ? (
                    <span className={`topbar-role-pill ${rolePill.className}`}>{rolePill.label}</span>
                  ) : null}
                  {isUser || isTeacher ? (
                    <>
                      <Link
                        to="/profile"
                        className="topbar-avatar topbar-avatar--link"
                        title={`${session?.name || 'Profile'} — open profile`}
                        aria-label="Open profile"
                      >
                        {initials || 'Me'}
                      </Link>
                      <Link to="/profile" className="chrome-profile-link">
                        Profile
                      </Link>
                    </>
                  ) : initials ? (
                    <span className="topbar-avatar" title={session?.name || session?.email}>
                      {initials}
                    </span>
                  ) : null}
                  <button type="button" className="btn btn-ghost btn-sm chrome-logout" onClick={logout}>
                    Log out
                  </button>
                </>
              )}

              <button
                type="button"
                className="chrome-menu-toggle"
                aria-expanded={mobileNavOpen}
                aria-controls={navListId}
                onClick={() => setMobileNavOpen((v) => !v)}
              >
                {mobileNavOpen ? 'Close' : 'Menu'}
              </button>
            </div>
          </div>
        </div>

        <div className="brand-tricolor chrome-tricolor" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        {homeActive ? (
          <div className="chrome-banner-wrap">
            <ErrorBoundary compact title="Highlights">
              <FeatureHighlightCarousel compact className="tv-feature-carousel--chrome" />
            </ErrorBoundary>
          </div>
        ) : null}

        <nav
          className={`chrome-nav${mobileNavOpen ? ' is-open' : ''}`}
          aria-label="Primary"
          ref={navRef}
        >
          <div id={navListId} className="chrome-nav-track">
            <Link
              to={navHomeTo}
              className={`chrome-nav-link${homeActive ? ' is-active' : ''}`}
              onClick={() => setOpenMenu(null)}
            >
              Home
            </Link>

            {showQuestionBankTab ? (
              <ChromeLink
                item={{
                  to: questionBankTo,
                  label: 'Question Bank',
                  icon: '📚',
                  title: signedIn
                    ? 'Open Question Bank'
                    : 'Question Bank — sign in as Teacher or Admin to open',
                }}
                pathname={pathname}
                search={search}
                className="chrome-nav-link"
              />
            ) : null}

            <ChromeDropdown
              id="practice"
              label="Practice"
              hubTo="/prepare"
              items={NAV_PRACTICE}
              pathname={pathname}
              search={search}
              openId={openMenu}
              setOpenId={setOpenMenu}
            />

            <ChromeDropdown
              id="test"
              label="Tests"
              hubTo="/mock-test"
              items={NAV_TEST}
              pathname={pathname}
              search={search}
              openId={openMenu}
              setOpenId={setOpenMenu}
            />

            <ChromeDropdown
              id="pyq"
              label="PYQ"
              hubTo="/practice/pyq"
              items={NAV_PYQ}
              pathname={pathname}
              search={search}
              openId={openMenu}
              setOpenId={setOpenMenu}
            />

            <ChromeDropdown
              id="progress"
              label="Progress"
              hubTo="/my-results"
              items={NAV_PROGRESS}
              pathname={pathname}
              search={search}
              openId={openMenu}
              setOpenId={setOpenMenu}
            />

            <ChromeDropdown
              id="challenges"
              label="Challenges"
              hubTo="/todays-drill"
              items={NAV_CHALLENGES}
              pathname={pathname}
              search={search}
              openId={openMenu}
              setOpenId={setOpenMenu}
            />

            {isTeacher ? (
              <ChromeDropdown
                id="teacher"
                label="Classroom"
                hubTo="/teacher"
                items={navTeacher}
                pathname={pathname}
                search={search}
                openId={openMenu}
                setOpenId={setOpenMenu}
              />
            ) : null}

            {isAdmin ? (
              <ChromeDropdown
                id="admin"
                label="Admin"
                hubTo="/admin"
                items={ADMIN_NAV}
                pathname={pathname}
                search={search}
                openId={openMenu}
                setOpenId={setOpenMenu}
              />
            ) : null}

            <ChromeDropdown
              id="more"
              label="More"
              hubTo="/tour"
              items={isAdmin ? NAV_MORE_ADMIN : NAV_MORE}
              pathname={pathname}
              search={search}
              openId={openMenu}
              setOpenId={setOpenMenu}
            />
          </div>
        </nav>
      </header>

      <div className={`main-wrap${isStudentView ? ' main-wrap--student' : ''}`}>
        <div className="app-topbar app-topbar--context">
          <p className="topbar-title">
            <span className="topbar-breadcrumb">{breadcrumb}</span>
            {' '}
            <strong>{pageTitle}</strong>
          </p>
          <div className="topbar-actions">
            {pathname === '/go-live-guide' && !isAdmin ? null : (
              <Link to="/prepare" className="btn btn-primary btn-sm">
                Practice Hub
              </Link>
            )}
          </div>
        </div>

        <main className="main-content">
          <ErrorBoundary key={pathname}>
            <ProfileGate>
              <Outlet />
            </ProfileGate>
          </ErrorBoundary>
        </main>

        <footer className="site-footer">
          TestVantages — Professional mock tests &amp; PYQ practice for serious aspirants
          {' · '}
          <Link to="/tour" className="site-footer-link">
            Tour
          </Link>
          {signedIn && session?.email ? (
            <span className="site-footer-user"> · {session.email}</span>
          ) : null}
        </footer>
      </div>
    </div>
  )
}
