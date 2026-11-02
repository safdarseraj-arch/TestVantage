import { useEffect, useMemo, useState } from 'react'
import MathText from './MathText'
import { getQuestionType } from '../data/questionTypes'
import { bankListActionTargetId, getPassageSetPreviewSnippet } from '../utils/passageBankList.js'
import { isPassageLinkedQuestion } from '../utils/passage'
import { describeBankPublishFilters } from '../utils/bankListFilters.js'
import {
  bankStatusLabel,
  collectOperatorsInBank,
  effectiveBankStatus,
  findBankQuestionById,
  questionIdsFromQuery,
} from '../utils/questionUploadFilter.js'
import { truncateForMathPreview } from '../utils/truncateForMathPreview'
import {
  blockersBesidesDuplicate,
  getQuestionPublishBlockers,
  getQuestionReviewState,
} from '../utils/questionBankReview.js'

/**
 * Review panel — preview questions and change Draft ↔ Published.
 * @param {{
 *   viewTab: 'draft' | 'published'
 *   filteredQuestions: import('../data/tests').Question[]
 *   filters: import('../utils/bankListFilters.js').BankListFilters
 *   allQuestions: import('../data/tests').Question[]
 *   canPublish?: boolean
 *   onPublishIds?: (ids: string[]) => void
 *   onPublishSilentIds?: (ids: string[]) => void
 *   onUnpublishIds?: (ids: string[]) => void
 *   onPublish?: (id: string) => void
 *   onPublishSilent?: (id: string) => void
 *   onUnpublish?: (id: string) => void
 *   onView?: (id: string) => void
 *   focusId?: string
 *   onFocusId?: (id: string) => void
 * }} props
 */
export default function BankBulkPublishPanel({
  viewTab,
  filteredQuestions,
  filters,
  allQuestions,
  canPublish = false,
  onPublishIds,
  onPublishSilentIds,
  onUnpublishIds,
  onPublish,
  onPublishSilent,
  onUnpublish,
  onView,
  focusId = '',
  onFocusId,
}) {
  const [focusedId, setFocusedId] = useState('')
  const reviewingDrafts = viewTab === 'draft'

  const statusInView = useMemo(
    () => filteredQuestions.filter((q) => effectiveBankStatus(q) === viewTab),
    [filteredQuestions, viewTab],
  )

  const publishableInView = useMemo(
    () =>
      reviewingDrafts
        ? statusInView.filter((q) => blockersBesidesDuplicate(getQuestionPublishBlockers(q)).length === 0)
        : statusInView,
    [reviewingDrafts, statusInView],
  )

  const blockedInView = useMemo(
    () =>
      reviewingDrafts
        ? statusInView.filter((q) => blockersBesidesDuplicate(getQuestionPublishBlockers(q)).length > 0)
        : [],
    [reviewingDrafts, statusInView],
  )

  const operatorLabel = useMemo(() => {
    const want = String(filters.uploadedBy ?? '').trim()
    if (!want) return ''
    const op = collectOperatorsInBank(allQuestions).find((row) => row.id === want)
    return op?.label ?? want
  }, [allQuestions, filters.uploadedBy])

  const criteriaLabel = useMemo(
    () => describeBankPublishFilters(filters, { operatorLabel }),
    [filters, operatorLabel],
  )

  const actionIds = useMemo(
    () => [...new Set(publishableInView.map((q) => bankListActionTargetId(q)).filter(Boolean))],
    [publishableInView],
  )

  const idChips = useMemo(() => {
    const fromQuery = questionIdsFromQuery(filters.questionIdQuery)
    if (fromQuery.length) return fromQuery
    return statusInView.map((q) => String(bankListActionTargetId(q)).toUpperCase()).filter(Boolean)
  }, [filters.questionIdQuery, statusInView])

  const focusedQuestion = useMemo(() => {
    if (!focusedId) return null
    return (
      findBankQuestionById(filteredQuestions, focusedId) ??
      findBankQuestionById(allQuestions, focusedId)
    )
  }, [focusedId, filteredQuestions, allQuestions])

  useEffect(() => {
    if (focusId) setFocusedId(String(focusId).toUpperCase())
  }, [focusId])

  useEffect(() => {
    if (!focusedId && idChips.length === 1) {
      setFocusedId(idChips[0])
    }
  }, [focusedId, idChips])

  const handleIdClick = (id) => {
    const normalized = String(id).trim().toUpperCase()
    setFocusedId(normalized)
    onFocusId?.(normalized)
    const el = document.getElementById(`bank-row-${normalized}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  if (!canPublish) return null

  const focusedActionId = focusedQuestion ? bankListActionTargetId(focusedQuestion) : ''
  const focusedIsPassage =
    focusedQuestion && isPassageLinkedQuestion(focusedQuestion) && !!focusedQuestion.passageText
  const focusedPreview = focusedQuestion
    ? focusedIsPassage
      ? getPassageSetPreviewSnippet(focusedQuestion, allQuestions)
      : focusedQuestion.text
    : ''
  const focusedIsDraft = focusedQuestion && effectiveBankStatus(focusedQuestion) === 'draft'
  const focusedReviewState = focusedQuestion ? getQuestionReviewState(focusedQuestion) : null
  const focusedBlockers = focusedQuestion ? getQuestionPublishBlockers(focusedQuestion) : []
  const focusedHardBlockers = blockersBesidesDuplicate(focusedBlockers)

  return (
    <section className="bank-bulk-publish card-inner">
      <div className="bank-bulk-publish-head">
        <h4>{reviewingDrafts ? 'Review drafts → publish' : 'Review published → move to draft'}</h4>
        <p className="form-hint">
          Click a <strong>Question ID</strong> to preview. After review, change status:{' '}
          <strong>Draft → Publish</strong> or <strong>Published → Draft</strong>.
        </p>
      </div>

      <dl className="bank-bulk-publish-summary">
        <div>
          <dt>Matching filters</dt>
          <dd>{criteriaLabel}</dd>
        </div>
        <div>
          <dt>{reviewingDrafts ? 'Drafts to review' : 'Published to review'}</dt>
          <dd>
            <strong>{statusInView.length}</strong>
            {filteredQuestions.length !== statusInView.length
              ? ` of ${filteredQuestions.length} in list`
              : ''}
          </dd>
        </div>
        {reviewingDrafts && (
          <div>
            <dt>Ready / blocked</dt>
            <dd>
              <strong>{actionIds.length}</strong> ready
              {blockedInView.length ? ` · ${blockedInView.length} blocked` : ''}
            </dd>
          </div>
        )}
      </dl>

      {idChips.length > 0 && (
        <div className="bank-publish-id-chips">
          <span className="bank-publish-id-chips-label">Question IDs — click to preview</span>
          <div className="bank-publish-id-chip-row">
            {idChips.slice(0, 24).map((id) => {
              const active = focusedId === String(id).toUpperCase()
              return (
                <button
                  key={id}
                  type="button"
                  className={`bank-publish-id-chip ${active ? 'active' : ''} ${reviewingDrafts ? 'draft' : 'published'}`}
                  onClick={() => handleIdClick(id)}
                  title={reviewingDrafts ? 'Draft' : 'Published'}
                >
                  {id}
                </button>
              )
            })}
            {idChips.length > 24 ? (
              <span className="form-hint">+{idChips.length - 24} more in the queue below</span>
            ) : null}
          </div>
        </div>
      )}

      {focusedQuestion && (
        <article className="bank-publish-preview card-inner">
          <div className="bank-publish-preview-head">
            <button
              type="button"
              className="bank-publish-preview-id"
              onClick={() => handleIdClick(focusedQuestion.id)}
            >
              {focusedQuestion.id}
            </button>
            <span className={`saved-bank-status saved-bank-status-${effectiveBankStatus(focusedQuestion)}`}>
              {bankStatusLabel(focusedQuestion)}
            </span>
            {focusedReviewState && (
              <span className={`bank-review-badge bank-review-badge-${focusedReviewState.id}`}>
                {focusedReviewState.label}
              </span>
            )}
            <span className="saved-subject">{focusedQuestion.subject}</span>
            <span className="saved-type">{getQuestionType(focusedQuestion.questionType).shortName}</span>
          </div>
          {focusedHardBlockers.length > 0 && (
            <p className="form-hint bank-publish-blocked-note">
              Publish blocked: {focusedHardBlockers.join(' ')}
            </p>
          )}
          {focusedHardBlockers.length === 0 && focusedBlockers.length > 0 && (
            <p className="form-hint">
              This matches a question already in the bank. Publish to compare, then choose Keep original
              only or Keep both.
            </p>
          )}
          <div className="bank-publish-preview-body">
            <MathText
              text={truncateForMathPreview(focusedPreview, focusedIsPassage ? 200 : 120, focusedQuestion.options)}
              questionContext={focusedPreview}
            />
          </div>
          <div className="bank-publish-preview-actions">
            {onView && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onView(focusedActionId)}>
                View full question
              </button>
            )}
            {focusedIsDraft && onPublish && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={focusedHardBlockers.length > 0}
                title={focusedHardBlockers.join(' ') || focusedBlockers.join(' ') || 'Publish after review'}
                onClick={() => onPublish(focusedActionId)}
              >
                Publish after review
              </button>
            )}
            {focusedIsDraft && onPublishSilent && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={focusedHardBlockers.length > 0}
                title={
                  focusedHardBlockers.join(' ') ||
                  focusedBlockers.join(' ') ||
                  'Publish silently — no student announcement'
                }
                onClick={() => onPublishSilent(focusedActionId)}
              >
                Publish (Silently)
              </button>
            )}
            {!focusedIsDraft && onUnpublish && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onUnpublish(focusedActionId)}
              >
                Move back to draft
              </button>
            )}
          </div>
        </article>
      )}

      {statusInView.length > 0 && (
        <p className="form-hint bank-bulk-publish-queue-note">
          Full questions with Publish and Edit are in the review queue below
          {statusInView.length > 10 ? ` (${statusInView.length} matching — shown 10 at a time).` : '.'}
        </p>
      )}

      <div className="bank-bulk-publish-actions">
        {reviewingDrafts ? (
          <>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!actionIds.length || !onPublishIds}
              onClick={() => onPublishIds?.(actionIds)}
            >
              Publish all {actionIds.length || ''} draft{actionIds.length === 1 ? '' : 's'} in view
            </button>
            {onPublishSilentIds ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!actionIds.length}
                onClick={() => onPublishSilentIds(actionIds)}
              >
                Publish all silently
              </button>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!actionIds.length || !onUnpublishIds}
            onClick={() => onUnpublishIds?.(actionIds)}
          >
            Move all {actionIds.length || ''} to draft
          </button>
        )}
        {!actionIds.length && !idChips.length && (
          <span className="form-hint">
            Filter by date, operator, or question ID, then review each row or use bulk action.
          </span>
        )}
      </div>
    </section>
  )
}
