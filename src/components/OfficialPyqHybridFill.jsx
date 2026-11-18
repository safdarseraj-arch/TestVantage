/**
 * Approved Official PYQ: Hybrid AI fills metatags, answers, and solutions two questions at a time.
 * Optional step between Approve and Publish. Each finished part is saved at once, so Stop or a
 * timeout keeps the work already done. Answers printed on the paper stay.
 */
import { useRef, useState } from 'react'
import { HYBRID_FILL_INCOMPLETE_NOTE, fillOfficialPyqApprovedPaperPartByPart } from '../utils/officialPyqPendingFill.js'
import { getOfficialPyqPendingPaper, updateOfficialPyqPendingPaper } from '../utils/officialPyqPendingStore.js'
import { HYBRID_FILL_TRIES, hybridFillUsageNote } from '../utils/officialPyqReplica.js'

function keyIsMissing(err) {
  return /GEMINI_API_KEY|API key|api key is missing/i.test(String(err?.message || err || ''))
}

function notSavedNote(result) {
  return result.notSaved?.length
    ? ` Question(s) ${result.notSaved.join(', ')} could not be saved (the card changed while filling). Press the button again.`
    : ''
}

function stillBlankNote(result) {
  const nums = Array.isArray(result.stillBlank) ? result.stillBlank : []
  if (!nums.length) return ''
  const shown = nums.slice(0, 40).join(', ')
  const more = nums.length > 40 ? ` (+${nums.length - 40} more)` : ''
  return ` Still blank tags (chapter / topic / unit / toughness): question(s) ${shown}${more}. Press Fill again for those, or type them by hand.`
}

export default function OfficialPyqHybridFill({ paperId, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [redoAll, setRedoAll] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [printedAll, setPrintedAll] = useState(() => getOfficialPyqPendingPaper(paperId)?.printedAnswersAndSolutions === true)
  const stopRef = useRef(/** @type {AbortController | null} */ (null))

  function onPrintedAllChange(checked) {
    if (!paperId) return
    const saved = updateOfficialPyqPendingPaper(paperId, { printedAnswersAndSolutions: checked })
    if (!saved) {
      setError('Could not save this setting. Questions are unchanged.')
      return
    }
    setPrintedAll(checked)
    setNote(
      checked
        ? 'Saved. Hybrid AI will fill only the tags. A question with no printed answer is listed for you to type, not answered by AI.'
        : 'Saved. Hybrid AI fills tags, and answers and solutions only where none is printed.',
    )
    onChanged?.()
  }

  async function onFill() {
    if (busy || !paperId) return
    const ctl = new AbortController()
    stopRef.current = ctl
    setBusy(true)
    setError('')
    setNote('Starting…')
    try {
      // Clear unreadable institute / draft sols first — Hybrid only fills true gaps (~5–10%).
      try {
        const { clearPoorInstituteSolutionsForHybrid } = await import('../utils/officialPyqInstituteSolutions.js')
        const cleared = clearPoorInstituteSolutionsForHybrid(paperId)
        if (cleared?.ok && cleared.cleared) {
          setNote(`Cleared ${cleared.cleared} unreadable institute solution(s). Filling remaining gaps…`)
          onChanged?.()
        }
      } catch {
        /* nonfatal — fill still runs */
      }
      const result = await fillOfficialPyqApprovedPaperPartByPart(paperId, {
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
        ? ` Check question(s) ${result.needsLook.join(', ')} — after ${HYBRID_FILL_TRIES} tries the solution still did not reach the official answer or read as a full solution; their tags were saved. Press the button again to retry them.`
        : ''
      const failed = result.failed?.length
        ? ` Question(s) ${result.failed.join(', ')} got no reply (${HYBRID_FILL_TRIES} tries). Press the button again to retry them.`
        : ''
      const incomplete = result.incomplete?.length
        ? ` Question(s) ${result.incomplete.join(', ')}: ${HYBRID_FILL_INCOMPLETE_NOTE}. They were not asked again, so nothing was paid twice.`
        : ''
      const cost = hybridFillUsageNote(result.usage)
      const blank = stillBlankNote(result)
      if (result.paused) {
        setError(
          `Hybrid AI stopped answering at question ${result.paused.at} after several failed pairs: ${result.paused.reason} Saved ${result.filled} question(s) before that. When the helper is running again, press the button — finished questions are skipped; blanks are tried again.`,
        )
        setNote(`${cost.trim()}${look}${incomplete}${failed}${notSavedNote(result)}${blank}`)
        return
      }
      const notSaved = notSavedNote(result)
      const tagsOnly = result.tagsOnly ? ` ${result.tagsOnly} question(s) had a printed answer and solution, so only their tags were filled.` : ''
      const noKey = result.noPrintedAnswer?.length
        ? ` Question(s) ${result.noPrintedAnswer.join(', ')} have no printed answer. Hybrid AI did not answer them because this paper is marked "printed answers and solutions" — type the answer by hand.`
        : ''
      if (!result.asked) {
        setNote(
          `${printedAll ? 'Every question already has its chapter.' : 'Every question already has its chapter, answer, and solution.'} Tick "Redo all" to fill again.${noKey}${blank}`,
        )
      } else {
        setNote(
          `${result.stopped ? 'Stopped. ' : ''}Hybrid AI filled and saved ${result.filled} of ${result.asked} question(s). The paper is still Approved — press Publish when it looks right.${tagsOnly}${look}${incomplete}${failed}${notSaved}${noKey}${blank}${cost}`,
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
    <div className="official-pyq-pending-fill" data-testid="official-pyq-hybrid-fill">
      <p className="form-hint">
        Optional: Hybrid AI fills the tags, answer, and solution, two questions at a time, for the whole
        paper. A short helper outage skips that pair and continues; only a long outage pauses. Source is the
        paper's own name. Answers printed on the paper and your own edits stay, and the solution must reach
        the printed answer; with no printed answer, the answer is the one the solution reaches. Question
        wording does not change. When a question has its answer and solution printed, only its tags are filled.
        After Fill, any questions still missing chapter / topic / unit / toughness are listed by number.
      </p>
      <label className="form-hint" data-testid="official-pyq-printed-solutions-toggle">
        <input
          type="checkbox"
          checked={printedAll}
          disabled={busy}
          onChange={(e) => onPrintedAllChange(e.target.checked)}
        />{' '}
        Paper has printed answers and solutions — fill tags only
      </label>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        data-testid="official-pyq-hybrid-fill-button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void onFill()}
      >
        {busy ? 'Filling…' : printedAll ? 'Fill tags only (Hybrid AI)' : 'Fill tags, answers & solutions (Hybrid AI)'}
      </button>
      {busy ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="official-pyq-hybrid-fill-stop"
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
        <p className="official-pyq-progress" role="status" data-testid="official-pyq-hybrid-fill-note">
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
