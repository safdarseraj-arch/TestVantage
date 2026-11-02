import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  estimateCloneTokens,
  formatQuestionSourceText,
  queueCloneScaled,
  similarClonePayloadFromSeed,
  withCloneCachingOptions,
} from '../utils/hybridAiClient.js'
import { syncHybridAiAfterJob } from '../utils/hybridAiSync.js'

const CACHE_TOKEN_MIN = 32_768

/**
 * Inline trigger for single-question similar clones (Hybrid AI).
 * @param {{
 *   seed: import('../data/tests').Question | null
 *   count: number
 *   onCountChange?: (n: number) => void
 *   countOptions?: number[]
 *   compact?: boolean
 *   onSaved?: () => void
 * }} props
 */
export function CloneModalTrigger({
  seed,
  count,
  onCountChange,
  countOptions = [3, 5],
  compact = false,
  onSaved,
}) {
  const [open, setOpen] = useState(false)
  if (!seed) return null

  return (
    <>
      <div className={`clone-modal-trigger-row${compact ? ' compact' : ''}`}>
        <label className="metadata-field">
          <span className="metadata-label">Similar count</span>
          <select
            value={String(count)}
            onChange={(e) => onCountChange?.(Number(e.target.value))}
          >
            {countOptions.map((n) => (
              <option key={n} value={String(n)}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          Queue similar (Hybrid AI)…
        </button>
      </div>
      {open ? (
        <CloneModal
          open
          seed={seed}
          count={count}
          onCountChange={onCountChange}
          countOptions={countOptions}
          title="Similar questions (Hybrid AI)"
          submitLabel={`Queue ${count} clone(s)`}
          onClose={() => setOpen(false)}
          onSubmitPayload={async (payload) => {
            const queued = await queueCloneScaled(payload)
            await syncHybridAiAfterJob({
              attempts: 24,
              intervalMs: 5000,
              jobId: queued?.job_id || queued?.batch_id,
            })
            onSaved?.()
            setOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

/**
 * @param {{
 *   open: boolean
 *   onClose: () => void
 *   seed: import('../data/tests').Question | null
 *   count: number
 *   onCountChange?: (n: number) => void
 *   countOptions?: number[]
 *   title?: string
 *   submitLabel?: string
 *   onSubmitPayload: (payload: Record<string, unknown>) => void | Promise<void>
 * }} props
 */
export default function CloneModal({
  open,
  onClose,
  seed,
  count,
  onCountChange,
  countOptions = [3, 5],
  title = 'Clone questions (Hybrid AI)',
  submitLabel = 'Queue clones',
  onSubmitPayload,
}) {
  const [includeSyllabus, setIncludeSyllabus] = useState(false)
  const [tokenEstimate, setTokenEstimate] = useState(null)
  const [tokenBusy, setTokenBusy] = useState(false)
  const [tokenError, setTokenError] = useState('')
  const [submitBusy, setSubmitBusy] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const sourceText = useMemo(
    () => (seed ? formatQuestionSourceText(seed) : ''),
    [seed],
  )

  const refreshTokens = useCallback(async () => {
    if (!open || !sourceText.trim()) {
      setTokenEstimate(null)
      return
    }
    setTokenBusy(true)
    setTokenError('')
    try {
      const data = await estimateCloneTokens({
        source_question_text: sourceText,
        count: Math.max(1, Number(count) || 1),
        include_syllabus: includeSyllabus,
      })
      setTokenEstimate(data)
    } catch (e) {
      setTokenEstimate(null)
      setTokenError(e instanceof Error ? e.message : 'Token estimate failed.')
    } finally {
      setTokenBusy(false)
    }
  }, [open, sourceText, count, includeSyllabus])

  useEffect(() => {
    if (!open) return undefined
    const handle = setTimeout(() => {
      refreshTokens()
    }, 350)
    return () => clearTimeout(handle)
  }, [open, refreshTokens])

  if (!open) return null

  const estimatedTokens = Number(tokenEstimate?.estimated_tokens ?? 0)
  const eligibleForCaching = Boolean(
    tokenEstimate?.eligible_for_caching || estimatedTokens >= CACHE_TOKEN_MIN,
  )
  const showCachingTip = tokenEstimate && !eligibleForCaching && !includeSyllabus

  const buildPayload = () => {
    const base = seed
      ? similarClonePayloadFromSeed(seed, { count, difficultyOffset: 1 })
      : {
          parent_question_id: 'unknown',
          source_question_text: sourceText,
          count: Math.max(1, Number(count) || 1),
          difficulty_offset: 1,
        }
    return withCloneCachingOptions(base, {
      includeSyllabus,
      eligibleForCaching: eligibleForCaching || includeSyllabus,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitError('')
    setSubmitBusy(true)
    try {
      await onSubmitPayload(buildPayload())
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Queue failed.')
    } finally {
      setSubmitBusy(false)
    }
  }

  const modal = (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clone-modal-title"
      onClick={(ev) => ev.target === ev.currentTarget && !submitBusy && onClose()}
    >
      <div className="modal clone-modal" onClick={(ev) => ev.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <h2 id="clone-modal-title">{title}</h2>
          <p className="form-hint">
            Scaled clones via <code>/api/questions/clone-scaled</code>. Parent:{' '}
            <strong>{seed?.id ?? '—'}</strong>
          </p>

          <label className="metadata-field">
            <span className="metadata-label">Clone count</span>
            <select
              value={String(count)}
              disabled={submitBusy}
              onChange={(e) => onCountChange?.(Number(e.target.value))}
            >
              {countOptions.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className="clone-token-indicator" aria-live="polite">
            <strong>Estimated tokens:</strong>{' '}
            {tokenBusy ? 'Calculating…' : tokenEstimate ? estimatedTokens.toLocaleString() : '—'}
            {tokenEstimate ? (
              <span className="form-hint">
                {' '}
                · Context caching {eligibleForCaching ? 'eligible' : 'not yet eligible'}
              </span>
            ) : null}
            {tokenError ? <p className="form-hint parse-status partial">{tokenError}</p> : null}
          </div>

          {showCachingTip ? (
            <div className="clone-caching-banner form-hint" role="note">
              Tip: Standard API pricing applies. To unlock Context Caching discounts, increase clone
              count to 50+, or check &apos;Attach JEE Syllabus/Guidelines&apos; to bundle context.
            </div>
          ) : null}

          <label className="clone-syllabus-toggle">
            <input
              type="checkbox"
              checked={includeSyllabus}
              disabled={submitBusy}
              onChange={(e) => setIncludeSyllabus(e.target.checked)}
            />
            Bundle Exam Guidelines &amp; Syllabus (Enables Context Caching)
          </label>

          {submitError ? <p className="form-hint parse-status partial">{submitError}</p> : null}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" disabled={submitBusy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitBusy || !sourceText.trim()}>
              {submitBusy ? 'Queuing…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
