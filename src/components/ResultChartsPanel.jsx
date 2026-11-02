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
import {
  buildOutcomeDonut,
  buildSubjectScoreBars,
  buildCumulativeTrend,
  buildSubjectRadar,
  buildMarketSnapshot,
  cohortSubjectAvgPcts,
} from '../utils/resultCharts.js'

function ChartEmpty({ message }) {
  return (
    <div className="rcx-empty">
      <p>{message}</p>
    </div>
  )
}

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`rcx-card card ${className}`.trim()}>
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
 * }} props
 */
export default function ResultChartsPanel({ data, test, attempts = [], scoreComparison = null }) {
  const result = data?.result
  const examPatternId = test?.examPatternId ?? data?.examPatternId

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
