/**
 * Pending Official PYQ: Hybrid AI fills metatags, answers, and solutions two questions at a time.
 * Each finished part is saved at once, so Stop or a timeout keeps the work already done.
 */
import { useRef, useState } from 'react'
import { fillOfficialPyqPendingPaperPartByPart } from '../utils/officialPyqPendingFill.js'

function keyIsMissing(err) {
  return /GEMINI_API_KEY|API key|api key is missing/i.test(String(err?.message || err || ''))
}

export default function OfficialPyqPendingFill({ paperId, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [redoAll, setRedoAll] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const stopRef = useRef(/** @type {AbortController | null} */ (null))

  async function onFill() {
    if (busy || !paperId) return
    const ctl = new AbortController()
    stopRef.current = ctl
    setBusy(true)
    setError('')
    setNote('Starting…')
    try {
      const result = await fillOfficialPyqPendingPaperPartByPart(paperId, {
        redoAll,
        signal: ctl.signal,
        isFatal: keyIsMissing,
        onProgress: ({ from, to, total, filled }) => {
          setNote(`Questions ${from}–${to} of ${total} (two at a time). Saved so far: ${filled}.`)
          onChanged?.()
        },
      })
      onChanged?.()
      const look = result.needsLook.length
        ? ` Check question(s) ${result.needsLook.join(', ')} — the solution or answer needs a look.`
        : ''
      if (!result.asked) {
        setNote('Every question already has its chapter, answer, and solution. Tick "Redo all" to fill again.')
      } else {
        setNote(
          `${result.stopped ? 'Stopped. ' : ''}Hybrid AI filled and saved ${result.filled} of ${result.asked} question(s).${look}`,
        )
      }
    } catch (err) {
      onChanged?.()
      setError(
        keyIsMissing(err)
          ? 'The Gemini key is missing on the helper. Questions saved before this stay saved.'
          : `${err instanceof Error ? err.message : 'Hybrid AI fill stopped.'} Questions saved before this stay saved.`,
      )
    } finally {
      stopRef.current = null
      setBusy(false)
    }
  }

  return (
    <div className="official-pyq-pending-fill" data-testid="official-pyq-pending-fill">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        data-testid="official-pyq-pending-fill-button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void onFill()}
      >
        {busy ? 'Filling…' : 'Fill tags, answers & solutions (Hybrid AI)'}
      </button>
      {busy ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="official-pyq-pending-fill-stop"
          onClick={() => {
            stopRef.current?.abort()
            setNote('Stopping after the two questions already sent…')
          }}
        >
          Stop
        </button>
      ) : (
        <label className="form-hint">
          <input type="checkbox" checked={redoAll} onChange={(e) => setRedoAll(e.target.checked)} /> Redo all
          (otherwise only questions missing a chapter, answer, or solution)
        </label>
      )}
      {note ? (
        <p className="official-pyq-progress" role="status" data-testid="official-pyq-pending-fill-note">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
