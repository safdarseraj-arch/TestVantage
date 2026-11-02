import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { PERMS } from '../utils/permissions'
import { savePracticePrefill } from '../utils/aiMastery.js'
import { runAiAssistWithFallback, aiAssistBadgeLabel } from '../utils/aiProviderAssist.js'

/**
 * Insight Coach · This test — strengths, focus areas, next steps for one attempt.
 * Optional short Cloud (Gemini) blurb when key is present; always shows Local fallback.
 * @param {{ insights: ReturnType<import('../utils/resultInsights.js').buildResultCoachInsights> }} props
 */
export default function ResultAiCoach({ insights }) {
  const navigate = useNavigate()
  const { isAdmin, hasPermission } = useAuth()
  const canOpenQuestionBank = isAdmin || hasPermission(PERMS.UPLOAD_QUESTIONS)
  const [cloudBlurb, setCloudBlurb] = useState(null)
  const [badge, setBadge] = useState('Local AI')
  const [loadingCloud, setLoadingCloud] = useState(false)

  useEffect(() => {
    if (!insights?.summary) {
      setCloudBlurb(null)
      setBadge('Local AI')
      return undefined
    }

    let cancelled = false
    const localBlurb = [
      insights.summary,
      insights.strengths?.[0] ? `Strength: ${insights.strengths[0]}` : '',
      insights.focus?.[0] ? `Focus: ${insights.focus[0]}` : '',
    ]
      .filter(Boolean)
      .join(' ')

    setCloudBlurb(null)
    setBadge('Local AI')
    setLoadingCloud(true)

    runAiAssistWithFallback({
      task: 'result-coach',
      localText: localBlurb,
      localDisclaimer:
        'Coaching tips use your real scores only. Estimated ranks are labelled when shown.',
      learningStem: `result-coach:${insights.summary}:${(insights.focus ?? []).slice(0, 2).join('|')}`,
      context: {
        instruction:
          'Write 2–3 short student-friendly sentences as a performance coach. Quote only the given numbers. Do NOT invent scores, percentiles, ranks, or cut-offs. Suggest study focus from the given strengths/focus lists.',
        summary: insights.summary,
        strengths: (insights.strengths ?? []).slice(0, 4),
        focus: (insights.focus ?? []).slice(0, 4),
        weakTopics: (insights.weakTopics ?? []).slice(0, 3).map((t) => ({
          chapter: t.chapter,
          accuracy: t.accuracy,
        })),
        masteryOverall: insights.mastery?.overallMastery ?? null,
      },
    }).then((res) => {
      if (cancelled) return
      setBadge(res.badge || aiAssistBadgeLabel(res.provider))
      if (res.provider === 'cloud-vision' && res.text) {
        setCloudBlurb(res.text)
      } else {
        setCloudBlurb(null)
      }
      setLoadingCloud(false)
    })

    return () => {
      cancelled = true
    }
  }, [insights])

  if (!insights) return null

  const onAction = (a) => {
    if (a.prefill) savePracticePrefill(a.prefill)
    const target =
      a.to?.startsWith('/question-bank') && !canOpenQuestionBank ? '/tests' : a.to
    navigate(target)
  }

  const isCloud = badge.toLowerCase().includes('cloud') || badge.toLowerCase().includes('gemini')

  return (
    <section className="si-coach card">
      <div className="si-coach-head">
        <div>
          <div className="si-coach-badges">
            <span className="ai-tune-badge">AI</span>
            <span
              className={`si-coach-source ${isCloud ? 'si-coach-source-cloud' : 'si-coach-source-local'}`}
              title={loadingCloud ? 'Checking cloud assist…' : badge}
            >
              {loadingCloud ? 'Checking…' : badge}
            </span>
          </div>
          <h2>Insight Coach · This test</h2>
          <p className="si-coach-summary">{insights.summary}</p>
          {cloudBlurb && (
            <p className="si-coach-cloud-blurb">
              <span className="si-coach-cloud-label">Cloud insight</span>
              {cloudBlurb}
            </p>
          )}
        </div>
      </div>

      <div className="si-coach-grid">
        {insights.strengths.length > 0 && (
          <div className="si-coach-block si-coach-strengths">
            <h3>What went well</h3>
            <ul>
              {insights.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {insights.focus.length > 0 && (
          <div className="si-coach-block si-coach-focus">
            <h3>Focus next</h3>
            <ul>
              {insights.focus.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="si-coach-actions">
        {insights.actions.map((a) => (
          <button
            key={a.to + a.label}
            type="button"
            className="si-action-chip"
            onClick={() => onAction(a)}
          >
            <span>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
      {insights.mastery && (
        <p className="form-hint si-coach-mastery">
          Overall chapter strength {insights.mastery.overallMastery}% across your attempts
        </p>
      )}
    </section>
  )
}
