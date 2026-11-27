import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ResponsiveContainer,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
  Line,
} from 'recharts'
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
import { buildErrorDnaTypes } from '../utils/resultAdvancedAnalytics.js'
import { attemptToResultData } from '../utils/attemptHistory.js'

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
  const attemptList = attempts.length ? attempts : []
  const forecastBundle = buildFormForecast(attemptList)
  const fit = buildExamFit(attemptList)
  const precision = buildPrecisionMap(attemptList)
  const primary = forecastBundle.byExam[forecastBundle.primaryExamId]
  const latest = attemptList[0]
  const activeTab = ANALYTICS_TABS.find((t) => t.id === tab)

  const trendChart = useMemo(
    () =>
      (stats.trend || []).map((t, i) => ({
        i: i + 1,
        label: new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        percentile: Math.round(t.percentile),
        scorePct: t.maxScore > 0 ? Math.round((t.score / t.maxScore) * 100) : 0,
      })),
    [stats.trend],
  )

  const activityChart = useMemo(
    () => (stats.activityByDay || []).map((d) => ({ day: d.day, count: d.count })),
    [stats.activityByDay],
  )

  const subjectChart = useMemo(() => {
    return ALL_SUBJECTS.filter((s) => stats.bySubject?.[s.id]).map((s) => {
      const d = stats.bySubject[s.id]
      const pct = d.max > 0 ? Math.round((d.score / d.max) * 100) : 0
      return { id: s.id, label: s.label, pct, color: s.color }
    })
  }, [stats.bySubject])

  const errorDna = useMemo(() => {
    const recent = (attemptList || []).slice(0, 8)
    /** @type {Record<string, number>} */
    const totals = {}
    let tagged = 0
    for (const att of recent) {
      const data = attemptToResultData(att)
      if (!data?.result?.perQuestion?.length) continue
      const dna = buildErrorDnaTypes({
        result: data.result,
        questionTimes: data.questionTimes ?? {},
        paperDurationSec: data.durationSeconds ?? 0,
        wrongReasons: data.wrongReasons ?? att.wrongReasons ?? {},
      })
      for (const [key, n] of Object.entries(dna.counts || {})) {
        if (!n) continue
        totals[key] = (totals[key] ?? 0) + n
        tagged += n
      }
    }
    if (tagged >= 3) {
      const meta = {
        question_misread: { name: 'Question Misread', color: '#e11d48' },
        question_misunderstanding: { name: 'Question Misunderstanding', color: '#d97706' },
        conceptual_error: { name: 'Conceptual Error', color: '#7c3aed' },
        calculation_error: { name: 'Calculation error', color: '#2563eb' },
        formula_error: { name: 'Formula error', color: '#0d9488' },
        guess: { name: 'Guess', color: '#64748b' },
        silly: { name: 'Silly / avoidable', color: '#e11d48' },
        overtime: { name: 'Overtime wrong', color: '#c2410c' },
        concept: { name: 'Concept gap', color: '#6d28d9' },
        calc: { name: 'Calc / numerical', color: '#1d4ed8' },
        other: { name: 'Other', color: '#94a3b8' },
      }
      return Object.keys(totals)
        .map((key) => ({
          name: meta[key]?.name ?? key,
          value: totals[key],
          color: meta[key]?.color ?? '#64748b',
        }))
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value)
    }
    // Fallback: weak-chapter donut when type tags are thin
    const weak = (stats.weakChapters || []).slice(0, 6)
    if (!weak.length) return []
    const colors = ['#e11d48', '#d97706', '#0d9488', '#2563eb', '#7c3aed', '#64748b']
    return weak.map((w, i) => ({
      name: w.chapter || w.topic || w.label || `Topic ${i + 1}`,
      value: Math.max(1, Math.round(100 - (w.accuracy ?? w.pct ?? 50))),
      color: colors[i % colors.length],
    }))
  }, [attemptList, stats.weakChapters])

  return (
    <div className="si-analytics">
      {(primary?.ready || fit.score > 0) && (
        <section className="ff-analytics-teaser card">
          <div className="ff-analytics-teaser-main">
            <p className="ff-eyebrow">Also on Rank Forecast</p>
            <h2>Practice AIR snapshot</h2>
            <p className="form-hint">
              {primary?.ready
                ? `${primary.examLabel} practice AIR ~${Number(primary.air).toLocaleString('en-IN')} · Exam Fit ${fit.score}/100 — full detail on Rank Forecast.`
                : `Exam Fit ${fit.score}/100 — open Rank Forecast for practice AIR, Precision Map, and Insight Coach.`}
            </p>
          </div>
          <Link to="/form-forecast" className="btn btn-primary btn-sm">
            Open Rank Forecast →
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
        estimates live on Rank Forecast and are labelled as estimates.
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
          <section className="card si-chart-card si-rechart-card">
            <h2>Percentile & score trend</h2>
            <p className="form-hint">Last {trendChart.length} attempts — dual-axis view</p>
            {trendChart.length < 2 ? (
              <p className="form-hint">Need at least two attempts for a trend line.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={trendChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="siPctFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0d9488" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#0d9488" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf2" />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis
                    yAxisId="left"
                    domain={[0, 100]}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="percentile"
                    name="Percentile"
                    stroke="#0d9488"
                    fill="url(#siPctFill)"
                    strokeWidth={2.5}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="scorePct"
                    name="Score %"
                    stroke="#2563eb"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
            <p className="aqm-takeaway">
              {stats.scoreTrendDelta > 0
                ? `Up ${stats.scoreTrendDelta} pts vs last test — protect this streak with one timed mock this week.`
                : stats.scoreTrendDelta < 0
                  ? `Down ${Math.abs(stats.scoreTrendDelta)} pts vs last — open weak chapters and drill the top two.`
                  : 'Take another mock to unlock a clearer trajectory.'}
            </p>
          </section>

          <section className="card si-chart-card si-rechart-card">
            <h2>Activity</h2>
            <p className="form-hint">Tests per day (recent)</p>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={activityChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf2" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Tests" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </section>

          {errorDna.length > 0 && (
            <section className="card si-chart-card si-rechart-card si-error-dna">
              <h2>Personal error DNA</h2>
              <p className="form-hint">
                Your “Why I got it wrong” tags when set; otherwise auto silly / overtime / concept /
                calc. Falls back to weak chapters when tags are thin.
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={errorDna}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={78}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {errorDna.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [`gap weight ${v}`, n]} />
                  <Legend verticalAlign="bottom" height={48} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </section>
          )}
        </div>
      )}

      {tab === 'subjects' && subjectChart.length > 0 && (
        <section className="card si-subject-mastery si-rechart-card">
          <h2>Subject performance</h2>
          <p className="form-hint">Average score % across all your attempts</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={subjectChart}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf2" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="label" width={100} tick={{ fill: '#334155', fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v}%`, 'Avg score']} />
              <Bar dataKey="pct" name="Avg score %" radius={[0, 8, 8, 0]} maxBarSize={22}>
                {subjectChart.map((d) => (
                  <Cell key={d.id} fill={d.color || '#2563eb'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="si-subject-tags">
            {stats.strongSubjects?.slice(0, 3).map((s) => (
              <span key={s.id} className="si-tag si-tag-good">
                Strong · {ALL_SUBJECTS.find((x) => x.id === s.id)?.label || s.id}
              </span>
            ))}
            {stats.weakSubjects?.slice(0, 3).map((s) => (
              <span key={s.id} className="si-tag si-tag-weak">
                Needs work · {ALL_SUBJECTS.find((x) => x.id === s.id)?.label || s.id}
              </span>
            ))}
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
