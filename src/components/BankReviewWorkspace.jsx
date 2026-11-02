import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BankQuestionFilters from './BankQuestionFilters'
import BankBulkPublishPanel from './BankBulkPublishPanel'
import QuickTagPanel from './QuickTagPanel'
import MathText from './MathText'
import {
  BANK_REVIEW_MODES,
  REVIEW_PAGE_SIZE_DRAFT,
  REVIEW_PAGE_SIZE_PUBLISHED,
  buildReviewQueue,
  collectPyqYearsInBank,
  countAllReviewModes,
  inferReviewDatePreset,
  reviewDatePresetToRange,
  sliceReviewPage,
} from '../utils/bankReviewFilters.js'
import {
  blockersBesidesDuplicate,
  getQuestionPublishBlockers,
  getQuestionReviewState,
  summarizeQuestionReviewStates,
} from '../utils/questionBankReview.js'
import { getQuestionPyqYear } from '../utils/bankReviewFilters.js'
import { bankListActionTargetId, getPassageSetPreviewSnippet } from '../utils/passageBankList'
import { isPassageLinkedQuestion } from '../utils/passage'
import { truncateForMathPreview } from '../utils/truncateForMathPreview'
import { isQuestionMetaUntagged } from '../utils/bankListFilters'
import { effectiveBankStatus } from '../utils/questionUploadFilter.js'
import { getQuestionType } from '../data/questionTypes'
import BankScrollReviewCard from './BankScrollReviewCard.jsx'
import BankReviewPageBar from './BankReviewPageBar.jsx'
import PyqMakeSimilarPanel from './PyqMakeSimilarPanel.jsx'
import { canSeedSimilarFromQuestion } from '../utils/pyqDetect.js'
import { useAfterFirstPaint, useIdleReady } from '../hooks/useBankPanelTiming.js'
import { mergeAdjacentOptionTails } from '../utils/extendTruncatedStem.js'

const EMPTY_MODE_COUNTS = {
  drafts: 0,
  duplicates: 0,
  untagged: 0,
  pyq: 0,
  ready: 0,
  'needs-fix': 0,
  'needs-action': 0,
  warnings: 0,
}

const EMPTY_REVIEW_SUMMARY = {
  total: 0,
  needsTags: 0,
  needsFix: 0,
  needsReview: 0,
  ready: 0,
}

/**
 * Focused review workspace — workflow presets, meta/PYQ filters, queue navigation.
 * @param {{
 *   questions: import('../data/tests').Question[],
 *   reviewMode: import('../utils/bankReviewFilters.js').BankReviewModeId,
 *   onReviewModeChange: (mode: import('../utils/bankReviewFilters.js').BankReviewModeId) => void,
 *   viewTab: 'draft' | 'published',
 *   onViewTabChange: (tab: 'draft' | 'published') => void,
 *   filters: import('../utils/bankReviewFilters.js').BankReviewFilters,
 *   onFiltersChange: (f: import('../utils/bankReviewFilters.js').BankReviewFilters) => void,
 *   selectedId: string | null,
 *   onSelectId: (id: string | null) => void,
 *   onView: (id: string) => void,
 *   onQuickTagSave: (id: string, updates: Partial<import('../data/tests').Question>) => void,
 *   canPublish?: boolean,
 *   onPublish?: (id: string) => void,
 *   onUnpublish?: (id: string) => void,
 *   onPublishFilteredDrafts?: (ids: string[]) => void,
 *   onUnpublishFiltered?: (ids: string[]) => void,
 * }} props
 */
export default function BankReviewWorkspace({
  questions,
  reviewMode,
  onReviewModeChange,
  viewTab,
  onViewTabChange,
  filters,
  onFiltersChange,
  selectedId,
  onSelectId,
  onView,
  onQuickTagSave,
  canPublish = false,
  onPublish,
  onUnpublish,
  onPublishFilteredDrafts,
  onUnpublishFiltered,
}) {
  const [quickTagId, setQuickTagId] = useState(null)
  const [publishFocusId, setPublishFocusId] = useState('')
  const [page, setPage] = useState(0)
  const listRef = useRef(null)

  const scoped = useMemo(
    () => questions.filter((q) => effectiveBankStatus(q) === viewTab),
    [questions, viewTab],
  )

  const queue = useMemo(
    () => mergeAdjacentOptionTails(buildReviewQueue(questions, filters, reviewMode, viewTab)),
    [questions, filters, reviewMode, viewTab],
  )

  const pageSize = viewTab === 'draft' ? REVIEW_PAGE_SIZE_DRAFT : REVIEW_PAGE_SIZE_PUBLISHED
  const paged = useMemo(() => sliceReviewPage(queue, page, pageSize), [queue, page, pageSize])
  const pageItems = paged.items
  const cardsReady = useAfterFirstPaint(`${viewTab}:${reviewMode}:${paged.page}:${pageSize}`)
  const statsReady = useIdleReady(viewTab)

  useEffect(() => {
    if (paged.page !== page) setPage(paged.page)
  }, [paged.page, page])

  const reviewSummary = useMemo(
    () => (statsReady ? summarizeQuestionReviewStates(scoped) : { ...EMPTY_REVIEW_SUMMARY, total: scoped.length }),
    [scoped, statsReady],
  )
  const pyqYears = useMemo(() => (statsReady ? collectPyqYearsInBank(scoped) : []), [scoped, statsReady])

  const modeCounts = useMemo(() => {
    if (!statsReady) {
      return {
        ...EMPTY_MODE_COUNTS,
        drafts: questions.filter((q) => effectiveBankStatus(q) === 'draft').length,
      }
    }
    return countAllReviewModes(questions)
  }, [questions, statsReady])
  const publishedCount = useMemo(
    () => questions.filter((q) => effectiveBankStatus(q) === 'published').length,
    [questions],
  )

  const selectedIndex = useMemo(() => {
    if (!selectedId) return -1
    return queue.findIndex((q) => String(bankListActionTargetId(q)) === String(selectedId))
  }, [queue, selectedId])

  const selectedQuestion = selectedIndex >= 0 ? queue[selectedIndex] : null

  const reviewSort = filters.reviewSort === 'oldest' ? 'oldest' : 'newest'
  const reviewDatePreset = useMemo(
    () => inferReviewDatePreset(filters.dateFrom, filters.dateTo),
    [filters.dateFrom, filters.dateTo],
  )

  useEffect(() => {
    setPage(0)
  }, [reviewMode, viewTab, filters, reviewSort, reviewDatePreset])

  const goToIndex = useCallback(
    (idx) => {
      const q = queue[idx]
      if (!q) return
      const id = bankListActionTargetId(q)
      setPage(Math.floor(idx / pageSize))
      onSelectId(id)
      requestAnimationFrame(() => {
        document.getElementById(`review-row-${String(id).toUpperCase()}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        })
      })
    },
    [queue, onSelectId, pageSize],
  )

  const goToPage = useCallback((nextPage) => {
    setPage(nextPage)
    requestAnimationFrame(() => {
      listRef.current?.scrollTo?.({ top: 0 })
    })
  }, [])

  const goPrev = () => {
    if (selectedIndex > 0) goToIndex(selectedIndex - 1)
    else if (queue.length) goToIndex(0)
  }

  const goNext = () => {
    if (selectedIndex >= 0 && selectedIndex < queue.length - 1) goToIndex(selectedIndex + 1)
    else if (selectedIndex < 0 && queue.length) goToIndex(0)
  }

  const goToLatest = () => {
    if (!queue.length) return
    goToIndex(reviewSort === 'oldest' ? queue.length - 1 : 0)
  }

  useEffect(() => {
    if (!queue.length) {
      onSelectId(null)
      return
    }
    if (!selectedId) return
    const stillThere = queue.some((q) => String(bankListActionTargetId(q)) === String(selectedId))
    if (!stillThere) onSelectId(bankListActionTargetId(queue[0]))
  }, [queue, selectedId, onSelectId])

  const handlePublishCurrent = () => {
    if (!selectedQuestion || !onPublish) return
    const id = bankListActionTargetId(selectedQuestion)
    const blockers = blockersBesidesDuplicate(getQuestionPublishBlockers(selectedQuestion))
    if (blockers.length) return
    const result = onPublish(id)
    if (result === 'compare' || result === false) return
    if (selectedIndex < queue.length - 1) goToIndex(selectedIndex + 1)
  }

  return (
    <div className="bank-review-workspace">
      <section className="card bank-review-workflow" aria-label="Review workflow">
        <div className="bank-review-workflow-head">
          <div>
            <h3>Review workflow</h3>
            <p className="form-hint">
              Filter by exam, subject, chapter, topic, type, toughness, and source first. Then
              scroll the full questions below — Publish or Edit on each card.
            </p>
          </div>
          <div className="bank-status-tabs bank-review-status-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={viewTab === 'draft'}
              className={`bank-view-tab ${viewTab === 'draft' ? 'active' : ''}`}
              onClick={() => onViewTabChange('draft')}
            >
              Draft ({modeCounts.drafts ?? 0})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewTab === 'published'}
              className={`bank-view-tab ${viewTab === 'published' ? 'active' : ''}`}
              onClick={() => onViewTabChange('published')}
            >
              Published ({publishedCount})
            </button>
          </div>
        </div>

        <div className="bank-review-mode-grid" role="tablist" aria-label="Review queues">
          {BANK_REVIEW_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={reviewMode === m.id}
              className={`bank-review-mode-card tone-${m.tone} ${reviewMode === m.id ? 'active' : ''}`}
              onClick={() => onReviewModeChange(m.id)}
            >
              <strong>
                {statsReady || m.id === 'drafts' ? (modeCounts[m.id] ?? 0) : '…'}
              </strong>
              <span className="bank-review-mode-label">{m.label}</span>
              <span className="bank-review-mode-hint">{m.hint}</span>
            </button>
          ))}
        </div>

        <div className="bank-review-board" aria-label="Review summary for current tab">
          <button
            type="button"
            className="bank-review-board-card needs-tags"
            onClick={() => onReviewModeChange('untagged')}
          >
            <strong>{statsReady ? reviewSummary.needsTags : '…'}</strong>
            <span>Needs tags</span>
          </button>
          <button
            type="button"
            className="bank-review-board-card needs-fix"
            onClick={() => onReviewModeChange('needs-fix')}
          >
            <strong>{statsReady ? reviewSummary.needsFix : '…'}</strong>
            <span>Needs content fix</span>
          </button>
          <button
            type="button"
            className="bank-review-board-card needs-review"
            onClick={() => onReviewModeChange('warnings')}
          >
            <strong>{statsReady ? reviewSummary.needsReview : '…'}</strong>
            <span>Review warnings</span>
          </button>
          <button
            type="button"
            className="bank-review-board-card ready"
            onClick={() => onReviewModeChange('ready')}
          >
            <strong>{statsReady ? reviewSummary.ready : '…'}</strong>
            <span>Ready</span>
          </button>
        </div>
      </section>

      {reviewMode === 'pyq' && pyqYears.length > 0 && (
        <section className="card bank-review-pyq-bar">
          <label className="bank-review-pyq-year">
            <span>PYQ year</span>
            <select
              value={filters.pyqYear ?? ''}
              onChange={(e) => onFiltersChange({ ...filters, pyqYear: e.target.value })}
            >
              <option value="">All years</option>
              {pyqYears.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <p className="form-hint bank-review-pyq-hint">
            Combine with Subject → Unit → Chapter below to review one syllabus slice of PYQ.
          </p>
        </section>
      )}

      {questions.length > 0 && (
        <BankQuestionFilters
          questions={scoped}
          filters={filters}
          onFiltersChange={onFiltersChange}
          matchCount={queue.length}
          totalCount={scoped.length}
          hideBankStatusFilter
          viewTab={viewTab}
        />
      )}

      {statsReady && canPublish && viewTab === 'draft' && (onPublishFilteredDrafts || onUnpublishFiltered) && (
        <BankBulkPublishPanel
          viewTab={viewTab}
          filteredQuestions={queue}
          filters={filters}
          allQuestions={questions}
          canPublish={canPublish}
          onPublishIds={onPublishFilteredDrafts}
          onUnpublishIds={onUnpublishFiltered}
          onPublish={onPublish}
          onUnpublish={onUnpublish}
          onView={onView}
          focusId={publishFocusId}
          onFocusId={setPublishFocusId}
        />
      )}

      <section className="card bank-review-queue-layout">
        <div className="bank-review-sort-bar" aria-label="Review order and date">
          <label className="bank-review-sort-field">
            <span className="metadata-label">Order</span>
            <select
              value={reviewSort}
              onChange={(e) => {
                const v = e.target.value === 'oldest' ? 'oldest' : 'newest'
                onFiltersChange({ ...filters, reviewSort: v })
              }}
            >
              <option value="newest">Newest first (latest on top)</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <label className="bank-review-sort-field">
            <span className="metadata-label">Saved</span>
            <select
              value={reviewDatePreset}
              onChange={(e) => {
                const preset = e.target.value
                const range =
                  preset === 'today' || preset === '7d' || preset === '30d'
                    ? reviewDatePresetToRange(preset)
                    : reviewDatePresetToRange('all')
                onFiltersChange({ ...filters, ...range })
              }}
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={goToLatest}
            disabled={!queue.length}
            title="Jump to the most recently saved question in this queue"
          >
            View latest
          </button>
          <span className="form-hint bank-review-sort-hint">
            Custom range: use Upload date from / to in filters below.
          </span>
        </div>
        <div className="bank-review-queue-head">
          <div>
            <h3>
              Review queue ({queue.length})
              {queue.length !== scoped.length && (
                <span className="bank-review-queue-of"> of {scoped.length} in tab</span>
              )}
            </h3>
            <p className="form-hint">
              {BANK_REVIEW_MODES.find((m) => m.id === reviewMode)?.hint}
            </p>
          </div>
          {queue.length > 0 && (
            <div className="bank-review-queue-nav">
              <span className="bank-review-queue-pos">
                {selectedIndex >= 0 ? `${selectedIndex + 1} / ${queue.length}` : `— / ${queue.length}`}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={goPrev} disabled={!queue.length}>
                ← Prev
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={goNext}
                disabled={!queue.length || selectedIndex >= queue.length - 1}
              >
                Next →
              </button>
              {canPublish && viewTab === 'draft' && onPublish && selectedQuestion && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={blockersBesidesDuplicate(getQuestionPublishBlockers(selectedQuestion)).length > 0}
                  title={
                    blockersBesidesDuplicate(getQuestionPublishBlockers(selectedQuestion)).join(' ') ||
                    (getQuestionPublishBlockers(selectedQuestion).length
                      ? 'Matches a question already in the bank. Compare, then Keep original only or Keep both.'
                      : 'Publish this question')
                  }
                  onClick={handlePublishCurrent}
                >
                  Publish current
                </button>
              )}
            </div>
          )}
        </div>

        {queue.length === 0 ? (
          <p className="form-hint bank-review-empty">
            No questions match these filters. Clear filters or pick another exam / subject / chapter.
          </p>
        ) : (
          <>
          {queue.length > pageSize && (
            <BankReviewPageBar
              page={paged.page}
              totalPages={paged.totalPages}
              start={paged.start}
              end={paged.end}
              total={queue.length}
              onPage={goToPage}
            />
          )}
          <ul className="bank-review-queue-list" ref={listRef}>
            {!cardsReady ? (
              <li className="bank-review-queue-item">
                <p className="form-hint" role="status">
                  Showing {queue.length === 0 ? 0 : paged.start + 1}–{paged.end} of {queue.length} — loading
                  this page…
                </p>
              </li>
            ) : (
            pageItems.map((q) => {
              const actionId = bankListActionTargetId(q)
              const reviewState = getQuestionReviewState(q)
              const publishBlockers = getQuestionPublishBlockers(q)
              const hardPublishBlockers = blockersBesidesDuplicate(publishBlockers)
              const isSelected = String(selectedId) === String(actionId)
              const pyqYear = getQuestionPyqYear(q)
              const typeLabel = getQuestionType(q.questionType ?? 'single_correct')?.label ?? q.questionType
              const previewText = isPassageLinkedQuestion(q)
                ? getPassageSetPreviewSnippet(q, questions)
                : q.text
              const showFull = viewTab === 'draft'

              return (
                <li
                  key={q.id}
                  id={`review-row-${String(actionId).toUpperCase()}`}
                  className={`bank-review-queue-item ${isSelected ? 'selected' : ''} ${quickTagId === actionId ? 'quick-tag-open' : ''} ${showFull ? 'saved-card-full' : ''}`}
                >
                  {showFull ? (
                    <>
                    <BankScrollReviewCard
                      question={q}
                      allQuestions={questions}
                      canPublish={canPublish}
                      onPublish={onPublish ? () => onPublish(actionId) : undefined}
                      onEdit={() => onView(actionId)}
                      publishDisabled={hardPublishBlockers.length > 0}
                      publishTitle={
                        hardPublishBlockers.join(' ') ||
                        (publishBlockers.length
                          ? 'Matches a question already in the bank. Compare, then Keep original only or Keep both.'
                          : 'Publish')
                      }
                      extraActions={
                        <>
                          <button
                            type="button"
                            className={`btn btn-sm ${isQuestionMetaUntagged(q) ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setQuickTagId((id) => (id === actionId ? null : actionId))}
                          >
                            {quickTagId === actionId ? 'Close tags' : 'Tags'}
                          </button>
                        </>
                      }
                    />
                    {canSeedSimilarFromQuestion(q) ? (
                      <PyqMakeSimilarPanel seed={q} bankQuestions={questions} compact />
                    ) : null}
                    </>
                  ) : (
                    <>
                  <button
                    type="button"
                    className="bank-review-queue-select"
                    onClick={() => onSelectId(actionId)}
                  >
                    <div className="bank-review-queue-meta">
                      <span className="bank-review-queue-id">{q.id}</span>
                      {isQuestionMetaUntagged(q) && (
                        <span className="saved-untagged-badge">Untagged</span>
                      )}
                      <span className={`bank-review-badge bank-review-badge-${reviewState.id}`}>
                        {reviewState.label}
                      </span>
                      {pyqYear && <span className="bank-review-pyq-year-badge">PYQ {pyqYear}</span>}
                    </div>
                    <div className="bank-review-queue-tags">
                      {[q.subject, q.section || q.unit, q.chapter, q.topic, typeLabel, q.source]
                        .filter(Boolean)
                        .slice(0, 5)
                        .map((t, i) => (
                          <span key={`${t}-${i}`} className="bank-review-tag-chip">
                            {t}
                          </span>
                        ))}
                    </div>
                    <p className="bank-review-queue-preview">
                      <MathText
                        text={truncateForMathPreview(previewText, 100, q.options)}
                        questionContext={previewText}
                      />
                    </p>
                  </button>
                  <div className="bank-review-queue-actions">
                    {canPublish && viewTab === 'draft' && onPublish && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={hardPublishBlockers.length > 0}
                        title={
                          hardPublishBlockers.join(' ') ||
                          (publishBlockers.length
                            ? 'Matches a question already in the bank. Compare, then Keep original only or Keep both.'
                            : 'Publish')
                        }
                        onClick={() => onPublish(actionId)}
                      >
                        Publish
                      </button>
                    )}
                    {canPublish && viewTab === 'published' && onUnpublish && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onUnpublish(actionId)}
                      >
                        To draft
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onView(actionId)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${isQuestionMetaUntagged(q) ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setQuickTagId((id) => (id === actionId ? null : actionId))}
                    >
                      {quickTagId === actionId ? 'Close tags' : 'Tags'}
                    </button>
                  </div>
                    </>
                  )}
                  {quickTagId === actionId && (
                    <QuickTagPanel
                      question={q}
                      bankQuestions={questions}
                      onSave={(updates) => {
                        onQuickTagSave(actionId, updates)
                        setQuickTagId(null)
                      }}
                      onCancel={() => setQuickTagId(null)}
                    />
                  )}
                </li>
              )
            })
            )}
          </ul>
          {queue.length > pageSize && (
            <BankReviewPageBar
              page={paged.page}
              totalPages={paged.totalPages}
              start={paged.start}
              end={paged.end}
              total={queue.length}
              onPage={goToPage}
            />
          )}
          </>
        )}
      </section>
    </div>
  )
}
