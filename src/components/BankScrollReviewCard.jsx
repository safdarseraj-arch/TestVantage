import { memo } from 'react'
import MathText from './MathText'
import { QuestionStem } from './QuestionMedia'
import { matchOptionsFoldedIntoLists } from '../utils/parseMatchingListDisplay.js'
import DraftFieldConfidence from './DraftFieldConfidence'
import ReportQuestionButton from './ReportQuestionModal.jsx'
import LazyWhenVisible from './LazyWhenVisible.jsx'
import { getQuestionType } from '../data/questionTypes'
import { formatExamLabels } from '../utils/questionMetadata'
import { formatMixToughnessLabel } from '../utils/bankToughnessMix.js'
import { pyqProvenanceLabel } from '../utils/pyqDetect.js'
import { formatPyqCardChip } from '../utils/pyqSlotMeta.js'
import { effectiveBankStatus } from '../utils/questionUploadFilter.js'
import { getPassageText, isPassageLinkedQuestion } from '../utils/passage.js'
import BankFamilyBadge from './BankFamilyBadge.jsx'

const LETTERS = ['A', 'B', 'C', 'D']

/**
 * Full draft card for scroll-review: stem, options A–D, solution, tags, confidence.
 * @param {{
 *   question: import('../data/tests').Question
 *   allQuestions?: import('../data/tests').Question[]
 *   canPublish?: boolean
 *   onPublish?: (id: string) => void
 *   onEdit?: (q: import('../data/tests').Question) => void
 *   publishDisabled?: boolean
 *   publishTitle?: string
 *   extraActions?: import('react').ReactNode
 * }} props
 */
function BankScrollReviewCard({
  question: q,
  allQuestions = [],
  canPublish = false,
  onPublish,
  onEdit,
  publishDisabled = false,
  publishTitle = '',
  extraActions = null,
}) {
  const type = getQuestionType(q.questionType ?? 'single_correct')
  const options = Array.isArray(q.options) ? q.options : []
  const foldedLists = matchOptionsFoldedIntoLists(q.text, options)
  const isMcq =
    !foldedLists && (q.questionType === 'multiple_correct' || options.length >= 2)
  const passage = getPassageText(q, allQuestions)
  const pyqChip = formatPyqCardChip(q) || pyqProvenanceLabel(q)
  const draft = effectiveBankStatus(q) === 'draft'

  return (
    <div className="bank-scroll-review-card">
      <div className="bank-scroll-review-tags">
        {q.id ? <span className="saved-question-id">{q.id}</span> : null}
        <BankFamilyBadge question={q} />
        {q.subject ? <span className="saved-subject">{q.subject}</span> : null}
        {q.section ? <span className="saved-section">{q.section}</span> : null}
        {q.chapter ? <span className="saved-chapter">{q.chapter}</span> : null}
        {q.topic ? <span className="saved-topic">{q.topic}</span> : null}
        <span className="saved-type">{type?.shortName || q.questionType}</span>
        {q.examIds?.length > 0 ? (
          <span className="saved-exams">{formatExamLabels(q.examIds)}</span>
        ) : null}
        {q.toughnessLevel != null && q.toughnessLevel >= 1 ? (
          <span className="saved-toughness">{formatMixToughnessLabel(q.toughnessLevel)}</span>
        ) : null}
        {q.source ? <span className="saved-source">{q.source}</span> : null}
        {pyqChip ? (
          <span
            className={`bank-review-pyq-year-badge ${String(pyqChip).includes('AI') ? 'is-ai' : 'is-official'}`}
          >
            {pyqChip}
          </span>
        ) : null}
        <DraftFieldConfidence question={q} variant="compact" showUnknown={draft} />
      </div>

      <div className="bank-scroll-review-actions">
        {canPublish && draft && onPublish ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={publishDisabled}
            title={publishTitle || 'Publish after review'}
            onClick={() => onPublish(q.id)}
          >
            Publish
          </button>
        ) : null}
        {onEdit ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(q)}>
            Edit
          </button>
        ) : null}
        <ReportQuestionButton questionId={q.id} source="bank" compact />
        {extraActions}
      </div>

      <LazyWhenVisible
        minHeight={220}
        placeholder={<p className="form-hint bank-scroll-review-lazy">Question loading…</p>}
      >
        {passage?.trim() ? (
          <div className="bank-scroll-review-block">
            <h4>Passage</h4>
            <MathText text={passage} />
          </div>
        ) : null}

        <div className="bank-scroll-review-block">
          <h4>Question</h4>
          <QuestionStem
            className="saved-viewer-math question-text"
            text={isPassageLinkedQuestion(q) ? q.text : q.text}
            options={q.options}
            questionImage={q.questionImage}
            layout="split"
            imageFirst
          />
        </div>

        {isMcq ? (
          <div className="bank-scroll-review-block">
            <h4>Options</h4>
            <ul className="saved-viewer-options">
              {LETTERS.map((letter, i) => {
                const opt = options[i] ?? ''
                const isCorrect =
                  q.questionType === 'multiple_correct'
                    ? (q.correctIndices ?? []).includes(i)
                    : q.correctIndex != null && q.correctIndex === i
                return (
                  <li key={letter} className={isCorrect ? 'saved-opt-correct' : ''}>
                    <span className="saved-opt-letter">{letter}</span>
                    {q.optionImages?.[i] ? (
                      <img
                        src={q.optionImages[i]}
                        alt={`Option ${letter}`}
                        className="saved-viewer-img saved-viewer-opt-img"
                      />
                    ) : null}
                    {opt ? (
                      <MathText text={String(opt)} questionContext={q.text} optionLetter={letter} />
                    ) : (
                      <span className="form-hint">(no text)</span>
                    )}
                    {isCorrect ? <span className="saved-opt-badge">Correct</span> : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : q.correctInteger != null || q.correctNumerical != null ? (
          <div className="bank-scroll-review-block">
            <h4>Answer</h4>
            <p>
              {q.correctInteger != null
                ? q.correctInteger
                : q.correctNumerical}
            </p>
          </div>
        ) : null}

        {q.solution || q.solutionImage ? (
          <div className="bank-scroll-review-block">
            <h4>Solution</h4>
            {q.solutionImage ? (
              <img src={q.solutionImage} alt="Solution" className="saved-viewer-img" />
            ) : null}
            {q.solution?.trim() ? <MathText text={q.solution} /> : null}
          </div>
        ) : (
          <p className="form-hint">No solution stored yet.</p>
        )}
      </LazyWhenVisible>
    </div>
  )
}

export default memo(BankScrollReviewCard)
