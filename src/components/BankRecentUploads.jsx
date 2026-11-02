import MathText from './MathText'
import { getQuestionType } from '../data/questionTypes'
import { formatExamLabels, formatToughnessLabel } from '../utils/questionMetadata'
import { isQuestionMetaUntagged } from '../utils/bankListFilters'
import { sortQuestionsByRecent } from '../utils/bankListFilters'
import { truncateForMathPreview } from '../utils/truncateForMathPreview'
import { isHybridQuestion } from '../utils/imageQuestion'

const RECENT_LIMIT = 10

/**
 * Last N saved questions on the upload page (not the full bank list).
 * @param {{
 *   questions: import('../data/tests').Question[],
 *   onView: (id: string) => void,
 *   onViewMeta: (id: string) => void,
 *   onEditQuestionAnswer: (q: import('../data/tests').Question) => void,
 *   onViewAll: () => void,
 * }} props
 */
export default function BankRecentUploads({
  questions,
  onView,
  onViewMeta,
  onEditQuestionAnswer,
  onViewAll,
}) {
  const recent = sortQuestionsByRecent(questions).slice(0, RECENT_LIMIT)

  if (!questions.length) {
    return (
      <section className="card bank-recent-uploads">
        <h3>Recent uploads</h3>
        <p className="form-hint">No questions saved yet. Use the tabs above to add your first question.</p>
      </section>
    )
  }

  return (
    <section className="card bank-recent-uploads">
      <div className="saved-list-header">
        <div>
          <h3>Recent uploads (last {RECENT_LIMIT})</h3>
          <p className="form-hint">
            Showing the {Math.min(RECENT_LIMIT, questions.length)} most recently saved questions.{' '}
            <button type="button" className="btn-link" onClick={onViewAll}>
              View all saved questions →
            </button>
          </p>
        </div>
      </div>
      <ul className="saved-question-list bank-recent-list">
        {recent.map((q) => (
          <li key={q.id}>
            <div className="saved-detail">
              {isQuestionMetaUntagged(q) ? (
                <span className="saved-untagged-badge">Untagged</span>
              ) : null}
              <span className="saved-subject">{q.subject}</span>
              {q.section && <span className="saved-section">{q.section}</span>}
              {q.chapter && <span className="saved-chapter">{q.chapter}</span>}
              <span className="saved-type">{getQuestionType(q.questionType).shortName}</span>
              {q.examIds?.length > 0 && (
                <span className="saved-exams">{formatExamLabels(q.examIds)}</span>
              )}
              {q.toughnessLevel != null && q.toughnessLevel >= 1 && (
                <span className="saved-toughness">{formatToughnessLabel(q.toughnessLevel)}</span>
              )}
              {q.source && <span className="saved-source">{q.source}</span>}
              {isHybridQuestion(q) && <span className="saved-hybrid-badge">Hybrid</span>}
              <p className="saved-text">
                <MathText text={truncateForMathPreview(q.text, 80, q.options)} questionContext={q.text} />
              </p>
            </div>
            <div className="saved-item-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onView(q.id)}>
                View
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onViewMeta(q.id)}>
                Metatags
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onEditQuestionAnswer(q)}
              >
                Q &amp; A
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
