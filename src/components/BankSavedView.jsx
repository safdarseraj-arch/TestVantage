import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import MathText from './MathText'
import BankQuestionFilters from './BankQuestionFilters'
import BankBulkPublishPanel from './BankBulkPublishPanel'
import QuickTagPanel from './QuickTagPanel'
import { getQuestionType } from '../data/questionTypes'
import {
  BANK_UNTAGGED_FILTER,
  bankListFiltersForViewTab,
  isQuestionMetaUntagged,
  listBankQuestionsFast,
} from '../utils/bankListFilters'
import { placeDuplicateReviewsBesideOriginals } from '../utils/detectDuplicateQuestion.js'
import { useAfterFirstPaint, useIdleReady } from '../hooks/useBankPanelTiming.js'
import {
  blockersBesidesDuplicate,
  getQuestionPublishBlockers,
  getQuestionReviewState,
  summarizeQuestionReviewStates,
} from '../utils/questionBankReview.js'
import {
  bankListActionTargetId,
  getPassageSetListLabel,
  getPassageSetPreviewSnippet,
} from '../utils/passageBankList'
import { mergeAdjacentOptionTails } from '../utils/extendTruncatedStem.js'
import { isPassageLinkedQuestion } from '../utils/passage'
import { formatExamLabels, formatToughnessLabel } from '../utils/questionMetadata'
import { truncateForMathPreview } from '../utils/truncateForMathPreview'
import { isHybridQuestion } from '../utils/imageQuestion'
import {
  clearQuestionBank,
  loadQuestionBank,
  repairUploadedQuestions,
} from '../utils/questionBank'
import { getBankStorageDiagnostics } from '../utils/bankStorageRecovery'
import { navigateCopyBankFromLocalhost } from '../utils/bankOriginRedirect'
import { repairBankFromBackups } from '../utils/questionBank'
import {
  downloadFullBankBackup,
  downloadQuestionsCsv,
  downloadQuestionsJson,
} from '../utils/csvQuestions'
import BankStorageTable from './BankStorageTable.jsx'
import BankServerSyncPanel from './BankServerSyncPanel.jsx'
import { syncStatusLabel } from '../utils/bankServerSync.js'
import {
  formatQuestionUploadDate,
  questionFirstSavedTimestamp,
  questionUploadOperatorLabel,
} from '../utils/questionUploadFilter.js'
import { bankStatusLabel, effectiveBankStatus } from '../utils/questionUploadFilter.js'
import { isSilentPublished } from '../utils/teacherQuestionBank.js'
import DraftFieldConfidence from './DraftFieldConfidence.jsx'
import BankScrollReviewCard from './BankScrollReviewCard.jsx'
import BankFamilyBadge from './BankFamilyBadge.jsx'
import ReportQuestionButton from './ReportQuestionModal.jsx'
import BankReviewPageBar from './BankReviewPageBar.jsx'
import {
  REVIEW_PAGE_SIZE_DRAFT,
  REVIEW_PAGE_SIZE_PUBLISHED,
  sliceReviewPage,
} from '../utils/bankReviewFilters.js'

/**
 * @param {{
 *   questions: import('../data/tests').Question[],
 *   viewTab: 'draft' | 'published',
 *   onSwitchViewTab?: (tab: 'draft' | 'published') => void,
 *   filters: import('../utils/bankListFilters.js').BankListFilters,
 *   onFiltersChange: (f: import('../utils/bankListFilters.js').BankListFilters) => void,
 *   onView: (id: string) => void,
 *   onViewMeta: (id: string) => void,
 *   onEditQuestionAnswer: (q: import('../data/tests').Question) => void,
 *   onDelete: (id: string) => void,
 *   onQuickTagSave: (id: string, updates: Partial<import('../data/tests').Question>) => void,
 *   onRefresh: () => void,
 *   onMessage: (type: string, text: string) => void,
 *   onBackupImport: (file: File | undefined, opts: { merge: boolean }) => void,
 *   canPublish?: boolean,
 *   onPublish?: (id: string) => void,
 *   onPublishSilent?: (id: string) => void,
 *   onUnpublish?: (id: string) => void,
 *   onPublishFilteredDrafts?: (ids: string[], opts?: { silent?: boolean }) => void,
 *   onUnpublishFiltered?: (ids: string[]) => void,
 *   teacherPrivateMode?: boolean,
 * }} props
 */
export default function BankSavedView({
  questions,
  viewTab,
  filters,
  onFiltersChange,
  onView,
  onViewMeta,
  onEditQuestionAnswer,
  onDelete,
  onQuickTagSave,
  onRefresh,
  onMessage,
  onBackupImport,
  onSwitchViewTab,
  canPublish = false,
  onPublish,
  onPublishSilent,
  onUnpublish,
  onPublishFilteredDrafts,
  onUnpublishFiltered,
  teacherPrivateMode = false,
}) {
  const [publishFocusId, setPublishFocusId] = useState('')
  const [quickTagId, setQuickTagId] = useState(null)

  const draftCountInBank = useMemo(
    () => questions.filter((q) => effectiveBankStatus(q) === 'draft').length,
    [questions],
  )
  const publishedCountInBank = useMemo(
    () => questions.filter((q) => effectiveBankStatus(q) === 'published').length,
    [questions],
  )
// eslint-disable-next-line react-hooks/exhaustive-deps
  const storageDiag = useMemo(() => getBankStorageDiagnostics(), [questions.length])

  const scoped = useMemo(() => {
    return mergeAdjacentOptionTails(questions.filter((q) => effectiveBankStatus(q) === viewTab))
  }, [questions, viewTab])

  const metaFilters = useMemo(() => bankListFiltersForViewTab(filters), [filters])
  const filtered = useMemo(
    () => listBankQuestionsFast(scoped, metaFilters),
    [scoped, metaFilters],
  )
  const [page, setPage] = useState(0)
  const pageSize = viewTab === 'draft' ? REVIEW_PAGE_SIZE_DRAFT : REVIEW_PAGE_SIZE_PUBLISHED
  const paged = useMemo(() => sliceReviewPage(filtered, page, pageSize), [filtered, page, pageSize])
  const cardsReady = useAfterFirstPaint(`${viewTab}:${paged.page}:${pageSize}`)
  const heavyReady = useIdleReady(viewTab)

  useEffect(() => {
    setPage(0)
  }, [viewTab, filters])

  useEffect(() => {
    if (paged.page !== page) setPage(paged.page)
  }, [paged.page, page])

  const visibleGroups = useMemo(() => {
    if (!cardsReady) return []
    const untagged = []
    const tagged = []
    for (const q of paged.items) {
      if (isQuestionMetaUntagged(q)) untagged.push(q)
      else tagged.push(q)
    }
    const groups = []
    if (untagged.length) {
      groups.push({
        id: BANK_UNTAGGED_FILTER,
        title: 'Untagged',
        questions: placeDuplicateReviewsBesideOriginals(untagged),
      })
    }
    if (tagged.length) {
      groups.push({
        id: 'classified',
        title: untagged.length ? 'Classified' : '',
        questions: placeDuplicateReviewsBesideOriginals(tagged),
      })
    }
    return groups
  }, [cardsReady, paged.items])

  const reviewSummary = useMemo(
    () =>
      heavyReady
        ? summarizeQuestionReviewStates(scoped)
        : { total: scoped.length, needsTags: 0, needsFix: 0, needsReview: 0, ready: 0 },
    [heavyReady, scoped],
  )

  const _quickTagQuestion = quickTagId
    ? questions.find((q) => String(q.id) === String(quickTagId)) ?? null
    : null

  const focusQuestionForPublish = (id) => {
    const normalized = String(id ?? '').trim().toUpperCase()
    if (!normalized) return
    setPublishFocusId(normalized)
    onFiltersChange({
      ...filters,
      questionIdQuery: normalized,
    })
    requestAnimationFrame(() => {
      document.querySelector('.bank-bulk-publish')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const title = viewTab === 'published' ? 'Published questions' : 'Draft questions'
  const hint = teacherPrivateMode
    ? viewTab === 'published'
      ? 'In your bank and the main bank. Delete removes from your bank only; silently published copies stay in the main bank.'
      : 'Your drafts also sit in the main Review & publish queue. Filter by chapter, topic, type, or toughness. Publish silently when ready.'
    : viewTab === 'published'
      ? 'Live in papers and student practice. Editing moves a question back to Draft. Gemini tags can be wrong: click Metatags (or Edit tags), change Type, then Save metatags. Passage number questions are NVQ, not SCQ — if Gemini chose SCQ or PSCQ, change Type to NVQ, or PIVQ when several parts share one passage.'
      : 'Not yet in papers — filter by exam, subject, chapter, topic, type, toughness, or source, then scroll the full questions. Publish or Edit on each card. No need to open one, close, then open the next.'

  return (
    <section className="card bank-saved-list">
      <div className="saved-list-header">
        <div>
          <h3>
            {title} ({scoped.length})
          </h3>
          <p className="form-hint saved-list-order-hint">{hint}</p>
        </div>
        <div className="extract-actions">
          {!teacherPrivateMode ? (
            <Link
              to="/question-bank/review?view=draft&mode=drafts"
              className="btn btn-primary btn-sm"
            >
              Open review workspace
            </Link>
          ) : null}
          {questions.length > 0 && (
            <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => downloadQuestionsCsv(questions)}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => downloadQuestionsJson(questions)}
            >
              Export JSON
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => downloadFullBankBackup(loadQuestionBank())}
            >
              Full backup
            </button>
            <label className="btn btn-ghost btn-sm file-btn">
              Merge backup
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  onBackupImport(e.target.files?.[0], { merge: true })
                  e.target.value = ''
                }}
              />
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const repaired = repairUploadedQuestions()
                onRefresh()
                onMessage('success', `Repaired formatting for ${repaired.length} questions.`)
              }}
            >
              Repair all
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (confirm('Delete all questions in bank?')) {
                  clearQuestionBank()
                  onRefresh()
                }
              }}
            >
              Clear all
            </button>
            </>
          )}
        </div>
      </div>

      {questions.length > 0 && heavyReady && (
        <BankServerSyncPanel
          questions={questions}
          onRefresh={onRefresh}
          onMessage={onMessage}
        />
      )}

      {questions.length > 0 && (
        <BankQuestionFilters
          questions={scoped}
          filters={filters}
          onFiltersChange={onFiltersChange}
          matchCount={filtered.length}
          totalCount={scoped.length}
          hideBankStatusFilter
          viewTab={viewTab}
        />
      )}

      {questions.length > 0 && scoped.length === 0 && viewTab === 'draft' ? (
        <p className="form-hint bank-saved-empty-tab-hint" role="status">
          No <strong>draft</strong> questions in this sub-bank tab
          {publishedCountInBank > 0 ? ' (try the Published tab)' : ''}. Hybrid AI rows sit under the{' '}
          <strong>Hybrid AI</strong> sub-bank — use{' '}
          <Link to="/question-bank?hub=view&view=draft&subBank=ai">Hybrid AI drafts</Link> or clear
          upload-date filters.
        </p>
      ) : null}

      {questions.length > 0 && (
        <div className="bank-review-board" aria-label="Question bank review board">
          <div className="bank-review-board-card needs-tags">
            <strong>{heavyReady ? reviewSummary.needsTags : '…'}</strong>
            <span>Needs tags</span>
          </div>
          <div className="bank-review-board-card needs-fix">
            <strong>{heavyReady ? reviewSummary.needsFix : '…'}</strong>
            <span>Needs content fix</span>
          </div>
          <div className="bank-review-board-card needs-review">
            <strong>{heavyReady ? reviewSummary.needsReview : '…'}</strong>
            <span>Review warnings</span>
          </div>
          <div className="bank-review-board-card ready">
            <strong>{heavyReady ? reviewSummary.ready : '…'}</strong>
            <span>Ready</span>
          </div>
        </div>
      )}

      {heavyReady && canPublish && (onPublishFilteredDrafts || onUnpublishFiltered) && (
        <BankBulkPublishPanel
          viewTab={viewTab}
          filteredQuestions={filtered}
          filters={filters}
          allQuestions={questions}
          canPublish={canPublish}
          onPublishIds={onPublishFilteredDrafts}
          onPublishSilentIds={
            onPublishFilteredDrafts
              ? (ids) => onPublishFilteredDrafts(ids, { silent: true })
              : undefined
          }
          onUnpublishIds={onUnpublishFiltered}
          onPublish={onPublish}
          onPublishSilent={onPublishSilent}
          onUnpublish={onUnpublish}
          onView={onView}
          focusId={publishFocusId}
          onFocusId={setPublishFocusId}
        />
      )}

      {questions.length > 0 && heavyReady && (
        <BankStorageTable
          questions={questions}
          onRefresh={onRefresh}
          onMessage={onMessage}
        />
      )}

      {questions.length === 0 ? (
        <div className="bank-empty-recovery card-inner">
          <p className="form-hint">
            <strong>No questions loaded on {window.location.origin}.</strong> Storage key has{' '}
            {storageDiag.bytes > 0 || storageDiag.backupBytes > 0 ? (
              <>
                main: <strong>{storageDiag.count}</strong> question(s),{' '}
                {Math.round(storageDiag.bytes / 1024)} KB
                {storageDiag.backupCount > 0 ? (
                  <>
                    {' '}
                    · backup: <strong>{storageDiag.backupCount}</strong> (
                    {Math.round((storageDiag.backupBytes ?? 0) / 1024)} KB)
                  </>
                ) : null}
                {!storageDiag.parseOk ? ' — format not recognized, try Restore below' : ''}
              </>
            ) : (
              'no saved bank data in this browser'
            )}
            . The app tries to copy from <code>localhost:5173</code> automatically when you open
            this page. Use the button below if that did not run.
          </p>
          <div className="extract-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => navigateCopyBankFromLocalhost('/question-bank?hub=view&view=draft')}
            >
              Copy from localhost:5173
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const n = repairBankFromBackups()
                onRefresh()
                onMessage(
                  n > 0 ? 'success' : 'error',
                  n > 0
                    ? `Restored ${n} question(s) from backup.`
                    : 'No backup in this browser — use Copy from localhost or Import JSON.',
                )
              }}
            >
              Restore from backup
            </button>
            <Link to="/merge-banks" className="btn btn-ghost btn-sm">
              Import JSON file
            </Link>
            <label className="btn btn-ghost btn-sm file-btn">
              Import backup JSON
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  onBackupImport(e.target.files?.[0], { merge: false })
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>
      ) : scoped.length === 0 ? (
        <div className="bank-empty-recovery card-inner">
          <p className="form-hint">
            {viewTab === 'draft'
              ? `No draft questions — ${publishedCountInBank} published, ${questions.length} total. New uploads appear here.`
              : `No published questions yet — ${draftCountInBank} draft, ${questions.length} total. Publish from the Draft tab.`}
          </p>
          {viewTab === 'draft' && draftCountInBank === 0 && publishedCountInBank > 0 && onSwitchViewTab && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onSwitchViewTab('published')}>
              View published ({publishedCountInBank})
            </button>
          )}
          {viewTab === 'published' && publishedCountInBank === 0 && draftCountInBank > 0 && onSwitchViewTab && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onSwitchViewTab('draft')}>
              View drafts ({draftCountInBank})
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <p className="form-hint">No questions match these filters.</p>
      ) : (
        <div className="saved-question-grouped">
          {filtered.length > pageSize && (
            <BankReviewPageBar
              page={paged.page}
              totalPages={paged.totalPages}
              start={paged.start}
              end={paged.end}
              total={filtered.length}
              onPage={setPage}
            />
          )}
          {!cardsReady ? (
            <p className="form-hint" role="status">
              Showing {filtered.length === 0 ? 0 : paged.start + 1}–{paged.end} of {filtered.length}{' '}
              — loading this page…
            </p>
          ) : (
          visibleGroups.map((group) => (
            <section key={group.id} className="bank-list-group">
              {group.title && viewTab === 'draft' ? (
                <h4 className="bank-list-group-title">
                  {group.title}
                  <span className="bank-list-group-count">({group.questions.length})</span>
                </h4>
              ) : null}
              <ul className="saved-question-list">
                {group.questions.map((q) => {
                  const actionId = bankListActionTargetId(q)
                  const passageSetLabel = getPassageSetListLabel(q, questions)
                  const isPassageBlock = isPassageLinkedQuestion(q) && !!passageSetLabel
                  const previewText = isPassageBlock
                    ? getPassageSetPreviewSnippet(q, questions)
                    : q.text
                  const reviewState = getQuestionReviewState(q)
                  const publishBlockers = getQuestionPublishBlockers(q)
                  const hardPublishBlockers = blockersBesidesDuplicate(publishBlockers)
                  const duplicateCompareTitle = publishBlockers.length
                    ? 'Matches a question already in the bank. Compare, then Keep original only or Keep both.'
                    : ''
                  return (
                  <li
                    key={q.id}
                    id={q.id ? `bank-row-${String(q.id).toUpperCase()}` : undefined}
                    className={`${quickTagId === actionId ? 'quick-tag-open' : ''} ${isPassageBlock ? 'saved-passage-set-row' : ''} ${viewTab === 'draft' ? 'saved-card-full' : ''}`}
                  >
                    <div className="saved-detail">
                      {isQuestionMetaUntagged(q) ? (
                        <span className="saved-untagged-badge">Untagged</span>
                      ) : null}
                      {q.duplicateOfId ? (
                        <span
                          className="saved-duplicate-badge"
                          title="Kept as a draft so you can compare with the original"
                        >
                          Possible duplicate — compare with original
                        </span>
                      ) : null}
                      {q.id && canPublish ? (
                        <button
                          type="button"
                          className="saved-question-id saved-question-id-btn"
                          onClick={() => focusQuestionForPublish(q.id)}
                          title="Show on bulk publish panel"
                        >
                          {q.id}
                        </button>
                      ) : q.id ? (
                        <span className="saved-question-id">{q.id}</span>
                      ) : null}
                      <BankFamilyBadge question={q} />
                      {passageSetLabel && (
                        <span className="saved-passage-set-badge">{passageSetLabel}</span>
                      )}
                      <span className="saved-subject">{q.subject}</span>
                      {q.section && <span className="saved-section">{q.section}</span>}
                      {q.chapter && <span className="saved-chapter">{q.chapter}</span>}
                      {q.topic && <span className="saved-topic">{q.topic}</span>}
                      <span className="saved-type">{getQuestionType(q.questionType).shortName}</span>
                      {q.examIds?.length > 0 && (
                        <span className="saved-exams">{formatExamLabels(q.examIds)}</span>
                      )}
                      {q.toughnessLevel != null && q.toughnessLevel >= 1 && (
                        <span className="saved-toughness">{formatToughnessLabel(q.toughnessLevel)}</span>
                      )}
                      {q.source && <span className="saved-source">{q.source}</span>}
                      <span className="saved-upload-date" title="When saved to bank">
                        {formatQuestionUploadDate(questionFirstSavedTimestamp(q))}
                      </span>
                      <span className="saved-upload-operator" title="Teacher / operator who saved">
                        {questionUploadOperatorLabel(q)}
                      </span>
                      <span
                        className={`saved-bank-status saved-bank-status-${effectiveBankStatus(q)}`}
                        title={
                          effectiveBankStatus(q) === 'published'
                            ? 'Available in papers and practice'
                            : 'Draft — publish to use in papers'
                        }
                      >
                        {bankStatusLabel(q)}
                      </span>
                      <DraftFieldConfidence
                        question={q}
                        variant="compact"
                        showUnknown={effectiveBankStatus(q) === 'draft'}
                      />
                      {isSilentPublished(q) ? (
                        <span className="saved-bank-status saved-bank-status-silent" title="Published without student announcement">
                          Silent
                        </span>
                      ) : null}
                      {q.syncStatus && q.syncStatus !== 'live' && (
                        <span className={`saved-sync-badge saved-sync-${q.syncStatus}`}>
                          {syncStatusLabel(q)}
                        </span>
                      )}
                      {q.syncStatus === 'live' && (
                        <span className="saved-sync-badge saved-sync-live">Live</span>
                      )}
                      {isHybridQuestion(q) && !isPassageBlock && (
                        <span className="saved-hybrid-badge">Hybrid</span>
                      )}
                      <span
                        className={`bank-review-badge bank-review-badge-${reviewState.id}`}
                        title={[...reviewState.blockers, ...reviewState.warnings].join(' ') || reviewState.label}
                      >
                        {reviewState.label}
                      </span>
                      {viewTab === 'draft' ? (
                        <BankScrollReviewCard
                          question={q}
                          allQuestions={questions}
                          canPublish={canPublish}
                          onPublish={onPublish ? () => onPublish(actionId) : undefined}
                          onEdit={() => onEditQuestionAnswer(q)}
                          publishDisabled={hardPublishBlockers.length > 0}
                          publishTitle={hardPublishBlockers.join(' ') || duplicateCompareTitle || 'Publish after review'}
                        />
                      ) : (
                        <p className="saved-text">
                          <MathText
                            text={truncateForMathPreview(previewText, isPassageBlock ? 160 : 80, q.options)}
                            questionContext={previewText}
                          />
                        </p>
                      )}
                    </div>
                    <div className="saved-item-actions">
                      {viewTab !== 'draft' && canPublish && effectiveBankStatus(q) === 'draft' && onPublish && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={hardPublishBlockers.length > 0}
                          title={hardPublishBlockers.join(' ') || duplicateCompareTitle || 'Publish after review'}
                          onClick={() => onPublish(actionId)}
                        >
                          Publish
                        </button>
                      )}
                      {canPublish && effectiveBankStatus(q) === 'draft' && onPublishSilent && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={hardPublishBlockers.length > 0}
                          title={hardPublishBlockers.join(' ') || duplicateCompareTitle || 'Publish silently to main bank'}
                          onClick={() => onPublishSilent(actionId)}
                        >
                          Publish (Silently)
                        </button>
                      )}
                      {canPublish && effectiveBankStatus(q) === 'published' && onUnpublish && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => onUnpublish(actionId)}
                        >
                          Move to draft
                        </button>
                      )}
                      {viewTab !== 'draft' ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onView(actionId)}
                        >
                          {q.duplicateOfId ? 'Compare' : 'Review'}
                        </button>
                      ) : null}
                      {viewTab !== 'draft' ? (
                        <ReportQuestionButton questionId={q.id} source="bank" compact />
                      ) : null}
                      <button
                        type="button"
                        className={`btn btn-sm ${isQuestionMetaUntagged(q) ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={() =>
                          setQuickTagId((id) => (id === actionId ? null : actionId))
                        }
                      >
                        {quickTagId === actionId
                          ? 'Close tags'
                          : isQuestionMetaUntagged(q)
                            ? 'Complete tags'
                            : 'Edit tags'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onViewMeta(actionId)}
                      >
                        Metatags
                      </button>
                      {viewTab !== 'draft' ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => onEditQuestionAnswer(q)}
                      >
                        {isPassageBlock ? 'Edit passage set' : 'Q & A'}
                      </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const msg = teacherPrivateMode
                            ? effectiveBankStatus(q) === 'published'
                              ? 'Remove from your bank only? It will stay in the main question bank.'
                              : 'Delete this draft from your bank?'
                            : 'Delete this question from the bank?'
                          if (!confirm(msg)) return
                          onDelete(actionId)
                          if (quickTagId === actionId) setQuickTagId(null)
                        }}
                      >
                        {teacherPrivateMode && effectiveBankStatus(q) === 'published'
                          ? 'Remove from mine'
                          : 'Delete'}
                      </button>
                    </div>
                    {quickTagId === actionId && (
                      <QuickTagPanel
                        question={q}
                        bankQuestions={questions}
                        onSave={(updates) => {
                          onQuickTagSave(actionId, updates)
                          setQuickTagId(null)
                        }}
                        onCancel={() => setQuickTagId(null)}
                        onHierarchyRenamed={() => onRefresh()}
                      />
                    )}
                  </li>
                  )
                })}
              </ul>
            </section>
          ))
          )}
          {filtered.length > pageSize && (
            <BankReviewPageBar
              page={paged.page}
              totalPages={paged.totalPages}
              start={paged.start}
              end={paged.end}
              total={filtered.length}
              onPage={setPage}
            />
          )}
        </div>
      )}

      <p className="form-hint bank-view-footer-hint">
        Stored for <strong>{window.location.origin}</strong> only.{' '}
        <Link to="/merge-banks">Merge banks from another port</Link>
      </p>
    </section>
  )
}

