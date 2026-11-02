/**
 * Queue strip for Question Bank Single tab — many images, one review at a time.
 */
import { countImageQueueByStatus } from '../utils/imageUploadQueue.js'

const STATUS_LABEL = {
  pending: 'Waiting',
  processing: 'OCR…',
  ready: 'Review',
  needs_review: 'Needs review',
  saved: 'Saved',
  rejected: 'Rejected',
  error: 'Error',
}

/**
 * @param {{
 *   queue: import('../utils/imageUploadQueue.js').ImageQueueItem[]
 *   activeId: string | null
 *   busy?: boolean
 *   onSelect: (id: string) => void
 *   onRejectActive: () => void
 *   onClearDone: () => void
 *   onClearAll: () => void
 * }} props
 */
export default function SingleImageUploadQueue({
  queue,
  activeId,
  busy = false,
  onSelect,
  onRejectActive,
  onClearDone,
  onClearAll,
}) {
  if (!queue?.length) return null

  const counts = countImageQueueByStatus(queue)
  const remaining =
    counts.pending + counts.processing + counts.ready + counts.needs_review + counts.error
  const active = queue.find((q) => q.id === activeId)

  return (
    <div className="single-image-queue" role="region" aria-label="Image upload queue">
      <div className="single-image-queue-toolbar">
        <p className="form-hint" style={{ margin: 0 }}>
          <strong>Image queue</strong> — {counts.total} file{counts.total === 1 ? '' : 's'}
          {remaining > 0 ? ` · ${remaining} left to review` : ''}
          {counts.saved ? ` · ${counts.saved} saved` : ''}
          {counts.rejected ? ` · ${counts.rejected} rejected` : ''}
        </p>
        <div className="single-image-queue-actions">
          {active &&
            (active.status === 'ready' ||
              active.status === 'needs_review' ||
              active.status === 'processing' ||
              active.status === 'error') && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={onRejectActive}
              title="Skip this image without saving"
            >
              Reject / skip
            </button>
          )}
          {(counts.saved > 0 || counts.rejected > 0) && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClearDone}>
              Clear done
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClearAll}>
            Clear queue
          </button>
        </div>
      </div>
      <ul className="single-image-queue-list">
        {queue.map((item, index) => {
          const isActive = item.id === activeId
          return (
            <li
              key={item.id}
              className={`single-image-queue-item status-${item.status}${isActive ? ' is-active' : ''}`}
            >
              <button
                type="button"
                className="single-image-queue-pick"
                disabled={busy || item.status === 'processing'}
                onClick={() => onSelect(item.id)}
                title={item.errorMessage || item.name}
              >
                <span className="single-image-queue-num">{index + 1}</span>
                <span className="single-image-queue-name">{item.name}</span>
                <span className={`single-image-queue-badge status-${item.status}`}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="form-hint">
        Review the form below, then <strong>Save to question bank</strong> or <strong>Reject / skip</strong>.
        The next waiting image starts automatically. (Browsers cannot move files on your disk — rejected
        images stay listed here until you clear them.)
      </p>
    </div>
  )
}
