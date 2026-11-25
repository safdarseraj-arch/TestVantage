import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import {
  buildAttemptQualityMatrix,
  simulateWhatIfScore,
} from '../utils/attemptQualityMatrix.js'

/**
 * Interactive What-If score simulator — silly-mistake & overtime levers.
 */
export default function WhatIfScoreSimulator({
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

  const [sillyFixPct, setSillyFixPct] = useState(60)
  const [overtimeFixPct, setOvertimeFixPct] = useState(40)

  const sim = useMemo(() => {
    if (!matrix.potential) return null
    return simulateWhatIfScore(
      {
        actual: matrix.potential.actual,
        maxScore: matrix.potential.maxScore,
        sillyLost: matrix.potential.sillyLost,
        overtimeCorrect: matrix.counts.overtimeCorrect,
      },
      { sillyFixPct, overtimeFixPct },
    )
  }, [matrix, sillyFixPct, overtimeFixPct])

  if (!matrix.potential || !sim) {
    return null
  }

  const barData = [
    {
      key: 'now',
      label: 'Now',
      score: matrix.potential.actual,
      color: '#64748b',
    },
    {
      key: 'whatif',
      label: 'What-if',
      score: sim.score,
      color: '#0d9488',
    },
  ]

  return (
    <div className="wif-panel">
      <div className="wif-head">
        <div>
          <h3>What-if score simulator</h3>
          <p>Model percentile impact by fixing avoidable mistakes and overtime drag</p>
        </div>
        <div className="wif-delta">
          <strong>
            {sim.delta >= 0 ? '+' : ''}
            {sim.delta}
          </strong>
          <span>marks · {sim.pct}% of max</span>
        </div>
      </div>

      <div className="wif-sliders">
        <label className="wif-slider">
          <span>
            Fix avoidable mistakes
            <em>{sillyFixPct}%</em>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={sillyFixPct}
            onChange={(e) => setSillyFixPct(Number(e.target.value))}
            aria-label="Percent of silly mistakes fixed"
          />
          <small>
            Recovers up to {matrix.potential.sillyLost} marks
            {matrix.potential.sillyCount
              ? ` across ~${matrix.potential.sillyCount} items`
              : ''}
          </small>
        </label>
        <label className="wif-slider">
          <span>
            Convert overtime corrects into free time
            <em>{overtimeFixPct}%</em>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={overtimeFixPct}
            onChange={(e) => setOvertimeFixPct(Number(e.target.value))}
            aria-label="Percent of overtime corrects sped up"
          />
          <small>
            {matrix.counts.overtimeCorrect} overtime corrects — faster solves free buffer for Pass-2
          </small>
        </label>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={barData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf2" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} />
          <YAxis
            domain={[0, Math.max(matrix.potential.maxScore || sim.score, sim.score, 1)]}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
          />
          <Tooltip formatter={(v) => [`${v} marks`, 'Score']} />
          <Bar dataKey="score" name="Score" radius={[8, 8, 0, 0]} maxBarSize={56}>
            {barData.map((d) => (
              <Cell key={d.key} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <p className="wif-takeaway">
        {sim.delta > 0
          ? `Closing ${sim.recoveredSilly} avoidable marks${
              sim.recoveredOvertime ? ` and freeing pace worth ~${sim.recoveredOvertime}` : ''
            } lifts you to ${sim.score}.`
          : 'Slide the levers to see how cleaning silly mistakes moves your score.'}
      </p>
    </div>
  )
}
