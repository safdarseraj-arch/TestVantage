import { useState } from 'react'
import {
  AI_TUNE_PROFILES,
  aiTunePaper,
} from '../../utils/aiPaperTuning.js'

/**
 * AI paper tuning controls.
 * @param {{
 *   pool: import('../../data/tests').Question[]
 *   slots: import('../../data/examPatterns').QuestionTypeSlot[]
 *   syllabus: import('../../utils/syllabusMeta').SyllabusSelection
 *   examPatternId: string
 *   toughnessTarget: number
 *   onToughnessChange: (n: number) => void
 *   onResult: (questions: import('../../data/tests').Question[], report: object | null) => void
 *   previewCount: number
 *   pyqPercent?: number
 * }} props
 */
export default function AiPaperTuningPanel({
  pool,
  slots,
  syllabus,
  examPatternId,
  toughnessTarget,
  onToughnessChange,
  onResult,
  previewCount,
  pyqPercent,
}) {
  const [profileId, setProfileId] = useState(/** @type {keyof typeof AI_TUNE_PROFILES} */ ('balanced'))
  const [tuning, setTuning] = useState(false)
  const [report, setReport] = useState(/** @type {Record<string, unknown> | null} */ (null))
  const [error, setError] = useState('')

  const profile = AI_TUNE_PROFILES[profileId]

  const runAiTune = () => {
    setError('')
    setTuning(true)
    try {
      const tuned = aiTunePaper(pool, slots, syllabus, {
        profileId,
        examPatternId,
        toughnessTarget,
        attempts: 16,
        pyqPercent,
      })
      setReport(tuned.tuneReport ?? null)
      onResult(tuned.questions ?? [], tuned.tuneReport ?? null)
      if (tuned.gaps?.length) {
        setError(
          `AI filled most slots but ${tuned.gaps.length} slot(s) still short — upload more questions in Question Bank.`,
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI tune failed.')
    } finally {
      setTuning(false)
    }
  }

  return (
    <div className="ai-tune-panel card">
      <div className="ai-tune-head">
        <div>
          <h3>AI paper tuning</h3>
          <p className="form-hint">
            AI tries many combinations and picks the best paper for difficulty, syllabus
            spread, and quality score.
          </p>
        </div>
        <span className="ai-tune-badge">AI</span>
      </div>

      <label className="ai-tune-profile-label">
        Tuning profile
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          {Object.entries(AI_TUNE_PROFILES).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <p className="form-hint ai-tune-profile-desc">{profile.description}</p>

      <label>
        Fine-tune toughness (optional)
        <input
          type="range"
          min={1}
          max={10}
          value={toughnessTarget}
          onChange={(e) => onToughnessChange(Number(e.target.value))}
        />
        <span className="toughness-value">{toughnessTarget}</span>
      </label>

      <button type="button" className="btn btn-primary" disabled={tuning} onClick={runAiTune}>
        {tuning ? 'AI tuning…' : 'AI tune paper'}
      </button>

      {error && <p className="upload-error ai-tune-msg">{error}</p>}

      {report && (
        <div className="ai-tune-report">
          <strong>AI tune result</strong>
          <div className="ai-tune-scores">
            <div className="ai-tune-score-box">
              <em>{report.aiScore}</em>
              <span>AI score</span>
            </div>
            <div className="ai-tune-score-box">
              <em>{report.tqs}</em>
              <span>TQS</span>
            </div>
            <div className="ai-tune-score-box">
              <em>{report.coverage}%</em>
              <span>Syllabus</span>
            </div>
            <div className="ai-tune-score-box">
              <em>{report.difficultyFit}%</em>
              <span>Difficulty fit</span>
            </div>
            <div className="ai-tune-score-box">
              <em>{report.diversity}%</em>
              <span>Chapter spread</span>
            </div>
          </div>
          {report.difficulty && (
            <p className="form-hint">
              Difficulty: Easy {report.difficulty.buckets.easy} · Medium {report.difficulty.buckets.medium}{' '}
              · Hard {report.difficulty.buckets.hard}
              {report.difficulty.average != null && ` · Avg ${report.difficulty.average.toFixed(1)}/10`}
            </p>
          )}
          {Array.isArray(report.suggestions) && report.suggestions.length > 0 && (
            <ul className="ai-tune-tips">
              {report.suggestions.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {previewCount > 0 && (
        <p className="form-hint">
          Prepared <strong>{previewCount}</strong> questions. Click <strong>Next</strong> to review and
          publish.
        </p>
      )}
    </div>
  )
}
