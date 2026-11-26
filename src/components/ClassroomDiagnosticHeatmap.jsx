import { useMemo, useState } from 'react'
import {
  buildClassroomFailureHeatmap,
  heatmapFailColor,
} from '../utils/classroomHeatmap.js'

/**
 * B2B cohort failure heatmap by chapter / subject for teacher & school panels.
 */
export default function ClassroomDiagnosticHeatmap({
  attempts = [],
  title = 'Classroom failure heatmap',
  subtitle = 'Where the cohort lost marks — darker cells = higher wrong rate among attempted.',
}) {
  const [testFilter, setTestFilter] = useState('')

  const testOptions = useMemo(() => {
    /** @type {Map<string, string>} */
    const map = new Map()
    for (const a of attempts) {
      if (!a.testId) continue
      map.set(a.testId, a.title || a.testId)
    }
    return [...map.entries()].map(([id, label]) => ({ id, label }))
  }, [attempts])

  const heatmap = useMemo(
    () =>
      buildClassroomFailureHeatmap(attempts, {
        testId: testFilter || undefined,
      }),
    [attempts, testFilter],
  )

  const topCells = heatmap.cells.filter((c) => c.failRate != null).slice(0, 24)

  return (
    <section className="card school-heatmap" aria-label="Classroom diagnostic heatmap">
      <div className="school-panel-head">
        <div>
          <h3>{title}</h3>
          <p className="form-hint">{subtitle}</p>
        </div>
        {testOptions.length > 1 && (
          <label className="form-hint school-heatmap-filter">
            Paper
            <select value={testFilter} onChange={(e) => setTestFilter(e.target.value)}>
              <option value="">All papers</option>
              {testOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="school-heatmap-meta form-hint">
        {heatmap.studentCount} student{heatmap.studentCount === 1 ? '' : 's'} ·{' '}
        {heatmap.attemptCount} attempt{heatmap.attemptCount === 1 ? '' : 's'}
      </div>

      {!heatmap.ready || !topCells.length ? (
        <p className="form-hint">{heatmap.takeaway}</p>
      ) : (
        <>
          <div className="school-heatmap-grid" role="table" aria-label="Failure rates">
            {topCells.map((cell) => (
              <div
                key={`${cell.subject}-${cell.chapter}`}
                className="school-heatmap-cell"
                style={{ background: heatmapFailColor(cell.failRate) }}
                title={`${cell.subjectLabel} · ${cell.chapter}: ${cell.failRate}% wrong (${cell.wrong}/${cell.attempted})`}
                role="cell"
              >
                <span className="school-heatmap-sub">{cell.subjectLabel}</span>
                <strong>{cell.chapter}</strong>
                <span className="school-heatmap-rate">{cell.failRate}% fail</span>
                <span className="form-hint">
                  {cell.wrong} wrong · {cell.studentCount} student
                  {cell.studentCount === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
          <div className="school-heatmap-legend" aria-hidden>
            <span>Low fail</span>
            <span className="school-heatmap-swatch" />
            <span>High fail</span>
          </div>
          <p className="form-hint">{heatmap.takeaway}</p>
        </>
      )}
    </section>
  )
}
