/** Horizontal percentile progress bar with milestone flags. */
export default function PercentileBar({ yourScore, maxScore, yourPct, milestones, studentCount }) {
  const pctOnBar = maxScore > 0 ? Math.min(100, (yourScore / maxScore) * 100) : 0

  return (
    <div className="pct-bar card">
      <div className="pct-bar-head">
        <div>
          <span className="pct-bar-label">Your score</span>
          <strong className="pct-bar-score">
            {yourScore}
            <small> / {maxScore}</small>
          </strong>
        </div>
        {yourPct != null && studentCount > 1 && (
          <span className="pct-bar-rank">{yourPct}th local percentile</span>
        )}
      </div>

      <div className="pct-bar-track-wrap">
        <div className="pct-bar-track">
          <div className="pct-bar-fill" style={{ width: `${pctOnBar}%` }} />
          {milestones?.map((m) => {
            const pos = maxScore > 0 ? (m.score / maxScore) * 100 : 0
            return (
              <div
                key={m.pct}
                className="pct-bar-flag"
                style={{ left: `${Math.min(98, Math.max(2, pos))}%` }}
                title={`${m.pct}th %ile ≈ ${m.score}/${maxScore}`}
              >
                <span className="pct-flag-icon">🚩</span>
                <span className="pct-flag-text">
                  {m.pct}th %ile
                  <br />
                  {m.score}/{maxScore}
                </span>
              </div>
            )
          })}
          <div className="pct-bar-you" style={{ left: `${pctOnBar}%` }} title={`You: ${yourScore}`}>
            <span>You</span>
          </div>
        </div>
        <div className="pct-bar-scale">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      {studentCount <= 1 && (
        <p className="form-hint pct-bar-hint">
          Local percentile markers update when more students take this test on this device. Not a
          national rank.
        </p>
      )}
    </div>
  )
}
