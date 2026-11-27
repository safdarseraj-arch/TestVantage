import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import {
  buildCrowdBenchmarkHint,
  buildDistractorBreakdown,
} from '../utils/diagnosticQuestionAnalytics.js'
import {
  buildQuestionVisitTimeline,
  formatDiagDuration,
  resolveIdealTimeSeconds,
  selfStatusLabel,
  toughnessLabel,
} from '../utils/questionLevelDiagnostics.js'

const BAND_COLORS = {
  top10: '#f9a8d4',
  top25: '#fdba74',
  all: '#a78bfa',
  you: '#38bdf8',
  ideal: '#34d399',
}

/**
 * SchoolLog-style per-question accuracy, timeline, toughness, ideal time, and peer bars.
 * @param {{
 *   peer?: object | null
 *   yourTimeSeconds?: number | null
 *   yourGrade?: string | null
 *   question?: object | null
 *   sessionTelemetry?: object | null
 *   demoTimeline?: boolean
 * }} props
 */
export default function QuestionPeerStatsBlock({
  peer,
  yourTimeSeconds,
  yourGrade,
  question = null,
  sessionTelemetry = null,
  demoTimeline = false,
}) {
  const [showAllVisits, setShowAllVisits] = useState(false)
  const yourSec = Number(yourTimeSeconds ?? 0)
  const hasYourTime = yourSec > 0

  const tough = useMemo(
    () => toughnessLabel(question?.toughnessLevel, question?.difficulty || peer?.difficulty),
    [question, peer],
  )
  const ideal = useMemo(() => resolveIdealTimeSeconds(question || {}), [question])

  const timeline = useMemo(
    () =>
      buildQuestionVisitTimeline({
        questionId: question?.id || peer?.questionId,
        sessionTelemetry,
        totalSeconds: yourSec,
        demo: demoTimeline,
      }),
    [question, peer, sessionTelemetry, yourSec, demoTimeline],
  )

  const visibleSegments = showAllVisits
    ? timeline.segments
    : timeline.segments.slice(0, 4)
  const hiddenCount = Math.max(0, timeline.segments.length - 4)

  const cohortReady = Boolean(peer && peer.studentCount >= 2)
  const bands = peer?.accuracyBands
  const correctTimes = peer?.correctSolverTimes

  const formatSec = (val) => {
    if (val == null || val <= 0) return '—'
    if (val < 60) return `${val}s`
    const m = Math.floor(val / 60)
    const s = val % 60
    return s ? `${m}m ${s}s` : `${m}m`
  }

  const crowd = buildCrowdBenchmarkHint({
    grade: yourGrade || undefined,
    peerCorrectPct: peer?.correctPct,
    peerStrugglePct: peer ? (peer.wrongPct || 0) + (peer.skippedPct || 0) : undefined,
    peerStudentCount: peer?.studentCount,
  })
  const distractors = buildDistractorBreakdown(peer?.optionWrong, peer?.wrong)

  const showNational = Boolean(bands?.top1 || bands?.top500 || peer?.source === 'live_server')
  const accuracyRows = [
    ...(showNational && bands?.top1
      ? [{ id: 'top1', label: 'Top 1% Stu. Avg.', band: bands.top1 }]
      : []),
    { id: 'top10', label: 'Top 10% Stu. Avg.', band: bands?.top10 },
    { id: 'top25', label: 'Top 25% Stu. Avg.', band: bands?.top25 },
    ...(showNational && bands?.top500
      ? [{ id: 'top500', label: 'Top 500 Stu. Avg.', band: bands.top500 }]
      : []),
    { id: 'all', label: 'All Stu. Avg.', band: bands?.all },
  ]

  const timeBarData = useMemo(() => {
    const rows = [
      ...(correctTimes?.top1 != null
        ? [
            {
              id: 'top1',
              label: 'Top 1%',
              minutes: Math.round((correctTimes.top1 / 60) * 10) / 10,
              fill: '#f472b6',
            },
          ]
        : []),
      {
        id: 'top10',
        label: 'Top 10%',
        minutes:
          correctTimes?.top10 != null ? Math.round((correctTimes.top10 / 60) * 10) / 10 : null,
        fill: BAND_COLORS.top10,
      },
      {
        id: 'top25',
        label: 'Top 25%',
        minutes:
          correctTimes?.top25 != null ? Math.round((correctTimes.top25 / 60) * 10) / 10 : null,
        fill: BAND_COLORS.top25,
      },
      ...(correctTimes?.top500 != null
        ? [
            {
              id: 'top500',
              label: 'Top 500',
              minutes: Math.round((correctTimes.top500 / 60) * 10) / 10,
              fill: '#c4b5fd',
            },
          ]
        : []),
      {
        id: 'all',
        label: 'All correct',
        minutes: correctTimes?.all != null ? Math.round((correctTimes.all / 60) * 10) / 10 : null,
        fill: BAND_COLORS.all,
      },
    ]
    if (hasYourTime) {
      rows.push({
        id: 'you',
        label: 'You',
        minutes: Math.round((yourSec / 60) * 10) / 10,
        fill: BAND_COLORS.you,
      })
    }
    if (ideal.seconds > 0) {
      rows.push({
        id: 'ideal',
        label: 'Ideal',
        minutes: Math.round((ideal.seconds / 60) * 10) / 10,
        fill: BAND_COLORS.ideal,
      })
    }
    return rows.filter((r) => r.minutes != null && r.minutes > 0)
  }, [correctTimes, hasYourTime, yourSec, ideal.seconds])

  const vsIdeal =
    hasYourTime && ideal.seconds > 0
      ? yourSec <= ideal.seconds * 1.15
        ? 'on_pace'
        : yourSec <= ideal.seconds * 1.6
          ? 'slow'
          : 'very_slow'
      : null

  return (
    <div className="rqw-peer-stats rqw-peer-stats--pro">
      <div className="rqw-diag-meta">
        <span className={`rqw-tough rqw-tough--${tough.level}`} title="Toughness Level">
          Toughness L{tough.level} · {tough.label}
        </span>
        <span className="rqw-ideal" title={ideal.label}>
          {ideal.label}: <strong>{formatDiagDuration(ideal.seconds)}</strong>
        </span>
        {vsIdeal === 'on_pace' && <span className="rqw-pace rqw-pace--ok">On pace vs ideal</span>}
        {vsIdeal === 'slow' && <span className="rqw-pace rqw-pace--slow">Slower than ideal</span>}
        {vsIdeal === 'very_slow' && (
          <span className="rqw-pace rqw-pace--slow">Much slower than ideal</span>
        )}
      </div>

      {yourGrade && peer && peer.studentCount >= 2 ? (
        <div className={`rqw-crowd-hint rqw-crowd-hint--${crowd.tone}`} role="status">
          <strong>{crowd.title}</strong>
          <p>{crowd.message}</p>
        </div>
      ) : null}

      <section className="rqw-peer-section rqw-accuracy-report">
        <div className="rqw-accuracy-head">
          <h4>Attempt &amp; Accuracy Rate</h4>
          <p className="rqw-self-status">
            Self Status: <strong>{selfStatusLabel(yourGrade)}</strong>
          </p>
        </div>
        {cohortReady ? (
          <>
            <div className="rqw-peer-table-wrap">
              <table className="rqw-peer-table rqw-accuracy-table">
                <thead>
                  <tr>
                    <th>Attempt &amp; Accuracy Rate</th>
                    <th className="rqw-peer-num">Correct</th>
                    <th className="rqw-peer-num">Incorrect</th>
                    <th className="rqw-peer-num">Not Attempt</th>
                  </tr>
                </thead>
                <tbody>
                  {accuracyRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.label}</td>
                      <td className="rqw-peer-num rqw-peer-row-correct">
                        {row.band?.correctPct != null ? `${row.band.correctPct}%` : '—'}
                      </td>
                      <td className="rqw-peer-num rqw-peer-row-wrong">
                        {row.band?.wrongPct != null ? `${row.band.wrongPct}%` : '—'}
                      </td>
                      <td className="rqw-peer-num rqw-peer-row-skipped">
                        {row.band?.skippedPct != null ? `${row.band.skippedPct}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {peer?._demoPeer ? (
              <p className="form-hint">
                Sample class averages for this demo — real papers use students on this device.
              </p>
            ) : null}
          </>
        ) : (
          <p className="form-hint rqw-peer-cohort-hint">
            Accuracy bands (Top 10% / Top 25% / All) need more students on this paper on this
            device. Your status above is from this attempt only.
          </p>
        )}
      </section>

      <div className="rqw-time-grid">
        <section className="rqw-peer-section rqw-timeline-card">
          <h4>Self Time Spent</h4>
          <p className="rqw-time-total">
            <strong>{formatDiagDuration(timeline.totalSeconds || yourSec)}</strong>
          </p>
          {visibleSegments.length > 0 ? (
            <>
              <p className="form-hint rqw-timeline-label">Your timeline</p>
              <ol className="rqw-visit-timeline">
                {visibleSegments.map((seg, i) => (
                  <li key={`${seg.visitN}-${i}`}>
                    <span className="rqw-visit-dot" aria-hidden />
                    <span>{formatDiagDuration(seg.seconds)}</span>
                    {seg.visitN != null ? (
                      <span className="rqw-visit-n">Visit {seg.visitN}</span>
                    ) : null}
                  </li>
                ))}
              </ol>
              {hiddenCount > 0 && !showAllVisits ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAllVisits(true)}
                >
                  Show more (+{hiddenCount})
                </button>
              ) : null}
              {timeline.source === 'demo' || timeline.source === 'synthetic' ? (
                <p className="form-hint">Visit segments estimated from this attempt’s timing.</p>
              ) : null}
            </>
          ) : (
            <p className="form-hint">No visit timing recorded for this question.</p>
          )}
        </section>

        <section className="rqw-peer-section rqw-correct-time-card">
          <h4>Time Spent By Top Students who marked Correct</h4>
          {timeBarData.length >= 2 ? (
            <div className="rqw-correct-time-chart" aria-label="Correct-solver time comparison">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={timeBarData} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    unit="m"
                    allowDecimals
                    width={36}
                    label={{ value: 'min', position: 'insideTopLeft', offset: 0, fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(v) => [`${v} min`, 'Time']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="minutes" radius={[6, 6, 0, 0]} maxBarSize={42}>
                    {timeBarData.map((row) => (
                      <Cell key={row.id} fill={row.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="form-hint">
              {cohortReady
                ? 'Not enough correct timed attempts yet for this chart.'
                : 'Needs more correct timed attempts on this device for peer bars.'}
            </p>
          )}
          {hasYourTime ? (
            <p className="form-hint">
              You: <strong>{formatDiagDuration(yourSec)}</strong>
              {ideal.seconds > 0 ? (
                <>
                  {' '}
                  · Ideal: <strong>{formatDiagDuration(ideal.seconds)}</strong>
                </>
              ) : null}
            </p>
          ) : null}
        </section>
      </div>

      {distractors.ready ? (
        <section className="rqw-peer-section">
          <h4>Wrong-option breakdown</h4>
          <p className="form-hint" style={{ marginTop: 0 }}>
            Where classmates landed when wrong
            {distractors.dominant
              ? ` — top trap option ${distractors.dominant} (${distractors.dominantPct}%)`
              : ''}
            .
          </p>
          <div className="rqw-peer-table-wrap">
            <table className="rqw-peer-table">
              <thead>
                <tr>
                  <th>Option</th>
                  <th className="rqw-peer-num">Count</th>
                  <th className="rqw-peer-num">Of wrong</th>
                </tr>
              </thead>
              <tbody>
                {distractors.rows.slice(0, 6).map((r) => (
                  <tr key={r.label}>
                    <td>
                      <strong>{r.label}</strong>
                    </td>
                    <td className="rqw-peer-num">{r.count}</td>
                    <td className="rqw-peer-num">{r.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rqw-peer-section">
        <h4>Time comparison (device)</h4>
        <div className="rqw-peer-table-wrap">
          <table className="rqw-peer-table">
            <thead>
              <tr>
                <th>Benchmark</th>
                <th className="rqw-peer-num">Time taken</th>
              </tr>
            </thead>
            <tbody>
              <tr className="rqw-peer-row-you">
                <td>Time taken by you</td>
                <td className="rqw-peer-num">
                  <strong>{hasYourTime ? formatSec(yourSec) : '—'}</strong>
                </td>
              </tr>
              <tr>
                <td>Ideal time</td>
                <td className="rqw-peer-num">{formatSec(ideal.seconds)}</td>
              </tr>
              <tr>
                <td>Average time taken</td>
                <td className="rqw-peer-num">{formatSec(peer?.avgTimeSeconds)}</td>
              </tr>
              <tr>
                <td>Fastest 10% on this device</td>
                <td className="rqw-peer-num">{formatSec(peer?.top10TimeSeconds)}</td>
              </tr>
              <tr>
                <td>Fastest 25% on this device</td>
                <td className="rqw-peer-num">{formatSec(peer?.top25TimeSeconds)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="form-hint rqw-peer-time-hint">
          {peer?.source === 'live_server'
            ? 'Peer times use live server attempts for this paper (Top 1% / Top 500 unlock as more students submit).'
            : 'Peer times are local device benchmarks until go-live sync — then Top 1% / Top 500 use all students on this paper.'}{' '}
          Ideal time uses Hybrid AI
          when saved on the question, otherwise a toughness-based estimate.
        </p>
      </section>
    </div>
  )
}
