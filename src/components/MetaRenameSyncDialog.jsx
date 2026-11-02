/**
 * Ask whether to apply a meta rename to saved questions now or later.
 * @param {{
 *   open: boolean,
 *   title: string,
 *   message: string,
 *   questionCount: number,
 *   onSyncNow: () => void,
 *   onSyncLater: () => void,
 *   onCancel: () => void,
 * }} props
 */
export default function MetaRenameSyncDialog({
  open,
  title,
  message,
  questionCount,
  onSyncNow,
  onSyncLater,
  onCancel,
}) {
  if (!open) return null

  return (
    <div
      className="duplicate-alarm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meta-sync-title"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="duplicate-alarm card meta-sync-dialog" role="alertdialog">
        <div className="duplicate-alarm-header">
          <strong id="meta-sync-title">{title}</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </div>
        <p>{message}</p>
        {questionCount > 0 && (
          <p className="form-hint">
            <strong>{questionCount}</strong> saved question{questionCount === 1 ? '' : 's'} use this tag.
          </p>
        )}
        <div className="duplicate-alarm-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
          {questionCount > 0 && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onSyncLater}>
                Label only — sync later
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={onSyncNow}>
                Sync now
              </button>
            </>
          )}
          {questionCount === 0 && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onSyncNow}>
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
