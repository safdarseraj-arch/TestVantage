import { useMemo } from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ComposedChart,
  Area,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts'
import { Link } from 'react-router-dom'
import {
  buildOutcomeDonut,
  buildSubjectScoreBars,
  buildCumulativeTrend,
  buildSubjectRadar,
  buildMarketSnapshot,
  cohortSubjectAvgPcts,
} from '../utils/resultCharts.js'
import {
  buildSkipIq,
  buildErrorDnaTypes,
  buildPassTimeline,
  buildDreamCollegeGapTeaser,
  buildBioClockInsight,
  buildScoreFloorCeilingBand,
} from '../utils/resultAdvancedAnalytics.js'
import {
  buildDiagnosticAnalyticsPack,
  buildPersonalFixQueue,
  buildRetestDelta,
} from '../utils/diagnosticQuestionAnalytics.js'
import { getAllStudentAttempts } from '../utils/attemptHistory.js'
import AttemptQualityMatrix from './AttemptQualityMatrix.jsx'
import WhatIfScoreSimulator from './WhatIfScoreSimulator.jsx'

function ChartEmpty({ message }) {
  return (
    <div className="rcx-empty">
      <p>{message}</p>
    </div>
  )
}

function ChartCard({ title, subtitle, children, className = '', ...rest }) {
  return (
    <div className={`rcx-card card ${className}`.trim()} {...rest}>
      <div className="rcx-card-head">
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className="rcx-card-body">{children}</div>
    </div>
  )
}

function tipLabel(tip, i) {
  return typeof tip === 'string' ? tip : `tip-${i}`
}

/**
 * Professional charts hub — donut, subject bars, cumulative trend, radar, market KPIs.
 * @param {{
 *   data: object
 *   test: import('../data/tests').Test
 *   attempts?: import('../utils/attemptHistory.js').Attempt[]
 *   scoreComparison?: object | null
 *   onOpenQuestion?: (questionId: string) => void
 *   attemptId?: string | null
 * }} props
 */
export default function ResultChartsPanel({
  data,
  test,
  attempts = [],
  scoreComparison = null,
  onOpenQuestion,
  attemptId = null,
}) {
  const result = data?.result
  const examPatternId = test?.examPatternId ?? data?.examPatternId
  const questionTimes = data?.questionTimes ?? {}
  const sessionTelemetry = data?.sessionTelemetry ?? null
  const paperDurationSec = Number(data?.durationSeconds ?? test?.durationMinutes ?? 0)
    ? Number(data?.durationSeconds) || Number(test?.durationMinutes || 0) * 60
    : 0
  const questions = test?.questions ?? []

  const donut = useMemo(() => (result ? buildOutcomeDonut(result) : []), [result])
  const cohortAvgs = useMemo(() => {
    if (!scoreComparison?.studentCount) return []
    return cohortSubjectAvgPcts(scoreComparison)
  }, [scoreComparison])
  const subjectBars = useMemo(
    () => (result && examPatternId ? buildSubjectScoreBars(result, examPatternId, cohortAvgs) : []),
    [result, examPatternId, cohortAvgs],
  )
  const trend = useMemo(
    () => buildCumulativeTrend(attempts, data, examPatternId),
    [attempts, data, examPatternId],
  )
  const radar = useMemo(
    () => (result && examPatternId ? buildSubjectRadar(result, examPatternId) : []),
    [result, examPatternId],
  )
  const snapshot = useMemo(
    () => buildMarketSnapshot(data, attempts, scoreComparison),
    [data, attempts, scoreComparison],
  )
  const skipIq = useMemo(
    () =>
      result
        ? buildSkipIq({ result, questionTimes, sessionTelemetry, paperDurationSec })
        : null,
    [result, questionTimes, sessionTelemetry, paperDurationSec],
  )
  const wrongReasons = data?.wrongReasons ?? {}
  const errorDna = useMemo(
    () =>
      result
        ? buildErrorDnaTypes({
            result,
            questionTimes,
            paperDurationSec,
            questions,
            wrongReasons,
          })
        : null,
    [result, questionTimes, paperDurationSec, questions, wrongReasons],
  )
  const passTimeline = useMemo(
    () =>
      result
        ? buildPassTimeline({ result, sessionTelemetry, examPatternId })
        : null,
    [result, sessionTelemetry, examPatternId],
  )
  const dreamGap = useMemo(
    () =>
      result
        ? buildDreamCollegeGapTeaser({
            result,
            questionTimes,
            paperDurationSec,
            questions,
            examPatternId,
            estimatedAIR: data?.estimatedAIR,
          })
        : null,
    [result, questionTimes, paperDurationSec, questions, examPatternId, data?.estimatedAIR],
  )

  const bioClock = useMemo(
    () =>
      buildBioClockInsight({
        currentAttempt: {
          startedAt: data?.startedAt,
          submittedAt: data?.submittedAt,
          score: result?.score,
          maxScore: result?.maxScore,
          accuracy: result?.accuracy,
        },
        attempts: attempts.map((a) => ({
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          score: a.score,
          maxScore: a.maxScore,
          accuracy: a.accuracy,
        })),
      }),
    [data?.startedAt, data?.submittedAt, result, attempts],
  )

  const scoreBand = useMemo(
    () =>
      result
        ? buildScoreFloorCeilingBand({
            result,
            questionTimes,
            paperDurationSec,
            questions,
          })
        : null,
    [result, questionTimes, paperDurationSec, questions],
  )

  const diagnosticStudentPack = useMemo(() => {
    const testId = test?.id ?? data?.testId
    if (!result?.perQuestion?.length || !testId) {
      return { trap: null, fixQueue: null, retest: null, tabs: null }
    }
    // Cohort is device-wide for this paper (same source as peer / question-level stats).
    let samePaper = getAllStudentAttempts().filter((a) => a.testId === testId)
    if (samePaper.length < 2) {
      samePaper = (attempts || []).filter((a) => a.testId === testId)
    }
    const pack =
      samePaper.length >= 2
        ? buildDiagnosticAnalyticsPack(samePaper, {
            testId,
            studentPerQuestion: result.perQuestion,
            studentQuestionTimes: questionTimes,
          })
        : null
    const trap =
      pack?.student ||
      {
        ready: false,
        takeaway:
          'When more classmates finish this same paper, High-mistake and High-skip rates appear here.',
        trapFallRate: null,
        timeSinkRate: null,
        tabASeen: 0,
        tabBSeen: 0,
      }
    const fixQueue = pack?.tabs
      ? buildPersonalFixQueue({
          perQuestion: result.perQuestion,
          tabs: pack.tabs,
          limit: 8,
        })
      : {
          ready: false,
          items: [],
          takeaway:
            'When more classmates finish this paper, your High-mistake / High-skip fix list appears here.',
        }

    const priorSamePaper = (attempts || []).filter((a) => {
      if (a.testId !== testId) return false
      if (attemptId && a.id === attemptId) return false
      // Prefer older attempts than the current one when timestamps exist
      const curAt = Number(data?.submittedAt) || 0
      const aAt = Number(a.submittedAt) || 0
      if (curAt && aAt) return aAt < curAt
      return true
    })
    const retest = buildRetestDelta({
      currentPerQuestion: result.perQuestion,
      priorAttempts: priorSamePaper,
    })

    return { trap, fixQueue, retest, tabs: pack?.tabs || null }
  }, [
    attempts,
    test?.id,
    data?.testId,
    data?.submittedAt,
    result,
    questionTimes,
    attemptId,
  ])

  const trapMetrics = diagnosticStudentPack.trap
  const fixQueue = diagnosticStudentPack.fixQueue
  const retestDelta = diagnosticStudentPack.retest

  const totalOutcome = donut.reduce((s, d) => s + d.value, 0)
  const trendIsWithinTest = trend.length > 0 && trend.every((p) => p.withinTest)
  const hasMarketAvg = subjectBars.some((b) => b.marketAvgPct != null)

  if (!result) {
    return <ChartEmpty message="No result data to chart yet." />
  }

  return (
    <section className="rcx-panel" aria-label="Performance charts">
      {snapshot && (
        <div className="rcx-snapshot">
          <div className="rcx-snap-item">
            <strong>{snapshot.scorePct}%</strong>
            <span>Score</span>
          </div>
          <div className="rcx-snap-item">
            <strong>{snapshot.accuracy}%</strong>
            <span>Accuracy</span>
          </div>
          <div className="rcx-snap-item">
            <strong>{snapshot.avgTimeSec != null ? `${snapshot.avgTimeSec}s` : '—'}</strong>
            <span>Avg / question</span>
          </div>
          <div className="rcx-snap-item">
            <strong>{snapshot.percentile != null ? snapshot.percentile.toFixed(1) : '—'}</strong>
            <span>Percentile</span>
          </div>
          <div className="rcx-snap-item">
            <strong>{snapshot.attemptCount}</strong>
            <span>Your attempts</span>
          </div>
          {snapshot.vsMarket && snapshot.vsMarket.studentCount > 0 && (
            <div
              className={`rcx-snap-item rcx-snap-market ${
                snapshot.vsMarket.ahead ? 'rcx-ahead' : 'rcx-behind'
              }`}
            >
              <strong>
                {snapshot.vsMarket.delta >= 0 ? '+' : ''}
                {snapshot.vsMarket.delta}
              </strong>
              <span>
                vs avg ({snapshot.vsMarket.avgScore}) · {snapshot.vsMarket.studentCount} on device
              </span>
            </div>
          )}
        </div>
      )}

      <div className="rcx-grid">
        <ChartCard
          title="Behavioural diagnostics"
          subtitle="4-quadrant attempt quality + potential score recovery"
          className="rcx-span-2 rcx-behaviour"
        >
          <AttemptQualityMatrix
            result={result}
            questionTimes={questionTimes}
            paperDurationSec={paperDurationSec}
            questions={questions}
          />
        </ChartCard>

        <ChartCard
          title="High mistake & High skip — fix first"
          subtitle={
            trapMetrics?.ready
              ? `High mistake ${trapMetrics.trapFallRate ?? '—'}% · High skip ${trapMetrics.timeSinkRate ?? '—'}% — redo these before the next mock`
              : 'Questions classmates miss or skip that you also missed — open and fix'
          }
          className="rcx-span-2"
          data-testid="result-high-mistake-skip"
        >
          {trapMetrics?.ready ? (
            <div className="rcx-band-kpis" style={{ marginBottom: '0.65rem' }}>
              <div>
                <strong>
                  {trapMetrics.trapFallRate != null ? `${trapMetrics.trapFallRate}%` : '—'}
                </strong>
                <span className="form-hint" style={{ display: 'block' }}>
                  High mistake ({trapMetrics.tabAWrongAttempt}/{trapMetrics.tabASeen})
                </span>
              </div>
              <div>
                <strong>
                  {trapMetrics.timeSinkRate != null ? `${trapMetrics.timeSinkRate}%` : '—'}
                </strong>
                <span className="form-hint" style={{ display: 'block' }}>
                  High skip ({trapMetrics.tabBTimeSinkSkip}/{trapMetrics.tabBSeen})
                </span>
              </div>
            </div>
          ) : null}
          {!fixQueue?.ready || !fixQueue.items?.length ? (
            <ChartEmpty
              message={
                fixQueue?.takeaway ||
                trapMetrics?.takeaway ||
                'When more classmates finish this paper, your fix list appears here.'
              }
            />
          ) : (
            <ul className="rcx-fix-queue">
              {fixQueue.items.map((item) => (
                <li key={item.questionId} className="rcx-fix-queue-item">
                  <div>
                    <strong>
                      {item.index != null ? `Q${item.index}` : 'Question'} · {item.reasonLabel}
                    </strong>
                    <span className="form-hint" style={{ display: 'block' }}>
                      {(item.subject || '—').toString()}
                      {item.chapter ? ` · ${item.chapter}` : ''} · peer {item.peerStrugglePct}% · you{' '}
                      {item.grade}
                    </span>
                  </div>
                  <div className="rcx-fix-queue-actions">
                    {typeof onOpenQuestion === 'function' ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => onOpenQuestion(item.questionId)}
                      >
                        Open
                      </button>
                    ) : null}
                    <Link
                      to={item.reason === 'high_skip' ? '/high-skip' : '/high-mistake'}
                      className="btn btn-ghost btn-sm"
                    >
                      {item.reason === 'high_skip' ? 'High skip' : 'High mistake'}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard
          title="Re-test delta"
          subtitle="Improvement on the same question IDs vs your earlier attempt(s)"
          className="rcx-span-2"
        >
          {!retestDelta?.ready ? (
            <ChartEmpty message={retestDelta?.takeaway || 'No overlapping re-test questions yet.'} />
          ) : (
            <>
              <div className="rcx-band-kpis">
                <div>
                  <strong>
                    {retestDelta.improvementPct != null ? `${retestDelta.improvementPct}%` : '—'}
                  </strong>
                  <span className="form-hint" style={{ display: 'block' }}>
                    Improved ({retestDelta.improved}/{retestDelta.comparable})
                  </span>
                </div>
                <div>
                  <strong>{retestDelta.regressed}</strong>
                  <span className="form-hint" style={{ display: 'block' }}>
                    Regressed
                  </span>
                </div>
                <div>
                  <strong>{retestDelta.held}</strong>
                  <span className="form-hint" style={{ display: 'block' }}>
                    Unchanged / still miss
                  </span>
                </div>
              </div>
              {retestDelta.items?.length ? (
                <ul className="rcx-retest-list">
                  {retestDelta.items.slice(0, 6).map((it) => (
                    <li key={it.questionId}>
                      <strong>{it.index != null ? `Q${it.index}` : 'Q?'}</strong>{' '}
                      <span
                        className={`rcx-retest-chip rcx-retest-chip--${it.change}`}
                      >
                        {it.change === 'improved'
                          ? 'Improved'
                          : it.change === 'regressed'
                            ? 'Regressed'
                            : it.change}
                      </span>{' '}
                      <span className="form-hint">
                        {it.previousGrade} → {it.currentGrade}
                      </span>
                      {typeof onOpenQuestion === 'function' ? (
                        <>
                          {' '}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => onOpenQuestion(it.questionId)}
                          >
                            View
                          </button>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="form-hint" style={{ marginBottom: 0 }}>
                {retestDelta.takeaway}
              </p>
            </>
          )}
        </ChartCard>

        <ChartCard
          title="What-if simulator"
          subtitle="Slide to model marks if you clean avoidable mistakes"
          className="rcx-span-2"
        >
          <WhatIfScoreSimulator
            result={result}
            questionTimes={questionTimes}
            paperDurationSec={paperDurationSec}
            questions={questions}
          />
        </ChartCard>

        <ChartCard
          title="Score floor vs ceiling"
          subtitle="Optimistic / pessimistic band from What-If and consistency"
          className="rcx-span-2"
        >
          {!scoreBand?.ready ? (
            <ChartEmpty message={scoreBand?.takeaway || 'No band yet.'} />
          ) : (
            <>
              <div className="rcx-band-kpis">
                <div>
                  <strong>
                    {scoreBand.floor.score}
                    <span className="rcx-band-pctile">~{scoreBand.floor.percentile}</span>
                  </strong>
                  <span>Floor (pessimistic)</span>
                </div>
                <div className="rcx-band-mid">
                  <strong>
                    {scoreBand.mid.score}
                    <span className="rcx-band-pctile">~{scoreBand.mid.percentile}</span>
                  </strong>
                  <span>This attempt</span>
                </div>
                <div>
                  <strong>
                    {scoreBand.ceiling.score}
                    <span className="rcx-band-pctile">~{scoreBand.ceiling.percentile}</span>
                  </strong>
                  <span>Ceiling (optimistic)</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={scoreBand.chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} />
                  <Tooltip
                    formatter={(value, name, item) => [
                      `${value} marks · ~${item?.payload?.percentile ?? '—'} %ile`,
                      name,
                    ]}
                  />
                  <Bar dataKey="score" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {scoreBand.chart.map((d) => (
                      <Cell key={d.key} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="aqm-takeaway">{scoreBand.takeaway}</p>
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Exam-slot biological clock"
          subtitle="Performance by time of day (from start / submit times)"
          className="rcx-span-2"
        >
          {!bioClock.ready ? (
            <ChartEmpty message={bioClock.takeaway} />
          ) : (
            <>
              {bioClock.currentSlot && (
                <p className="form-hint rcx-bio-current">
                  This attempt: <strong>{bioClock.currentSlot.label}</strong> (
                  {bioClock.currentSlot.range})
                </p>
              )}
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={bioClock.chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(value, name, item) => [
                      value == null ? '—' : `${value}%`,
                      name === 'avgPct' ? 'Avg score %' : name,
                    ]}
                    labelFormatter={(label, payload) => {
                      const row = payload?.[0]?.payload
                      return row ? `${label} · ${row.range} · ${row.count} attempt(s)` : label
                    }}
                  />
                  <Bar dataKey="avgPct" name="Avg score %" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    {bioClock.chart.map((d) => (
                      <Cell
                        key={d.id}
                        fill={d.isCurrent ? '#2563eb' : d.avgPct != null ? '#94a3b8' : '#e2e8f0'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="aqm-takeaway">{bioClock.takeaway}</p>
            </>
          )}
        </ChartCard>

        {dreamGap?.ready && (
          <ChartCard
            title="Dream-college gap"
            subtitle="What-if silly fixes × Career Guide cutoffs"
            className="rcx-span-2 rcx-dream-gap"
          >
            <div className="rcx-dream-body">
              <p className="rcx-dream-headline">{dreamGap.headline}</p>
              <p className="form-hint">{dreamGap.detail}</p>
              <div className="rcx-dream-kpis">
                <div>
                  <strong>
                    {dreamGap.currentScore} → {dreamGap.nextScore}
                  </strong>
                  <span>Marks</span>
                </div>
                <div>
                  <strong>
                    ~{Number(dreamGap.currentAir).toLocaleString('en-IN')} → ~
                    {Number(dreamGap.nextAir).toLocaleString('en-IN')}
                  </strong>
                  <span>Est. AIR</span>
                </div>
                {dreamGap.gapClosedPct != null && (
                  <div>
                    <strong>{dreamGap.gapClosedPct}%</strong>
                    <span>Gap closed</span>
                  </div>
                )}
              </div>
              <Link to="/career-compass" className="btn btn-ghost btn-sm">
                Open Career Guide →
              </Link>
            </div>
          </ChartCard>
        )}

        <ChartCard
          title="Skip IQ"
          subtitle="How you leave questions — glance, linger, or never open"
        >
          {!skipIq || skipIq.skipped === 0 ? (
            <ChartEmpty message={skipIq?.insight || 'No skips on this paper.'} />
          ) : (
            <>
              <div className="rcx-skip-kpis">
                <div>
                  <strong>{skipIq.skipRate}%</strong>
                  <span>Skip rate</span>
                </div>
                <div>
                  <strong>{skipIq.avgSkipSec}s</strong>
                  <span>Avg on skips</span>
                </div>
                <div>
                  <strong className={`rcx-skip-band rcx-skip-${skipIq.band}`}>{skipIq.band}</strong>
                  <span>Skip IQ</span>
                </div>
              </div>
              {skipIq.chart.length > 0 && (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={skipIq.chart}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {skipIq.chart.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <p className="aqm-takeaway">{skipIq.takeaway}</p>
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Error DNA"
          subtitle="Your tags (Misread · Concept · Calc · Guess…) when set; else auto silly · overtime · concept · calc"
        >
          {!errorDna?.chart?.length ? (
            <ChartEmpty message={errorDna?.takeaway || 'No wrong answers to tag.'} />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <PieChart>
                  <Pie
                    data={errorDna.chart}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={74}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {errorDna.chart.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name, item) => [
                      `${value} Q · ~${item?.payload?.marks ?? 0} marks`,
                      name,
                    ]}
                  />
                  <Legend verticalAlign="bottom" height={40} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
              <p className="aqm-takeaway">{errorDna.takeaway}</p>
            </>
          )}
        </ChartCard>

        <ChartCard
          title="Pass-1 · subject path"
          subtitle={
            passTimeline?.hasTelemetry
              ? 'Live subject switches and first-pass vs revisit'
              : 'Subject path (estimated until a new timed mock records switches)'
          }
          className="rcx-span-2"
        >
          {!passTimeline ? (
            <ChartEmpty message="No timeline data yet." />
          ) : (
            <div className="rcx-pass-wrap">
              <div className="rcx-pass-kpis">
                <div>
                  <strong>{passTimeline.firstPass.accuracy}%</strong>
                  <span>Pass-1 accuracy ({passTimeline.firstPass.count} Q)</span>
                </div>
                <div>
                  <strong>{passTimeline.revisit.count}</strong>
                  <span>Revisits · {passTimeline.revisit.accuracy}% correct</span>
                </div>
                <div>
                  <strong>{passTimeline.switchCount}</strong>
                  <span>Subject switches</span>
                </div>
              </div>
              {passTimeline.subjectPath.length > 0 && (
                <ol className="rcx-pass-path">
                  {passTimeline.subjectPath.map((step, i) => (
                    <li key={`${step.subjectId}-${step.t}-${i}`}>
                      <span className="rcx-pass-time">{step.label}</span>
                      <strong>{step.subject}</strong>
                      {step.estimated ? <em>est.</em> : null}
                    </li>
                  ))}
                </ol>
              )}
              {passTimeline.takeaway ? <p className="aqm-takeaway">{passTimeline.takeaway}</p> : null}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Answer mix"
          subtitle="Correct, wrong, and skipped on this paper"
          className="rcx-donut-wrap"
        >
          {donut.length === 0 || totalOutcome === 0 ? (
            <ChartEmpty message="No question outcomes to show." />
          ) : (
            <div className="rcx-donut-layout">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={donut}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {donut.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [
                      `${value} (${totalOutcome ? Math.round((value / totalOutcome) * 100) : 0}%)`,
                      name,
                    ]}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
              <div className="rcx-donut-center-label" aria-hidden="true">
                <strong>{totalOutcome}</strong>
                <span>questions</span>
              </div>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Subject scores"
          subtitle={
            hasMarketAvg
              ? 'Your % of max vs average of attempts on this device'
              : 'Your score as % of max marks per subject'
          }
        >
          {subjectBars.length === 0 ? (
            <ChartEmpty message="No subject breakdown for this paper." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={subjectBars}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
                barCategoryGap="28%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  formatter={(value, name) => [`${value}%`, name === 'youPct' ? 'You' : 'Device avg']}
                  labelFormatter={(label) => label}
                />
                <Bar dataKey="youPct" name="You" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={36} />
                {hasMarketAvg && (
                  <Bar
                    dataKey="marketAvgPct"
                    name="Device avg"
                    fill="#94a3b8"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Cumulative performance"
          subtitle={
            trendIsWithinTest
              ? 'Subject path on this paper (take more tests for a full trend)'
              : 'Score % and running average across your recent attempts'
          }
          className="rcx-span-2"
        >
          {trend.length < 2 ? (
            <ChartEmpty message="Need at least two attempts (or two subjects) for a trend line." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={trend} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="rcxScoreFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="shortLabel" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0]?.payload
                    if (!row) return null
                    return (
                      <div className="rcx-tooltip">
                        <strong>{row.title}</strong>
                        <p>
                          Score {row.score}/{row.maxScore} ({row.scorePct}%)
                        </p>
                        <p>Running avg {row.cumulativeAvg}%</p>
                        {row.accuracy != null && <p>Accuracy {row.accuracy}%</p>}
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="scorePct"
                  name="Score %"
                  stroke="#2563eb"
                  fill="url(#rcxScoreFill)"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="cumulativeAvg"
                  name="Running avg"
                  stroke="#16a34a"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                />
                <Legend />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Strength radar"
          subtitle="Subject score % — farther from centre is stronger"
        >
          {radar.length < 3 ? (
            <ChartEmpty message="Need scores in at least three subjects for a radar view." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radar} cx="50%" cy="50%" outerRadius="72%">
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 12 }} />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  axisLine={false}
                />
                <Radar
                  name="You"
                  dataKey="you"
                  stroke="#2563eb"
                  fill="#2563eb"
                  fillOpacity={0.22}
                  strokeWidth={2}
                />
                <Tooltip formatter={(v) => [`${v}%`, 'Score']} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Actionable tips" subtitle="Based on this attempt — not guessed ranks">
          {snapshot?.tips?.length ? (
            <ul className="rcx-tips">
              {snapshot.tips.map((tip, i) => (
                <li key={tipLabel(tip, i)}>{tip}</li>
              ))}
            </ul>
          ) : (
            <ChartEmpty message="No special focus tips — keep practising." />
          )}
          {snapshot?.weakChapters?.length > 0 && (
            <div className="rcx-weak-chips">
              <span className="rcx-weak-label">Weak chapters</span>
              {snapshot.weakChapters.map((w) => (
                <span key={w.chapter} className="rcx-weak-chip">
                  {w.chapter} · {w.accuracy}%
                </span>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </section>
  )
}
