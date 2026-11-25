import { useMemo, useState } from 'react'
import {
  buildReportCardModel,
  buildReportCardHtml,
  downloadReportCardHtml,
  openReportMailto,
  trySendReportEmail,
  getMailSendConfig,
} from '../utils/resultReportCard.js'

/**
 * Email / share report card — download printable HTML, mailto, or real send if configured.
 */
export default function ResultShareReport({ data, test, studentName }) {
  const [email, setEmail] = useState(() => data?.userEmail || '')
  const [status, setStatus] = useState(/** @type {string | null} */ (null))
  const [busy, setBusy] = useState(false)
  const mailCfg = useMemo(() => getMailSendConfig(), [])

  const model = useMemo(
    () =>
      buildReportCardModel({
        data,
        test,
        studentName: studentName || data?.userName,
        parentEmail: email,
      }),
    [data, test, studentName, email],
  )

  const onDownload = () => {
    const html = buildReportCardHtml(model)
    const safe = String(model.title || 'report')
      .replace(/[^\w\-]+/g, '-')
      .slice(0, 40)
    downloadReportCardHtml(html, `testvantage-${safe}-report.html`)
    setStatus('Downloaded a printable report (open it → Print → Save as PDF).')
  }

  const onMailto = () => {
    openReportMailto(model, email)
    setStatus('Opened your email app with a short summary. Attach the downloaded HTML if you like.')
  }

  const onSend = async () => {
    setBusy(true)
    setStatus(null)
    const res = await trySendReportEmail(model, { to: email })
    setBusy(false)
    if (res.ok) {
      setStatus('Report emailed.')
      return
    }
    if (res.reason === 'not_configured') {
      setStatus('Direct send is not set up on this device — use Email app or Download instead.')
      return
    }
    if (res.reason === 'no_recipient') {
      setStatus('Add a parent or student email first.')
      return
    }
    setStatus('Could not send right now — try Download or Email app.')
  }

  const onPrint = () => {
    const html = buildReportCardHtml(model)
    const w = window.open('', '_blank', 'noopener,noreferrer,width=720,height=900')
    if (!w) {
      setStatus('Pop-up blocked — use Download instead, then open the file.')
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
    setTimeout(() => {
      try {
        w.focus()
        w.print()
      } catch {
        /* ignore */
      }
    }, 250)
    setStatus('Print / Save as PDF window opened.')
  }

  return (
    <section className="card si-share-report" aria-label="Email or share report">
      <div className="si-share-head">
        <div>
          <p className="si-weak-eyebrow">Parent / student</p>
          <h2>Email / share report</h2>
          <p className="form-hint">
            A one-page summary of marks, subjects, and focus chapters — easy to forward home.
          </p>
        </div>
      </div>

      <label className="si-share-email">
        <span>Send to (email)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="parent@email.com"
          autoComplete="email"
        />
      </label>

      <div className="si-share-actions">
        {mailCfg.enabled && (
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onSend}>
            {busy ? 'Sending…' : 'Send email'}
          </button>
        )}
        <button type="button" className="btn btn-primary btn-sm" onClick={onMailto}>
          Open email app
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDownload}>
          Download HTML report
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onPrint}>
          Print / PDF
        </button>
      </div>

      {!mailCfg.enabled && (
        <p className="form-hint si-share-note">
          Direct server email is not configured here — use <strong>Open email app</strong> or{' '}
          <strong>Download</strong> (then Print → Save as PDF).
        </p>
      )}
      {status && (
        <p className="form-hint" role="status">
          {status}
        </p>
      )}
    </section>
  )
}
