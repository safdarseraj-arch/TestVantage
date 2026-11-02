import { isAnswerAttempted } from '../utils/answers.js'

/**
 * @param {Object} props
 * @param {import('../data/tests').Question[]} props.questions
 * @param {{ id: string, label: string, color: string }[]} props.subjects
 * @param {number} props.currentIndex
 * @param {Record<string, number | null>} props.answers
 * @param {Set<string>} props.marked
 * @param {(index: number) => void} props.onSelect
 */
export default function QuestionPalette({
  questions,
  subjects,
  currentIndex,
  answers,
  marked,
  onSelect }) {
  const getStatus = (q) => {
    const answered = isAnswerAttempted(answers[q.id], q)
    const isMarked = marked.has(q.id)
    if (answered && isMarked) return 'marked-answered'
    if (answered) return 'answered'
    if (isMarked) return 'marked'
    return 'unanswered'
  }

  return (
    <aside className="palette">
      <h3>Question Palette</h3>
      <div className="palette-legend">
        <span><i className="dot unanswered" /> Not answered</span>
        <span><i className="dot answered" /> Answered</span>
        <span><i className="dot marked" /> Marked for review</span>
        <span><i className="dot marked-answered" /> Marked & answered</span>
      </div>
      {subjects.map((subject) => {
        const indices = questions
          .map((q, i) => (q.subject === subject.id ? i : -1))
          .filter((i) => i >= 0)
        if (indices.length === 0) return null
        return (
          <div key={subject.id} className="palette-section">
            <p className="palette-subject" style={{ color: subject.color }}>
              {subject.label}
            </p>
            <div className="palette-grid">
              {indices.map((i) => {
                const q = questions[i]
                const status = getStatus(q)
                return (
                  <a
                    key={q.id}
                    href={`#q${i + 1}`}
                    className={`palette-btn ${status} ${i === currentIndex ? 'active' : ''}`}
                    data-exam-action="palette"
                    data-exam-arg={String(i)}
                    onClick={(e) => {
                      e.preventDefault()
                      onSelect(i)
                    }}
                    aria-label={`Question ${i + 1}`}
                    aria-current={i === currentIndex ? 'true' : undefined}
                  >
                    {i + 1}
                  </a>
                )
              })}
            </div>
          </div>
        )
      })}
    </aside>
  )
}
