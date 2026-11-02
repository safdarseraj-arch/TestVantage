import { useState } from 'react'
import { Link } from 'react-router-dom'
import { hybridSyncUserMessage, syncHybridAiIntoQuestionBank } from '../utils/hybridAiSync.js'
import { peekUploadedQuestions } from '../utils/questionBank.js'
import { countHybridAiDrafts } from '../utils/questionBankSubBank.js'
import { SUB_BANK_TYPE_AI } from '../utils/subBankType.js'

/**
 * Short Review and approve path for Hybrid AI drafts.
 * @param {{
 *   draftCount: number
 *   hybridDraftCount: number
 *   onSynced?: (result: { added: number, ids: string[] }) => void
 *   onOpenReview?: () => void
 *   subBankActive?: string
 * }} props
 */
export default function BankReviewApproveStrip({
  draftCount,
  hybridDraftCount,
  onSynced,
  onOpenReview,
  subBankActive = '',
}) {
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState('')

  const handleSync = async () => {
    setSyncing(true)
    setSyncNote('')
    try {
      const result = await syncHybridAiIntoQuestionBank({ approvedOnly: false })
      onSynced?.(result)
      const localHybrid = countHybridAiDrafts(peekUploadedQuestions())
      const msg = hybridSyncUserMessage(result, { localHybridDraftCount: localHybrid })
      setSyncNote(msg ?? 'Sync finished.')
    } catch (err) {
      setSyncNote(err instanceof Error ? err.message : 'Sync failed — is Hybrid AI running?')
    } finally {
      setSyncing(false)
    }
  }

  const reviewHref =
    subBankActive === SUB_BANK_TYPE_AI
      ? '/question-bank?hub=review&view=draft&mode=drafts&subBank=ai&reviewSort=newest&reviewDays=7d'
      : '/question-bank?hub=review&view=draft&mode=drafts&reviewSort=newest&reviewDays=7d'

  return (
    <section className="card bank-review-approve-strip" aria-label="Review and approve">
      <div className="bank-review-approve-head">
        <div>
          <h3>Review &amp; approve</h3>
          <p className="form-hint">
            Hybrid AI saves as <strong>drafts</strong> (source Hybrid AI, temporary ids like{' '}
            <code>TV-AI-…</code>). Sync, review, then publish — approval assigns an id like{' '}
            <code>MAM00001I</code>.
          </p>
        </div>
        {draftCount > 0 ? (
          <span className="bank-review-approve-badge" title="Draft questions in this view">
            {draftCount} pending
          </span>
        ) : null}
      </div>

      <ol className="bank-review-approve-steps">
        <li>
          <strong>Sync</strong> — pull new rows from Postgres
          <button
            type="button"
            className="btn btn-secondary btn-sm bank-review-sync-btn"
            disabled={syncing}
            onClick={() => void handleSync()}
          >
            {syncing ? 'Syncing…' : 'Sync from Hybrid AI'}
          </button>
        </li>
        <li>
          <strong>Review</strong> — fix tags and content
          {onOpenReview ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenReview}>
              Open review
            </button>
          ) : (
            <Link to={reviewHref} className="btn btn-ghost btn-sm">
              Open review
            </Link>
          )}
        </li>
        <li>
          <strong>Publish</strong> — make live for tests
        </li>
      </ol>

      {hybridDraftCount > 0 ? (
        <p className="form-hint bank-review-hybrid-hint">
          <strong>{hybridDraftCount}</strong> Hybrid AI draft
          {hybridDraftCount === 1 ? '' : 's'} in this view — use sub-bank{' '}
          <Link to="/question-bank?hub=view&view=draft&subBank=ai">Hybrid AI</Link> to focus.
        </p>
      ) : null}

      {syncNote ? (
        <p className="form-hint bank-review-sync-note" role="status">
          {syncNote}
        </p>
      ) : null}
    </section>
  )
}
