/**
 * Question Bank Draft questions: Hybrid AI fills tags, answers, and solutions two at a time.
 * Upload only splits questions; this is the later fill step. Each finished part is saved at once,
 * so Stop or a timeout keeps the work already done. Printed answers and hand edits stay.
 */
import { useRef, useState } from 'react'
import { bankDraftsToFill, fillBankDraftsWithHybridAi } from '../utils/bankHybridFill.js'

function stopsTheFill(err) {
  return /GEMINI_API_KEY|API key|not running/i.test(String(err?.message || err || ''))
}

/**
 * @param {{ drafts: any[], onChanged?: () => void }} props drafts: the Draft questions in this view
 */
export default function BankHybridFill({ drafts, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [redoAll, setRedoAll] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const stopRef = useRef(/** @type {AbortController | null} */ (null))
  const toFill = bankDraftsToFill(drafts, { redoAll })

  async function onFill() {
    if (busy || !toFill.length) return
    const ctl = new AbortController()
    stopRef.current = ctl
    setBusy(true)
    setError('')
    setNote('Starting…')
    try {
      const result = await fillBankDraftsWithHybridAi(
        toFill.map((q) => String(q.id)),
        {
          redoAll,
          signal: ctl.signal,
          isFatal: stopsTheFill,
          onProgress: ({ from, to, total, filled }) => {
            setNote(`Questions ${from}–${to} of ${total} (two at a time). Saved so far: ${filled}.`)
            onChanged?.()
          },
        },
      )
      onChanged?.()
      const look = result.needsLook.length
        ? ` ${result.needsLook.length} question(s) need a look: the solution read like a hint or an essay, or no answer came back, so it was not saved.`
        : ''
      const tagsOnly = result.tagsOnly
        ? ` ${result.tagsOnly} question(s) had a printed answer and solution, so only their tags were filled.`
        : ''
      setNote(
        `${result.stopped ? 'Stopped. ' : ''}Hybrid AI filled and saved ${result.filled} of ${result.asked} Draft question(s). They are still Drafts — review, then Publish.${tagsOnly}${look}`,
      )
    } catch (err) {
      onChanged?.()
      setError(
        /GEMINI_API_KEY|API key/i.test(String(err?.message || ''))
          ? 'The Gemini key is missing on the helper. Questions saved before this stay saved.'
          : `${err instanceof Error ? err.message : 'Hybrid AI fill stopped.'} Questions saved before this stay saved.`,
      )
    } finally {
      stopRef.current = null
      setBusy(false)
    }
  }

  return (
    <div className="bank-hybrid-fill" data-testid="bank-hybrid-fill">
      <p className="form-hint">
        Upload only splits questions. <strong>Fill with Hybrid AI</strong> adds the tags, answer, and a short
        worked solution, two questions at a time. Answers printed on the paper and your own edits stay;
        question wording does not change. Each question is one Gemini request.
      </p>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        data-testid="bank-hybrid-fill-button"
        disabled={busy || !toFill.length}
        aria-busy={busy}
        onClick={() => void onFill()}
      >
        {busy
          ? 'Filling…'
          : toFill.length || !drafts?.length
            ? `Fill with Hybrid AI (${toFill.length} Draft question${toFill.length === 1 ? '' : 's'})`
            : 'Fill with Hybrid AI (all Drafts already filled — tick Redo all to fill again)'}
      </button>
      {busy ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="bank-hybrid-fill-stop"
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
          (otherwise only Drafts missing a chapter, answer, or solution)
        </label>
      )}
      {note ? (
        <p className="form-hint" role="status" data-testid="bank-hybrid-fill-note">
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
