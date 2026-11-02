import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import InsightPageHero from '../components/InsightPageHero'
import InsightCoachPanel from '../components/InsightCoachPanel'
import { useAuth } from '../context/AuthContext'
import { getAttemptsByOwner, getOwnerKey } from '../utils/attemptHistory'
import { buildExamFit, openLadderPractice } from '../utils/examFit'
import { buildFormForecast } from '../utils/formForecast'
import { buildPrecisionMap } from '../utils/precisionMap'
import { getPercentileCurveTable } from '../utils/counsellingPredictor.js'
import { PercentileCurveTable } from '../components/CounsellingPredictorPanels.jsx'

function formatAir(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-IN')
}

function ConfidenceMeter({ value, label }) {
  return (
    <div className="ff-confidence" title={`Confidence ${value}/100`}>
      <div className="ff-confidence-head">
        <span>Confidence</span>
        <strong>
          {label} · {value}%
        </strong>
      </div>
      <div className="ff-confidence-track" aria-hidden>
        <div className="ff-confidence-fill" style={{ width: `${Math.max(4, value)}%` }} />
      </div>
    </div>
  )
}

export default function FormForecastPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const ownerKey = getOwnerKey(session?.userId)
  const attempts = getAttemptsByOwner(ownerKey)

  const forecast = useMemo(() => buildFormForecast(attempts), [attempts])
  const examFit = useMemo(() => buildExamFit(attempts), [attempts])
  const precision = useMemo(() => buildPrecisionMap(attempts), [attempts])

  const [examId, setExamId] = useState(forecast.primaryExamId)
  const active = forecast.byExam[examId] ?? forecast.exams[0]
  const percentileCurve = useMemo(
    () =>
      active?.percentileCurve ??
      getPercentileCurveTable(examId, {
        highlightPercentile: 99,
        toughness: 'moderate',
        radius: 2.5,
      }),
    [active, examId],
  )

  useEffect(() => {
    const hash = window.location.hash?.replace('#', '')
    if (!hash) return undefined
    const t = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="page form-forecast-page insight-portal-page student-portal-page">
      <InsightPageHero
        pageId="form-forecast"
        actions={
          <>
            <Link to="/career-compass" className="btn btn-primary btn-sm">
              Career Compass
            </Link>
            <Link to="/analytics" className="btn btn-ghost btn-sm">
              Analytics
            </Link>
          </>
        }
      />

      <p className="ff-bridge form-hint">
        <strong>Practice form vs exam day:</strong> Form Forecast reads your mocks. Career Compass
        turns marks into NTA AIR, colleges, and choice filling — use both side by side.
      </p>

      <InsightCoachPanel
        forecast={active?.ready ? active : null}
        examFit={examFit}
        precision={precision}
      />

      {/* ── Form Forecast ── */}
      <section className="ff-panel ff-panel--forecast card" id="form-forecast">
        <header className="ff-panel-head">
          <div>
            <p className="ff-eyebrow">Practice AIR · NTA curves</p>
            <h2>Form Forecast</h2>
            <p className="form-hint">
              Speed + accuracy + difficulty from your attempts → projected AIR with a confidence
              band. JEE Main, Advanced, and NEET when you have data.
            </p>
          </div>
          <div className="ff-exam-tabs" role="tablist" aria-label="Exam">
            {forecast.exams.map((ex) => (
              <button
                key={ex.examId}
                type="button"
                role="tab"
                aria-selected={examId === ex.examId}
                className={`ff-exam-tab${examId === ex.examId ? ' is-active' : ''}`}
                onClick={() => setExamId(ex.examId)}
              >
                {ex.examLabel}
                {ex.ready ? (
                  <span className="ff-exam-dot" title="Has practice data" />
                ) : null}
              </button>
            ))}
          </div>
        </header>

        {!active?.ready ? (
          <div className="insight-empty-state ff-empty">
            <div className="insight-empty-icon">📡</div>
            <h3>Unlock Form Forecast</h3>
            <p>{active?.formNote}</p>
            <div className="insight-empty-actions">
              <Link to="/mock-test" className="btn btn-primary">
                AI Mock Builder
              </Link>
              <Link to="/prepare" className="btn btn-ghost">
                Prepare centre
              </Link>
            </div>
          </div>
        ) : (
          <div className="ff-forecast-body">
            <div className="ff-air-hero">
              <div className="ff-air-main">
                <span className="ff-air-label">Practice AIR</span>
                <strong className="ff-air-value">{formatAir(active.air)}</strong>
                <span className="ff-air-band">
                  Band {formatAir(active.airLow)} – {formatAir(active.airHigh)}
                </span>
              </div>
              <div className="ff-air-side">
                <div className="ff-stat">
                  <span>Percentile</span>
                  <strong>{active.percentile}</strong>
                </div>
                <div className="ff-stat">
                  <span>Practice marks</span>
                  <strong>
                    {active.practiceMarks}/{active.marksMax}
                  </strong>
                </div>
                <div className="ff-stat">
                  <span>Attempts used</span>
                  <strong>
                    {active.attemptsUsed}/{active.attemptCount}
                  </strong>
                </div>
                <div className="ff-stat">
                  <span>Form trend</span>
                  <strong>
                    {active.trend === 'up'
                      ? 'Improving'
                      : active.trend === 'down'
                        ? 'Softening'
                        : 'Stable'}
                  </strong>
                </div>
              </div>
            </div>

            <ConfidenceMeter value={active.confidence} label={active.confidenceLabel} />

            <p className="ff-note">{active.formNote}</p>
            <p className="ff-note ff-note--soft">{active.vsCompassHint}</p>

            <div className="ff-actions">
              <Link
                to={`/career-compass?exam=${active.examId}&marks=${active.practiceMarks}`}
                className="btn btn-primary btn-sm"
              >
                Open Career Compass with these marks →
              </Link>
              <Link to="/my-results" className="btn btn-ghost btn-sm">
                My results
              </Link>
            </div>

            {active.recentAir?.length > 0 && (
              <div className="ff-recent">
                <h3>Recent practice projections</h3>
                <ul>
                  {active.recentAir.map((r, i) => (
                    <li key={`${r.date}-${i}`}>
                      <span className="ff-recent-title">{r.label}</span>
                      <span>
                        ~{r.marks} marks → AIR {formatAir(r.air)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {percentileCurve?.rows?.length > 0 && (
          <PercentileCurveTable table={percentileCurve} />
        )}
      </section>

      {/* ── Exam Fit + Revision Ladder ── */}
      <section className="ff-panel ff-panel--fit card" id="exam-fit">
        <header className="ff-panel-head">
          <div>
            <p className="ff-eyebrow">Readiness · /100</p>
            <h2>Exam Fit</h2>
            <p className="form-hint">{examFit.summary}</p>
          </div>
          <div className="ff-fit-score" aria-label={`Exam Fit ${examFit.score} out of 100`}>
            <strong>{examFit.score}</strong>
            <span>/100</span>
            <em>{examFit.label}</em>
          </div>
        </header>

        <div className="ff-bands">
          {Object.entries(examFit.bands).map(([key, val]) => (
            <div key={key} className="ff-band">
              <div className="ff-band-head">
                <span>{key}</span>
                <strong>{val}</strong>
              </div>
              <div className="ff-band-track" aria-hidden>
                <div className="ff-band-fill" style={{ width: `${Math.max(3, val)}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="ff-ladder" id="revision-ladder">
          <h3>Revision Ladder</h3>
          <p className="form-hint">
            Ordered weak chapters — reattempt the result analysis or drill in Practice.
          </p>
          {examFit.ladder.length === 0 ? (
            <p className="form-hint">No weak chapters yet — keep taking mocks.</p>
          ) : (
            <ol className="ff-ladder-list">
              {examFit.ladder.map((rung) => (
                <li key={`${rung.rank}-${rung.chapter}`} className="ff-ladder-rung">
                  <span className="ff-ladder-rank">{rung.rank}</span>
                  <div className="ff-ladder-body">
                    <strong>{rung.chapter}</strong>
                    <p>{rung.reason}</p>
                    <div className="ff-ladder-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          openLadderPractice(rung.practicePrefill)
                          navigate('/practice')
                        }}
                      >
                        Drill in Practice
                      </button>
                      {rung.testId && rung.attemptId ? (
                        <Link
                          to={rung.reattemptTo}
                          className="btn btn-ghost btn-sm"
                        >
                          Open wrongs →
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <span className="ff-ladder-acc">{rung.accuracy}%</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* ── Precision Map ── */}
      <section className="ff-panel ff-panel--precision card" id="precision-map">
        <header className="ff-panel-head">
          <div>
            <p className="ff-eyebrow">Time × chapter × type</p>
            <h2>Precision Map</h2>
            <p className="form-hint">{precision.summary}</p>
          </div>
          {precision.ready ? (
            <div className="ff-precision-meta">
              <span>
                Median pace <strong>{precision.medianSeconds}s</strong>/Q
              </span>
              <span>
                Tagged <strong>{precision.totalTagged}</strong>
              </span>
            </div>
          ) : null}
        </header>

        {!precision.ready ? (
          <div className="insight-empty-state ff-empty">
            <div className="insight-empty-icon">🗺️</div>
            <h3>Need timed question data</h3>
            <p>{precision.summary}</p>
            <Link to="/mock-test" className="btn btn-primary">
              Take a timed mock
            </Link>
          </div>
        ) : (
          <>
            <div className="ff-tag-strip">
              {Object.entries(precision.tagCounts).map(([id, count]) => {
                const meta = precision.tagMeta[id]
                if (!meta || !count) return null
                return (
                  <div key={id} className={`ff-tag-chip ff-tag-chip--${meta.tone}`}>
                    <strong>{count}</strong>
                    <span>{meta.label}</span>
                  </div>
                )
              })}
            </div>

            {precision.insights.length > 0 && (
              <div className="ff-insights">
                {precision.insights.map((ins) => (
                  <div key={ins.id} className="ff-insight-card">
                    <strong>{ins.title}</strong>
                    <p>{ins.detail}</p>
                  </div>
                ))}
              </div>
            )}

            <h3 className="ff-subhead">Hotspots</h3>
            <div className="ff-alert-grid">
              {precision.topAlerts.map((a, i) => (
                <div key={`${a.chapter}-${a.typeLabel}-${i}`} className={`ff-alert ff-alert--${a.tone}`}>
                  <div className="ff-alert-top">
                    <strong>{a.chapter}</strong>
                    <span className="ff-alert-type">{a.typeLabel}</span>
                  </div>
                  <span className="ff-alert-tag">{a.tagLabel}</span>
                  <p>{a.detail}</p>
                </div>
              ))}
              {precision.topAlerts.length === 0 && (
                <p className="form-hint">No pressure hotspots — form looks paced.</p>
              )}
            </div>

            <h3 className="ff-subhead">Chapter × type grid</h3>
            <div className="ff-cell-table-wrap">
              <table className="ff-cell-table">
                <thead>
                  <tr>
                    <th>Chapter</th>
                    <th>Type</th>
                    <th>Acc</th>
                    <th>Avg s</th>
                    <th>Pattern</th>
                  </tr>
                </thead>
                <tbody>
                  {precision.cells.slice(0, 12).map((c) => (
                    <tr key={`${c.chapter}-${c.questionType}`}>
                      <td>{c.chapter}</td>
                      <td>{c.typeLabel}</td>
                      <td>{c.accuracy}%</td>
                      <td>{c.avgSeconds}s</td>
                      <td>
                        <span
                          className={`ff-mini-tag ff-mini-tag--${precision.tagMeta[c.dominantTag]?.tone || 'muted'}`}
                        >
                          {precision.tagMeta[c.dominantTag]?.label ?? c.dominantTag}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <footer className="ff-foot">
        <Link to="/prepare">Prepare centre</Link>
        <span aria-hidden>·</span>
        <Link to="/exam-pulse">Exam Pulse</Link>
        <span aria-hidden>·</span>
        <Link to="/career-compass">Career Compass</Link>
        <span aria-hidden>·</span>
        <Link to="/analytics">Analytics</Link>
      </footer>
    </div>
  )
}
