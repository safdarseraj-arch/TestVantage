/**
 * "Compare with original paper" for one PENDING Official PYQ paper.
 * Sends ONLY the questions the local check flagged (red banner), one at a
 * time (gemini-3.7-flash on the FastAPI side). Results go onto each card.
 * Never rewrites questions and never publishes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { isAdminLoggedIn } from '../utils/auth.js'
import {
  GEMINI_KEY_MISSING_MESSAGE,
  ORIGINAL_MISSING_MESSAGE,
  compareWholeOfficialPyqPaper,
  getOfficialPyqOriginalStatus,
  uploadOfficialPyqOriginal,
} from '../utils/officialPyqOriginalCompare.js'

/**
 * @param {{ paperId: string, flaggedGoTo?: number[], onChanged?: () => void }} props
 */
export default function OfficialPyqOriginalComparePanel({ paperId, flaggedGoTo = [], onChanged }) {
  const flagged = Array.isArray(flaggedGoTo) ? flaggedGoTo : []
  const flaggedLabel = `${flagged.length} flagged question${flagged.length === 1 ? '' : 's'}`
  const [status, setStatus] = useState(/** @type {any} */ (null))
  const [statusError, setStatusError] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const abortRef = useRef(/** @type {AbortController | null} */ (null))

  const loadStatus = useCallback(async () => {
    setStatusError('')
    try {
      setStatus(await getOfficialPyqOriginalStatus(paperId))
    } catch (err) {
      setStatus(null)
      setStatusError(err instanceof Error ? err.message : 'Compare service is not reachable.')
    }
  }, [paperId])

  useEffect(() => {
    setSummary('')
    setError('')
    setProgress('')
    void loadStatus()
    return () => abortRef.current?.abort()
  }, [loadStatus])

  if (!isAdminLoggedIn()) return null

  async function onAttach(file) {
    setError('')
    setSummary('')
    try {
      await uploadOfficialPyqOriginal(paperId, file)
      await loadStatus()
      setSummary(`Stored “${file.name}” as the original paper. Questions were not changed.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not store the original paper.')
    }
  }

  async function onCompareAll() {
    if (busy) return
    setError('')
    setSummary('')
    if (!status?.available) {
      setError(ORIGINAL_MISSING_MESSAGE)
      return
    }
    if (!flagged.length) {
      setSummary('No flagged questions — nothing was sent to Gemini. Use "Compare this question" on a card for a one-off check.')
      return
    }
    if (!status?.gemini_key) {
      setError(GEMINI_KEY_MISSING_MESSAGE)
      return
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        `Compare ${flaggedLabel} (Q ${flagged.slice(0, 24).join(', ')}) with the original paper? This sends one Gemini request per flagged question (gemini-3.7-flash). Unflagged questions are not sent. Questions are not changed.`,
      )
    ) {
      return
    }
    const ctl = new AbortController()
    abortRef.current = ctl
    setBusy(true)
    try {
      const out = await compareWholeOfficialPyqPaper(paperId, {
        signal: ctl.signal,
        onProgress: (_done, _total, label) => setProgress(label),
      })
      onChanged?.()
      if (!out.ok) {
        setError(out.error || 'Compare stopped.')
        return
      }
      const t = out.tally
      setSummary(
        `Compared ${t.matches + t.differs + t.error} flagged question(s): ${t.matches} match, ${t.differs} differ` +
          (out.differsGoTo?.length ? ` (Go to Q ${out.differsGoTo.join(', ')})` : '') +
          `, ${t.error} could not compare` +
          (out.failedGoTo?.length ? ` (Q ${out.failedGoTo.join(', ')})` : '') +
          '. Nothing was rewritten — open a card to accept or change a suggestion.',
      )
    } finally {
      abortRef.current = null
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <div className="official-pyq-original-compare" data-testid="official-pyq-original-compare">
      <p className="form-hint">
        {status?.available ? (
          <>
            Original paper: <strong>{status.file_name}</strong>
            {status.kind === 'pdf' ? ` (${status.pages} page${status.pages === 1 ? '' : 's'})` : ' (page image)'}
            {status.gemini_key ? '' : ` · ${GEMINI_KEY_MISSING_MESSAGE}`}
          </>
        ) : status ? (
          <span data-testid="official-pyq-original-missing">{ORIGINAL_MISSING_MESSAGE}.</span>
        ) : statusError ? (
          <span>{statusError}</span>
        ) : (
          'Checking for the original paper…'
        )}
      </p>
      <div className="official-pyq-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="official-pyq-compare-paper"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void onCompareAll()}
        >
          {busy ? 'Comparing…' : 'Compare with original paper'}
        </button>
        <span className="form-hint" data-testid="official-pyq-compare-flagged-count">
          {flagged.length
            ? `Sends only the ${flaggedLabel} (Q ${flagged.slice(0, 12).join(', ')}${flagged.length > 12 ? ' …' : ''})`
            : 'No flagged questions to send'}
        </span>
        {busy ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        ) : null}
        <label className="btn btn-ghost btn-sm">
          {status?.available ? 'Replace original PDF' : 'Attach original PDF / page image'}
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
            hidden
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void onAttach(f)
            }}
          />
        </label>
      </div>
      {busy && progress ? (
        <p className="official-pyq-progress" role="status" data-testid="official-pyq-compare-progress">
          {progress}
        </p>
      ) : null}
      {error ? <p className="upload-error">{error}</p> : null}
      {summary ? <p className="form-hint upload-success-hint">{summary}</p> : null}
    </div>
  )
}
