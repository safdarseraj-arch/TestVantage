import { useEffect, useMemo, useState } from 'react'
import {
  evaluateGoLiveReadiness,
  statusLabel,
} from '../utils/goLiveReadiness.js'
import {
  getLaunchPhases,
  loadLaunchChecks,
  saveLaunchChecks,
} from '../utils/launchChecklist.js'

export default function LaunchChecklist() {
  const [report, setReport] = useState(null)
  const [checks, setChecks] = useState(() => loadLaunchChecks())
  const [expanded, setExpanded] = useState(true)

  const phases = useMemo(() => getLaunchPhases(), [])

  useEffect(() => {
    evaluateGoLiveReadiness().then(setReport)
  }, [])

  const totalTasks = phases.reduce((n, p) => n + p.tasks.length, 0)
  const doneCount = phases.reduce(
    (n, p) => n + p.tasks.filter((t) => checks[t.id]).length,
    0,
  )

  const toggle = (id) => {
    setChecks((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      saveLaunchChecks(next)
      return next
    })
  }

  const resetChecks = () => {
    setChecks({})
    saveLaunchChecks({})
  }

  const handlePrint = () => {
    window.print()
  }

  const today = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <section className="card launch-checklist-card" id="launch-checklist">
      <div className="launch-checklist-toolbar no-print">
        <div>
          <h2>Launch checklist</h2>
          <p className="form-hint">
            One-page plan from pilot to national scale. Tick items as you complete them, then print
            or save as PDF.
          </p>
        </div>
        <div className="launch-checklist-toolbar-actions">
          <span className="launch-checklist-progress">
            <strong>{doneCount}</strong> / {totalTasks} done
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetChecks}>
            Reset ticks
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={handlePrint}>
            Print / Save PDF
          </button>
        </div>
      </div>

      {expanded && (
        <div className="launch-checklist-doc">
          <header className="launch-doc-header">
            <div className="launch-doc-brand">
              <span className="launch-doc-mark">TV</span>
              <div>
                <strong>TestVantages</strong>
                <span>Launch readiness checklist</span>
              </div>
            </div>
            <div className="launch-doc-meta">
              <span>{today}</span>
              {report && (
                <span
                  className={`launch-doc-verdict ${report.goLiveReady ? 'launch-doc-verdict--ok' : 'launch-doc-verdict--warn'}`}
                >
                  {report.goLiveReady ? 'Pilot ready' : 'Pre-launch work remaining'}
                </span>
              )}
            </div>
          </header>

          {report && (
            <div className="launch-doc-summary">
              <p>
                <strong>{report.summary.ready}</strong> features ready ·{' '}
                <strong>{report.summary.partial}</strong> partial ·{' '}
                <strong>{report.summary.blocked}</strong> before public go-live
              </p>
            </div>
          )}

          {phases.map((phase, pi) => (
            <div key={phase.id} className="launch-doc-phase">
              <h3>
                <span className="launch-phase-num">{pi + 1}</span>
                {phase.title}
              </h3>
              <p className="launch-phase-sub">{phase.subtitle}</p>
              <ul className="launch-task-list">
                {phase.tasks.map((task) => (
                  <li key={task.id} className={checks[task.id] ? 'launch-task-done' : ''}>
                    <label className="launch-task-label">
                      <input
                        type="checkbox"
                        checked={Boolean(checks[task.id])}
                        onChange={() => toggle(task.id)}
                        className="launch-task-check"
                      />
                      <span className="launch-task-box" aria-hidden="true" />
                      <span className="launch-task-text">
                        <strong>{task.task}</strong>
                        {task.detail && <span className="launch-task-detail">{task.detail}</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {report && report.items.length > 0 && (
            <div className="launch-doc-feature-snapshot">
              <h3>Feature status snapshot</h3>
              <table className="launch-snapshot-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Feature</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.map((row) => (
                    <tr key={row.id}>
                      <td>{row.area}</td>
                      <td>{row.feature}</td>
                      <td>
                        <span className={`go-live-status go-live-status--${row.status}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <footer className="launch-doc-footer">
            <p>
              TestVantages — JEE · NEET · Advanced mock tests. Keep building in Cursor until Phase 2
              is complete, then deploy to cloud for public access.
            </p>
          </footer>
        </div>
      )}
    </section>
  )
}
