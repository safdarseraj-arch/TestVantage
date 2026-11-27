import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ResultAnalysisDashboard from '../components/ResultAnalysisDashboard'
import ResultScoreRing from '../components/ResultScoreRing'
import ResultNextSteps from '../components/ResultNextSteps'
import ResultShareReport from '../components/ResultShareReport'
import WeakChaptersPanel from '../components/WeakChaptersPanel'
import {
  DEMO_ANALYSIS_HIGHLIGHTS,
  getDemoTestAnalysisBundle,
} from '../data/demoStudentTestAnalysis.js'
import { DEMO_REPORT_STUDENT } from '../data/demoStudentReportCard.js'
import { formatTime } from '../utils/formatTime'
import { getTestPattern } from '../utils/patternResolver'
import { getTestType } from '../data/testTypes'
import { computePerformanceGrade } from '../utils/resultInsights'
import { estimateAIR } from '../utils/percentile'
import { buildChapterSubjectMap, buildWeakTopics } from '../utils/testAnalysis'
import { listWrongQuestionIds } from '../utils/mistakeOnlyRetest'
import {
  buildDiagnosticReportModel,
  downloadDiagnosticReportHtml,
  buildDiagnosticReportHtml,
  openDiagnosticReportPrint,
} from '../utils/diagnosticReportPdf.js'

/**
 * Sample full Result & analysis for Aarav Sharma — no real attempt needed.
 * Path: /demo/test-analysis
 */
export default function DemoTestAnalysis() {
  const bundle = useMemo(() => getDemoTestAnalysisBundle(), [])
  const test = bundle?.test ?? null
  const data = bundle?.data ?? null
  const attemptId = bundle?.attemptId ?? null
  const result = data?.result ?? null
  const [diagStatus, setDiagStatus] = useState('')

  const diagnosticModel = useMemo(() => {
    if (!data || !test) return null
    return buildDiagnosticReportModel({
      data: { ...data, batchLabel: DEMO_REPORT_STUDENT.classLabel },
      test,
      studentName: data.userName || DEMO_REPORT_STUDENT.name,
      attempts: [],
      attemptId,
    })
  }, [data, test, attemptId])

  const onDownloadFullDiag = () => {
    if (!diagnosticModel) return
    const html = buildDiagnosticReportHtml(diagnosticModel)
    downloadDiagnosticReportHtml(html, 'testvantages-demo-aarav-full-diagnostic.html')
    setDiagStatus('Downloaded full 6-page diagnostic. Open → Print → Save as PDF.')
  }

  const onPrintFullDiag = () => {
    if (!diagnosticModel) return
    const res = openDiagnosticReportPrint(diagnosticModel)
    if (!res.ok) {
      setDiagStatus('Pop-up blocked — use Download full diagnostic instead.')
      return
    }
    setDiagStatus('Full diagnostic print window opened.')
  }

  const studentGradeMap = useMemo(() => {
    const m = new Map()
    for (const pq of result?.perQuestion ?? []) {
      m.set(pq.questionId, pq.grade)
    }
    return m
  }, [result?.perQuestion])

  const weakTopics = useMemo(
    () => buildWeakTopics(result?.byChapter ?? {}),
    [result?.byChapter],
  )
  const chapterSubjects = useMemo(
    () => buildChapterSubjectMap(result?.perQuestion ?? []),
    [result?.perQuestion],
  )
  const topWeakSubjects = useMemo(() => {
    const top = weakTopics[0]?.chapter
    return top ? (chapterSubjects[top] ?? []) : []
  }, [weakTopics, chapterSubjects])
  const wrongCount = useMemo(
    () => (result ? listWrongQuestionIds(result).length : 0),
    [result],
  )

  if (!bundle || !test || !data || !result) {
    return (
      <div className="page si-empty">
        <h1>Sample analysis unavailable</h1>
        <p className="lead">The built-in JEE Main sample paper could not be loaded.</p>
        <Link to="/prepare" className="btn btn-primary">
          Practice Hub
        </Link>
      </div>
    )
  }

  const pct = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0
  const pattern = getTestPattern(test)
  const testType = getTestType(test.testTypeId)
  const timeLabel = formatTime(data.durationSeconds)
  const examPatternId = data.examPatternId ?? test.examPatternId
  const estimatedAIR =
    data.percentile != null ? estimateAIR(data.percentile, examPatternId) : data.estimatedAIR
  const perfGrade = computePerformanceGrade(result.score, result.maxScore)

  return (
    <div className="page result-page result-page-pro si-result demo-test-analysis-page">
      <div className="demo-analysis-banner" role="status">
        <div>
          <strong>Sample analysis</strong> — fixed demo for {DEMO_REPORT_STUDENT.name} (
          {DEMO_REPORT_STUDENT.classLabel}). Same Result tabs as a real submitted paper.
        </div>
        <div className="demo-analysis-banner-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onDownloadFullDiag}>
            Download full diagnostic
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onPrintFullDiag}>
            Print full / PDF
          </button>
          <Link to="/demo/report-card" className="btn btn-ghost btn-sm">
            Demo report pack
          </Link>
          <Link to="/my-results" className="btn btn-ghost btn-sm">
            My Results
          </Link>
        </div>
      </div>
      {diagStatus ? (
        <p className="form-hint" role="status">
          {diagStatus}
        </p>
      ) : null}

      <details className="card demo-analysis-legend">
        <summary>What you can explore on this page</summary>
        <div className="demo-analysis-legend-grid">
          {DEMO_ANALYSIS_HIGHLIGHTS.map((block) => (
            <div key={block.group}>
              <h3>{block.group}</h3>
              <ul>
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>

      <header className="si-result-hero">
        <div className="si-result-hero-glow" aria-hidden="true" />
        <div className="si-result-hero-left">
          <p className="result-page-eyebrow">Result & analysis · Demo</p>
          <h1>{data.title}</h1>
          <p className="result-user">
            {data.userName}
            {data.userEmail ? ` · ${data.userEmail}` : ''}
          </p>
          <div className="result-badges si-result-badges">
            <span className="badge badge-exam" style={{ background: pattern.color }}>
              {pattern.name}
            </span>
            <span className="badge badge-type">
              {testType.icon} {testType.name}
            </span>
            <span className="badge badge-time">⏱ {timeLabel}</span>
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
                <strong>{Number(estimatedAIR).toLocaleString('en-IN')}</strong>
                <span>
                  Est. AIR <em className="si-est-label">(estimate)</em>
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

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
          subtitle="Sorted weakest first — same panel as a real Result page."
          maxRows={6}
        />
      )}

      <ResultShareReport
        data={data}
        test={test}
        studentName={data.userName}
        attemptId={attemptId}
      />

      <p className="si-ff-hint form-hint">
        For practice AIR across many mocks, open <Link to="/form-forecast">Rank Forecast</Link>. Full
        printable diagnostic: use <strong>Download full diagnostic report</strong> above, or open{' '}
        <Link to="/demo/report-card">Demo report pack</Link>.
      </p>

      <ResultAnalysisDashboard
        data={data}
        test={test}
        testId={test.id}
        studentGrades={studentGradeMap}
        comparison={null}
        attempts={[]}
        attemptId={null}
      />

      <ResultNextSteps
        testId={test.id}
        examPatternId={examPatternId}
        topWeakChapter={weakTopics[0]?.chapter}
        topWeakSubjects={topWeakSubjects}
        testTypeId={data.testTypeId}
        wrongCount={wrongCount}
      />

      <div className="result-actions si-result-actions si-result-actions-secondary">
        <Link to="/demo/report-card" className="btn btn-ghost btn-sm">
          Demo report card
        </Link>
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
