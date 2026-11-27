import { useEffect, useState } from 'react'
import {
  downloadAutoDiagnostic,
  generateAutoDiagnosticReport,
  getAutoDiagnosticStatus,
  openAutoDiagnosticPrint,
} from '../utils/autoDiagnosticReport.js'

/**
 * Shows auto-generated diagnostic status after submit (test or practice).
 */
export default function AutoDiagnosticReportBanner({
  attemptId,
  test,
  data,
  studentName,
  attempts = [],
}) {
  const [status, setStatus] = useState(() => getAutoDiagnosticStatus(attemptId))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!attemptId) return undefined
    setStatus(getAutoDiagnosticStatus(attemptId))
    const t = setInterval(() => {
      setStatus(getAutoDiagnosticStatus(attemptId))
    }, 800)
    return () => clearInterval(t)
  }, [attemptId])

  if (!attemptId) return null

  const state = status?.status || 'missing'

  const onOpen = async () => {
    setBusy(true)
    setMsg('')
    const res = await openAutoDiagnosticPrint(attemptId)
    setBusy(false)
    if (!res.ok) {
      setMsg(res.reason === 'popup' ? 'Pop-up blocked — use Download.' : 'Report not ready yet.')
    }
  }

  const onDownload = async () => {
    setBusy(true)
    setMsg('')
    const res = await downloadAutoDiagnostic(attemptId)
    setBusy(false)
    if (!res.ok) setMsg('Report not ready yet — wait a moment or tap Generate.')
    else setMsg('Downloaded. Open the file → Print → Save as PDF.')
  }

  const onGenerate = async () => {
    setBusy(true)
    setMsg('Generating full diagnostic…')
    const res = await generateAutoDiagnosticReport({
      attemptId,
      test,
      data,
      studentName,
      attempts,
    })
    setBusy(false)
    setStatus(getAutoDiagnosticStatus(attemptId))
    setMsg(res.ok ? 'Report ready.' : 'Could not generate — try again.')
  }

  return (
    <section className="card auto-diag-banner" aria-label="Auto diagnostic report">
      <div className="auto-diag-banner-main">
        <div>
          <p className="si-weak-eyebrow">Auto report</p>
          <h2>
            {state === 'ready'
              ? 'Diagnostic report ready'
              : state === 'generating' || state === 'queued'
                ? 'Building your diagnostic report…'
                : state === 'error'
                  ? 'Report needs a retry'
                  : 'Full diagnostic report'}
          </h2>
          <p className="form-hint">
            After every mock or practice submit, TestVantages builds the multi-page diagnostic
            automatically. After go-live it also syncs to the server when available.
            {status?.livePeersReady ? ' Live peer bands included.' : ''}
          </p>
        </div>
        <div className="auto-diag-banner-actions">
          {state === 'ready' ? (
            <>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onOpen}>
                Open / Print PDF
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onDownload}>
                Download
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onGenerate}>
              {busy || state === 'generating' || state === 'queued' ? 'Working…' : 'Generate now'}
            </button>
          )}
        </div>
      </div>
      {msg ? (
        <p className="form-hint" role="status">
          {msg}
        </p>
      ) : null}
    </section>
  )
}
