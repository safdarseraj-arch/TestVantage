import { useEffect, useState } from 'react'
import {
  clearUploadHistory,
  formatUploadDuration,
  formatUploadHistoryWhen,
  labelUploadHistoryMode,
  listUploadHistory,
  uploadHistoryTone,
} from '../utils/uploadHistory.js'

/**
 * Modal timeline of recent uploads on this browser.
 * @param {{ open: boolean, onClose: () => void }} props
 */
export default function UploadHistoryTimeline({ open, onClose }) {
  const [entries, setEntries] = useState([])

  useEffect(() => {
    if (!open) return undefined
    setEntries(listUploadHistory())
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const refresh = () => setEntries(listUploadHistory())

  return (
    <div
      className="upload-history-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-history-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="upload-history-panel card">
        <div className="upload-history-head">
          <div>
            <h3 id="upload-history-title">Upload history</h3>
            <p className="form-hint">Recent uploads on this browser — newest first.</p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="form-hint upload-history-empty">No uploads yet. Drop an image to start the timeline.</p>
        ) : (
          <ol className="upload-history-timeline">
            {entries.map((entry) => {
              const tone = uploadHistoryTone(entry)
              return (
                <li key={entry.id} className={`upload-history-item upload-history-item--${tone}`}>
                  <div className="upload-history-item-head">
                    <time dateTime={entry.at}>{formatUploadHistoryWhen(entry.at)}</time>
                    <span className="upload-history-mode">{labelUploadHistoryMode(entry)}</span>
                    {entry.durationMs > 0 && (
                      <span className="upload-history-duration">{formatUploadDuration(entry.durationMs)}</span>
                    )}
                  </div>
                  <div className="upload-history-file">{entry.fileName}</div>
                  {entry.error ? (
                    <p className="upload-history-error">{entry.error}</p>
                  ) : (
                    <div className="upload-history-meta">
                      <span>Options {entry.found ?? 0}/4</span>
                      <span>Quality {entry.confidence ?? 0}/100</span>
                      {entry.detectedType && <span>{entry.detectedType}</span>}
                      {entry.readyToSave && !entry.needsReview && (
                        <span className="upload-history-badge upload-history-badge--ok">Ready</span>
                      )}
                      {entry.needsReview && !entry.needsAgentRepair && (
                        <span className="upload-history-badge upload-history-badge--warn">Review</span>
                      )}
                      {entry.needsAgentRepair && (
                        <span className="upload-history-badge upload-history-badge--bad">Needs repair</span>
                      )}
                    </div>
                  )}
                  {entry.stemPreview && (
                    <p className="upload-history-preview">{entry.stemPreview}</p>
                  )}
                  {entry.steps?.length > 0 && (
                    <ul className="upload-history-steps">
                      {entry.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ol>
        )}

        <div className="upload-history-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
            Refresh
          </button>
          {entries.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                clearUploadHistory()
                refresh()
              }}
            >
              Clear history
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
