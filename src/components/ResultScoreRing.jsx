/** SVG circular score ring for result hero. */
export default function ResultScoreRing({
  score,
  maxScore,
  size = 120,
  stroke = 10,
  grade,
  gradeColor,
}) {
  const pct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ

  return (
    <div className="si-score-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="si-score-ring-svg" aria-hidden>
        <circle
          className="si-score-ring-bg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          className="si-score-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ stroke: gradeColor ?? 'var(--primary)' }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="si-score-ring-center">
        {grade && (
          <span className="si-grade-badge" style={{ color: gradeColor }}>
            {grade}
          </span>
        )}
        <strong className="si-ring-score">{score}</strong>
        <span className="si-ring-max">/ {maxScore}</span>
      </div>
    </div>
  )
}
