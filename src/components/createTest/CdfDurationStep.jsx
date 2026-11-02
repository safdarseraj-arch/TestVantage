import { CDF_DURATION_OPTIONS, formatCdfTestTimingSummary } from '../../utils/cdfTest.js'

/**
 * @param {{
 *   durationMinutes: number
 *   onChange: (minutes: number) => void
 *   syllabusLabel: string
 *   poolCount: number
 * }} props
 */
export default function CdfDurationStep({
  durationMinutes,
  onChange,
  syllabusLabel,
  poolCount,
}) {
  return (
    <section className="create-section card">
      <h2>Time slot</h2>
      <p className="form-hint">
        Choose 15 or 30 minutes. AI picks level-1 SCQ and T/F questions from your syllabus to fit
        this slot. Per-question timer: {formatCdfTestTimingSummary()}.
      </p>
      <p className="form-hint">
        <strong>{syllabusLabel}</strong> · <strong>{poolCount}</strong> eligible questions in bank
      </p>
      <div className="speed-duration-grid" role="radiogroup" aria-label="Time slot">
        {CDF_DURATION_OPTIONS.map((mins) => (
          <button
            key={mins}
            type="button"
            role="radio"
            aria-checked={durationMinutes === mins}
            className={`speed-duration-card${durationMinutes === mins ? ' selected' : ''}`}
            onClick={() => onChange(mins)}
          >
            <span className="speed-duration-value">{mins}</span>
            <span className="speed-duration-unit">minutes</span>
          </button>
        ))}
      </div>
    </section>
  )
}
