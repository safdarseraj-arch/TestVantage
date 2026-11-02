import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import {
  QUESTION_REPORT_CATEGORIES,
  QUESTION_REPORT_MAX_COMMENT,
  addQuestionReport,
  getQuestionReportCategory,
} from '../utils/questionReports.js'
import { submitQuestionReportRemote } from '../utils/questionReportsApi.js'

/**
 * Small Report control + modal. Does not change the question or spoil answers.
 * @param {{
 *   questionId: string
 *   source?: string
 *   compact?: boolean
 *   className?: string
 * }} props
 */
export default function ReportQuestionButton({
  questionId,
  source = '',
  compact = true,
  className = '',
}) {
  const [open, setOpen] = useState(false)
  if (!questionId) return null
  return (
    <>
      <button
        type="button"
        className={`btn btn-ghost ${compact ? 'btn-sm' : ''} ${className}`.trim()}
        onClick={() => setOpen(true)}
      >
        Report
      </button>
      {open ? (
        <ReportQuestionModal
          questionId={questionId}
          source={source}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

/**
 * @param {{ questionId: string, source?: string, onClose: () => void }} props
 */
export function ReportQuestionModal({ questionId, source = '', onClose }) {
  const { session } = useAuth()
  const [category, setCategory] = useState('')
  const [subReason, setSubReason] = useState('')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const selected = useMemo(() => getQuestionReportCategory(category), [category])
  const reasons = selected?.reasons ?? []

  const handleCategory = (id) => {
    setCategory(id)
    setSubReason('')
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const reporter = session
        ? {
            userId: session.userId ?? null,
            name: session.name ?? null,
            email: session.email ?? null,
            role: session.role ?? null,
          }
        : null
      const report = addQuestionReport({
        questionId,
        category,
        subReason,
        comment,
        reporter,
        source,
      })
      await submitQuestionReportRemote(report)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report.')
    } finally {
      setBusy(false)
    }
  }

  const modal = (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-question-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal report-question-modal" onClick={(e) => e.stopPropagation()}>
        {sent ? (
          <>
            <h2 id="report-question-title">Report sent — thank you.</h2>
            <p className="form-hint">
              A teacher can look this over. The question stays as it is until someone reviews it.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 id="report-question-title">Report a problem</h2>
            <p className="form-hint">
              Pick one main group, then a specific reason if shown. A short note is optional.
            </p>

            <fieldset className="report-reason-fieldset">
              <legend>Main category</legend>
              <div className="report-reason-list">
                {QUESTION_REPORT_CATEGORIES.map((cat) => (
                  <label key={cat.id}>
                    <input
                      type="radio"
                      name="report-category"
                      value={cat.id}
                      checked={category === cat.id}
                      onChange={() => handleCategory(cat.id)}
                    />
                    <span>{cat.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {reasons.length > 0 ? (
              <fieldset className="report-reason-fieldset">
                <legend>Specific reason</legend>
                <div className="report-reason-list">
                  {reasons.map((reason) => (
                    <label key={reason.id}>
                      <input
                        type="radio"
                        name="report-reason"
                        value={reason.id}
                        checked={subReason === reason.id}
                        onChange={() => {
                          setSubReason(reason.id)
                          setError('')
                        }}
                      />
                      <span>{reason.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <label className="report-comment-label">
              Short note (optional)
              <textarea
                rows={3}
                maxLength={QUESTION_REPORT_MAX_COMMENT}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Anything that helps a teacher find the problem"
              />
            </label>
            <p className="form-hint">
              {comment.trim().length}/{QUESTION_REPORT_MAX_COMMENT}
            </p>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal
}
