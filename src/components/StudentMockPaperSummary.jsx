import { getQuestionType, formatMarkingLabel } from '../data/questionTypes'
import { selectionProgressBySlot } from '../utils/paperAssembly'
import { getAnswerableQuestions } from '../utils/passage'

/**
 * @param {{
 *   title?: string
 *   durationMinutes: number
 *   slots?: import('../data/examPatterns').QuestionTypeSlot[]
 *   questions?: import('../data/tests').Question[]
 *   paperLabel?: string
 *   adaptive?: boolean
 *   targetTotal?: number
 *   pyqMix?: { pyqSummary?: string, pyqAvailable?: number }
 * }} props
 */
export default function StudentMockPaperSummary({
  title = 'AI-built paper',
  durationMinutes,
  slots = [],
  questions = [],
  paperLabel,
  adaptive = false,
  targetTotal,
  pyqMix,
}) {
  const answerable = getAnswerableQuestions(questions)
  const progress = selectionProgressBySlot(answerable, slots).filter((r) => r.need > 0 || r.have > 0)
  const totalQ = adaptive ? targetTotal ?? answerable.length : answerable.length

  return (
    <div className="speed-paper-summary student-mock-paper-summary">
      <h3>{title}</h3>
      <ul className="speed-paper-stats">
        {paperLabel && (
          <li>
            Pattern: <strong>{paperLabel}</strong>
          </li>
        )}
        <li>
          Duration: <strong>{durationMinutes} min</strong>
        </li>
        <li>
          Questions: <strong>{totalQ}</strong>
          {adaptive ? ' (adaptive — more delivered during test)' : ' (AI tuned from syllabus)'}
        </li>
      </ul>
      {progress.length > 0 && (
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
              {progress.map(({ slot, need, have }) => {
                const def = getQuestionType(slot.questionTypeId)
                const count = have > 0 ? have : need
                if (!count) return null
                return (
                  <tr key={`${slot.questionTypeId}-${slot.section ?? ''}`}>
                    <td>{def.shortName}</td>
                    <td>{count}</td>
                    <td>{slot.marking ? formatMarkingLabel(slot.marking) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
      {!adaptive && !totalQ && (
        <p className="upload-error">
          Not enough ready questions in your syllabus for this paper. Widen syllabus or add questions
          in the bank.
        </p>
      )}
      {pyqMix?.pyqAvailable > 0 && pyqMix.pyqSummary && (
        <p className="form-hint ai-pyq-mix-note">{pyqMix.pyqSummary}</p>
      )}
    </div>
  )
}
