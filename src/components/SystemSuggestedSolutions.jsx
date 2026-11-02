import { useMemo } from 'react'
import MathText from './MathText'
import { findSimilarBankQuestions } from '../utils/bankMatch'

/**
 * @param {{ title: string, body: string, subject?: string, compact?: boolean }} props
 */
export default function SystemSuggestedSolutions({ title, body, subject, compact = false }) {
  const matches = useMemo(() => {
    const query = `${title}\n${body}`.trim()
    if (query.length < 20) return []
    return findSimilarBankQuestions(query, { subject, limit: compact ? 2 : 3 })
  }, [title, body, subject, compact])

  if (matches.length === 0) return null

  return (
    <section className="system-solutions-block">
      <div className="system-solutions-head">
        <span className="system-badge">🤖 System</span>
        <h4>Matched from Question Bank</h4>
        <p className="form-hint">
          Same or similar problem found in your bank — showing stored solution(s).
        </p>
      </div>
      <ul className="system-solutions-list">
        {matches.map((m, i) => (
          <li key={`${m.question.id}-${i}`} className="system-solution-card">
            <div className="system-match-meta">
              <span className="match-score">{Math.round(m.score * 100)}% match</span>
              <span className="match-label">{m.matchLabel}</span>
              {m.chapter && <span className="match-chapter">{m.chapter}</span>}
              <span className="match-source">{m.testTitle}</span>
            </div>
            <details className="matched-question-details">
              <summary>View matched question</summary>
              <div className="matched-question-text">
                <MathText text={m.questionPreview} />
              </div>
            </details>
            <div className="system-solution-body">
              <strong>Solution:</strong>
              {m.solution ? (
                <MathText text={m.solution} />
              ) : (
                <p className="form-hint">No text solution — see video below.</p>
              )}
              {m.videoSolution && (
                <a
                  href={m.videoSolution}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost btn-sm video-solution-link"
                >
                  ▶ Video solution
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
