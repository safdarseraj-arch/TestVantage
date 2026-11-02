import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PortalPage from '../components/PortalPage'
import QuestionBankHubNav from '../components/QuestionBankHubNav'
import SavedQuestionViewer from '../components/SavedQuestionViewer'
import { useAuth } from '../context/AuthContext'
import { PERMS } from '../utils/permissions'
import {
  countOpenQuestionReports,
  listQuestionReports,
  markQuestionReportReviewed,
  questionBankViewUrl,
  reportReasonLine,
  reporterDisplayName,
} from '../utils/questionReports.js'
import {
  markQuestionReportReviewedRemote,
  refreshQuestionReportsFromRemote,
} from '../utils/questionReportsApi.js'
import {
  peekUploadedQuestions,
  repairBankFromBackups,
  loadUploadedQuestions,
  updateUploadedQuestion,
} from '../utils/questionBank'
import { effectiveBankStatus } from '../utils/questionUploadFilter'

function formatWhen(ts) {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return '—'
  try {
    return new Date(n).toLocaleString()
  } catch {
    return '—'
  }
}

export default function QuestionReports() {
  const { hasPermission } = useAuth()
  const canOpenBank = hasPermission(PERMS.UPLOAD_QUESTIONS) || hasPermission(PERMS.ACCESS_MAIN_QUESTION_BANK)
  const [reports, setReports] = useState(() => listQuestionReports())
  const [filter, setFilter] = useState('open')
  const [viewingId, setViewingId] = useState(null)
  const [saved, setSaved] = useState(() => {
    const peek = peekUploadedQuestions()
    if (peek.length > 0) return peek
    repairBankFromBackups()
    return loadUploadedQuestions()
  })

  const refresh = useCallback(async () => {
    await refreshQuestionReportsFromRemote()
    setReports(listQuestionReports())
    const peek = peekUploadedQuestions()
    setSaved(peek.length ? peek : loadUploadedQuestions())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const openCount = useMemo(
    () => reports.filter((r) => r.status === 'open').length,
    [reports],
  )
  const shown = useMemo(() => {
    if (filter === 'open') return reports.filter((r) => r.status === 'open')
    if (filter === 'reviewed') return reports.filter((r) => r.status === 'reviewed')
    return reports
  }, [reports, filter])

  const viewingQuestion = useMemo(
    () => (viewingId ? saved.find((q) => String(q.id) === String(viewingId)) ?? null : null),
    [saved, viewingId],
  )

  const draftCount = saved.filter((q) => effectiveBankStatus(q) !== 'published').length
  const publishedCount = saved.length - draftCount

  const handleReviewed = async (id) => {
    markQuestionReportReviewed(id)
    await markQuestionReportReviewedRemote(id)
    setReports(listQuestionReports())
  }

  return (
    <PortalPage
      role="upload"
      className="page question-reports-page"
      eyebrow="Question bank"
      title="Question reports"
      subtitle="Problems students or teachers flagged. Mark as reviewed after you check — nothing is deleted or unpublished from a report."
      actions={
        <Link to="/question-bank?hub=view" className="btn btn-ghost btn-sm">
          ← Saved questions
        </Link>
      }
    >
      <QuestionBankHubNav
        activeSection="reports"
        viewTab="draft"
        onViewTabChange={() => {}}
        showReviewLink={canOpenBank}
        counts={{
          total: saved.length,
          draft: draftCount,
          published: publishedCount,
          reportsOpen: openCount || countOpenQuestionReports(),
        }}
      />

      <div className="bank-status-tabs" role="tablist" aria-label="Report status">
        <button
          type="button"
          role="tab"
          className={`bank-view-tab ${filter === 'open' ? 'active' : ''}`}
          aria-selected={filter === 'open'}
          onClick={() => setFilter('open')}
        >
          Open ({openCount})
        </button>
        <button
          type="button"
          role="tab"
          className={`bank-view-tab ${filter === 'reviewed' ? 'active' : ''}`}
          aria-selected={filter === 'reviewed'}
          onClick={() => setFilter('reviewed')}
        >
          Reviewed ({reports.length - openCount})
        </button>
        <button
          type="button"
          role="tab"
          className={`bank-view-tab ${filter === 'all' ? 'active' : ''}`}
          aria-selected={filter === 'all'}
          onClick={() => setFilter('all')}
        >
          All ({reports.length})
        </button>
      </div>

      {shown.length === 0 ? (
        <section className="card">
          <p className="form-hint">
            {filter === 'open'
              ? 'No open reports right now.'
              : 'No reports in this list yet.'}
          </p>
        </section>
      ) : (
        <ul className="question-reports-list">
          {shown.map((row) => (
            <li key={row.id} className="card question-report-card">
              <div className="question-report-card-top">
                <span className={`question-report-status question-report-status--${row.status}`}>
                  {row.status === 'open' ? 'Open' : 'Reviewed'}
                </span>
                <span className="question-report-when">{formatWhen(row.createdAt)}</span>
              </div>
              <p className="question-report-reason">{reportReasonLine(row)}</p>
              <p className="form-hint question-report-meta">
                Question <strong>{row.questionId}</strong>
                {' · '}
                From {reporterDisplayName(row)}
                {row.source ? ` · ${row.source}` : ''}
              </p>
              {row.comment ? <p className="question-report-comment">{row.comment}</p> : null}
              <div className="question-report-actions">
                {saved.some((q) => String(q.id) === String(row.questionId)) ? (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setViewingId(row.questionId)}
                  >
                    Open question
                  </button>
                ) : (
                  <Link
                    className="btn btn-ghost btn-sm"
                    to={questionBankViewUrl(row.questionId)}
                  >
                    Look up in bank
                  </Link>
                )}
                {row.status === 'open' ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleReviewed(row.id)}
                  >
                    Mark reviewed
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewingQuestion ? (
        <SavedQuestionViewer
          question={viewingQuestion}
          allQuestions={saved}
          onClose={() => setViewingId(null)}
          onSave={(updates) => {
            const next = updateUploadedQuestion(viewingQuestion.id, updates)
            if (next) setSaved(peekUploadedQuestions())
            return !!next
          }}
          onEditFull={() => {
            setViewingId(null)
          }}
          onDelete={() => {
            setViewingId(null)
          }}
        />
      ) : null}
    </PortalPage>
  )
}
