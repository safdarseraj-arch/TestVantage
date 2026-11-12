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
import { OFFICIAL_PYQ_AUTO_FIX_MAX, autoFixFlaggedOfficialPyqCards, officialPyqAutoFixTodo } from '../utils/officialPyqAutoFix.js'
import { getOfficialPyqPendingPaper } from '../utils/officialPyqPendingStore.js'
import { OFFICIAL_PYQ_FACTS_CONFIRMED_EVENT, autoFixAfterOfficialPyqFactsConfirmed } from '../utils/officialPyqFactsAutoFix.js'

const AUTO_RUN_KEY = 'testvantage-official-pyq-auto-fix-auto'

function readAutoRun() {
  try {
    return localStorage.getItem(AUTO_RUN_KEY) !== '0'
  } catch {
    return true
  }
}

const AUTO_FIX_CONFIRM_TEXT = `Auto-fix flagged questions? Each flagged question (at most ${OFFICIAL_PYQ_AUTO_FIX_MAX} this time) is compared with the original paper (one Gemini request each). A correction is saved only if it draws cleanly and adds no new alert, and you can Undo it on the card. Questions you edited yourself are not changed. Nothing is published.`

/** @param {any} out result of an auto-fix run */
function autoFixResultLines(out) {
  const lines = []
  if (out.rebuilt) {
    lines.push(
      out.rebuilt.to === out.rebuilt.expected
        ? `Rebuilt the question list from the scan: ${out.rebuilt.from} → ${out.rebuilt.to} questions.`
        : `The question list has ${out.rebuilt.to} of ${out.rebuilt.expected} questions and the scan could not rebuild it — check the missing numbers.`,
    )
  }
  if (out.fixed?.length) lines.push(`Fixed and now passing: Q ${out.fixed.join(', ')}.`)
  if (out.stillFlagged?.length) lines.push(`Corrected but still flagged: Q ${out.stillFlagged.join(', ')}.`)
  if (out.needsAdmin?.length) {
    lines.push(`Needs you: ${out.needsAdmin.map((n) => `Q${n.goTo} (${n.reason})`).join('; ')}.`)
  }
  if (out.skippedAdminEdited?.length) {
    lines.push(`Not changed because you edited them: Q ${out.skippedAdminEdited.join(', ')} — use Compare this question on the card.`)
  }
  if (out.skippedTried?.length) lines.push(`Already tried before (no new Gemini request): Q ${out.skippedTried.join(', ')}.`)
  if (out.notTried?.length) lines.push(`Left for the next run: Q ${out.notTried.join(', ')}.`)
  return lines
}

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
  const [autoRun, setAutoRun] = useState(readAutoRun)
  const autoRanRef = useRef(/** @type {Set<string>} */ (new Set()))
  const flaggedKey = flagged.join(',')

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

  useEffect(() => {
    if (!autoRun || busy || !status?.available || !status?.gemini_key || !isAdminLoggedIn()) return
    const paper = getOfficialPyqPendingPaper(paperId)
    if (String(paper?.status) !== 'pending_review') return
    const todo = officialPyqAutoFixTodo(paper)
    if (!todo.length) return
    const key = paperId + ':' + todo.join(',')
    if (autoRanRef.current.has(key)) return
    autoRanRef.current.add(key)
    void runAutoFix(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, busy, status, paperId, flaggedKey])

  useEffect(() => {
    function onFactsConfirmed(e) {
      const detail = e?.detail
      if (!detail || detail.paperId !== paperId || !isAdminLoggedIn()) return
      detail.handled = true
      void runAfterFactsConfirmed(detail.before)
    }
    window.addEventListener(OFFICIAL_PYQ_FACTS_CONFIRMED_EVENT, onFactsConfirmed)
    return () => window.removeEventListener(OFFICIAL_PYQ_FACTS_CONFIRMED_EVENT, onFactsConfirmed)
  })

  if (!isAdminLoggedIn()) return null

  function onAutoRunChange(on) {
    setAutoRun(on)
    try {
      localStorage.setItem(AUTO_RUN_KEY, on ? '1' : '0')
    } catch {
      /* setting is only for this session */
    }
  }

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

  async function runAutoFix(auto = false) {
    if (busy) return
    setError('')
    setSummary('')
    if (!status?.available) {
      setError(ORIGINAL_MISSING_MESSAGE)
      return
    }
    if (!status?.gemini_key) {
      setError(GEMINI_KEY_MISSING_MESSAGE)
      return
    }
    if (!auto && typeof window !== 'undefined' && !window.confirm(AUTO_FIX_CONFIRM_TEXT)) {
      return
    }
    const ctl = new AbortController()
    abortRef.current = ctl
    setBusy(true)
    try {
      const out = await autoFixFlaggedOfficialPyqCards(paperId, {
        signal: ctl.signal,
        onProgress: (_done, _total, label) => setProgress(label),
      })
      onChanged?.()
      const lines = autoFixResultLines(out)
      if (!out.ok) {
        setError(`${out.error || 'Auto-fix stopped.'} ${lines.join(' ')}`.trim())
        return
      }
      const lead = auto ? 'Auto-fix ran on its own (new alerts on this pending paper). ' : ''
      setSummary(lines.length ? `${lead}${lines.join(' ')} Wrong fix? Open the card and click Undo last edit.` : 'No flagged questions to fix.')
    } finally {
      abortRef.current = null
      setBusy(false)
      setProgress('')
    }
  }

  /**
   * Started by a real "Confirm facts": the free rebuild first; the paid Compare only for cards
   * still flagged, with the same yes/no as the button unless "Auto-fix new alerts on their own" is on.
   * @param {number} [before] card count before the confirm
   */
  async function runAfterFactsConfirmed(before) {
    if (busy) {
      setSummary('Facts confirmed. Auto-fix is already running on this paper, so it was not started twice.')
      return
    }
    setError('')
    setSummary('')
    const ctl = new AbortController()
    abortRef.current = ctl
    setBusy(true)
    setProgress('Facts confirmed — auto-fix started')
    try {
      await new Promise((resolve) => setTimeout(resolve, 0))
      const out = await autoFixAfterOfficialPyqFactsConfirmed(paperId, {
        before,
        canCompare: Boolean(status?.available && status?.gemini_key),
        confirmPaid: () => autoRun || window.confirm(AUTO_FIX_CONFIRM_TEXT),
        signal: ctl.signal,
        onProgress: (_done, _total, label) => setProgress(label),
      })
      onChanged?.()
      const lines = autoFixResultLines(out)
      if (out.waiting && out.todo?.length) {
        const why =
          out.waiting === 'declined'
            ? 'Nothing was sent to Gemini — press Auto-fix flagged questions when you are ready.'
            : `Nothing was sent to Gemini (${status?.available ? GEMINI_KEY_MISSING_MESSAGE : ORIGINAL_MISSING_MESSAGE}).`
        lines.push(`Still flagged: Q ${out.todo.join(', ')}. ${why}`)
      }
      if (!out.ok) {
        setError(`Facts confirmed. ${out.error || 'Auto-fix stopped.'} ${lines.join(' ')}`.trim())
        return
      }
      const tail = out.paid ? ' Wrong fix? Open the card and click Undo last edit.' : out.waiting ? '' : ' No Gemini request was needed.'
      setSummary(`Facts confirmed — auto-fix ran. ${lines.length ? lines.join(' ') : 'No flagged questions left.'}${tail}`)
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
        <button
          type="button"
          className="btn btn-primary btn-sm"
          data-testid="official-pyq-auto-fix"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void runAutoFix(false)}
        >
          Auto-fix flagged questions (compare with original)
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
        <label className="form-hint" data-testid="official-pyq-auto-fix-auto">
          <input type="checkbox" checked={autoRun} onChange={(e) => onAutoRunChange(e.target.checked)} /> Auto-fix new alerts on their own
        </label>
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
