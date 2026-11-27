import { useEffect, useState } from 'react'
import { evaluateGoLiveReadiness, statusLabel } from '../utils/goLiveReadiness.js'

export default function GoLiveReadiness() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    evaluateGoLiveReadiness().then((r) => {
      setReport(r)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <section className="card go-live-report">
        <p className="form-hint">Checking go-live readiness…</p>
      </section>
    )
  }

  if (!report) return null

  const { summary, items, goLiveReady, deployReady, apiOnline, platformScale } = report

  return (
    <section className="card go-live-report">
      <div className="go-live-report-head">
        <div>
          <h2>Go-live readiness</h2>
          <p className="form-hint">
            {deployReady
              ? goLiveReady
                ? 'TestVantages is pilot-ready. Last step for the public: point testvantages.com DNS and turn on HTTPS after live:deploy.'
                : 'App code is deploy-ready. Live students still need a server: rent VPS → set passwords → npm run live:deploy → HTTPS. Open More → Go-live Guide for the full checklist.'
              : 'Some items still need work before deploy. You can keep building safely in Cursor.'}
          </p>
        </div>
        <div
          className={`go-live-verdict ${deployReady ? (goLiveReady ? 'go-live-verdict--ok' : 'go-live-verdict--warn') : 'go-live-verdict--warn'}`}
        >
          {deployReady ? (goLiveReady ? 'Pilot ready' : 'Deploy ready — server steps left') : 'Not deploy ready'}
        </div>
      </div>

      {deployReady && !goLiveReady ? (
        <ol className="form-hint" data-testid="go-live-founder-next" style={{ marginTop: '0.75rem', paddingLeft: '1.2rem' }}>
          <li>Rent a cloud computer (≈4 GB Docker droplet) — do not run live:deploy on this laptop.</li>
          <li>Point testvantages.com DNS to that server IP.</li>
          <li>On the server: copy project → set .env.production passwords → run <code>npm run live:deploy</code>.</li>
          <li>Add HTTPS, then invite 5–10 pilot students.</li>
          <li>Full “10 lakh students” scale stays later — it does not block a small pilot.</li>
        </ol>
      ) : null}

      <div className="go-live-summary-row">
        <span className="go-live-pill go-live-pill--ready">
          <strong>{summary.ready}</strong> ready
        </span>
        <span className="go-live-pill go-live-pill--partial">
          <strong>{summary.partial}</strong> partial
        </span>
        <span className="go-live-pill go-live-pill--blocked">
          <strong>{summary.blocked}</strong> before go-live
        </span>
        <span className="form-hint">
          API {apiOnline ? 'online' : 'offline'} · Build mode{' '}
          {platformScale ? 'production scale' : 'local dev'}
        </span>
      </div>

      <div className="bank-storage-table-wrap bank-storage-table-wrap--scroll">
        <table className="bank-storage-table go-live-table">
          <thead>
            <tr>
              <th>Area</th>
              <th>Feature</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className={`portal-role-badge portal-role-${row.area.toLowerCase()}`}>
                    {row.area}
                  </span>
                </td>
                <td>{row.feature}</td>
                <td>
                  <span className={`go-live-status go-live-status--${row.status}`}>
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td className="go-live-note">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
