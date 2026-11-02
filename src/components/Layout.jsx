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

import { STUDENT_PREPARE_NAV } from '../data/studentPrepareModes'

const NAV_COMPETE = [
  { to: '/todays-drill', label: 'Today’s Drill', icon: '🗓️', title: 'Daily mixed set' },
  { to: '/peer-pulse', label: 'Peer Pulse', icon: '🔗', title: 'Spar Code peer link' },
  { to: '/merit-stride', label: 'Merit Stride', icon: '✨', title: 'Points, badges, focus' },
  { to: '/study-circle', label: 'Study Circle', icon: '👥', title: 'Cohort Code rooms' },
  { to: '/doubts', label: 'Ask Your Doubt', icon: '💬', title: 'Doubt on a question' },
]

const NAV_MORE = [{ to: '/tour', label: 'TestVantages Tour', icon: '🗺️' }]
const NAV_MORE_ADMIN = [
  ...NAV_MORE,
  { to: '/go-live-guide', label: 'Go live guide', icon: '🚀' },
]

const ADMIN_NAV = [
  { to: '/question-bank', label: 'Question Bank', icon: '📚' },
  { to: '/question-bank/ai-generate', label: 'Hybrid AI', icon: '🤖' },
  { to: '/question-bank/book-ingest', label: 'Book ingest', icon: '📖' },
  { to: '/question-bank/review', label: 'Review & publish', icon: '✅' },
  { to: '/question-bank/reports', label: 'Question reports', icon: '🚩' },
  { to: '/official-pyq', label: 'Approve official papers', icon: '📜' },
  { to: '/any-paper', label: 'Upload any paper', icon: '📄' },
  { to: '/merge-banks', label: 'Merge banks', icon: '🔀' },
  { to: '/create-test', label: 'Create Test', icon: '➕' },
  { to: '/admin/paper-patterns', label: 'Paper patterns', icon: '📐' },
  { to: '/edit-test', label: 'Edit Test', icon: '✏️' },
  { to: '/admin/schools', label: 'School Management', icon: '🏫' },
  { to: '/teacher/results', label: 'Student Results', icon: '👥' },
  { to: '/admin', label: 'OCR settings', icon: '⚙️' },
]

const PAGE_TITLES = {
  '/': 'Home',
  '/home': 'Home',
  '/prepare': 'Prepare Centre',
  '/prep-hub': 'Prepare Centre',
  '/peer-pulse': 'Peer Pulse',
  '/todays-drill': 'Today’s Drill',
  '/merit-stride': 'Merit Stride',
  '/study-circle': 'Study Circle',
  '/tour': 'TestVantages Tour',
  '/site-map': 'TestVantages Tour',
  '/go-live-guide': 'Go Live Guide',
  '/tests': 'Mock Tests',
  '/practice': 'Syllabus Practice',
  '/speed-test': 'Precision Speed Test',
  '/cdf-test': 'CDF Mastery Test',
  '/quick-revision': 'Quick Revision',
  '/formula-sheet': 'My Formula Sheet',
  '/daily-target': 'Today’s Target',
  '/daily-sheet': 'Daily Practice Sheet',
  '/placement-check': 'Placement check',
  '/mock-test': 'AI Mock Builder',
  '/my-results': 'My Results',
  '/analytics': 'Analytics',
  '/form-forecast': 'Form Forecast',
  '/leaderboard': 'Leaderboard',
  '/career-compass': 'Career Compass',
  '/exam-pulse': 'Exam Pulse',
  '/test-series': 'Test Series',
  '/pyq': 'PYQ Bank',
  '/practice/pyq': 'PYQ Bank',
  '/practice/similar-pyq': 'Similar PYQ',
  '/official-pyq': 'Approve official papers',
  '/any-paper': 'Upload any paper',
  '/doubts': 'Ask Your Doubt',
  '/question-bank': 'Question Bank',
  '/question-bank/ai-generate': 'Hybrid AI',
  '/question-bank/book-ingest': 'Book ingest',
  '/question-bank/review': 'Review & Publish',
  '/question-bank/reports': 'Question Reports',
  '/merge-banks': 'Merge banks',
  '/create-test': 'Create Test',
  '/edit-test': 'Edit Test',
  '/publish-review': 'Publish Review',
  '/paper-manifest': 'Paper Manifest',
  '/admin': 'Admin Settings',
  '/admin/schools': 'School Management',
  '/teacher': 'Teacher Home',
  '/teacher/lecture-questions': 'Lecture Questions',
  '/teacher/results': 'Student Results',
  '/admin/paper-patterns': 'Paper Patterns',
  '/login': 'Sign In',
  '/profile': 'Profile',
}

const BREADCRUMB = {
  '/': 'Home',
  '/prepare': 'Prepare',
  '/prep-hub': 'Prepare',
  '/peer-pulse': 'Compete',
  '/todays-drill': 'Compete',
  '/merit-stride': 'Compete',
  '/study-circle': 'Compete',
  '/tour': 'Help',
  '/site-map': 'Help',
  '/go-live-guide': 'Help',
  '/tests': 'Practice',
  '/my-results': 'Insights',
  '/analytics': 'Insights',
  '/form-forecast': 'Insights',
  '/leaderboard': 'Insights',
  '/career-compass': 'Insights',
  '/exam-pulse': 'Insights',
  '/test-series': 'Practice',
  '/pyq': 'Practice',
  '/practice/pyq': 'Practice',
  '/practice/similar-pyq': 'Practice',
  '/official-pyq': 'Admin',
  '/any-paper': 'Admin',
  '/cdf-test': 'Practice',
  '/quick-revision': 'Practice',
  '/formula-sheet': 'Practice',
  '/daily-target': 'Practice',
  '/doubts': 'Community',
  '/question-bank': 'Admin',
  '/question-bank/ai-generate': 'Admin',
  '/question-bank/book-ingest': 'Admin',
  '/question-bank/review': 'Admin',
  '/question-bank/reports': 'Admin',
  '/create-test': 'Admin',
  '/edit-test': 'Admin',
  '/admin': 'Admin',
  '/admin/schools': 'Admin',
  '/admin/paper-patterns': 'Admin',
  '/teacher': 'Teacher',
  '/teacher/lecture-questions': 'Teacher',
  '/teacher/results': 'Teacher',
  '/login': 'Account',
  '/profile': 'Account',
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
    if (pathOnly === '/question-bank') {
      return !pageParams.get('hub') || pageParams.get('hub') === 'view'
    }
    return true
  }

  if (
    pathOnly !== '/' &&
    pathOnly !== '/teacher' &&
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
              key={item.to}
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

  const navPractice = STUDENT_PREPARE_NAV

  const navInsights = [
    { to: '/my-results', label: 'My Results', icon: '📊' },
    { to: '/analytics', label: 'Analytics', icon: '📈' },
    { to: '/form-forecast', label: 'Form Forecast', icon: '🎯' },
    { to: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
    { to: '/career-compass', label: 'Career Compass', icon: '🧭' },
    { to: '/exam-pulse', label: 'Exam Pulse', icon: '📡' },
  ]

  const navTeacher = [
    { to: '/teacher', label: 'Teacher home', icon: '🏠' },
    ...(hasPermission(PERMS.UPLOAD_QUESTIONS)
      ? [
          {
            to: accessMainBank
              ? '/question-bank?hub=view'
              : '/question-bank?hub=view&view=draft&owner=teacher',
            label: accessMainBank ? 'Question bank' : 'My question bank',
            icon: '📚',
          },
          { to: '/teacher/lecture-questions', label: 'Lecture set', icon: '🎓' },
          { to: '/teacher/lecture-planner', label: 'Lecture Planner', icon: '📋' },
          { to: '/question-bank?hub=upload&owner=teacher', label: 'Upload questions', icon: '⬆️' },
          { to: '/question-bank/ai-generate', label: 'Hybrid AI', icon: '🤖' },
  { to: '/question-bank/book-ingest', label: 'Book ingest', icon: '📖' },
        ]
      : []),
    ...(accessMainBank && hasPermission(PERMS.UPLOAD_QUESTIONS)
      ? [{ to: '/question-bank/review', label: 'Review & publish', icon: '✅' }]
      : []),
    ...(hasPermission(PERMS.UPLOAD_QUESTIONS)
      ? [{ to: '/question-bank/reports', label: 'Question reports', icon: '🚩' }]
      : []),
    ...(hasPermission(PERMS.CREATE_PAPER)
      ? [
          { to: '/create-test?pool=mine', label: 'Prepare test paper', icon: '📝' },
          { to: '/edit-test', label: 'Edit paper', icon: '✏️' },
          { to: '/admin/paper-patterns', label: 'Paper patterns', icon: '📐' },
        ]
      : []),
    ...(hasPermission(PERMS.VIEW_STUDENT_RESULTS)
      ? [{ to: '/teacher/results', label: 'Student results', icon: '👥' }]
      : []),
    ...(hasPermission(PERMS.MANAGE_SCHOOLS) || hasPermission(PERMS.ASSIGN_TESTS)
      ? [{ to: '/admin/schools', label: 'Schools', icon: '🏫' }]
      : []),
  ]

  const prepareItems = [
    { to: '/prepare', label: 'Prepare centre', icon: '🎓', title: 'All prepare modes' },
    ...navPractice,
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
     (not buried under Teaching / More). Opening the page still requires Teacher or Admin sign-in. */
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

        {pathname === '/official-pyq' || pathname.startsWith('/official-pyq/') ? null : (
          <div className="chrome-banner-wrap">
            <ErrorBoundary compact title="Highlights">
              <FeatureHighlightCarousel compact className="tv-feature-carousel--chrome" />
            </ErrorBoundary>
          </div>
        )}

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
                className="chrome-nav-link chrome-nav-link--bank"
              />
            ) : null}

            <ChromeDropdown
              id="prepare"
              label="Prepare"
              hubTo="/prepare"
              items={prepareItems}
              pathname={pathname}
              search={search}
              openId={openMenu}
              setOpenId={setOpenMenu}
            />

            <ChromeDropdown
              id="compete"
              label="Compete"
              hubTo="/todays-drill"
              items={NAV_COMPETE}
              pathname={pathname}
              search={search}
              openId={openMenu}
              setOpenId={setOpenMenu}
            />

            <ChromeDropdown
              id="insights"
              label="Insights"
              hubTo="/my-results"
              items={navInsights}
              pathname={pathname}
              search={search}
              openId={openMenu}
              setOpenId={setOpenMenu}
            />

            {isTeacher ? (
              <ChromeDropdown
                id="teacher"
                label="Teaching"
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
                Prepare centre
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
