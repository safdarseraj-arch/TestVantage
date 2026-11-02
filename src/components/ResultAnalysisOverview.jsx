import {
  buildPerformanceOverview,
  buildTimeAnalytics,
} from '../utils/testAnalysis.js'

/** Detailed performance snapshot — KPI cards, subject table, charts. */
export default function ResultAnalysisOverview({ data, test }) {
  if (!data?.result || !test) return null

  const rows = buildPerformanceOverview({
    result: data.result,
    examPatternId: test.examPatternId,
    visitedIds: data.visitedIds,
    questionTimes: data.questionTimes ?? {},
    questions: test.questions,
  })

  const timeStats = buildTimeAnalytics({
    result: data.result,
    questionTimes: data.questionTimes ?? {},
    examPatternId: test.examPatternId,
  })

  const overall = rows[0]

  const barPct = (correct, incorrect, unattempted, total) => {
    if (!total) return { c: 0, i: 0, u: 0 }
    return {
      c: Math.round((correct / total) * 100),
      i: Math.round((incorrect / total) * 100),
      u: Math.round((unattempted / total) * 100),
    }
  }

  return (
    <section className="perf-analysis">
      <div className="perf-analysis-header">
        <h2>Performance overview</h2>
        <p className="perf-analysis-lead">
          Score breakdown by subject — correct, incorrect, and unattempted questions.
        </p>
      </div>

      {overall && (
        <div className="result-kpi-grid">
          <div className="result-kpi result-kpi-score">
            <span className="result-kpi-label">Score</span>
            <strong>
              {overall.score}
              <small> / {overall.maxScore}</small>
            </strong>
            <span className="result-kpi-meta">{overall.scorePct}% of max</span>
          </div>
          <div className="result-kpi result-kpi-correct">
            <span className="result-kpi-label">Accuracy</span>
            <strong>{overall.accuracyPct}%</strong>
            <span className="result-kpi-meta">on attempted</span>
          </div>
          <div className="result-kpi result-kpi-correct">
            <span className="result-kpi-label">Correct</span>
            <strong>{overall.correct}</strong>
            <span className="result-kpi-meta">questions</span>
          </div>
          <div className="result-kpi result-kpi-wrong">
            <span className="result-kpi-label">Incorrect</span>
            <strong>{overall.incorrect}</strong>
            <span className="result-kpi-meta">questions</span>
          </div>
          <div className="result-kpi result-kpi-skipped">
            <span className="result-kpi-label">Unattempted</span>
            <strong>{overall.unattempted + overall.notVisited}</strong>
            <span className="result-kpi-meta">not answered</span>
          </div>
          <div className="result-kpi result-kpi-time">
            <span className="result-kpi-label">Time</span>
            <strong>{timeStats.totalLabel}</strong>
            <span className="result-kpi-meta">avg {timeStats.avgSeconds}s / Q</span>
          </div>
        </div>
      )}

      <div className="perf-analysis-card card">
        <h3 className="perf-section-title">Subject-wise breakdown</h3>
        <div className="perf-analysis-table-wrap">
          <table className="perf-analysis-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Score</th>
                <th>Accuracy</th>
                <th>Correct</th>
                <th>Incorrect</th>
                <th>Unattempted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className={row.label === 'Overall' ? 'perf-analysis-overall' : ''}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>
                    {row.score}/{row.maxScore}{' '}
                    <span className="perf-muted">({row.scorePct}%)</span>
                  </td>
                  <td>
                    <span className="perf-acc-pill">{row.accuracyPct}%</span>
                  </td>
                  <td className="perf-num-correct">{row.correct}</td>
                  <td className="perf-num-wrong">{row.incorrect}</td>
                  <td className="perf-num-skipped">{row.unattempted + row.notVisited}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="perf-analysis-charts">
        {rows
          .filter((row) => row.label !== 'Overall')
          .map((row) => {
            const total =
              row.correct + row.incorrect + row.unattempted + row.notVisited || row.totalQuestions
            const p = barPct(row.correct, row.incorrect, row.unattempted + row.notVisited, total)
            return (
              <div key={`chart-${row.label}`} className="perf-analysis-chart-card card">
                <div className="perf-chart-head">
                  <h4>{row.label}</h4>
                  <span className="perf-chart-score">
                    {row.score}/{row.maxScore}
                  </span>
                </div>
                <div className="perf-analysis-stacked-bar" title={`${row.label} question status`}>
                  {p.c > 0 && <span className="seg correct" style={{ width: `${p.c}%` }} />}
                  {p.i > 0 && <span className="seg incorrect" style={{ width: `${p.i}%` }} />}
                  {p.u > 0 && <span className="seg unattempted" style={{ width: `${p.u}%` }} />}
                </div>
                <div className="perf-chart-pcts">
                  <span className="pct-correct">{p.c}% correct</span>
                  <span className="pct-wrong">{p.i}% wrong</span>
                  <span className="pct-skipped">{p.u}% skipped</span>
                </div>
              </div>
            )
          })}
      </div>

      <div className="perf-analysis-side-grid">
        {timeStats.slowest.some((t) => t.seconds > 0) && (
          <div className="perf-analysis-slow card">
            <h4>Time management</h4>
            <p className="form-hint">Questions where you spent the most time.</p>
            <ul className="perf-slow-list">
              {timeStats.slowest
                .filter((t) => t.seconds > 0)
                .slice(0, 6)
                .map((t) => (
                  <li key={t.questionId}>
                    <span className="perf-slow-q">Q{t.index}</span>
                    <span className="perf-slow-time">{t.seconds}s</span>
                    <span className={`perf-slow-grade ${t.grade}`}>{t.grade}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
