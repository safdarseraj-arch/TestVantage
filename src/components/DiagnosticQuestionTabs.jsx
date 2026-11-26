import { useEffect, useMemo, useState } from 'react'
import {
  buildDiagnosticAnalyticsPack,
  buildDistractorBreakdown,
  buildSchoolDiagnosticRoiSummary,
  DEFAULT_SAMPLE_FLOOR,
  suggestSmartPaperBalance,
  summarizeDiagnosticTrendPoint,
} from '../utils/diagnosticQuestionAnalytics.js'
import {
  getAllVerificationStatuses,
  getDiagnosticTrendSnapshots,
  getVerificationAuditLog,
  recordDiagnosticTrendSnapshot,
  saveDiagnosticRollupCache,
  setVerificationStatus,
} from '../utils/diagnosticLocalStore.js'

const TABS = [
  { id: 'mistake', label: 'High mistake', short: 'Mistake' },
  { id: 'skip', label: 'High skip', short: 'Skip' },
  { id: 'combined', label: 'Combined struggle', short: 'Struggle' },
  { id: 'suspect', label: 'Suspect key', short: 'QA' },
]

const VERIFY_ACTIONS = [
  { id: 'verified', label: 'Verified OK' },
  { id: 'wrong_key', label: 'Wrong key' },
  { id: 'keep', label: 'Keep watching' },
]

/**
 * @param {object} q
 */
function subjectLabel(q) {
  const s = String(q.subject || '').trim()
  if (!s) return '—'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * @param {number} at
 */
function formatWhen(at) {
  try {
    return new Date(at).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

/**
 * Teacher / school diagnostic tabs — Tab A (high mistake), Tab B (high skip),
 * Combined Struggle, Suspect Key triage + verification, distractors, trend, anomalies.
 *
 * @param {{
 *   attempts?: object[]
 *   title?: string
 *   subtitle?: string
 *   sampleFloor?: number
 * }} props
 */
export default function DiagnosticQuestionTabs({
  attempts = [],
  title = 'Question diagnostics',
  subtitle = 'Focus class time on questions that cost the batch marks — high mistake, high skip, or both.',
  sampleFloor = DEFAULT_SAMPLE_FLOOR,
}) {
  const [tab, setTab] = useState('mistake')
  const [testFilter, setTestFilter] = useState('')
  const [verifyTick, setVerifyTick] = useState(0)
  const [trendTick, setTrendTick] = useState(0)
  const [expandedId, setExpandedId] = useState(/** @type {string | null} */ (null))

  const testOptions = useMemo(() => {
    /** @type {Map<string, string>} */
    const map = new Map()
    for (const a of attempts) {
      if (!a.testId) continue
      map.set(a.testId, a.title || a.testId)
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }))
  }, [attempts])

  const pack = useMemo(
    () =>
      buildDiagnosticAnalyticsPack(attempts, {
        testId: testFilter || undefined,
        sampleFloor,
      }),
    [attempts, testFilter, sampleFloor],
  )

  const { tabs, anomalies } = pack
  const summaryKey = `${tabs.studentCount}-${tabs.summary.highMistake}-${tabs.summary.highSkip}-${tabs.summary.combinedOnly}-${tabs.summary.suspectKey}`

  const verificationMapEarly = useMemo(() => getAllVerificationStatuses(), [verifyTick])
  const paperBalance = useMemo(() => suggestSmartPaperBalance(tabs), [tabs])
  const roi = useMemo(
    () => buildSchoolDiagnosticRoiSummary(tabs, verificationMapEarly),
    [tabs, verificationMapEarly],
  )

  useEffect(() => {
    if (!tabs?.ready) return
    const titleLabel =
      (testFilter && testOptions.find((t) => t.id === testFilter)?.label) ||
      (testOptions.length === 1 ? testOptions[0].label : 'All papers')
    const cacheId = testFilter || 'all'
    recordDiagnosticTrendSnapshot(
      summarizeDiagnosticTrendPoint(tabs, {
        testId: cacheId,
        testTitle: titleLabel || '',
      }),
    )
    saveDiagnosticRollupCache(cacheId, {
      testTitle: titleLabel || '',
      summary: tabs.summary,
      studentCount: tabs.studentCount,
      paperBalanceTakeaway: paperBalance.takeaway,
      roiTakeaway: roi.takeaway,
    })
    setTrendTick((n) => n + 1)
    // summaryKey captures rollup changes without depending on a new tabs object identity
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional summaryKey gate
  }, [summaryKey, testFilter, tabs?.ready, paperBalance.takeaway, roi.takeaway])

  const trendPoints = useMemo(() => {
    void trendTick
    return getDiagnosticTrendSnapshots({
      testId: testFilter || 'all',
      limit: 8,
    })
  }, [testFilter, trendTick])

  const verificationMap = verificationMapEarly

  const auditLog = useMemo(() => {
    void verifyTick
    return getVerificationAuditLog(8)
  }, [verifyTick])

  const activeRows =
    tab === 'skip'
      ? tabs.tabB
      : tab === 'combined'
        ? tabs.tabCombined
        : tab === 'suspect'
          ? tabs.suspect
          : tabs.tabA

  const emptyHint =
    tab === 'skip'
      ? 'No high-skip questions yet. Items need a stable skip rate ≥ 50% after enough attempts.'
      : tab === 'combined'
        ? 'No combined-struggle-only items. Questions already in Mistake or Skip tabs are listed there.'
        : tab === 'suspect'
          ? 'No Suspect Key flags. Those need high mistakes plus weak topper accuracy or a dominant wrong option.'
          : 'No high-mistake questions yet. After enough attempts, items with ≥ 50% wrong appear here.'

  const onVerify = (questionId, status) => {
    setVerificationStatus(questionId, status)
    setVerifyTick((n) => n + 1)
  }

  return (
    <section className="card diag-tabs" aria-label="Question diagnostic tabs">
      <div className="school-panel-head">
        <div>
          <h3>{title}</h3>
          <p className="form-hint">{subtitle}</p>
        </div>
        {testOptions.length > 1 && (
          <label className="form-hint school-heatmap-filter">
            Paper
            <select value={testFilter} onChange={(e) => setTestFilter(e.target.value)}>
              <option value="">All papers</option>
              {testOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {tabs.ready ? (
        <div className="diag-tabs-meta diag-tabs-meta--strip" aria-label="Class summary">
          <span>
            <strong>{tabs.studentCount}</strong> students
          </span>
          <span>
            <strong>{roi?.questionsFlagged ?? 0}</strong> flags
          </span>
          <span>
            <strong>{roi?.verifiedReviewed ?? 0}</strong> reviewed
          </span>
          {roi?.wrongKeysCaught ? (
            <span>
              <strong>{roi.wrongKeysCaught}</strong> wrong keys
            </span>
          ) : null}
          {tabs.summary.belowFloor > 0 ? (
            <span className="form-hint">{tabs.summary.belowFloor} warming up</span>
          ) : null}
        </div>
      ) : (
        <p className="form-hint diag-tabs-meta">Load a classroom batch to see question flags.</p>
      )}

      <div className="diag-tabs-bar" role="tablist" aria-label="Diagnostic views">
        {TABS.map((t) => {
          const count =
            t.id === 'skip'
              ? tabs.summary.highSkip
              : t.id === 'combined'
                ? tabs.summary.combinedOnly
                : t.id === 'suspect'
                  ? tabs.summary.suspectKey
                  : tabs.summary.highMistake
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`diag-tabs-btn ${tab === t.id ? 'is-active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="diag-tabs-btn-label">{t.label}</span>
              <span className="diag-tabs-btn-count">{count}</span>
            </button>
          )
        })}
      </div>

      {!tabs.ready || !activeRows.length ? (
        <p className="form-hint diag-tabs-empty">
          {!tabs.ready
            ? 'Load a classroom batch or wait for shared attempts on the same paper.'
            : emptyHint}
        </p>
      ) : (
        <div className="diag-tabs-table-wrap">
          <table className="attempts-table diag-tabs-table">
            <thead>
              <tr>
                <th>Q</th>
                <th>Subject / chapter</th>
                <th>Served</th>
                <th>Mistake %</th>
                <th>Skip %</th>
                <th>Struggle %</th>
                <th>Attempt error %</th>
                <th>Signal</th>
                {tab === 'suspect' ? <th>Verify</th> : <th>Options</th>}
              </tr>
            </thead>
            <tbody>
              {activeRows.map((q) => {
                const dist = buildDistractorBreakdown(q.optionWrong, q.wrong)
                const v = verificationMap[q.questionId]
                const open = expandedId === q.questionId
                return (
                  <tr key={q.questionId}>
                    <td>
                      <strong>{q.index != null ? `Q${q.index}` : '—'}</strong>
                      <span className="form-hint" style={{ display: 'block', fontSize: '0.7rem' }}>
                        {String(q.questionId).slice(0, 28)}
                        {String(q.questionId).length > 28 ? '…' : ''}
                      </span>
                    </td>
                    <td>
                      <strong>{subjectLabel(q)}</strong>
                      {q.chapter ? (
                        <span className="form-hint" style={{ display: 'block' }}>
                          {q.chapter}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {q.totalServed}
                      <span className="form-hint" style={{ display: 'block' }}>
                        {q.wrong} wrong · {q.skipped} skip
                      </span>
                    </td>
                    <td>
                      <strong>{q.mistakePct}%</strong>
                    </td>
                    <td>{q.skipPct}%</td>
                    <td>{q.strugglePct}%</td>
                    <td>
                      {q.attemptErrorPct}%
                      {q.discrimination != null ? (
                        <span className="form-hint" style={{ display: 'block' }}>
                          D {q.discrimination > 0 ? '+' : ''}
                          {q.discrimination}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {q.triage?.badge ? (
                        <span
                          className={`diag-badge diag-badge--${q.triage.badge}`}
                          title={q.triage.action}
                        >
                          {q.triage.priority} · {q.triage.label}
                        </span>
                      ) : q.skipTiming === 'quick_skip' ? (
                        <span className="diag-badge diag-badge--quick">Quick skip</span>
                      ) : q.skipTiming === 'time_sink' ? (
                        <span className="diag-badge diag-badge--time">Time sink</span>
                      ) : (
                        <span className="form-hint">Teach priority</span>
                      )}
                      {v?.status ? (
                        <span
                          className={`diag-badge diag-badge--verify-${v.status}`}
                          style={{ display: 'block', marginTop: '0.25rem' }}
                        >
                          {v.status === 'verified'
                            ? 'Verified'
                            : v.status === 'wrong_key'
                              ? 'Wrong key'
                              : 'Keep watching'}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {tab === 'suspect' ? (
                        <div className="diag-verify-actions">
                          {VERIFY_ACTIONS.map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              className={`btn btn-ghost btn-sm diag-verify-btn ${
                                v?.status === a.id ? 'is-active' : ''
                              }`}
                              onClick={() => onVerify(q.questionId, a.id)}
                            >
                              {a.label}
                            </button>
                          ))}
                        </div>
                      ) : dist.ready ? (
                        <div className="diag-distractor">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setExpandedId(open ? null : q.questionId)}
                          >
                            {open ? 'Hide' : 'Options'} ({dist.rows.length})
                          </button>
                          {open ? (
                            <ul className="diag-distractor-list">
                              {dist.rows.map((r) => (
                                <li key={r.label}>
                                  <strong>{r.label}</strong> · {r.count} ({r.pct}%)
                                  <span
                                    className="diag-distractor-bar"
                                    style={{ width: `${Math.min(100, r.pct)}%` }}
                                    aria-hidden
                                  />
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <span className="form-hint" style={{ display: 'block' }}>
                              Top {dist.dominant} · {dist.dominantPct}%
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="form-hint">No option data</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'suspect' && (
        <div className="diag-audit">
          <strong>Verification audit log</strong>
          <p className="form-hint" style={{ margin: '0.2rem 0 0.45rem' }}>
            Marks save on this browser only — Verified / Wrong key / Keep watching.
          </p>
          {!auditLog.length ? (
            <p className="form-hint">No verification actions yet.</p>
          ) : (
            <ul className="diag-audit-list">
              {auditLog.map((e, i) => (
                <li key={`${e.at}-${e.questionId}-${i}`}>
                  <span className="form-hint">{formatWhen(e.at)}</span>{' '}
                  <code>{String(e.questionId).slice(0, 24)}</code> →{' '}
                  <strong>
                    {e.status === 'verified'
                      ? 'Verified OK'
                      : e.status === 'wrong_key'
                        ? 'Wrong key'
                        : 'Keep watching'}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(paperBalance?.ready || anomalies?.ready || trendPoints.length > 0) && (
        <details className="diag-more-insights" open={Boolean(anomalies?.ready)}>
          <summary>
            More insights
            <span className="form-hint">
              {[
                paperBalance?.ready ? 'paper balance' : null,
                anomalies?.ready ? 'anomaly' : null,
                trendPoints.length ? 'trend' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </summary>
          {paperBalance?.ready ? (
            <div className="diag-balance" aria-label="Smart paper balance">
              <strong>Smart paper balance</strong>
              <p className="form-hint" style={{ margin: '0.25rem 0 0.45rem' }}>
                {paperBalance.takeaway}
              </p>
              <ul className="diag-balance-list">
                {paperBalance.suggestions.slice(0, 5).map((s) => (
                  <li key={s.questionId}>
                    <span className={`diag-badge diag-badge--${s.action}`}>
                      {s.action.replace(/_/g, ' ')}
                    </span>{' '}
                    {s.index != null ? `Q${s.index}` : 'Q?'} · {subjectLabel(s)} — {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {anomalies?.ready ? (
            <div className="diag-anomaly" role="status">
              <strong>Anomaly check</strong>
              <p className="form-hint" style={{ margin: '0.25rem 0 0.5rem' }}>
                {anomalies.takeaway}
              </p>
              <ul className="diag-anomaly-list">
                {anomalies.flags.slice(0, 4).map((f) => (
                  <li key={`${f.questionId}-${f.code}`}>
                    <span className="diag-badge diag-badge--anomaly">{f.label}</span>{' '}
                    {f.index != null ? `Q${f.index}` : 'Q?'} · {subjectLabel(f)}
                    {f.chapter ? ` · ${f.chapter}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {trendPoints.length > 0 ? (
            <div className="diag-trend" aria-label="Diagnostic trend snapshot">
              <strong className="diag-trend-title">Trend</strong>
              <div className="diag-trend-row">
                {[...trendPoints].reverse().map((p, i) => (
                  <div key={`${p.at}-${i}`} className="diag-trend-pill" title={formatWhen(p.at)}>
                    <span className="diag-trend-pill-when">{formatWhen(p.at)}</span>
                    <span>
                      M {p.highMistake} · S {p.highSkip} · C {p.combinedOnly}
                      {p.suspectKey ? ` · QA ${p.suspectKey}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </details>
      )}

      <p className="form-hint diag-tabs-foot">
        Flags need {tabs.sampleFloor}+ exposures; 50% / 45% hysteresis avoids flapping. Attempt error
        ignores skips.
      </p>
    </section>
  )
}
