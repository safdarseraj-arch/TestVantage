import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { savePracticePrefill } from '../utils/aiMastery.js'
import { aiAssistBadgeLabel } from '../utils/aiProviderAssist.js'
import { buildInsightCoachLocal, runInsightCoach } from '../utils/insightCoach.js'

/**
 * Insight Coach panel — priorities, why, revision order, practice vs exam-day.
 * Gemini when ready; Local AI always.
 *
 * @param {{
 *   forecast?: object | null
 *   examFit?: object | null
 *   precision?: object | null
 *   analytics?: object | null
 *   compact?: boolean
 *   autoRun?: boolean
 * }} props
 */
export default function InsightCoachPanel({
  forecast = null,
  examFit = null,
  precision = null,
  analytics = null,
  compact = false,
  autoRun = true,
}) {
  const navigate = useNavigate()
  const localPack = buildInsightCoachLocal({ forecast, examFit, precision, analytics })
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = () => {
    setLoading(true)
    setError('')
    runInsightCoach({ forecast, examFit, precision, analytics })
      .then((res) => setResult(res))
      .catch(() => {
        setError('Could not refresh Insight Coach — showing local priorities.')
        setResult({
          ...localPack,
          narrative: localPack.localText,
          badge: 'Local AI',
          provider: 'local',
        })
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!autoRun) return undefined
    let cancelled = false
    setLoading(true)
    runInsightCoach({ forecast, examFit, precision, analytics })
      .then((res) => {
        if (!cancelled) setResult(res)
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            ...localPack,
            narrative: localPack.localText,
            badge: 'Local AI',
            provider: 'local',
          })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Re-run when standing numbers change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    forecast?.air,
    forecast?.examId,
    forecast?.practiceMarks,
    examFit?.score,
    precision?.totalTagged,
    analytics?.avgAccuracy,
    autoRun,
  ])

  const view = result ?? {
    ...localPack,
    narrative: localPack.localText,
    badge: 'Local AI',
    provider: 'local',
  }
  const badge = view.badge || aiAssistBadgeLabel(view.provider)
  const isCloud = String(badge).toLowerCase().includes('cloud') || String(badge).toLowerCase().includes('gemini')

  const onAction = (a) => {
    if (a.to?.includes('/practice')) {
      const top = examFit?.ladder?.[0]
      if (top?.practicePrefill) savePracticePrefill(top.practicePrefill)
    }
    if (a.to?.startsWith('http') || a.to?.includes('#')) {
      navigate(a.to.replace(/#.*$/, '') || a.to)
      if (a.to.includes('#')) {
        const hash = a.to.split('#')[1]
        setTimeout(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' })
        }, 200)
      }
      return
    }
    navigate(a.to)
  }

  return (
    <section
      className={`si-coach card ic-coach-panel${compact ? ' ic-coach-panel--compact' : ''}`}
      id="insight-coach"
    >
      <div className="si-coach-head">
        <div>
          <div className="si-coach-badges">
            <span className="ai-tune-badge">AI</span>
            <span
              className={`si-coach-source ${isCloud ? 'si-coach-source-cloud' : 'si-coach-source-local'}`}
              title={loading ? 'Checking cloud assist…' : badge}
            >
              {loading ? 'Checking…' : badge}
            </span>
            {view.needsReview ? (
              <span className="ic-needs-review" title="Limited data — priorities may be incomplete">
                Needs review
              </span>
            ) : null}
          </div>
          <h2>Insight Coach</h2>
          <p className="si-coach-summary">{view.summary}</p>
          {view.narrative && view.narrative !== view.summary && (
            <div className="si-coach-cloud-blurb ic-narrative">
              <span className="si-coach-cloud-label">
                {isCloud ? 'Cloud insight' : 'Coach notes'}
              </span>
              <pre className="ic-narrative-text">{view.narrative}</pre>
            </div>
          )}
          {view.cloudError ? (
            <p className="form-hint">Cloud tried and fell back to Local AI. {view.cloudError}</p>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={run} disabled={loading}>
          {loading ? 'Writing…' : 'Refresh Insight Coach'}
        </button>
      </div>

      <div className="si-coach-grid">
        <div className="si-coach-block si-coach-focus">
          <h3>Priorities</h3>
          <ul>
            {view.priorities.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
        <div className="si-coach-block si-coach-strengths">
          <h3>Why (your data)</h3>
          <ul>
            {view.why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      </div>

      {!compact && (
        <div className="ic-revision-block">
          <h3>Revision order</h3>
          <ol className="ic-revision-list">
            {view.revisionOrder.map((r) => (
              <li key={r}>{r.replace(/^\d+\.\s*/, '')}</li>
            ))}
          </ol>
        </div>
      )}

      <p className="ic-form-vs-day form-hint">
        <strong>Practice form vs exam day:</strong> {view.formVsExamDay}{' '}
        <Link to="/career-compass">Career Compass →</Link>
      </p>

      <div className="si-coach-actions">
        {view.actions.map((a) => (
          <button
            key={a.to + a.label}
            type="button"
            className="si-action-chip"
            onClick={() => onAction(a)}
          >
            <span>{a.icon || '→'}</span>
            {a.label}
          </button>
        ))}
      </div>

      {view.disclaimer ? <p className="form-hint ic-disclaimer">{view.disclaimer}</p> : null}
    </section>
  )
}
