import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import RequirePermission from './components/RequirePermission'
import Layout from './components/Layout'
import { PERMS } from './utils/permissions'

function lazyPage(importFn, label) {
  return lazy(() =>
    importFn().catch((err) => {
      console.error(`Failed to load ${label}`, err)
      return {
        default: function PageLoadError() {
          return (
            <div className="page boot-error-page">
              <h1>Could not open this page</h1>
              <p className="form-hint">
                <strong>{label}</strong> did not load. Try <strong>Ctrl+Shift+R</strong> to refresh.
              </p>
              <pre className="boot-error-pre">{err instanceof Error ? err.message : String(err)}</pre>
            </div>
          )
        },
      }
    }),
  )
}

const PrepareHub = lazyPage(() => import('./pages/PrepareHub'), 'Prepare')
const PeerPulse = lazyPage(() => import('./pages/PeerPulse'), 'Peer Pulse')
const TodaysDrill = lazyPage(() => import('./pages/TodaysDrill'), 'Today’s Drill')
const MeritStride = lazyPage(() => import('./pages/MeritStride'), 'Merit Stride')
const StudyCircle = lazyPage(() => import('./pages/StudyCircle'), 'Study Circle')
const Home = lazyPage(() => import('./pages/Home'), 'Home')
const QuestionBank = lazyPage(() => import('./pages/QuestionBank'), 'Question Bank')
const BankReview = lazyPage(() => import('./pages/BankReview'), 'Bank review')
const MergeBanks = lazyPage(() => import('./pages/MergeBanks'), 'Merge banks')
const ExportBankRelay = lazyPage(() => import('./pages/ExportBankRelay'), 'Export bank')
const Login = lazyPage(() => import('./pages/Login'), 'Login')
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
const TeacherHub = lazyPage(() => import('./pages/TeacherHub'), 'Teacher home')
const LectureQuestions = lazyPage(() => import('./pages/LectureQuestions'), 'Lecture questions')
const LecturePlanner = lazyPage(() => import('./pages/LecturePlanner'), 'Lecture Planner')
const TeacherResults = lazyPage(() => import('./pages/TeacherResults'), 'Teacher results')
const SchoolSetup = lazyPage(() => import('./pages/SchoolSetup'), 'School Management')
const SchoolDetail = lazyPage(() => import('./pages/SchoolDetail'), 'School Management')
const Practice = lazyPage(() => import('./pages/Practice'), 'Practice')
const SpeedTest = lazyPage(() => import('./pages/SpeedTest'), 'Speed test')
const CdfTest = lazyPage(() => import('./pages/CdfTest'), 'CDF test')
const StudentMockTest = lazyPage(() => import('./pages/StudentMockTest'), 'Mock test')
const PYQ = lazyPage(() => import('./pages/PYQ'), 'PYQ')
const OfficialPyqPending = lazyPage(() => import('./pages/OfficialPyqPending'), 'Approve official papers')
const SiteMap = lazyPage(() => import('./pages/SiteMap'), 'Site map')
const GoLiveGuide = lazyPage(() => import('./pages/GoLiveGuide'), 'Go live guide')

function RouteLoading({ label = 'Loading…' }) {
  return (
    <div className="page route-loading">
      <h2 style={{ margin: 0, color: 'var(--text-h, #0f172a)' }}>{label}</h2>
      <p className="form-hint">Please wait a moment.</p>
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
      <Route path="/login" element={withSuspense(<Login />, 'Opening sign in…')} />
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
        <Route path="speed-test" element={withSuspense(<SpeedTest />, 'Loading speed test…')} />
        <Route path="cdf-test" element={withSuspense(<CdfTest />, 'Loading CDF test…')} />
        <Route path="mock-test" element={withSuspense(<StudentMockTest />, 'Loading mock test…')} />
        <Route path="pyq" element={withSuspense(<PYQ />, 'Loading PYQ…')} />
        <Route
          path="official-pyq"
          element={
            <RequirePermission anyPermission={[PERMS.UPLOAD_QUESTIONS, PERMS.PUBLISH_QUESTIONS]}>
              {withSuspense(<OfficialPyqPending />, 'Loading approve official papers…')}
            </RequirePermission>
          }
        />
        <Route path="tour" element={withSuspense(<SiteMap />, 'Loading tour…')} />
        <Route path="site-map" element={<Navigate to="/tour" replace />} />
        <Route path="go-live-guide" element={withSuspense(<GoLiveGuide />, 'Loading go-live guide…')} />
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
        <Route path="teacher" element={withSuspense(<TeacherHub />, 'Loading teacher home…')} />
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
