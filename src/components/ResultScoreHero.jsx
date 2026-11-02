import ResultScoreRing from './ResultScoreRing'
import { computePerformanceGrade } from '../utils/resultInsights.js'
import { formatTime } from '../utils/formatTime.js'
import { estimateAIR, getExamAirPoolSize } from '../utils/percentile.js'

/**
 * Compact score snapshot for deep analysis dashboard.
 */
export default function ResultScoreHero({
  result,
  durationSeconds,
  percentile,
  comparison,
  examPatternId,
  estimatedAIR,
}) {
  const pct = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0
  const timeLabel = durationSeconds != null ? formatTime(durationSeconds) : '—'
  const gradeInfo = computePerformanceGrade(result.score, result.maxScore)
  const airPoolSize = examPatternId ? getExamAirPoolSize(examPatternId) : null
  const air =
    estimatedAIR != null
      ? estimatedAIR
      : percentile != null && examPatternId
        ? estimateAIR(percentile, examPatternId)
        : null

  return (
    <div className="rad-score-hero">
      <ResultScoreRing
        score={result.score}
        maxScore={result.maxScore}
        grade={gradeInfo.grade}
        gradeColor={gradeInfo.color}
        size={100}
        stroke={8}
      />
      <div className="rad-score-metrics">
        <div className="rad-score-metric">
          <strong>{pct}%</strong>
          <span>of max marks</span>
        </div>
        <div className="rad-score-metric">
          <strong>{gradeInfo.grade}</strong>
          <span>{gradeInfo.label}</span>
        </div>
        <div className="rad-score-metric">
          <strong>{result.accuracy}%</strong>
          <span>accuracy</span>
        </div>
        {percentile != null && (
          <div className="rad-score-metric rad-score-metric-highlight">
            <strong>{percentile.toFixed(1)}</strong>
            <span>percentile</span>
          </div>
        )}
        {air != null && airPoolSize != null && (
          <div className="rad-score-metric rad-score-metric-air">
            <strong>{air.toLocaleString()}</strong>
            <span>
              Est. AIR <em className="rad-est-label">(estimate)</em>
            </span>
          </div>
        )}
        <div className="rad-score-metric">
          <strong>{timeLabel}</strong>
          <span>time taken</span>
        </div>
        <div className="rad-score-metric">
          <strong>{result.correct}</strong>
          <span>correct</span>
        </div>
        {comparison?.sameTest && (
          <div
            className={`rad-score-metric rad-score-metric-delta${comparison.improved ? ' up' : ' down'}`}
          >
            <strong>
              {comparison.scoreDelta >= 0 ? '+' : ''}
              {comparison.scoreDelta}
            </strong>
            <span>vs last attempt</span>
          </div>
        )}
      </div>
    </div>
  )
}
