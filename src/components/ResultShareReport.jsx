import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  buildReportCardModel,
  buildReportCardHtml,
  downloadReportCardHtml,
  openReportMailto,
  trySendReportEmail,
  getMailSendConfig,
} from '../utils/resultReportCard.js'
import {
  buildDiagnosticReportModel,
  buildDiagnosticReportModelAsync,
  buildDiagnosticReportHtml,
  downloadDiagnosticReportHtml,
  openDiagnosticReportPrint,
} from '../utils/diagnosticReportPdf.js'
import {
  buildAdvancedDualPaperBundle,
  getLinkedAdvancedPaperPair,
  linkAdvancedPaperPair,
  listRecentAdvancedAttemptsForOwner,
} from '../utils/diagnosticLiveCapacity.js'
import { getOwnerKey } from '../utils/attemptHistory.js'

/**
 * Email / share report card — one-page parent card + full multi-page diagnostic.
 * After go-live, full download prefers live peer bands (Top 1% / Top 500).
 */
export default function ResultShareReport({ data, test, studentName, attempts = [], attemptId = null }) {
  const { session } = useAuth()
  const ownerKey = getOwnerKey(session?.userId)
  const [email, setEmail] = useState(() => data?.userEmail || '')
  const [status, setStatus] = useState(/** @type {string | null} */ (null))
  const [busy, setBusy] = useState(false)
  const mailCfg = useMemo(() => getMailSendConfig(), [])

  const isAdvanced = String(data?.examPatternId || test?.examPatternId || '')
    .toLowerCase()
    .includes('advanced')

  const advAttempts = useMemo(
    () => (isAdvanced ? listRecentAdvancedAttemptsForOwner(ownerKey, 16) : []),
    [isAdvanced, ownerKey],
  )
  const linked = useMemo(() => getLinkedAdvancedPaperPair(ownerKey), [ownerKey, status])
  const [p1Id, setP1Id] = useState(() => linked?.paper1AttemptId || attemptId || '')
  const [p2Id, setP2Id] = useState(() => linked?.paper2AttemptId || '')

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

  const dualBundle = useMemo(() => {
    const pair = getLinkedAdvancedPaperPair(ownerKey)
    if (!pair?.paper1AttemptId || !pair?.paper2AttemptId) return null
    const built = buildAdvancedDualPaperBundle(pair)
    return built.ok ? built : null
  }, [ownerKey, status])

  const diagnosticModel = useMemo(
    () =>
      buildDiagnosticReportModel({
        data,
        test,
        studentName: studentName || data?.userName,
        attempts,
        attemptId,
        dualPaper: dualBundle,
      }),
    [data, test, studentName, attempts, attemptId, dualBundle],
  )

  const resolveFullModel = async () => {
    return buildDiagnosticReportModelAsync({
      data,
      test,
      studentName: studentName || data?.userName,
      attempts,
      attemptId,
      dualPaper: dualBundle,
    })
  }

  const onDownload = () => {
    const html = buildReportCardHtml(model)
    const safe = String(model.title || 'report')
      .replace(/[^\w\-]+/g, '-')
      .slice(0, 40)
    downloadReportCardHtml(html, `testvantage-${safe}-report.html`)
    setStatus('Downloaded the one-page parent card (open → Print → Save as PDF).')
  }

  const onDownloadFull = async () => {
    setBusy(true)
    setStatus('Building full diagnostic (live peers if API is up)…')
    try {
      const full = await resolveFullModel()
      const html = buildDiagnosticReportHtml(full)
      const safe = String(full.studentName || 'student')
        .replace(/[^\w\-]+/g, '-')
        .slice(0, 28)
      const safeTitle = String(full.title || 'diagnostic')
        .replace(/[^\w\-]+/g, '-')
        .slice(0, 36)
      downloadDiagnosticReportHtml(html, `testvantages-${safe}-${safeTitle}-diagnostic.html`)
      setStatus(
        full.livePeersReady
          ? 'Downloaded full diagnostic with live peer bands. Open → Print → Save as PDF (enable background graphics).'
          : 'Downloaded full diagnostic. After go-live, peer bands use all students on this paper. Open → Print → Save as PDF.',
      )
    } catch {
      const html = buildDiagnosticReportHtml(diagnosticModel)
      downloadDiagnosticReportHtml(html, 'testvantages-diagnostic.html')
      setStatus('Downloaded full diagnostic (offline peer fallback).')
    } finally {
      setBusy(false)
    }
  }

  const onPrintFull = async () => {
    setBusy(true)
    setStatus('Preparing print…')
    try {
      const full = await resolveFullModel()
      const res = openDiagnosticReportPrint(full)
      if (!res.ok) {
        setStatus('Pop-up blocked — use Download full diagnostic instead.')
        return
      }
      setStatus(
        full.livePeersReady
          ? 'Full diagnostic opened with live peers — choose Save as PDF.'
          : 'Full diagnostic print opened — choose Save as PDF.',
      )
    } catch {
      const res = openDiagnosticReportPrint(diagnosticModel)
      if (!res.ok) setStatus('Pop-up blocked — use Download instead.')
      else setStatus('Full diagnostic print opened.')
    } finally {
      setBusy(false)
    }
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
    setStatus('One-page print / Save as PDF window opened.')
  }

  const onLinkAdv = () => {
    const res = linkAdvancedPaperPair({
      ownerKey,
      paper1AttemptId: p1Id,
      paper2AttemptId: p2Id,
    })
    if (!res.ok) {
      setStatus(res.error || 'Could not link papers.')
      return
    }
    setStatus('Paper 1 + Paper 2 linked. Download / Print full diagnostic to include the dual pack.')
  }

  return (
    <section className="card si-share-report" aria-label="Email or share report">
      <div className="si-share-head">
        <div>
          <p className="si-weak-eyebrow">Parent / student</p>
          <h2>Email / share report</h2>
          <p className="form-hint">
            One-page parent card, or the full multi-page diagnostic. After go-live, full download uses
            live peer bands (Top 1% / Top 500) when the API has enough attempts.
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

      {isAdvanced ? (
        <div className="si-adv-dual-pack" style={{ marginBottom: '0.85rem' }}>
          <p className="form-hint" style={{ marginTop: 0 }}>
            <strong>JEE Advanced dual pack</strong> — link Paper 1 and Paper 2 attempts for a merged
            section in the full diagnostic (ready for go-live).
          </p>
          <div className="tv-inline-form" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <label>
              <span className="form-hint">Paper 1 attempt</span>
              <select value={p1Id} onChange={(e) => setP1Id(e.target.value)}>
                <option value="">Select…</option>
                {advAttempts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {(a.title || a.testId || a.id).slice(0, 48)} · {a.score}/{a.maxScore}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="form-hint">Paper 2 attempt</span>
              <select value={p2Id} onChange={(e) => setP2Id(e.target.value)}>
                <option value="">Select…</option>
                {advAttempts.map((a) => (
                  <option key={`p2-${a.id}`} value={a.id}>
                    {(a.title || a.testId || a.id).slice(0, 48)} · {a.score}/{a.maxScore}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLinkAdv}>
              Link P1 + P2
            </button>
          </div>
          {dualBundle?.ok ? (
            <p className="form-hint" role="status">
              Linked · Combined {dualBundle.combined.score}/{dualBundle.combined.maxScore} (
              {dualBundle.combined.pct}%)
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="si-share-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onDownloadFull}>
          {busy ? 'Building…' : 'Download full diagnostic report'}
        </button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onPrintFull}>
          {busy ? 'Building…' : 'Print full diagnostic / PDF'}
        </button>
        {mailCfg.enabled && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onSend}>
            {busy ? 'Sending…' : 'Send email'}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onMailto}>
          Open email app
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDownload}>
          Download one-page card
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onPrint}>
          Print one-page card
        </button>
      </div>

      {!mailCfg.enabled && (
        <p className="form-hint si-share-note">
          Prefer <strong>Download full diagnostic report</strong> or{' '}
          <strong>Print full diagnostic / PDF</strong> for the exhaustive pack. Direct server email is
          not configured here.
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
