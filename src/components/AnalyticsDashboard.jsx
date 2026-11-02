import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import StatBar from './StatBar'
import { ALL_SUBJECTS } from '../data/subjects'
import { formatTime } from '../utils/formatTime'
import AiStudyPlanPanel from './AiStudyPlanPanel'
import InsightCoachPanel from './InsightCoachPanel'
import WeakChaptersPanel from './WeakChaptersPanel'
import ResultNextSteps from './ResultNextSteps'
import { savePracticePrefill } from '../utils/aiMastery.js'
import { buildExamFit } from '../utils/examFit.js'
import { buildFormForecast } from '../utils/formForecast.js'
import { buildPrecisionMap } from '../utils/precisionMap.js'

const ANALYTICS_TABS = [
  { id: 'overview', label: 'Overview', short: 'Overview', icon: '📊' },
  { id: 'trends', label: 'Trends', short: 'Trends', icon: '📈' },
  { id: 'subjects', label: 'Subjects', short: 'Subjects', icon: '📚' },
  { id: 'chapters', label: 'Chapterwise', short: 'Chapters', icon: '🎯' },
  { id: 'time', label: 'Time sinks', short: 'Time', icon: '⏱' },
  { id: 'coach', label: 'Insight Coach', short: 'Coach', icon: '🤖' },
]

/**
 * Rich student analytics dashboard.
 * @param {{ stats: ReturnType<import('../utils/analytics.js').buildUserAnalytics>, attempts?: import('../utils/attemptHistory.js').Attempt[] }} props
 */
export default function AnalyticsDashboard({ stats, attempts = [] }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const maxTrend = Math.max(...stats.trend.map((t) => t.percentile), 1)
  const maxActivity = Math.max(...stats.activityByDay.map((d) => d.count), 1)
  const attemptList = attempts.length ? attempts : []
  const forecastBundle = buildFormForecast(attemptList)
  const fit = buildExamFit(attemptList)
  const precision = buildPrecisionMap(attemptList)
  const primary = forecastBundle.byExam[forecastBundle.primaryExamId]
  const latest = attemptList[0]
  const activeTab = ANALYTICS_TABS.find((t) => t.id === tab)

  return (
    <div className="si-analytics">
      {(primary?.ready || fit.score > 0) && (
        <section className="ff-analytics-teaser card">
          <div className="ff-analytics-teaser-main">
            <p className="ff-eyebrow">Also on Form Forecast</p>
            <h2>Practice AIR snapshot</h2>
            <p className="form-hint">
              {primary?.ready
                ? `${primary.examLabel} practice AIR ~${Number(primary.air).toLocaleString('en-IN')} · Exam Fit ${fit.score}/100 — full detail on Form Forecast.`
                : `Exam Fit ${fit.score}/100 — open Form Forecast for practice AIR, Precision Map, and Insight Coach.`}
            </p>
          </div>
          <Link to="/form-forecast" className="btn btn-primary btn-sm">
            Open Form Forecast →
          </Link>
        </section>
      )}

      <section className="si-analytics-hero">
        <div className="si-analytics-hero-main">
          <p className="si-analytics-eyebrow">Performance snapshot</p>
          <h2>Your score overview</h2>
          <p className="si-analytics-lead">
            {stats.scoreTrendDelta > 0
              ? `Up ${stats.scoreTrendDelta}% vs your last test — keep the momentum.`
              : stats.scoreTrendDelta < 0
                ? `Down ${Math.abs(stats.scoreTrendDelta)}% vs last test — review weak chapters below.`
                : 'Complete more mocks to unlock deeper trends.'}
          </p>
        </div>
        <div className="si-analytics-hero-stats">
          <div className="si-hero-stat si-hero-stat-highlight">
            <strong>{stats.avgPercentile}</strong>
            <span>Avg percentile</span>
          </div>
          <div className="si-hero-stat">
            <strong>{stats.bestPercentile}</strong>
            <span>Best percentile</span>
          </div>
          <div className="si-hero-stat">
            <strong>{stats.avgAccuracy}%</strong>
            <span>Avg accuracy</span>
          </div>
          <div className="si-hero-stat">
            <strong>{stats.streak}</strong>
            <span>Day streak</span>
          </div>
        </div>
      </section>

      <p className="si-cohort-note">
        <span className="si-cohort-badge">Your history</span>
        These charts are from your attempts on this device. Practice AIR and national-style
        estimates live on Form Forecast and are labelled as estimates.
      </p>

      <div className="rad-main-tabs si-analytics-tabs" role="tablist" aria-label="Analytics sections">
        {ANALYTICS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`rad-main-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="rad-tab-icon" aria-hidden>
              {t.icon}
            </span>
            <span className="rad-tab-full">{t.label}</span>
            <span className="rad-tab-short">{t.short}</span>
          </button>
        ))}
      </div>

      <div className="rad-panel-head">
        <h2>
          {activeTab?.icon} {activeTab?.label}
        </h2>
      </div>

      {tab === 'overview' && (
        <>
          <div className="analytics-kpi-grid si-kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Tests taken</span>
              <strong className="kpi-value">{stats.totalAttempts}</strong>
            </div>
            <div className="kpi-card highlight">
              <span className="kpi-label">Questions correct</span>
              <strong className="kpi-value">{stats.totalCorrect}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Wrong total</span>
              <strong className="kpi-value">{stats.totalWrong}</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Practice time</span>
              <strong className="kpi-value">{stats.totalTimeMinutes}m</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Avg time / Q</span>
              <strong className="kpi-value">{stats.avgTimePerQuestion}s</strong>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Skipped total</span>
              <strong className="kpi-value">{stats.totalUnattempted}</strong>
            </div>
          </div>

          {stats.recentAttempts.length > 0 && (
            <section className="card si-recent">
              <h2>Recent attempts</h2>
              <ul className="si-recent-list">
                {stats.recentAttempts.map((a) => (
                  <li key={a.id} className="si-recent-item">
                    <div className="si-recent-info">
                      <strong>{a.title}</strong>
                      <span>
                        {new Date(a.submittedAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="si-recent-scores">
                      <span className="si-recent-score">
                        {a.score}/{a.maxScore} ({a.pct}%)
                      </span>
                      <span className="si-recent-acc">{a.accuracy}% acc</span>
                      {a.durationSeconds != null && (
                        <span className="si-recent-time">{formatTime(a.durationSeconds)}</span>
                      )}
                    </div>
                    <Link to={`/result/${a.testId}?attempt=${a.id}`} className="btn btn-ghost btn-sm">
                      Analysis →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {tab === 'trends' && (
        <div className="si-analytics-two-col">
          <section className="card si-chart-card">
            <h2>Percentile trend</h2>
            <p className="form-hint">Last {stats.trend.length} attempts — higher is better</p>
            <div className="si-trend-chart">
              {stats.trend.map((t, i) => (
                <div
                  key={`${t.label}-${i}`}
                  className="si-trend-col"
                  title={`${t.percentile.toFixed(0)} percentile · ${new Date(t.date).toLocaleDateString()}`}
                >
                  <div
                    className="si-trend-bar"
                    style={{ height: `${Math.max(12, (t.percentile / maxTrend) * 100)}%` }}
                  />
                  <span className="si-trend-pct">{Math.round(t.percentile)}</span>
                  <span className="si-trend-label">
                    {new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="card si-chart-card">
            <h2>Activity</h2>
            <p className="form-hint">Tests per day (recent)</p>
            <div className="si-activity-chart">
              {stats.activityByDay.map((d) => (
                <div key={d.day} className="si-activity-col" title={`${d.count} test(s)`}>
                  <div
                    className="si-activity-bar"
                    style={{ height: `${Math.max(8, (d.count / maxActivity) * 100)}%` }}
                  />
                  <span className="si-activity-label">{d.day}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'subjects' && Object.keys(stats.bySubject).length > 0 && (
        <section className="card si-subject-mastery">
          <h2>Subject performance</h2>
          <p className="form-hint">Average score % across all your attempts</p>
          <div className="si-subject-bars">
            {ALL_SUBJECTS.filter((s) => stats.bySubject[s.id]).map((s) => {
              const d = stats.bySubject[s.id]
              const pct = d.max > 0 ? Math.round((d.score / d.max) * 100) : 0
              const isStrong = stats.strongSubjects.some((x) => x.id === s.id)
              const isWeak = stats.weakSubjects.some((x) => x.id === s.id)
              return (
                <div key={s.id} className="si-subject-row">
                  <div className="si-subject-row-head">
                    <span style={{ color: s.color }}>{s.label}</span>
                    <strong>{pct}%</strong>
                    {isStrong && <span className="si-tag si-tag-good">Strong</span>}
                    {isWeak && <span className="si-tag si-tag-weak">Needs work</span>}
                  </div>
                  <StatBar label="" value={pct} max={100} color={s.color} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {tab === 'subjects' && Object.keys(stats.bySubject).length === 0 && (
        <p className="form-hint">Subject splits appear after attempts that store subject scores.</p>
      )}

      {tab === 'chapters' && stats.weakChapters?.length > 0 && (
        <WeakChaptersPanel
          topics={stats.weakChapters}
          title="Weak chapters across all attempts"
          subtitle="Topic-wise accuracy from your history — sort and practice any chapter."
        />
      )}

      {tab === 'chapters' && !stats.weakChapters?.length && (
        <p className="form-hint">No weak-chapter pattern yet — take a few more tests.</p>
      )}

      {tab === 'time' && (
        <section className="card rad-slow-list rad-sink-list">
          <h2>Time sinks across recent tests</h2>
          <p className="form-hint">
            Slow and wrong questions from your last few attempts. Open analysis to review the paper.
          </p>
          {stats.timeSinks?.length ? (
            <ul>
              {stats.timeSinks.map((t) => (
                <li key={`${t.attemptId}-${t.questionId}`}>
                  <Link
                    className="rad-sink-jump"
                    to={`/result/${t.testId}?attempt=${t.attemptId}`}
                  >
                    <span className="perf-slow-q">Q{t.index}</span>
                    <span className="perf-slow-time">{t.seconds}s</span>
                    <span className="rad-muted">{t.chapter || t.title}</span>
                    <span className={`rad-grade ${t.grade}`}>{t.grade}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="form-hint">
              No slow-and-wrong sinks yet. Timed tests with question clocks unlock this list.
            </p>
          )}
        </section>
      )}

      {tab === 'coach' && (
        <>
          {attemptList.length > 0 && (
            <InsightCoachPanel
              forecast={primary?.ready ? primary : null}
              examFit={fit}
              precision={precision}
              analytics={{
                avgAccuracy: stats.avgAccuracy,
                avgPercentile: stats.avgPercentile,
                weakChapters: stats.weakChapters,
              }}
            />
          )}

          {stats.studyPlan && <AiStudyPlanPanel studyPlan={stats.studyPlan} />}

          <section className="card si-recommend">
            <div className="si-recommend-head">
              <span className="ai-tune-badge">AI</span>
              <h2>Recommended next steps</h2>
            </div>
            <div className="si-recommend-grid">
              {stats.recommendations.map((r) =>
                r.onNavigate ? (
                  <button
                    key={r.title}
                    type="button"
                    className="si-recommend-card"
                    onClick={() => {
                      r.onNavigate?.()
                      navigate(r.to)
                    }}
                  >
                    <strong>
                      {r.icon ? `${r.icon} ` : ''}
                      {r.title}
                    </strong>
                    <p>{r.detail}</p>
                    <span className="si-recommend-arrow">→</span>
                  </button>
                ) : (
                  <Link
                    key={r.title}
                    to={r.to}
                    className="si-recommend-card"
                    onClick={() => {
                      if (r.chapter) savePracticePrefill({ chapters: [r.chapter] })
                    }}
                  >
                    <strong>{r.title}</strong>
                    <p>{r.detail}</p>
                    <span className="si-recommend-arrow">→</span>
                  </Link>
                ),
              )}
            </div>
          </section>
        </>
      )}

      {latest && (
        <ResultNextSteps
          testId={latest.testId}
          examPatternId={latest.examPatternId}
          topWeakChapter={stats.weakChapters?.[0]?.chapter}
          testTypeId={latest.testTypeId}
        />
      )}
    </div>
  )
}
