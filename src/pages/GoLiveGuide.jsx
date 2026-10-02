import { useCallback, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PortalPage from '../components/PortalPage'
import {
  GO_LIVE_PARTS,
  GO_LIVE_READINESS_URL,
  GO_LIVE_SUMMARY_LINE,
} from '../data/goLiveGuide'
import { loadLaunchChecks, saveLaunchChecks } from '../utils/launchChecklist'
import { signedInHomePath } from '../utils/userProfiles'

export default function GoLiveGuide() {
  const { isAdmin, session } = useAuth()
  const [checks, setChecks] = useState(() => loadLaunchChecks())

  const toggle = useCallback((id) => {
    setChecks((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      saveLaunchChecks(next)
      return next
    })
  }, [])

  if (!isAdmin) {
    const to = signedInHomePath(session)
    return (
      <div className="page go-live-guide-page">
        <Navigate to={to} replace />
        <section className="card" style={{ maxWidth: 480, margin: '2rem auto' }}>
          <h1>Not available</h1>
          <p className="form-hint">
            The go-live guide is only for the founder admin. Opening your home.
          </p>
          <Link to={to} className="btn btn-primary">
            Continue
          </Link>
        </section>
      </div>
    )
  }

  const handlePrint = () => window.print()

  const doneCount = GO_LIVE_PARTS.flatMap((p) => p.steps).filter((s) => checks[s.id]).length
  const totalCount = GO_LIVE_PARTS.flatMap((p) => p.steps).length

  return (
    <PortalPage
      role="platform"
      className="page go-live-guide-page"
      eyebrow="Deployment guide"
      title="Go live — step by step"
      subtitle="Follow these steps in order. Print or save as PDF for your team."
      actions={
        <>
          <button type="button" className="btn btn-primary btn-sm golive-print-btn" onClick={handlePrint}>
            Print / Save as PDF
          </button>
          <Link to="/tour" className="btn btn-ghost btn-sm golive-screen-only">
            TestVantage Tour
          </Link>
        </>
      }
    >
      <div className="golive-print-header" aria-hidden="true">
        <h1>TestVantage — Go Live Guide</h1>
        <p>Follow steps in order · {new Date().toLocaleDateString()}</p>
      </div>

      <section className="card golive-intro">
        <p className="golive-rule">
          <strong>Simple rule:</strong> {GO_LIVE_SUMMARY_LINE}
        </p>
        <p className="form-hint golive-progress golive-screen-only">
          Progress: <strong>{doneCount}</strong> of <strong>{totalCount}</strong> steps checked
        </p>
        <div className="golive-progress-bar-wrap golive-screen-only" aria-hidden="true">
          <div
            className="golive-progress-bar-fill"
            style={{ width: `${totalCount ? Math.round((doneCount / totalCount) * 100) : 0}%` }}
          />
        </div>
        <div className="golive-readiness-row golive-screen-only">
          <span>Live checklist also in Admin → Go-live readiness</span>
          <Link to={GO_LIVE_READINESS_URL} className="btn btn-ghost btn-sm">
            Open Admin
          </Link>
        </div>
      </section>

      <section className="card golive-pdf-how golive-screen-only">
        <h2>How to save as PDF</h2>
        <ol>
          <li>Click <strong>Print / Save as PDF</strong> above (or press Ctrl+P).</li>
          <li>Choose <strong>Save as PDF</strong> or <strong>Microsoft Print to PDF</strong>.</li>
          <li>Turn on <strong>Background graphics</strong> if your printer dialog has that option.</li>
          <li>Save the file — e.g. <code>TestVantage-Go-Live-Guide.pdf</code></li>
        </ol>
      </section>

      {GO_LIVE_PARTS.map((part) => (
        <section key={part.id} className="card golive-part" id={`golive-${part.id}`}>
          <header className="golive-part-head">
            <span className="golive-part-badge">{part.part}</span>
            <div>
              <h2>{part.title}</h2>
              <p className="form-hint">{part.intro}</p>
            </div>
          </header>

          <ol className="golive-steps">
            {part.steps.map((step, idx) => {
              const globalNum =
                GO_LIVE_PARTS.slice(0, GO_LIVE_PARTS.indexOf(part))
                  .reduce((n, p) => n + p.steps.length, 0) + idx + 1
              const checked = !!checks[step.id]
              return (
                <li
                  key={step.id}
                  className={`golive-step ${checked ? 'golive-step--done' : ''}`}
                >
                  <label className="golive-step-check golive-screen-only">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(step.id)}
                    />
                    <span className="golive-step-num">{globalNum}</span>
                  </label>
                  <span className="golive-step-num golive-print-only">{globalNum}.</span>
                  <div className="golive-step-body">
                    <h3>{step.title}</h3>
                    <ul>
                      {step.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    {step.commands?.length > 0 && (
                      <pre className="golive-command">
                        {step.commands.map((c) => (
                          <code key={c}>{c}</code>
                        ))}
                      </pre>
                    )}
                    <span className="golive-print-checkbox" aria-hidden>
                      ☐ Done
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ))}

      <section className="card golive-checklist-table">
        <h2>Quick checklist (printable)</h2>
        <table className="golive-table">
          <thead>
            <tr>
              <th className="golive-col-check">✓</th>
              <th>#</th>
              <th>Task</th>
            </tr>
          </thead>
          <tbody>
            {GO_LIVE_PARTS.flatMap((part) =>
              part.steps.map((step, idx) => {
                const globalNum =
                  GO_LIVE_PARTS.slice(0, GO_LIVE_PARTS.indexOf(part))
                    .reduce((n, p) => n + p.steps.length, 0) + idx + 1
                return (
                  <tr key={step.id}>
                    <td className="golive-col-check">☐</td>
                    <td>{globalNum}</td>
                    <td>{step.title}</td>
                  </tr>
                )
              }),
            )}
          </tbody>
        </table>
      </section>

      <footer className="card golive-footer">
        <h3>When are you ready?</h3>
        <ul>
          <li>
            <strong>Pilot ready</strong> — Parts A–F complete; 5–10 students tested on your domain.
          </li>
          <li>
            <strong>Public go-live</strong> — Part G complete; HTTPS, backups, and monitoring in place.
          </li>
          <li>
            <strong>National scale</strong> — CDN, auto-scaling, and Redis at scale (Phase 3 in Admin).
          </li>
        </ul>
        <p className="form-hint golive-print-url">
          TestVantage · Go-live guide · {typeof window !== 'undefined' ? window.location.origin : ''}/go-live-guide
        </p>
      </footer>
    </PortalPage>
  )
}
