import { difficultyLabel } from '../utils/adaptiveTest.js'

/**
 * @param {{
 *   standing: import('../utils/adaptiveTest.js').StandingEstimate | import('../utils/aiAdaptiveEngine.js').ReturnType<import('../utils/aiAdaptiveEngine.js').standingFromLiveAbility> | null,
 *   sectionResults: import('../utils/adaptiveTest.js').SectionResult[],
 *   nextDifficulty?: import('../utils/adaptiveTest.js').DifficultyBand,
 *   liveItemCount?: number,
 *   compact?: boolean
 * }} props
 */
export default function CalibratedStandingPanel({
  standing,
  sectionResults,
  nextDifficulty,
  liveItemCount = 0,
  compact = false,
}) {
  if (!standing && sectionResults.length === 0) return null

  const level = standing?.levelScore ?? 0
  const tier = standing?.tier ?? '—'

  return (
    <div className={`calibrated-standing ${compact ? 'calibrated-standing-compact' : ''}`}>
      <div className="calibrated-standing-head">
        <span className="calibrated-standing-label">Your calibrated level</span>
        <strong className="calibrated-standing-tier">{tier}</strong>
        {standing && (
          <span className="calibrated-standing-score" title="Composite level score">
            {level}/100
          </span>
        )}
      </div>
      {!compact && standing?.headline && (
        <p className="calibrated-standing-headline">{standing.headline}</p>
      )}
      {!compact && standing?.summary && (
        <p className="form-hint calibrated-standing-summary">{standing.summary}</p>
      )}
      {liveItemCount > 0 && (
        <p className="form-hint calibrated-live-items">
          AI calibrated on <strong>{liveItemCount}</strong> response{liveItemCount === 1 ? '' : 's'} so far
        </p>
      )}
      {sectionResults.length > 0 && (
        <ul className="calibrated-section-log">
          {sectionResults.map((s) => (
            <li key={s.subjectId}>
              <span className="calibrated-log-subject">{s.subjectId}</span>
              <span className="calibrated-log-diff">{difficultyLabel(s.difficulty)}</span>
              <span className="calibrated-log-acc">{Math.round(s.accuracy * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
      {nextDifficulty && (
        <p className="calibrated-next-hint">
          Next section block: <strong>{difficultyLabel(nextDifficulty)}</strong> difficulty
        </p>
      )}
    </div>
  )
}
