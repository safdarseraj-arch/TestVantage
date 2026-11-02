import { useMemo, useState } from 'react'
import {
  flushAllServerSync,
  loadPendingServerSync,
  pullBankFromServer,
  questionNeedsSync,
  syncStatusLabel,
} from '../utils/bankServerSync.js'
import { isPlatformScaleEnabled } from '../config/platform.js'

/**
 * @param {{
 *   questions: import('../data/tests').Question[],
 *   onRefresh?: () => void,
 *   onMessage?: (type: string, text: string) => void,
 * }} props
 */
export default function BankServerSyncPanel({ questions, onRefresh, onMessage }) {
  const [syncing, setSyncing] = useState(false)
// eslint-disable-next-line react-hooks/exhaustive-deps
  const pending = useMemo(() => loadPendingServerSync(), [questions, syncing])
  const needsSyncCount = useMemo(
    () => (questions ?? []).filter((q) => questionNeedsSync(q)).length,
    [questions],
  )

  const runSync = async () => {
    setSyncing(true)
    try {
      const result = await flushAllServerSync(questions)
      onRefresh?.()
      if (result.synced > 0 && result.failed === 0) {
        onMessage?.('success', `Synced ${result.synced} question(s) to the online bank.`)
      } else if (result.synced > 0) {
        onMessage?.(
          'info',
          `Synced ${result.synced} question(s). ${result.failed} still failed — check server is running (npm run api).`,
        )
      } else if (result.failed > 0) {
        onMessage?.('error', 'Sync failed. Start the server: npm run api')
      } else {
        onMessage?.('info', 'No questions need syncing.')
      }
    } catch (e) {
      onMessage?.('error', e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const runPull = async () => {
    setSyncing(true)
    try {
      const result = await pullBankFromServer()
      onRefresh?.()
      onMessage?.(
        'success',
        `Pulled ${result.serverCount} question(s) from server — ${result.merged} total in bank.`,
      )
    } catch (e) {
      onMessage?.('error', e instanceof Error ? e.message : 'Pull failed')
    } finally {
      setSyncing(false)
    }
  }

  if (!questions?.length && !pending.length) return null

  return (
    <div className="bank-server-sync-panel card">
      <div className="bank-server-sync-head">
        <h3>Online sync</h3>
        <div className="launch-checklist-toolbar-actions">
          {isPlatformScaleEnabled() && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={syncing} onClick={runPull}>
              {syncing ? 'Working…' : 'Pull from server'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={syncing || (needsSyncCount === 0 && pending.length === 0)}
            onClick={runSync}
          >
            {syncing ? 'Syncing…' : `Push ${needsSyncCount || pending.length} to online`}
          </button>
        </div>
      </div>
      <p className="form-hint">
        Offline saves stay on this device until you sync. After sync they become{' '}
        <span className="saved-sync-live">Live</span> on the server.
      </p>
      {pending.length > 0 && (
        <p className="form-hint bank-server-sync-pending">
          <strong>{pending.length}</strong> in retry queue from earlier failed syncs.
        </p>
      )}
      <div className="bank-storage-table-wrap bank-storage-table-wrap--scroll">
        <table className="bank-storage-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Subject</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(questions ?? [])
              .filter((q) => questionNeedsSync(q) || q.syncStatus === 'live')
              .slice(0, 40)
              .map((q) => (
                <tr key={q.id}>
                  <td>
                    <code>{q.id}</code>
                  </td>
                  <td>{q.subject ?? '—'}</td>
                  <td>
                    <span className={`saved-sync-badge saved-sync-${q.syncStatus ?? 'offline'}`}>
                      {syncStatusLabel(q)}
                    </span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

