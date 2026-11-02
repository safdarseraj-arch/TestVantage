import { lazy, Suspense, useEffect, useState, createElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import RequirePermission from './components/RequirePermission'
import Layout from './components/Layout'
import Login from './pages/Login'
import StudentOnboarding from './pages/StudentOnboarding'
import TeacherOnboarding from './pages/TeacherOnboarding'
import TeacherHub from './pages/TeacherHub'
import Profile from './pages/Profile'
import OfficialPyqPendingRoute from './pages/OfficialPyqPendingRoute'
import { PERMS } from './utils/permissions'

function loadLazyPage(importFn, label, timeoutMs = 25_000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} took too long to open.`)), timeoutMs)
  })
  return Promise.race([importFn(), timeout])
    .then((mod) => {
      clearTimeout(timer)
      return mod
    })
    .catch((err) => {
      clearTimeout(timer)
      throw err
    })
}

function lazyPage(importFn, label, timeoutMs = 25_000) {
  return lazy(async () => {
    try {
      return await loadLazyPage(importFn, label, timeoutMs)
    } catch (err) {
      console.error(`Failed to load ${label}`, err)
      const message = err instanceof Error ? err.message : String(err)
      return {
        default: function PageLoadError() {
          const [LoadedPage, setLoadedPage] = useState(null)
          const [retryError, setRetryError] = useState(message)
          const [retrying, setRetrying] = useState(false)

          const retry = () => {
            setRetrying(true)
            setRetryError('')
            loadLazyPage(importFn, label, timeoutMs)
              .then((mod) => {
                setLoadedPage(() => mod.default)
                setRetryError('')
              })
              .catch((retryErr) => {
                console.error(`Failed to load ${label}`, retryErr)
                setRetryError(retryErr instanceof Error ? retryErr.message : String(retryErr))
              })
              .finally(() => setRetrying(false))
          }

          if (LoadedPage) return createElement(LoadedPage)

          return (
            <div className="page boot-error-page">
              <h1>Could not load — retry</h1>
              <p className="form-hint">
                <strong>{label}</strong> did not open. Press <strong>F5</strong> or use Retry.
              </p>
              <pre className="boot-error-pre">{retryError || message}</pre>
              <p>
                <button type="button" className="btn btn-primary" disabled={retrying} onClick={retry}>
                  {retrying ? 'Retrying…' : 'Retry'}
                </button>
              </p>
            </div>
          )
        },
      }
    }
  })
}

const PrepareHub = lazyPage(() => import('./pages/PrepareHub'), 'Prepare')
const PeerPulse = lazyPage(() => import('./pages/PeerPulse'), 'Peer Pulse')
const TodaysDrill = lazyPage(() => import('./pages/TodaysDrill'), 'Today’s Drill')
const MeritStride = lazyPage(() => import('./pages/MeritStride'), 'Merit Stride')
const StudyCircle = lazyPage(() => import('./pages/StudyCircle'), 'Study Circle')
const Home = lazyPage(() => import('./pages/Home'), 'Home')
const QuestionBank = lazyPage(() => import('./pages/QuestionBankRoute'), 'Question Bank')
const AnyPaperPending = lazyPage(() => import('./pages/AnyPaperPending.jsx'), 'Upload any paper')
const BankReview = lazyPage(() => import('./pages/BankReview'), 'Bank review')
const QuestionReports = lazyPage(() => import('./pages/QuestionReports'), 'Question reports')
const MergeBanks = lazyPage(() => import('./pages/MergeBanks'), 'Merge banks')
const ExportBankRelay = lazyPage(() => import('./pages/ExportBankRelay'), 'Export bank')
const AdminPanel = lazyPage(() => import('./pages/AdminPanel'), 'Admin')
const TestList = lazyPage(() => import('./pages/TestList'), 'Tests')
const Exam = lazyPage(() => import('./pages/Exam'), 'Exam')
const Result = lazyPage(() => import('./pages/Result'), 'Result')
const CreateTest = lazyPage(() => import('./pages/CreateTest'), 'Create test')
const EditTest = lazyPage(() => import('./pages/EditTest'), 'Edit test')
const PublishReview = lazyPage(() => import('./pages/PublishReview'), 'Publish review')
const PaperManifestPage = lazyPage(() => import('./pages/PaperManifestPage'), 'Paper manifest')
const MyResults = lazyPage(() => import('./pages/MyResults'), 'My results')
const Analytics = lazyPage(() => import('./pages/Analytics'), 'Analytics')
const Leaderboard = lazyPage(() => import('./pages/Leaderboard'), 'Leaderboard')
const CareerCompass = lazyPage(() => import('./pages/CareerCompass'), 'Career Compass')
const FormForecast = lazyPage(() => import('./pages/FormForecast'), 'Form Forecast')
const ExamPulse = lazyPage(() => import('./pages/ExamPulse'), 'Exam Pulse')
const LectureQuestions = lazyPage(() => import('./pages/LectureQuestions'), 'Lecture questions')
const LecturePlanner = lazyPage(() => import('./pages/LecturePlanner'), 'Lecture Planner')
const TeacherResults = lazyPage(() => import('./pages/TeacherResults'), 'Teacher results')
const SchoolSetup = lazyPage(() => import('./pages/SchoolSetup'), 'School Management')
const SchoolDetail = lazyPage(() => import('./pages/SchoolDetail'), 'School Management')
const Practice = lazyPage(() => import('./pages/Practice'), 'Practice')
const SpeedTest = lazyPage(() => import('./pages/SpeedTest'), 'Speed test')
const CdfTest = lazyPage(() => import('./pages/CdfTest'), 'CDF test')
const QuickRevision = lazyPage(() => import('./pages/QuickRevision'), 'Quick Revision')
const FormulaPocket = lazyPage(() => import('./pages/FormulaPocket'), 'Formula Sheet')
const DailyTarget = lazyPage(() => import('./pages/DailyTarget'), 'Today’s Target')
const DailyPracticeSheet = lazyPage(() => import('./pages/DailyPracticeSheet'), 'Daily Practice Sheet')
const PlacementCheck = lazyPage(() => import('./pages/PlacementCheck'), 'Placement check')
const TestSeries = lazyPage(() => import('./pages/TestSeries'), 'Series calendar')
const Doubts = lazyPage(() => import('./pages/Doubts'), 'Ask Your Doubt')
const StudentMockTest = lazyPage(() => import('./pages/StudentMockTest'), 'Mock test')
const PYQ = lazyPage(() => import('./pages/PYQ'), 'PYQ')
const PracticePyqBank = lazyPage(
  () => import('./pages/PracticeSubBank').then((m) => ({ default: m.PracticePyqBankPage })),
  'PYQ practice bank',
)
const PracticeSimilarPyqBank = lazyPage(
  () =>
    import('./pages/PracticeSubBank').then((m) => ({ default: m.PracticeSimilarPyqBankPage })),
  'Similar PYQ practice bank',
)
const SiteMap = lazyPage(() => import('./pages/SiteMap'), 'Site map')
const GoLiveGuide = lazyPage(() => import('./pages/GoLiveGuide'), 'Go live guide')
const PaperPatterns = lazyPage(() => import('./pages/PaperPatterns'), 'Paper patterns')
const GeneratorDashboard = lazyPage(
  () => import('./components/GeneratorDashboard.jsx'),
  'Hybrid AI',
)
const BookUpload = lazyPage(() => import('./pages/BookUpload.jsx'), 'Book ingest')

function RouteLoading({ label = 'Loading…' }) {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), 8000)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div className="page route-loading">
      <h2 style={{ margin: 0, color: 'var(--text-h, #0f172a)' }}>{label}</h2>
      {stuck ? (
        <>
          <p className="form-hint">This is taking too long. Press F5 or use Retry.</p>
          <p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Retry
            </button>
          </p>
        </>
      ) : (
        <p className="form-hint">Please wait a moment.</p>
      )}
    </div>
  )
}

function withSuspense(node, label) {
  return <Suspense fallback={<RouteLoading label={label} />}>{node}</Suspense>
}

/** OCR-first: Question Bank is the main workflow. */
export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <ErrorBoundary>
            <Login />
          </ErrorBoundary>
        }
      />
      <Route
        path="/onboarding/student"
        element={
          <ErrorBoundary>
            <StudentOnboarding />
          </ErrorBoundary>
        }
      />
      <Route
        path="/onboarding/teacher"
        element={
          <ErrorBoundary>
            <TeacherOnboarding />
          </ErrorBoundary>
        }
      />
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={withSuspense(<Home />, 'Loading home…')} />
        <Route path="prepare" element={withSuspense(<PrepareHub />, 'Loading prepare centre…')} />
        {/* Bookmark: old Prep Hub URL → single Prepare centre */}
        <Route path="prep-hub" element={<Navigate to="/prepare" replace />} />
        <Route path="peer-pulse" element={withSuspense(<PeerPulse />, 'Loading Peer Pulse…')} />
        <Route path="todays-drill" element={withSuspense(<TodaysDrill />, 'Loading Today’s Drill…')} />
        <Route path="merit-stride" element={withSuspense(<MeritStride />, 'Loading Merit Stride…')} />
        <Route path="study-circle" element={withSuspense(<StudyCircle />, 'Loading Study Circle…')} />
        <Route
          path="question-bank"
          element={
            <RequirePermission permission={PERMS.UPLOAD_QUESTIONS}>
              {withSuspense(<QuestionBank />, 'Loading question bank…')}
            </RequirePermission>
          }
        />
        <Route
          path="question-bank/review"
          element={
            <RequirePermission
              anyPermission={[PERMS.ACCESS_MAIN_QUESTION_BANK, PERMS.PUBLISH_QUESTIONS]}
            >
              {withSuspense(<BankReview />, 'Loading review workspace…')}
            </RequirePermission>
          }
        />
        <Route
          path="question-bank/reports"
          element={
            <RequirePermission
              anyPermission={[
                PERMS.UPLOAD_QUESTIONS,
                PERMS.ACCESS_MAIN_QUESTION_BANK,
                PERMS.PUBLISH_QUESTIONS,
              ]}
            >
              {withSuspense(<QuestionReports />, 'Loading question reports…')}
            </RequirePermission>
          }
        />
        <Route
          path="merge-banks"
          element={
            <RequirePermission anyPermission={[PERMS.ACCESS_MAIN_QUESTION_BANK]}>
              {withSuspense(<MergeBanks />, 'Loading merge banks…')}
            </RequirePermission>
          }
        />
        <Route path="export-bank" element={withSuspense(<ExportBankRelay />, 'Loading…')} />
        <Route path="a" element={<Navigate to="/admin" replace />} />
        <Route
          path="admin"
          element={
            <RequirePermission adminOnly>
              {withSuspense(<AdminPanel />, 'Loading admin…')}
            </RequirePermission>
          }
        />
        <Route
          path="admin/paper-patterns"
          element={
            <RequirePermission permission={PERMS.CREATE_PAPER}>
              {withSuspense(<PaperPatterns />, 'Loading paper patterns…')}
            </RequirePermission>
          }
        />
        <Route
          path="question-bank/ai-generate"
          element={
            <RequirePermission permission={PERMS.UPLOAD_QUESTIONS}>
              {withSuspense(<GeneratorDashboard />, 'Loading Hybrid AI…')}
            </RequirePermission>
          }
        />
        <Route
          path="question-bank/book-ingest"
          element={
            <RequirePermission permission={PERMS.UPLOAD_QUESTIONS}>
              {withSuspense(<BookUpload />, 'Loading book ingest…')}
            </RequirePermission>
          }
        />
        <Route path="generator" element={<Navigate to="/question-bank/ai-generate" replace />} />
        <Route path="testvantages" element={<Navigate to="/question-bank/ai-generate" replace />} />
        <Route
          path="admin/schools"
          element={
            <RequirePermission anyPermission={[PERMS.MANAGE_SCHOOLS, PERMS.ASSIGN_TESTS]}>
              {withSuspense(<SchoolSetup />, 'Loading schools…')}
            </RequirePermission>
          }
        />
        <Route
          path="admin/schools/:schoolId"
          element={
            <RequirePermission anyPermission={[PERMS.MANAGE_SCHOOLS, PERMS.ASSIGN_TESTS]}>
              {withSuspense(<SchoolDetail />, 'Loading school…')}
            </RequirePermission>
          }
        />
        <Route path="upload" element={<Navigate to="/question-bank?hub=upload&tab=single" replace />} />
        <Route path="tests" element={withSuspense(<TestList />, 'Loading tests…')} />
        <Route path="practice" element={withSuspense(<Practice />, 'Loading practice…')} />
        <Route
          path="practice/pyq"
          element={withSuspense(<PracticePyqBank />, 'Loading PYQ bank…')}
        />
        <Route
          path="practice/similar-pyq"
          element={withSuspense(<PracticeSimilarPyqBank />, 'Loading Similar PYQ…')}
        />
        <Route path="speed-test" element={withSuspense(<SpeedTest />, 'Loading speed test…')} />
        <Route path="cdf-test" element={withSuspense(<CdfTest />, 'Loading CDF test…')} />
        <Route path="quick-revision" element={withSuspense(<QuickRevision />, 'Loading Quick Revision…')} />
        <Route path="formula-sheet" element={withSuspense(<FormulaPocket />, 'Loading formula sheet…')} />
        <Route path="daily-target" element={withSuspense(<DailyTarget />, 'Loading today’s target…')} />
        <Route path="daily-sheet" element={withSuspense(<DailyPracticeSheet />, 'Loading daily sheet…')} />
        <Route path="placement-check" element={withSuspense(<PlacementCheck />, 'Loading placement check…')} />
        <Route path="test-series" element={withSuspense(<TestSeries />, 'Loading series calendar…')} />
        <Route path="doubts" element={withSuspense(<Doubts />, 'Loading doubts…')} />
        <Route path="mock-test" element={withSuspense(<StudentMockTest />, 'Loading mock test…')} />
        <Route path="pyq" element={withSuspense(<PYQ />, 'Loading PYQ…')} />
        <Route
          path="official-pyq"
          element={
            <RequirePermission adminOnly>
              <OfficialPyqPendingRoute />
            </RequirePermission>
          }
        />
        <Route
          path="any-paper"
          element={
            <RequirePermission permission={PERMS.UPLOAD_QUESTIONS}>
              {withSuspense(<AnyPaperPending />, 'Loading any paper…')}
            </RequirePermission>
          }
        />
        <Route path="tour" element={withSuspense(<SiteMap />, 'Loading tour…')} />
        <Route path="site-map" element={<Navigate to="/tour" replace />} />
        <Route path="go-live-guide" element={withSuspense(<GoLiveGuide />, 'Loading go-live guide…')} />
        <Route path="profile" element={<Profile />} />
        <Route path="how-we-compare" element={<Navigate to="/home" replace />} />
        <Route
          path="create-test"
          element={
            <RequirePermission permission={PERMS.CREATE_PAPER}>
              {withSuspense(<CreateTest />, 'Loading create test…')}
            </RequirePermission>
          }
        />
        <Route
          path="edit-test"
          element={
            <RequirePermission permission={PERMS.CREATE_PAPER}>
              {withSuspense(<EditTest />, 'Loading edit test…')}
            </RequirePermission>
          }
        />
        <Route
          path="publish-review/:testId"
          element={
            <RequirePermission permission={PERMS.CREATE_PAPER}>
              {withSuspense(<PublishReview />, 'Loading publish review…')}
            </RequirePermission>
          }
        />
        <Route
          path="paper-manifest/:testId"
          element={
            <RequirePermission permission={PERMS.CREATE_PAPER}>
              {withSuspense(<PaperManifestPage />, 'Loading manifest…')}
            </RequirePermission>
          }
        />
        <Route path="exam/:testId" element={withSuspense(<Exam />, 'Loading exam…')} />
        <Route path="result/:testId" element={withSuspense(<Result />, 'Loading result…')} />
        <Route path="my-results" element={withSuspense(<MyResults />, 'Loading results…')} />
        <Route path="analytics" element={withSuspense(<Analytics />, 'Loading analytics…')} />
        <Route path="leaderboard" element={withSuspense(<Leaderboard />, 'Loading leaderboard…')} />
        <Route
          path="career-compass"
          element={withSuspense(<CareerCompass />, 'Loading Career Compass…')}
        />
        <Route
          path="form-forecast"
          element={withSuspense(<FormForecast />, 'Loading Form Forecast…')}
        />
        <Route
          path="exam-pulse"
          element={withSuspense(<ExamPulse />, 'Loading Exam Pulse…')}
        />
        <Route path="teacher" element={<TeacherHub />} />
        <Route
          path="teacher/lecture-questions"
          element={withSuspense(<LectureQuestions />, 'Loading lecture questions…')}
        />
        <Route
          path="teacher/lecture-planner"
          element={withSuspense(<LecturePlanner />, 'Loading Lecture Planner…')}
        />
        <Route
          path="teacher/results"
          element={
            <RequirePermission permission={PERMS.VIEW_STUDENT_RESULTS}>
              {withSuspense(<TeacherResults />, 'Loading teacher results…')}
            </RequirePermission>
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  )
}
