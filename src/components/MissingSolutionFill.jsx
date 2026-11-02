/**
 * Three ways to fill a missing solution. Admin only.
 * Hybrid AI fills the solution only. Scan and paste use the shared cleaner and quality check.
 */
import { useState } from 'react'
import { isAdminLoggedIn } from '../utils/auth.js'
import { fillOfficialPyqTags } from '../utils/hybridAiClient.js'
import { mapExamSlugToHybridLabel, mapSubjectSlugToHybridLabel } from '../utils/hybridMetadata.js'
import { prepareAndCheckSolution, readSolutionScan } from '../utils/solutionFill.js'

export default function MissingSolutionFill({
  hasSolution = false,
  questionText = '',
  options = [],
  subject = '',
  section = '',
  chapter = '',
  topic = '',
  questionType = '',
  examId = '',
  toughness = '',
  source = '',
  answerText = '',
  storedSolution = '',
  onApply,
  disabled = false,
}) {
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [mode, setMode] = useState('')
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [draft, setDraft] = useState('')
  const [passed, setPassed] = useState(false)
  if (!isAdminLoggedIn()) return null

  const showChoices = !hasSolution || replaceOpen

  function resetReview() {
    setError('')
    setNote('')
    setDraft('')
    setPassed(false)
  }

  async function onAskSolution() {
    if (disabled || busy) return
    setMode('hybrid')
    setBusy(true)
    resetReview()
    try {
      const filled = await fillOfficialPyqTags({
        question_text: String(questionText || ''),
        options: (Array.isArray(options) ? options : []).map((opt) => String(opt ?? '')),
        subject: subject ? mapSubjectSlugToHybridLabel(subject, chapter || section) : '',
        unit: section,
        section,
        chapter,
        topic,
        question_type: questionType,
        exam: examId ? mapExamSlugToHybridLabel(examId) : '',
        toughness_level: toughness,
        source,
        answer: answerText,
        solution: storedSolution,
      })
      const text = String(filled?.step_by_step_solution || '').trim()
      if (!text) {
        setError('Hybrid AI did not return a solution. The question was not changed.')
        return
      }
      setDraft(text)
      setPassed(true)
      setNote('Review this solution. Nothing is saved until you use it. The question wording stays as it is.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hybrid AI could not write a solution.')
    } finally {
      setBusy(false)
    }
  }

  async function onUpload(event) {
    const file = event.target.files && event.target.files[0]
    event.target.value = ''
    if (!file || disabled || busy) return
    setMode('upload')
    setBusy(true)
    resetReview()
    try {
      const checked = await readSolutionScan(file)
      setDraft(checked.text || '')
      setPassed(checked.passed === true)
      if (!checked.passed) {
        setError((checked.errors || []).join(' ') || 'Quality checked by local AI — not passed.')
        setNote('The scan was not kept.')
        return
      }
      setNote('Review the solution from the scan. Nothing is saved until you use it.')
    } catch (err) {
      setPassed(false)
      setError(err instanceof Error ? err.message : 'The file could not be read.')
    } finally {
      setBusy(false)
    }
  }

  function onCheckPaste() {
    if (disabled || busy) return
    setMode('paste')
    const checked = prepareAndCheckSolution(paste)
    setDraft(checked.text || '')
    setPassed(checked.passed === true)
    setError('')
    setNote('')
    if (!checked.passed) {
      setError((checked.errors || []).join(' ') || 'Quality checked by local AI — not passed.')
      setNote('The paste was not kept.')
      return
    }
    setNote('Review the pasted solution. You can still edit it after you use it.')
  }

  function onUse() {
    if (!passed || !String(draft || '').trim() || typeof onApply !== 'function') return
    onApply(String(draft).trim())
    setNote('Solution is in the box. You can still edit it. Nothing else on the question was changed.')
    setDraft('')
    setPassed(false)
    setMode('')
  }

  const choices = (
    <div data-testid="missing-solution-options">
      <p className="form-hint">
        {hasSolution
          ? 'Replace the solution with one of these. The question wording stays as it is.'
          : 'This solution is empty. Fill it with one of these. The question wording stays as it is.'}
      </p>
      <div className="official-pyq-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="ask-hybrid-solution"
          onClick={() => void onAskSolution()}
          disabled={disabled || busy}
        >
          {busy && mode === 'hybrid' ? 'Asking Hybrid AI...' : 'Ask Hybrid AI for Solution'}
        </button>
        <label className="btn btn-ghost btn-sm">
          {busy && mode === 'upload' ? 'Reading the file...' : 'Upload image or PDF'}
          <input
            data-testid="upload-solution-file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf"
            hidden
            disabled={disabled || busy}
            onChange={(e) => void onUpload(e)}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid="paste-solution-open"
          onClick={() => {
            setMode('paste')
            resetReview()
          }}
          disabled={disabled || busy}
        >
          Paste Word or LaTeX
        </button>
      </div>
      {mode === 'paste' ? (
        <label className="metadata-field">
          <span className="metadata-label">Paste Word or LaTeX</span>
          <textarea
            data-testid="paste-solution-text"
            rows={5}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste the solution here"
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="paste-solution-check"
            onClick={onCheckPaste}
            disabled={disabled || busy}
          >
            Check pasted solution
          </button>
        </label>
      ) : null}
      {draft ? (
        <div className="form-hint" data-testid="solution-fill-review">
          <p>{passed ? 'Quality check passed.' : 'Not marked passed.'}</p>
          <p>{draft}</p>
          {passed ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="use-solution-fill"
              onClick={onUse}
              disabled={disabled || busy}
            >
              Use this solution
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="upload-error" role="alert" data-testid="solution-fill-error">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="form-hint" role="status">
          {note}
        </p>
      ) : null}
    </div>
  )

  if (!showChoices) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        data-testid="replace-solution"
        onClick={() => setReplaceOpen(true)}
        disabled={disabled}
      >
        Replace solution
      </button>
    )
  }

  return choices
}
