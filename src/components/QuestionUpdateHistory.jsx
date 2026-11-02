import { historyActionLabel } from '../utils/questionBankHistory.js'
import { formatQuestionUploadDate } from '../utils/questionUploadFilter.js'

/**
 * @param {{ history?: import('../utils/questionBankHistory.js').QuestionHistoryEntry[] }} props
 */
export default function QuestionUpdateHistory({ history = [] }) {
  const rows = Array.isArray(history) ? history : []
  if (!rows.length) {
    return <p className="form-hint">No modification history recorded yet.</p>
  }

  return (
    <ol className="question-update-history">
      {rows.map((row, i) => (
        <li key={`${row.at}-${row.action}-${i}`} className="question-update-history-row">
          <div className="question-update-history-head">
            <strong>{historyActionLabel(row.action)}</strong>
            <span className="question-update-history-when">{formatQuestionUploadDate(row.at)}</span>
          </div>
          <div className="question-update-history-who">
            {row.byName || 'Unknown'}
            {row.summary ? ` — ${row.summary}` : ''}
          </div>
        </li>
      ))}
    </ol>
  )
}
