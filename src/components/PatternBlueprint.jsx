import { getPatternBlueprintRows, getPatternTotalQuestions, getPatternMaxScore } from '../data/examPatterns'
import { getQuestionType } from '../data/questionTypes'

export default function PatternBlueprint({ pattern }) {
  if (!pattern?.questionSlots?.length) {
    return <p className="form-hint">Exam pattern details are not available for this paper.</p>
  }
  const rows = getPatternBlueprintRows(pattern)
  const totalQ = getPatternTotalQuestions(pattern)
  const maxScore = getPatternMaxScore(pattern)

  return (
    <div className="pattern-blueprint">
      <p className="blueprint-summary">
        <strong>{totalQ}</strong> questions · <strong>{pattern.totalMinutes}</strong> minutes · max{' '}
        <strong>{maxScore}</strong> marks
      </p>
      <table className="blueprint-table">
        <thead>
          <tr>
            <th>Section</th>
            <th>Question type</th>
            <th>Count</th>
            <th>Marking</th>
            <th>~Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>{row.section}</td>
              <td>{getQuestionType(row.typeId).name}</td>
              <td>{row.count}</td>
              <td>{row.markingLabel}</td>
              <td>{row.minutesShare} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
