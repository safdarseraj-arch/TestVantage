import { formatMarkingLabel } from '../data/questionTypes'

/**
 * Status + marks row for Smart Compose (manual bank entry).
 * Status maps onto existing draft / published bank workflow.
 *
 * @param {{
 *   status: 'active' | 'needs_review' | 'disabled',
 *   onStatusChange: (v: 'active' | 'needs_review' | 'disabled') => void,
 *   marksCorrect: number | string,
 *   marksWrong: number | string,
 *   onMarksCorrectChange: (v: string) => void,
 *   onMarksWrongChange: (v: string) => void,
 *   markingHint?: string,
 * }} props
 */
export default function ComposeQuestionExtras({
  status,
  onStatusChange,
  marksCorrect,
  marksWrong,
  onMarksCorrectChange,
  onMarksWrongChange,
  markingHint = '',
}) {
  const preview = formatMarkingLabel({
    correct: Number(marksCorrect) || 0,
    wrong: Number(marksWrong) || 0,
    unattempted: 0,
  })

  return (
    <div className="compose-extras card-inner" aria-label="Status and marks">
      <div className="compose-extras-grid">
        <label className="compose-extras-field">
          Status
          <select
            value={status}
            onChange={(e) => onStatusChange(/** @type {'active' | 'needs_review' | 'disabled'} */ (e.target.value))}
          >
            <option value="needs_review">Needs Review (draft)</option>
            <option value="active">Active (published)</option>
            <option value="disabled">Disabled (held in draft)</option>
          </select>
          <span className="form-hint">
            Active tries to publish after Save. Needs Review / Disabled stay in draft until you publish
            from Saved questions or Review.
          </span>
        </label>
        <label className="compose-extras-field">
          Marks (correct)
          <input
            type="number"
            step="1"
            value={marksCorrect}
            onChange={(e) => onMarksCorrectChange(e.target.value)}
          />
        </label>
        <label className="compose-extras-field">
          Marks (wrong)
          <input
            type="number"
            step="1"
            value={marksWrong}
            onChange={(e) => onMarksWrongChange(e.target.value)}
          />
          <span className="form-hint">
            Scheme: {preview}
            {markingHint ? ` · ${markingHint}` : ''}
          </span>
        </label>
      </div>
    </div>
  )
}
