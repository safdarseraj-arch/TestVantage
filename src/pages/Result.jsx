import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import ResultAnalysisDashboard from '../components/ResultAnalysisDashboard'
import ResultScoreRing from '../components/ResultScoreRing'
import { attemptToResultData, getAttemptById, getAttemptsByOwner } from '../utils/attemptHistory'
import { resolveTestForResult } from '../utils/resolveTestForResult'
import { formatTime } from '../utils/formatTime'
import { difficultyLabel } from '../utils/adaptiveTest'
import CalibratedStandingPanel from '../components/CalibratedStandingPanel'
import { useAuth } from '../context/AuthContext'
import { getOwnerKey } from '../utils/attemptHistory'
import {
  compareWithPreviousAttempt,
  computePerformanceGrade,
  findPreviousAttempt,
} from '../utils/resultInsights'
import { estimateAIR } from '../utils/percentile'
import { getTestPattern } from '../utils/patternResolver'
import { getTestType } from '../data/testTypes'
import { getSubjectsForPattern } from '../data/subjects'
import { getTestById } from '../data/tests'
import WeakChaptersPanel from '../components/WeakChaptersPanel'
import ResultNextSteps from '../components/ResultNextSteps'
import { buildChapterSubjectMap, buildWeakTopics } from '../utils/testAnalysis'

export default function Result() {
  const { testId } = useParams()
  const [searchParams] = useSearchParams()
  const { session } = useAuth()
  const ownerKey = getOwnerKey(session?.userId)
  const attemptId = searchParams.get('attempt')
  const storedAttempt = attemptId ? getAttemptById(attemptId) : null
  const raw = sessionStorage.getItem(`testvantage-result-${testId}`)
  const sessionData = raw ? JSON.parse(raw) : null
  const data = storedAttempt ? attemptToResultData(storedAttempt) : sessionData

  const test = useMemo(() => {
    const live = getTestById(testId)
    if (live) return live
    return data ? resolveTestForResult(testId, storedAttempt, data) : null
  }, [testId, storedAttempt, data])
  const attempts = useMemo(() => getAttemptsByOwner(ownerKey), [ownerKey])

  const previousAttempt = useMemo(
    () => findPreviousAttempt(attempts, testId, attemptId ?? undefined),
    [attempts, testId, attemptId],
  )

  const comparison = useMemo(
    () => (data ? compareWithPreviousAttempt(data, previousAttempt) : null),
    [data, previousAttempt],
  )

  const perfGrade = useMemo(
    () =>
      data?.result
        ? computePerformanceGrade(data.result.score, data.result.maxScore)
        : null,
    [data],
  )

  const studentGradeMap = useMemo(() => {
    const m = new Map()
    for (const pq of data?.result?.perQuestion ?? []) {
      m.set(pq.questionId, pq.grade)
    }
    return m
  }, [data])

  const weakTopics = useMemo(
    () => buildWeakTopics(data?.result?.byChapter ?? {}),
    [data?.result?.byChapter],
  )

  const chapterSubjects = useMemo(
    () => buildChapterSubjectMap(data?.result?.perQuestion ?? []),
    [data?.result?.perQuestion],
  )

  const topWeakSubjects = useMemo(() => {
    const top = weakTopics[0]?.chapter
    return top ? (chapterSubjects[top] ?? []) : []
  }, [weakTopics, chapterSubjects])

  if (!data) {
    return (
      <div className="page si-empty">
        <h1>No result found</h1>
        <p className="lead">Take a test first, then submit to see analysis.</p>
        <Link to="/tests" className="btn btn-primary">
          Go to tests
        </Link>
      </div>
    )
  }

  if (!test) {
    return (
      <div className="page si-empty">
        <h1>Result unavailable</h1>
        <p className="lead">
          This attempt was saved without enough detail to reopen analysis. Take the test again from
          Prepare centre.
        </p>
        <Link to="/my-results" className="btn btn-ghost">
          My results
        </Link>
        <Link to="/prepare" className="btn btn-primary">
          Prepare centre
        </Link>
      </div>
    )
  }

  const { result } = data
  const pct = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0
  const pattern = getTestPattern(test)
  const testType = getTestType(test.testTypeId)
  const subjects = getSubjectsForPattern(test.examPatternId)
  const timeLabel = data.durationSeconds != null ? formatTime(data.durationSeconds) : '—'
  const examPatternId = data.examPatternId ?? test.examPatternId
  const estimatedAIR =
    data.percentile != null ? estimateAIR(data.percentile, examPatternId) : data.estimatedAIR

  return (
    <div className="page result-page result-page-pro si-result">
      <header className="si-result-hero">
        <div className="si-result-hero-glow" aria-hidden="true" />
        <div className="si-result-hero-left">
          <p className="result-page-eyebrow">Result & analysis</p>
          <h1>{data.title}</h1>
          {data.userName && (
            <p className="result-user">
              {data.userName}
              {data.userEmail ? ` · ${data.userEmail}` : ''}
            </p>
          )}
          <div className="result-badges si-result-badges">
            <span className="badge badge-exam" style={{ background: pattern.color }}>
              {pattern.name}
            </span>
            <span className="badge badge-type">
              {testType.icon} {testType.name}
            </span>
            <span className="badge badge-time">⏱ {timeLabel}</span>
            {(result.markedCount ?? 0) > 0 && (
              <span className="badge badge-marked">🔖 {result.markedCount} marked</span>
            )}
            {data.percentile != null && (
              <span className="badge badge-percentile">
                📈 {data.percentile.toFixed(1)} percentile
              </span>
            )}
          </div>
        </div>

        <div className="si-result-hero-right">
          {perfGrade && (
            <ResultScoreRing
              score={result.score}
              maxScore={result.maxScore}
              grade={perfGrade.grade}
              gradeColor={perfGrade.color}
              size={136}
            />
          )}
          <div className="si-result-hero-metrics">
            <div className="si-metric">
              <strong>{pct}%</strong>
              <span>Score</span>
            </div>
            <div className="si-metric">
              <strong>{result.accuracy}%</strong>
              <span>Accuracy</span>
            </div>
            <div className="si-metric">
              <strong>{perfGrade?.label ?? '—'}</strong>
              <span>Grade</span>
            </div>
            {estimatedAIR != null && (
              <div className="si-metric si-metric-highlight si-metric-air">
                <strong>{estimatedAIR.toLocaleString()}</strong>
                <span>
                  Est. AIR <em className="si-est-label">(estimate)</em>
                </span>
              </div>
            )}
            {comparison?.sameTest && (
              <div
                className={`si-metric si-metric-delta${comparison.improved ? ' si-metric-delta-up' : ' si-metric-delta-down'}`}
              >
                <strong>
                  {comparison.scoreDelta >= 0 ? '+' : ''}
                  {comparison.scoreDelta}
                </strong>
                <span>vs last attempt</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {comparison && comparison.sameTest && (
        <div
          className={`si-compare-banner ${comparison.improved ? 'si-compare-up' : 'si-compare-down'}`}
        >
          {comparison.improved ? '▲' : '▼'} vs last attempt on this test:{' '}
          <strong>
            {comparison.scoreDelta >= 0 ? '+' : ''}
            {comparison.scoreDelta} marks
          </strong>{' '}
          ({comparison.pctDelta >= 0 ? '+' : ''}
          {comparison.pctDelta}%){' '}
          <span className="si-compare-prev">
            — previous {comparison.previousScore}/{comparison.previousMax}
          </span>
        </div>
      )}

      {data.testTypeId === 'practice' && (
        <p className="form-hint si-practice-hint">
          Syllabus practice session — review below, then{' '}
          <Link to="/practice">start another practice</Link>.
        </p>
      )}

      {data.submitReason === 'proctor' && (
        <p className="result-proctor-notice upload-error">
          This paper was submitted automatically because you opened another tab during the test.
        </p>
      )}

      {data.calibratedStanding && (
        <section className="card calibrated-result-hero">
          <h2>Calibrated standing</h2>
          <CalibratedStandingPanel
            standing={data.calibratedStanding}
            sectionResults={data.calibratedSectionResults ?? []}
            liveItemCount={data.calibratedSectionResults?.length ?? 0}
          />
          {data.calibratedSectionResults?.length > 0 && (
            <div className="si-cal-section-grid">
              {data.calibratedSectionResults.map((s) => {
                const sub = subjects.find((x) => x.id === s.subjectId)
                return (
                  <div key={s.subjectId} className="si-cal-section-card">
                    <span className="si-cal-sub" style={{ borderColor: sub?.color }}>
                      {sub?.label ?? s.subjectId}
                    </span>
                    <span>{difficultyLabel(s.difficulty)}</span>
                    <strong>
                      {s.score}/{s.maxScore}
                    </strong>
                    <span>{Math.round(s.accuracy * 100)}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      <div className="si-result-quick-stats">
        <div className="si-quick-stat si-quick-correct">
          <strong>{result.correct}</strong>
          <span>Correct</span>
        </div>
        <div className="si-quick-stat si-quick-wrong">
          <strong>{result.wrong}</strong>
          <span>Wrong</span>
        </div>
        <div className="si-quick-stat si-quick-skipped">
          <strong>{result.unattempted}</strong>
          <span>Skipped</span>
        </div>
        {(result.partial ?? 0) > 0 && (
          <div className="si-quick-stat si-quick-partial">
            <strong>{result.partial}</strong>
            <span>Partial</span>
          </div>
        )}
        <div className="si-quick-stat si-quick-time">
          <strong>{timeLabel}</strong>
          <span>Time</span>
        </div>
      </div>

      {weakTopics.length > 0 && (
        <WeakChaptersPanel
          topics={weakTopics}
          examPatternId={examPatternId}
          chapterSubjects={chapterSubjects}
          title="Focus areas from this test"
          subtitle="Sorted weakest first — one tap starts a practice session for that chapter."
          maxRows={6}
        />
      )}

      <p className="si-ff-hint form-hint">
        For practice AIR, Exam Fit, and Revision Ladder across all mocks, open{' '}
        <Link to="/form-forecast">Form Forecast</Link>.
      </p>

      <ResultAnalysisDashboard
        data={data}
        test={test}
        testId={testId}
        studentGrades={studentGradeMap}
        comparison={comparison}
        attempts={attempts}
      />

      <ResultNextSteps
        testId={testId}
        examPatternId={examPatternId}
        topWeakChapter={weakTopics[0]?.chapter}
        topWeakSubjects={topWeakSubjects}
        testTypeId={data.testTypeId}
      />

      <div className="result-actions si-result-actions si-result-actions-secondary">
        <Link to="/my-results" className="btn btn-ghost btn-sm">
          My results
        </Link>
        <Link to="/tests" className="btn btn-ghost btn-sm">
          More tests
        </Link>
      </div>
    </div>
  )
}
