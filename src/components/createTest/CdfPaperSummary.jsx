import { getQuestionType, formatMarkingLabel } from '../../data/questionTypes'
import { getAnswerableQuestions } from '../../utils/passage'
import { formatCdfTestTimingSummary } from '../../utils/cdfTest.js'

/**
 * @param {{
 *   durationMinutes: number
 *   requestedDurationMinutes?: number
 *   plannedQuestionCount?: number
 *   slots?: import('../../data/examPatterns').QuestionTypeSlot[]
 *   questions?: import('../../data/tests').Question[]
 *   compact?: boolean
 * }} props
 */
export default function CdfPaperSummary({
  durationMinutes,
  requestedDurationMinutes,
  plannedQuestionCount = 0,
  slots = [],
  questions = [],
  compact = false,
}) {
  const answerable = getAnswerableQuestions(questions)
  const totalQ = answerable.length
  const requested = requestedDurationMinutes ?? durationMinutes
  const underFilled = plannedQuestionCount > totalQ && totalQ > 0
  const shortened = requested > durationMinutes
  const slotRows = slots.filter((s) => s.count > 0)

  return (
    <div className={`speed-paper-summary${compact ? ' speed-paper-summary-compact' : ''}`}>
      <h3>{compact ? 'Your CDF test' : 'AI-built Concept Definition and Formula paper'}</h3>
      <ul className="speed-paper-stats">
        <li>
          Time slot: <strong>{durationMinutes} min</strong>
          {shortened && (
            <span className="form-hint">
              {' '}
              (you chose {requested} min — shortened because only {totalQ} level-1 question
              {totalQ === 1 ? '' : 's'} matched your syllabus)
            </span>
          )}
        </li>
        <li>
          Questions: <strong>{totalQ}</strong> (SCQ &amp; T/F · toughness level 1)
          {underFilled && !shortened && (
            <span className="form-hint">
              {' '}
              (planned {plannedQuestionCount} — add more level-1 questions or widen syllabus)
            </span>
          )}
        </li>
        <li>Per-question timer: {formatCdfTestTimingSummary()}</li>
      </ul>
      {slotRows.length > 0 && (
        <>
          <h4>Question types &amp; marking</h4>
          <table className="create-slots-table speed-marking-summary-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Count</th>
                <th>Marking</th>
              </tr>
            </thead>
            <tbody>
              {slotRows.map((slot) => {
                const def = getQuestionType(slot.questionTypeId)
                return (
                  <tr key={`${slot.questionTypeId}-${slot.section ?? ''}`}>
                    <td>{def.shortName}</td>
                    <td>{slot.count}</td>
                    <td>{slot.marking ? formatMarkingLabel(slot.marking) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
      {underFilled && (
        <p className="upload-error">
          Your syllabus has only {totalQ} level-1 question{totalQ === 1 ? '' : 's'} for this paper.
          For a full {requested}-minute CDF test, upload more toughness level 1 SCQ/T/F questions or
          pick a shorter time slot.
        </p>
      )}
      {!totalQ && (
        <p className="upload-error">
          Not enough level-1 SCQ or T/F questions in your syllabus. Add questions to the bank or
          widen your syllabus selection.
        </p>
      )}
    </div>
  )
}
