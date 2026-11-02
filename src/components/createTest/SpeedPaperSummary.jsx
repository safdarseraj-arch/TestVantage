import { getQuestionType, formatMarkingLabel } from '../../data/questionTypes'
import { getAnswerableQuestions } from '../../utils/passage'
import { formatSpeedTestTimingSummary } from '../../utils/speedTest.js'

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
export default function SpeedPaperSummary({
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
      <h3>{compact ? 'Your speed test' : 'AI-built speed paper'}</h3>
      <ul className="speed-paper-stats">
        <li>
          Duration: <strong>{durationMinutes} min</strong>
          {shortened && (
            <span className="form-hint">
              {' '}
              (you chose {requested} min — shortened because only {totalQ} easy question
              {totalQ === 1 ? '' : 's'} matched your syllabus)
            </span>
          )}
        </li>
        <li>
          Questions: <strong>{totalQ}</strong> (AI tuned from syllabus)
          {underFilled && !shortened && (
            <span className="form-hint">
              {' '}
              (planned {plannedQuestionCount} — add more level 1–3 questions or widen syllabus)
            </span>
          )}
        </li>
        <li>Pacing: {formatSpeedTestTimingSummary()}</li>
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
          Your syllabus has only {totalQ} easy question{totalQ === 1 ? '' : 's'} for this paper.
          For a full {requested}-minute speed test, upload more toughness level 1–3 questions or
          pick a shorter duration.
        </p>
      )}
      {!totalQ && (
        <p className="upload-error">
          Not enough level 1–3 questions in your syllabus for this duration. Try a shorter time or
          add easier questions to the bank.
        </p>
      )}
    </div>
  )
}
