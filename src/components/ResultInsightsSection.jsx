import { getQuestionType } from '../data/questionTypes'
import { getSubjectsForPattern } from '../data/subjects'
import { buildWeakTopics } from '../utils/testAnalysis.js'

/**
 * Legacy insight blocks — stat grid, question-type & subject breakdown, focus tips.
 * @param {{ result: import('../data/tests').TestResult, examPatternId: string }} props
 */
export default function ResultInsightsSection({ result, examPatternId }) {
  const subjects = getSubjectsForPattern(examPatternId)
  const chapters = Object.entries(result.byChapter ?? {}).filter(([, v]) => v.total > 0)
  const weakTopics = buildWeakTopics(result.byChapter ?? {})
  const hasPartial = (result.partial ?? 0) > 0

  return (
    <section className="rad-insights">
      <div className={`rad-stat-grid ${hasPartial ? 'has-partial' : ''}`}>
        <div className="rad-stat-box correct">
          <span className="rad-stat-num">{result.correct}</span>
          <span>Correct</span>
        </div>
        {hasPartial && (
          <div className="rad-stat-box partial">
            <span className="rad-stat-num">{result.partial ?? 0}</span>
            <span>Partial (MSQ)</span>
          </div>
        )}
        <div className="rad-stat-box wrong">
          <span className="rad-stat-num">{result.wrong}</span>
          <span>Wrong</span>
        </div>
        <div className="rad-stat-box skipped">
          <span className="rad-stat-num">{result.unattempted}</span>
          <span>Unattempted</span>
        </div>
        {(result.markedCount ?? 0) > 0 && (
          <div className="rad-stat-box marked">
            <span className="rad-stat-num">{result.markedCount}</span>
            <span>Marked for review</span>
          </div>
        )}
      </div>

      <div className="rad-insights-grid">
        {result.byQuestionType && (
          <div className="card rad-insight-card">
            <h3>By question type</h3>
            <div className="rad-breakdown-list">
              {Object.entries(result.byQuestionType).map(([typeId, sub]) => {
                const total = sub.correct + sub.wrong + sub.unattempted + (sub.partial ?? 0)
                if (total === 0) return null
                return (
                  <div key={typeId} className="rad-breakdown-row">
                    <span className="rad-breakdown-name">{getQuestionType(typeId).name}</span>
                    <span>
                      <strong>{sub.score}</strong>/{sub.maxScore}
                    </span>
                    <span className="text-correct">✓ {sub.correct}</span>
                    {(sub.partial ?? 0) > 0 && <span>◐ {sub.partial}</span>}
                    <span className="text-wrong">✗ {sub.wrong}</span>
                    <span>— {sub.unattempted}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="card rad-insight-card">
          <h3>By subject</h3>
          <div className="rad-breakdown-list">
            {subjects.map((s) => {
              const sub = result.bySubject[s.id]
              if (!sub) return null
              const total = sub.correct + sub.wrong + sub.unattempted + (sub.partial ?? 0)
              if (total === 0) return null
              const subPct = sub.maxScore > 0 ? Math.round((sub.score / sub.maxScore) * 100) : 0
              return (
                <div key={s.id} className="rad-breakdown-row">
                  <span className="rad-breakdown-name" style={{ borderColor: s.color }}>
                    {s.label}
                  </span>
                  <span>
                    <strong>{sub.score}</strong>/{sub.maxScore} ({subPct}%)
                  </span>
                  <span className="text-correct">✓ {sub.correct}</span>
                  {(sub.partial ?? 0) > 0 && <span>◐ {sub.partial}</span>}
                  <span className="text-wrong">✗ {sub.wrong}</span>
                  <span>— {sub.unattempted}</span>
                </div>
              )
            })}
          </div>
        </div>

        {chapters.length > 0 && (
          <div className="card rad-insight-card">
            <h3>By chapter / topic</h3>
            <div className="rad-breakdown-list">
              {chapters.map(([ch, sub]) => (
                <div key={ch} className="rad-breakdown-row">
                  <span className="rad-breakdown-name">{ch}</span>
                  <span>
                    <strong>{sub.score}</strong>/{sub.maxScore}
                  </span>
                  <span className="text-correct">✓ {sub.correct}</span>
                  <span className="text-wrong">✗ {sub.wrong}</span>
                  <span>— {sub.unattempted}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card rad-insight-card rad-focus-card">
          <h3>Performance insight</h3>
          <ul className="rad-insight-list">
            {subjects.map((s) => {
              const sub = result.bySubject[s.id]
              if (!sub || sub.wrong + sub.unattempted === 0) return null
              if (sub.wrong < sub.correct) return null
              return (
                <li key={s.id}>
                  Focus on <strong>{s.label}</strong> — {sub.wrong} wrong, {sub.unattempted} skipped.
                </li>
              )
            })}
            {weakTopics.slice(0, 4).map((t) => (
              <li key={t.chapter}>
                Chapter <strong>{t.chapter}</strong> — {t.accuracy}% accuracy ({t.wrong} wrong).
              </li>
            ))}
            {result.wrong === 0 && result.unattempted === 0 && (
              <li className="rad-insight-good">Excellent attempt — all questions answered correctly!</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  )
}
