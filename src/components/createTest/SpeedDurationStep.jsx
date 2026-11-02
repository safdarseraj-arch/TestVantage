import { SPEED_DURATION_OPTIONS, formatSpeedTestTimingSummary } from '../../utils/speedTest.js'

/**
 * @param {{
 *   durationMinutes: number
 *   onChange: (minutes: number) => void
 *   syllabusLabel: string
 *   poolCount: number
 * }} props
 */
export default function SpeedDurationStep({
  durationMinutes,
  onChange,
  syllabusLabel,
  poolCount,
}) {
  return (
    <section className="create-section card">
      <h2>Exam duration</h2>
      <p className="form-hint">
        Choose how long the speed test runs. AI will pick questions (toughness level 3 or easier)
        from your syllabus to fit this time. Pacing: {formatSpeedTestTimingSummary()}.
      </p>
      <p className="form-hint">
        <strong>{syllabusLabel}</strong> · <strong>{poolCount}</strong> eligible questions in bank
      </p>
      <div className="speed-duration-grid" role="radiogroup" aria-label="Exam duration">
        {SPEED_DURATION_OPTIONS.map((mins) => (
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
