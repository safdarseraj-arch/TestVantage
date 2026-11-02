import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import InsightPageHero from '../components/InsightPageHero'
import { useAuth } from '../context/AuthContext'
import { getAttemptsByOwner, getOwnerKey } from '../utils/attemptHistory'
import { formatTime } from '../utils/formatTime'

function scoreTone(pct) {
  if (pct >= 80) return 'excellent'
  if (pct >= 60) return 'good'
  return 'focus'
}

export default function MyResults() {
  const { session, isUser } = useAuth()
  const ownerKey = getOwnerKey(session?.userId)
  const attempts = getAttemptsByOwner(ownerKey)

  const summary = useMemo(() => {
    if (attempts.length === 0) return null
    const pcts = attempts.map((a) =>
      a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0,
    )
    const avgPct = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length)
    const bestPct = Math.max(...pcts)
    const latest = attempts[0]
    return { total: attempts.length, avgPct, bestPct, latest }
  }, [attempts])

  return (
    <div className="page my-results-page insight-portal-page insight-portal-page--my-results student-portal-page">
      <InsightPageHero
        pageId="my-results"
        actions={
          <>
            <Link to="/analytics" className="btn btn-ghost btn-sm">
              Analytics
            </Link>
            <Link to="/prepare" className="btn btn-primary btn-sm">
              Prepare centre
            </Link>
          </>
        }
      />

      {!isUser ? (
        <div className="insight-notice-card">
          <p>
            <Link to="/login">Sign in</Link> to sync results across devices. Guest attempts are saved
            on this browser only.
          </p>
          <Link to="/login" className="btn btn-primary btn-sm">
            Sign in
          </Link>
        </div>
      ) : (
        <div className="insight-notice-card insight-notice-card--signed-in">
          <p>
            Signed in as <strong>{session.name}</strong> · {session.email}
          </p>
        </div>
      )}

      {summary && (
        <div className="insight-kpi-strip">
          <div className="insight-kpi-card insight-kpi-card--highlight">
            <span className="insight-kpi-label">Attempts</span>
            <strong className="insight-kpi-value">{summary.total}</strong>
          </div>
          <div className="insight-kpi-card">
            <span className="insight-kpi-label">Average score</span>
            <strong className="insight-kpi-value">{summary.avgPct}%</strong>
          </div>
          <div className="insight-kpi-card">
            <span className="insight-kpi-label">Best score</span>
            <strong className="insight-kpi-value">{summary.bestPct}%</strong>
          </div>
          <div className="insight-kpi-card">
            <span className="insight-kpi-label">Latest</span>
            <strong className="insight-kpi-value insight-kpi-value--sm">
              {summary.latest.title}
            </strong>
            <span className="insight-kpi-sub">
              {new Date(summary.latest.submittedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      {attempts.length === 0 ? (
        <div className="insight-empty-state">
          <div className="insight-empty-icon">🏆</div>
          <h2>No attempts yet</h2>
          <p>
            Take a mock test or practice session — your scores and full AI analysis will appear here.
          </p>
          <div className="insight-empty-actions">
            <Link to="/prepare" className="btn btn-primary">
              Open prepare centre
            </Link>
            <Link to="/tests" className="btn btn-ghost">
              Browse tests
            </Link>
          </div>
        </div>
      ) : (
        <div className="insight-table-card">
          <div className="insight-table-card-head">
            <h2>Test history</h2>
            <span>{attempts.length} attempt{attempts.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="insight-table-wrap">
            <table className="attempts-table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Score</th>
                  <th>Accuracy</th>
                  <th>Time</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => {
                  const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.title}</strong>
                      </td>
                      <td>
                        <span className={`insight-score-badge insight-score-badge--${scoreTone(pct)}`}>
                          {a.score}/{a.maxScore}
                        </span>{' '}
                        <span className="form-hint">({pct}%)</span>
                      </td>
                      <td>{a.accuracy}%</td>
                      <td>{a.durationSeconds != null ? formatTime(a.durationSeconds) : '—'}</td>
                      <td>{new Date(a.submittedAt).toLocaleString()}</td>
                      <td>
                        <Link
                          to={`/result/${a.testId}?attempt=${a.id}`}
                          className="btn btn-ghost btn-sm"
                        >
                          Analysis
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
