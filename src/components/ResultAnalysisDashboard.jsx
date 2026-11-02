import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PercentileBar from './PercentileBar'
import VerticalCompareChart from './VerticalCompareChart'
import QuestionLevelAnalysis from './QuestionLevelAnalysis'
import ResultAnalysisOverview from './ResultAnalysisOverview'
import ResultInsightsSection from './ResultInsightsSection'
import ResultAiCoach from './ResultAiCoach'
import ResultChartsPanel from './ResultChartsPanel'
import WeakChaptersPanel from './WeakChaptersPanel'
import CohortDataNote from './CohortDataNote'
import { savePracticePrefill } from '../utils/aiMastery.js'
import { buildResultCoachInsights } from '../utils/resultInsights.js'
import {
  buildChapterLevelAnalysis,
  buildCohortScoreComparison,
  buildDifficultyAnalysis,
  buildDifficultyInsight,
  buildPercentileMilestones,
  buildStaminaInsight,
  buildStaminaQuarters,
  buildTimeBehaviourAnalysis,
  buildTimeAnalytics,
  buildTimeSinks,
  buildWeakTopics,
  buildChapterSubjectMap,
  getAnalysisSubjectTabs,
} from '../utils/testAnalysis.js'
import { COMPARE_SERIES_LABELS, chartSeries } from '../utils/chartColors.js'
import { formatTime } from '../utils/formatTime.js'

const MAIN_TABS = [
  { id: 'summary', label: 'Overall Score', short: 'Score', icon: '📊' },
  { id: 'time', label: 'Time & Behaviour', short: 'Time', icon: '⏱' },
  { id: 'questions', label: 'Question-wise', short: 'Questions', icon: '📝' },
  { id: 'difficulty', label: 'Difficulty', short: 'Difficulty', icon: '🎯' },
  { id: 'stamina', label: 'Stamina', short: 'Stamina', icon: '💪' },
  { id: 'chapter', label: 'Chapterwise', short: 'Chapters', icon: '📚' },
  { id: 'charts', label: 'Charts', short: 'Charts', icon: '📈' },
  { id: 'coach', label: 'Insight Coach', short: 'Coach', icon: '🤖' },
]

const SUBJECT_TAB_IDS = new Set([
  'summary',
  'time',
  'questions',
  'difficulty',
  'stamina',
  'chapter',
])

function InsightCallout({ title, children }) {
  if (!children) return null
  return (
    <div className="rad-callout">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  )
}

/**
 * @param {{
 *   data: object
 *   test: import('../data/tests').Test
 *   testId: string
 *   studentGrades?: Map<string, string>
 *   comparison?: ReturnType<import('../utils/resultInsights.js').compareWithPreviousAttempt> | null
 *   attempts?: import('../utils/attemptHistory.js').Attempt[]
 * }} props
 */
export default function ResultAnalysisDashboard({
  data,
  test,
  testId,
  studentGrades,
  comparison,
  attempts = [],
}) {
  const navigate = useNavigate()
  const [mainTab, setMainTab] = useState('summary')
  const [focusQuestionId, setFocusQuestionId] = useState(/** @type {string | null} */ (null))
  const subjectTabs = useMemo(
    () => getAnalysisSubjectTabs(test.examPatternId),
    [test.examPatternId],
  )
  const [subjectTab, setSubjectTab] = useState('overall')
  const showSubjectTabs = SUBJECT_TAB_IDS.has(mainTab)

  const { result } = data
  const questionTimes = data.questionTimes ?? {}

  const scoreComparison = useMemo(
    () => buildCohortScoreComparison(testId, result, test.examPatternId, subjectTab),
    [testId, result, test.examPatternId, subjectTab],
  )

  const percentileBar = useMemo(
    () => buildPercentileMilestones(testId, result.score, result.maxScore),
    [testId, result.score, result.maxScore],
  )

  const stamina = useMemo(
    () => buildStaminaQuarters(result, subjectTab),
    [result, subjectTab],
  )

  const difficulty = useMemo(
    () => buildDifficultyAnalysis(result, testId, test.questions, subjectTab),
    [result, testId, test.questions, subjectTab],
  )

  const chapters = useMemo(
    () => buildChapterLevelAnalysis(result, testId, subjectTab),
    [result, testId, subjectTab],
  )

  const chaptersWeakFirst = useMemo(() => {
    return [...chapters].sort((a, b) => {
      const accA = a.correct + a.wrong > 0 ? a.correct / (a.correct + a.wrong) : 1
      const accB = b.correct + b.wrong > 0 ? b.correct / (b.correct + b.wrong) : 1
      return accA - accB
    })
  }, [chapters])

  const timeBehaviour = useMemo(
    () =>
      buildTimeBehaviourAnalysis({
        result,
        questionTimes,
        examPatternId: test.examPatternId,
        subjectFilter: subjectTab,
        testId,
      }),
    [result, questionTimes, test.examPatternId, subjectTab, testId],
  )

  const timeDetail = useMemo(
    () =>
      buildTimeAnalytics({
        result,
        questionTimes,
        examPatternId: test.examPatternId,
      }),
    [result, questionTimes, test.examPatternId],
  )

  const timeSinks = useMemo(
    () =>
      buildTimeSinks({
        result,
        questionTimes,
        avgSeconds: timeDetail.avgSeconds,
        subjectFilter: subjectTab,
      }),
    [result, questionTimes, timeDetail.avgSeconds, subjectTab],
  )

  const weakTopics = useMemo(
    () => buildWeakTopics(result.byChapter ?? {}),
    [result.byChapter],
  )

  const chapterSubjects = useMemo(
    () => buildChapterSubjectMap(result.perQuestion ?? []),
    [result.perQuestion],
  )

  const filteredWeakTopics = useMemo(() => {
    if (subjectTab === 'overall') return weakTopics
    return weakTopics.filter((t) => (chapterSubjects[t.chapter] ?? []).includes(subjectTab))
  }, [weakTopics, subjectTab, chapterSubjects])

  const coachInsights = useMemo(
    () => buildResultCoachInsights(data, test, attempts),
    [data, test, attempts],
  )

  const staminaInsight = useMemo(() => buildStaminaInsight(stamina), [stamina])
  const difficultyInsight = useMemo(() => buildDifficultyInsight(difficulty), [difficulty])

  const staminaChart = useMemo(() => {
    if (!stamina.length) return null
    return {
      categories: stamina.map((q) => ({ id: q.id, label: q.label, sub: q.range })),
      series: ['correct', 'incorrect', 'unattempted'].map((key) => {
        const labels = { correct: 'Correct', incorrect: 'Incorrect', unattempted: 'Unattempted' }
        return {
          ...chartSeries(key === 'incorrect' ? 'wrong' : key, labels[key]),
          values: Object.fromEntries(
            stamina.map((q) => [q.id, q[key === 'unattempted' ? 'unattempted' : key]]),
          ),
        }
      }),
    }
  }, [stamina])

  const difficultyChart = useMemo(
    () => ({
      categories: difficulty.map((d) => ({ id: d.id, label: d.label, maxScore: d.maxScore })),
      series: [
        {
          ...chartSeries('you', 'Your score'),
          values: Object.fromEntries(difficulty.map((d) => [d.id, d.score])),
        },
        {
          ...chartSeries('max', 'Max possible'),
          values: Object.fromEntries(difficulty.map((d) => [d.id, d.maxScore])),
        },
      ],
    }),
    [difficulty],
  )

  const chapterChart = useMemo(() => {
    const top = chapters.slice(0, 8)
    if (!top.length) return null
    return {
      categories: top.map((c) => ({
        id: c.chapter,
        label: c.chapter.length > 14 ? `${c.chapter.slice(0, 12)}…` : c.chapter,
        maxScore: c.maxScore,
      })),
      series: ['you', 'topper', 'top10', 'top25', 'allAvg'].map((key) => {
        const field = key === 'you' ? 'score' : key
        return {
          ...chartSeries(key, COMPARE_SERIES_LABELS[key]),
          values: Object.fromEntries(top.map((c) => [c.chapter, c[field]])),
        }
      }),
    }
  }, [chapters])

  const activeTabMeta = MAIN_TABS.find((t) => t.id === mainTab)
  const subjectLabel = subjectTabs.find((t) => t.id === subjectTab)?.label ?? 'Overall'

  const openQuestion = (questionId) => {
    setFocusQuestionId(questionId)
    setMainTab('questions')
  }

  const onPracticeChapter = (chapter) => {
    savePracticePrefill({
      examPatternId: test.examPatternId,
      chapters: [chapter],
      subjects: chapterSubjects[chapter] ?? [],
    })
    navigate('/practice')
  }

  return (
    <div className="rad-dashboard rad-dashboard-pro">
      <div className="rad-main-tabs" role="tablist" aria-label="Analysis sections">
        {MAIN_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={mainTab === t.id}
            className={`rad-main-tab ${mainTab === t.id ? 'active' : ''}`}
            onClick={() => setMainTab(t.id)}
          >
            <span className="rad-tab-icon" aria-hidden>
              {t.icon}
            </span>
            <span className="rad-tab-full">{t.label}</span>
            <span className="rad-tab-short">{t.short}</span>
          </button>
        ))}
      </div>

      {showSubjectTabs && (
        <div className="rad-sub-tabs" role="tablist" aria-label="Subject filter">
          {subjectTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={subjectTab === t.id}
              className={`rad-sub-tab ${subjectTab === t.id ? 'active' : ''}`}
              onClick={() => setSubjectTab(t.id)}
            >
              <span className="rad-sub-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="rad-panel-head">
        <h2>
          {activeTabMeta?.icon} {activeTabMeta?.label}
        </h2>
        <p>
          {showSubjectTabs ? (
            <>
              Viewing <strong>{subjectLabel}</strong> — switch subject chips above to filter.
            </>
          ) : mainTab === 'charts' ? (
            'Charts use this attempt and your recent history. Device averages are labelled honestly.'
          ) : (
            'Personal coaching for this one attempt — strengths, focus areas, and next steps.'
          )}
        </p>
      </div>

      {mainTab === 'summary' && (
        <div className="rad-panel">
          {comparison && comparison.sameTest && (
            <div
              className={`si-compare-banner ${comparison.improved ? 'si-compare-up' : 'si-compare-down'}`}
            >
              {comparison.improved ? '▲' : '▼'} vs your previous attempt:{' '}
              <strong>
                {comparison.scoreDelta >= 0 ? '+' : ''}
                {comparison.scoreDelta} marks ({comparison.pctDelta >= 0 ? '+' : ''}
                {comparison.pctDelta}%)
              </strong>
            </div>
          )}

          <PercentileBar {...percentileBar} />

          <CohortDataNote studentCount={scoreComparison.studentCount} />

          <VerticalCompareChart
            title="Overall & subject-wise marks"
            subtitle={`You vs local best, local top 10%, local top 25%, and device average${
              scoreComparison.studentCount > 0
                ? ` · ${scoreComparison.studentCount} attempt${scoreComparison.studentCount === 1 ? '' : 's'} on this device`
                : ''
            }`}
            categories={scoreComparison.categories.map((c) => ({
              id: c.id,
              label: c.label,
              maxScore: c.maxScore,
            }))}
            series={scoreComparison.series}
            showMaxInLabel
          />

          <ResultAnalysisOverview data={data} test={test} />

          <p className="si-ff-hint form-hint">
            Cross-test Exam Fit and Revision Ladder:{' '}
            <Link to="/form-forecast">Form Forecast</Link> ·{' '}
            <Link to="/form-forecast#revision-ladder">Revision Ladder</Link>
          </p>
        </div>
      )}

      {mainTab === 'charts' && (
        <div className="rad-panel">
          <CohortDataNote studentCount={scoreComparison.studentCount} />
          <ResultChartsPanel
            data={data}
            test={test}
            attempts={attempts}
            scoreComparison={scoreComparison}
          />
          <VerticalCompareChart
            title="You vs device cohort"
            subtitle={
              scoreComparison.studentCount > 0
                ? `Compared with ${scoreComparison.studentCount} attempt${
                    scoreComparison.studentCount === 1 ? '' : 's'
                  } on this device — not a national rank`
                : 'Take this test with more students on this device for richer averages'
            }
            categories={scoreComparison.categories.map((c) => ({
              id: c.id,
              label: c.label,
              maxScore: c.maxScore,
            }))}
            series={scoreComparison.series}
            showMaxInLabel
          />
        </div>
      )}

      {mainTab === 'coach' && (
        <div className="rad-panel">
          <ResultAiCoach insights={coachInsights} />
          <ResultInsightsSection result={result} examPatternId={test.examPatternId} />
        </div>
      )}

      {mainTab === 'time' && (
        <div className="rad-panel">
          <CohortDataNote studentCount={timeBehaviour.studentCount} />
          <InsightCallout title="Pacing">
            {timeSinks.sinks.length
              ? `${timeSinks.sinks.length} time sink${timeSinks.sinks.length === 1 ? '' : 's'} — questions slower than ~${timeSinks.threshold}s that still went wrong. Tap a row to open it.`
              : `Average ${timeDetail.avgSeconds}s per question. No slow-and-wrong sinks in this view.`}
          </InsightCallout>

          <VerticalCompareChart
            title="Average time per question"
            subtitle="Lower is better — your seconds vs device average"
            categories={timeBehaviour.categories.map((c) => ({
              id: c.id,
              label: c.label,
            }))}
            series={timeBehaviour.series}
            valueSuffix="s"
          />

          <div className="rad-kpi-row">
            <div className="rad-kpi">
              <span>Total time</span>
              <strong>{timeDetail.totalLabel}</strong>
            </div>
            <div className="rad-kpi">
              <span>Avg per question</span>
              <strong>{timeDetail.avgSeconds}s</strong>
            </div>
            <div className="rad-kpi">
              <span>Time sinks</span>
              <strong>{timeSinks.sinks.length}</strong>
            </div>
            <div className="rad-kpi">
              <span>Questions timed</span>
              <strong>
                {timeDetail.slowest.filter((t) => t.seconds > 0).length} /{' '}
                {result.perQuestion?.length ?? 0}
              </strong>
            </div>
          </div>

          <div className="rad-two-col">
            <div className="card rad-slow-list rad-sink-list">
              <h3>Time sinks</h3>
              <p className="form-hint">
                Slow and wrong (or partial) — these ate the clock without marks.
              </p>
              {timeSinks.sinks.length ? (
                <ul>
                  {timeSinks.sinks.map((t) => (
                    <li key={t.questionId}>
                      <button
                        type="button"
                        className="rad-sink-jump"
                        onClick={() => openQuestion(t.questionId)}
                      >
                        <span className="perf-slow-q">Q{t.index}</span>
                        <span className="perf-slow-time">{t.seconds}s</span>
                        {t.chapter ? <span className="rad-muted">{t.chapter}</span> : null}
                        <span className={`rad-grade ${t.grade}`}>{t.grade}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="form-hint">No time sinks in this subject filter.</p>
              )}
            </div>

            {timeDetail.slowest.some((t) => t.seconds > 0) && (
              <div className="card rad-slow-list">
                <h3>Longest time</h3>
                <p className="form-hint">Most seconds spent — including questions you got right.</p>
                <ul>
                  {timeDetail.slowest
                    .filter((t) => t.seconds > 0)
                    .slice(0, 10)
                    .map((t) => (
                      <li key={t.questionId}>
                        <button
                          type="button"
                          className="rad-sink-jump"
                          onClick={() => openQuestion(t.questionId)}
                        >
                          <span className="perf-slow-q">Q{t.index}</span>
                          <span className="perf-slow-time">{t.seconds}s</span>
                          <span className={`rad-grade ${t.grade}`}>{t.grade}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>

          {timeDetail.bySubject.length > 0 && (
            <div className="card rad-time-subject">
              <h3>Time by subject</h3>
              <ul className="rad-time-subject-list">
                {timeDetail.bySubject.map((s) => (
                  <li key={s.label}>
                    <span>{s.label}</span>
                    <strong>{formatTime(s.seconds)}</strong>
                    <span className="rad-muted">{s.count} Q</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {mainTab === 'questions' && (
        <div className="rad-panel">
          <QuestionLevelAnalysis
            testId={testId}
            questions={test.questions}
            studentGrades={studentGrades}
            subjectFilter={subjectTab}
            perQuestion={result.perQuestion}
            initialQuestionId={focusQuestionId}
          />
        </div>
      )}

      {mainTab === 'difficulty' && (
        <div className="rad-panel">
          <InsightCallout title="Difficulty read">{difficultyInsight}</InsightCallout>
          <CohortDataNote studentCount={scoreComparison.studentCount} />
          <VerticalCompareChart
            title="Score by difficulty level"
            subtitle="Easy / Medium / Hard — based on how students on this device performed"
            categories={difficultyChart.categories}
            series={difficultyChart.series}
            showMaxInLabel
          />

          <div className="rad-diff-grid">
            {difficulty.map((d) => (
              <div key={d.id} className={`rad-diff-card rad-diff-${d.id}`}>
                <h4>{d.label}</h4>
                <p>
                  Score <strong>{d.score}</strong>/{d.maxScore}
                </p>
                <p>
                  <strong className="text-correct">{d.correct}</strong> correct ·{' '}
                  <strong className="text-wrong">{d.incorrect}</strong> wrong · {d.unattempted}{' '}
                  skipped
                </p>
                <p className="rad-diff-acc">{d.accuracy}% accuracy on attempted</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {mainTab === 'chapter' && (
        <div className="rad-panel">
          <CohortDataNote studentCount={scoreComparison.studentCount} />
          {chapterChart ? (
            <VerticalCompareChart
              title="Chapter-wise marks"
              subtitle="Your score vs local device benchmarks — largest chapters in this view"
              categories={chapterChart.categories}
              series={chapterChart.series}
              showMaxInLabel
            />
          ) : (
            <div className="vchart-empty card">
              <p>No chapter data for this subject filter.</p>
            </div>
          )}

          {chaptersWeakFirst.length > 0 && (
            <div className="rad-chapter-table-wrap card">
              <table className="rad-chapter-table">
                <thead>
                  <tr>
                    <th>Chapter</th>
                    <th>Score</th>
                    <th>Accuracy</th>
                    <th>Correct</th>
                    <th>Wrong</th>
                    <th>Skipped</th>
                    <th>Device avg</th>
                    <th aria-label="Practice" />
                  </tr>
                </thead>
                <tbody>
                  {chaptersWeakFirst.map((c) => {
                    const attempted = c.correct + c.wrong
                    const acc = attempted > 0 ? Math.round((c.correct / attempted) * 100) : 0
                    return (
                      <tr key={c.chapter} className={acc < 50 ? 'rad-chapter-weak' : ''}>
                        <td>
                          <strong>{c.chapter}</strong>
                        </td>
                        <td>
                          {c.score}/{c.maxScore}
                        </td>
                        <td>
                          <span className={`si-weak-acc${acc < 50 ? ' low' : ''}`}>{acc}%</span>
                        </td>
                        <td className="text-correct">{c.correct}</td>
                        <td className="text-wrong">{c.wrong}</td>
                        <td>{c.unattempted}</td>
                        <td>{c.allAvg}</td>
                        <td className="si-weak-action">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm si-practice-btn"
                            onClick={() => onPracticeChapter(c.chapter)}
                          >
                            Practice
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filteredWeakTopics.length > 0 && (
            <WeakChaptersPanel
              topics={filteredWeakTopics}
              examPatternId={test.examPatternId}
              chapterSubjects={chapterSubjects}
              compact
              title="Focus areas"
              subtitle="Sort and practice weak chapters from this test."
            />
          )}
        </div>
      )}

      {mainTab === 'stamina' && (
        <div className="rad-panel">
          <InsightCallout title="Stamina read">{staminaInsight}</InsightCallout>
          <VerticalCompareChart
            title="Stamina — performance across the paper"
            subtitle="Correct vs incorrect vs unattempted in each quarter of the test"
            categories={
              staminaChart?.categories.map((c) => ({
                id: c.id,
                label: `${c.label} (${c.sub})`,
              })) ?? []
            }
            series={staminaChart?.series ?? []}
          />

          <div className="rad-stamina-grid">
            {stamina.map((q) => (
              <div key={q.id} className="rad-stamina-card card">
                <h4>{q.label}</h4>
                <p className="rad-stamina-range">{q.range}</p>
                <div className="rad-stamina-stats">
                  <div>
                    <strong className="text-correct">{q.correct}</strong>
                    <span>Correct</span>
                  </div>
                  <div>
                    <strong className="text-wrong">{q.incorrect}</strong>
                    <span>Incorrect</span>
                  </div>
                  <div>
                    <strong>{q.unattempted}</strong>
                    <span>Skipped</span>
                  </div>
                  <div>
                    <strong>{q.attempted}</strong>
                    <span>Attempted</span>
                  </div>
                </div>
                <div className="rad-stamina-bar">
                  {q.total > 0 && (
                    <>
                      <span
                        className="seg correct"
                        style={{ width: `${(q.correct / q.total) * 100}%` }}
                      />
                      <span
                        className="seg wrong"
                        style={{ width: `${(q.incorrect / q.total) * 100}%` }}
                      />
                      <span
                        className="seg skipped"
                        style={{ width: `${(q.unattempted / q.total) * 100}%` }}
                      />
                    </>
                  )}
                </div>
                <p className="rad-stamina-pct">
                  {q.total > 0 ? Math.round((q.correct / q.total) * 100) : 0}% accuracy this quarter
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
