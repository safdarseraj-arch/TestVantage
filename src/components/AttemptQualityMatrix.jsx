import { useMemo } from 'react'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { buildAttemptQualityMatrix } from '../utils/attemptQualityMatrix.js'

/**
 * 4-quadrant attempt quality — Perfect / Overtime / Wasted / Painful.
 * Calm teal–amber–coral palette (exam-anxiety aware).
 */
export default function AttemptQualityMatrix({
  result,
  questionTimes = {},
  paperDurationSec = 0,
  questions = [],
}) {
  const matrix = useMemo(
    () =>
      buildAttemptQualityMatrix({
        result,
        questionTimes,
        paperDurationSec,
        questions,
      }),
    [result, questionTimes, paperDurationSec, questions],
  )

  if (!matrix.chart.length) {
    return (
      <div className="aqm-empty">
        <p>Attempt quality unlocks when this result has question-level grades.</p>
      </div>
    )
  }

  const total = matrix.chart.reduce((s, d) => s + d.value, 0)
  const gridKeys = ['perfect', 'overtimeCorrect', 'wasted', 'painful']

  return (
    <div className="aqm-panel">
      <div className="aqm-head">
        <div>
          <h3>Attempt quality matrix</h3>
          <p>
            Ideal pace ~{matrix.idealSeconds}s per question — how cleanly you converted time into
            marks
          </p>
        </div>
        {matrix.potential && (
          <div className="aqm-potential">
            <span className="aqm-potential-label">Potential score</span>
            <strong>
              {matrix.potential.actual}
              {matrix.potential.recoverable > 0 ? (
                <em> → {matrix.potential.potentialScore}</em>
              ) : null}
            </strong>
            <span className="aqm-potential-hint">
              {matrix.potential.recoverable > 0
                ? `+${matrix.potential.recoverable} from avoidable mistakes`
                : 'Few easy marks left on the table'}
            </span>
          </div>
        )}
      </div>

      <div className="aqm-quad-grid" role="list">
        {gridKeys.map((key) => {
          const meta = matrix.meta[key]
          const n = matrix.counts[key] || 0
          return (
            <div
              key={key}
              className={`aqm-quad aqm-quad-${key}`}
              role="listitem"
              style={{ borderColor: `${meta.color}33` }}
            >
              <span className="aqm-quad-dot" style={{ background: meta.color }} aria-hidden />
              <strong style={{ color: meta.color }}>{n}</strong>
              <span className="aqm-quad-label">{meta.label}</span>
              <span className="aqm-quad-hint">{meta.hint}</span>
            </div>
          )
        })}
      </div>

      <div className="aqm-charts">
        <div className="aqm-chart">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={matrix.chart}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={76}
                paddingAngle={2}
                stroke="none"
              >
                {matrix.chart.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [
                  `${value} (${total ? Math.round((value / total) * 100) : 0}%)`,
                  name,
                ]}
              />
              <Legend verticalAlign="bottom" height={32} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="aqm-chart">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={matrix.chart}
              layout="vertical"
              margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf2" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fill: '#475569', fontSize: 11 }}
                axisLine={false}
              />
              <Tooltip />
              <Bar dataKey="value" name="Questions" radius={[0, 6, 6, 0]} maxBarSize={18}>
                {matrix.chart.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {matrix.takeaway ? <p className="aqm-takeaway">{matrix.takeaway}</p> : null}
    </div>
  )
}
