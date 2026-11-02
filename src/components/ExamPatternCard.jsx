import { getExamPattern, getPatternMarkingLabel, getPatternTotalQuestions } from '../data/examPatterns'

export default function ExamPatternCard({ patternId, selected, onSelect }) {
  const pattern = getExamPattern(patternId)
  const totalQ = getPatternTotalQuestions(pattern)

  return (
    <button
      type="button"
      className={`pattern-card ${selected ? 'selected' : ''}`}
      onClick={() => onSelect(pattern.id)}
      style={{ '--pattern-color': pattern.color }}
    >
      <span className="pattern-name">{pattern.name}</span>
      <span className="pattern-marking">{getPatternMarkingLabel(pattern)}</span>
      <span className="pattern-desc">
        {totalQ} Q · {pattern.totalMinutes} min · {pattern.questionSlots.length} question types
      </span>
      <span className="pattern-subjects">
        {pattern.subjects.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' · ')}
      </span>
    </button>
  )
}
